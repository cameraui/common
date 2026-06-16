"""Logger service for structured logging."""

from __future__ import annotations

import json
import os
import time
import traceback
from datetime import datetime
from typing import Any, Literal, TypedDict, cast

from .ansicolor import ansicolor

LogLevel = Literal["log", "warn", "error", "debug", "trace", "success", "attention", "raw"]

LogTargetType = Literal["camera", "plugin", "system"]

LogSource = Literal["main", "child"]


class LogEntry(TypedDict):
    """A structured log entry."""

    timestamp: int
    level: LogLevel
    prefix: str
    suffix: str | None
    message: str
    targetId: str | None
    targetType: LogTargetType | None
    pluginId: str | None
    source: LogSource
    processId: int


class ChildLogMessage(TypedDict):
    """Message format for child process logs."""

    type: Literal["log"]
    entry: LogEntry


class LoggerOptions(TypedDict, total=False):
    """Options for configuring the logger."""

    prefix: str | None
    suffix: str | None
    disable_prefix: bool | None
    disable_timestamps: bool | None
    debug_enabled: bool | None
    trace_enabled: bool | None
    target_id: str | None
    target_type: LogTargetType | None
    plugin_id: str | None


class LoggerService:
    """A structured logging service with support for child process mode."""

    prefix: str
    suffix: str | None
    target_id: str | None
    target_type: LogTargetType | None
    disable_prefix: bool | None
    plugin_id: str | None

    disable_timestamps: bool
    debug_enabled: bool
    trace_enabled: bool

    # Whether to output JSON (for parent process) or formatted text (for local debugging)
    _is_child_process: bool = True

    def __init__(self, options: LoggerOptions | None = None) -> None:
        self.prefix = cast(str, options.get("prefix", "camera.ui") if options else "camera.ui")
        self.suffix = options.get("suffix") if options else None
        self.target_id = options.get("target_id") if options else None
        self.target_type = options.get("target_type") if options else None
        self.disable_prefix = options.get("disable_prefix", False) if options else False
        self.plugin_id = options.get("plugin_id") if options else None

        self.disable_timestamps = cast(bool, options.get("disable_timestamps", False) if options else False)
        self.debug_enabled = cast(bool, options.get("debug_enabled", False) if options else False)
        self.trace_enabled = cast(bool, options.get("trace_enabled", False) if options else False)

    def set_child_process_mode(self, enabled: bool) -> None:
        """
        Set whether this logger runs in child process mode.
        In child mode, logs are output as JSON to stdout.
        """
        self._is_child_process = enabled

    def create_logger(self, options: LoggerOptions | None = None) -> LoggerService:
        """Create a child logger that inherits settings from this logger."""
        logger_options: LoggerOptions = {
            "prefix": options.get("prefix", self.prefix) if options else self.prefix,
            "suffix": options.get("suffix", self.suffix) if options else self.suffix,
            "disable_timestamps": options.get("disable_timestamps", self.disable_timestamps)
            if options
            else self.disable_timestamps,
            "debug_enabled": options.get("debug_enabled", self.debug_enabled)
            if options
            else self.debug_enabled,
            "trace_enabled": options.get("trace_enabled", self.trace_enabled)
            if options
            else self.trace_enabled,
            "target_id": options.get("target_id", self.target_id) if options else self.target_id,
            "target_type": options.get("target_type", self.target_type) if options else self.target_type,
            "disable_prefix": options.get("disable_prefix", False) if options else False,
            "plugin_id": options.get("plugin_id", self.plugin_id) if options else self.plugin_id,
        }
        logger = LoggerService(logger_options)
        logger._is_child_process = self._is_child_process
        return logger

    def log(self, *args: Any) -> None:
        self._write_log("log", args)

    def error(self, *args: Any) -> None:
        self._write_log("error", args)

    def warn(self, *args: Any) -> None:
        self._write_log("warn", args)

    def success(self, *args: Any) -> None:
        self._write_log("success", args)

    def attention(self, *args: Any) -> None:
        self._write_log("attention", args)

    def debug(self, *args: Any) -> None:
        if not self.debug_enabled:
            return
        self._write_log("debug", args)

    def trace(self, *args: Any) -> None:
        if not self.trace_enabled:
            return
        self._write_log("trace", args)

    def raw(self, *args: Any) -> None:
        self._write_log("raw", args)

    def _write_log(self, level: LogLevel, args: tuple[Any, ...]) -> None:
        """Core logging method that creates entry and routes it."""
        entry = self._create_entry(level, args)

        if self._is_child_process:
            # Child process: write JSON to stdout
            self._write_to_stdout(entry)
        else:
            # Local mode: write formatted to console
            self._write_to_console(entry)

    def _create_entry(self, level: LogLevel, args: tuple[Any, ...]) -> LogEntry:
        """Create a structured log entry."""
        formatted_args = self._format_args(args)
        message = " ".join(formatted_args)

        return LogEntry(
            timestamp=int(time.time() * 1000),
            level=level,
            prefix=self.prefix,
            suffix=self.suffix,
            message=message,
            targetId=self.target_id,
            targetType=self.target_type,
            pluginId=self.plugin_id,
            source="child",
            processId=os.getpid(),
        )

    def _write_to_stdout(self, entry: LogEntry) -> None:
        """Write log entry to stdout as JSON."""
        message: ChildLogMessage = {"type": "log", "entry": entry}
        json_line = json.dumps(message, ensure_ascii=False)
        print(json_line, flush=True)

    def _write_to_console(self, entry: LogEntry) -> None:
        """Write formatted log to console."""
        formatted = self._format_for_console(entry)
        print(*formatted)

    def _format_for_console(self, entry: LogEntry) -> list[str]:
        """Format a log entry for console output with ANSI colors."""
        parts: list[str] = []

        # Timestamp
        if not self.disable_timestamps:
            parts.append(f"[{self._format_timestamp(entry['timestamp'])}]")

        # Prefix
        if not self.disable_prefix and entry.get("prefix"):
            parts.append(ansicolor.blue(f"[{entry['prefix']}]"))

        # Suffix
        if entry.get("suffix"):
            parts.append(ansicolor.cyan(f"[{entry['suffix']}]"))

        # Level prefix and colored message
        level = entry["level"]
        level_prefix = self._get_level_prefix(level)
        if level_prefix:
            parts.append(level_prefix)

        # Message with appropriate color
        colored_message = self._colorize_message(level, entry["message"])
        parts.append(colored_message)

        return parts

    def _get_level_prefix(self, level: LogLevel) -> str:
        """Get the level prefix badge."""
        prefixes = {
            "error": ansicolor.bgRed(" ERROR "),
            "warn": ansicolor.bgYellow(" WARN "),
            "success": ansicolor.bgGreen(" SUCCESS "),
            "attention": ansicolor.bgMagenta(" ATTENTION "),
            "trace": ansicolor.bgDarkGray(" TRACE "),
            "debug": "",
            "log": "",
            "raw": "",
        }
        return prefixes.get(level, "")

    def _colorize_message(self, level: LogLevel, message: str) -> str:
        """Apply color to message based on log level."""
        if level in ("debug", "trace"):
            return ansicolor.darkGray(message)
        elif level == "warn":
            return ansicolor.yellow(message)
        elif level == "error":
            return ansicolor.red(message)
        elif level == "success":
            return ansicolor.green(message)
        elif level == "attention":
            return ansicolor.magenta(message)
        return message

    def _format_args(self, args: tuple[Any, ...]) -> list[str]:
        """Format arguments for logging."""
        formatted_args: list[str] = []
        for arg in args:
            if isinstance(arg, BaseException):
                message = str(arg).split("\n")[0].strip() if str(arg) else "Unknown error"
                error_traceback = traceback.format_exc().rstrip()
                formatted_args.append(message)
                if error_traceback and error_traceback != "NoneType: None":
                    formatted_args.append(f"\n{error_traceback}")
            elif isinstance(arg, (dict, list)):
                try:
                    formatted_args.append(json.dumps(arg, indent=2, ensure_ascii=False))
                except (TypeError, ValueError):
                    formatted_args.append(str(arg))  # pyright: ignore[reportUnknownArgumentType]
            else:
                formatted_args.append(str(arg))
        return formatted_args

    def _format_timestamp(self, timestamp: int) -> str:
        """Format timestamp for display."""
        try:
            dt = datetime.fromtimestamp(timestamp / 1000)
            return dt.strftime("%d.%m.%Y, %H:%M:%S")
        except Exception:
            return "Unknown"

    @staticmethod
    def format_as_text(entry: LogEntry) -> str:
        """Format a log entry as plain text (for file output)."""
        parts: list[str] = []

        # Timestamp
        try:
            dt = datetime.fromtimestamp(entry["timestamp"] / 1000)
            parts.append(f"[{dt.strftime('%d.%m.%Y, %H:%M:%S')}]")
        except Exception:
            parts.append("[Unknown]")

        # Prefix
        if entry.get("prefix"):
            parts.append(f"[{entry['prefix']}]")

        # Suffix
        if entry.get("suffix"):
            parts.append(f"[{entry['suffix']}]")

        # Level prefix
        level_prefixes = {
            "error": " ERROR ",
            "warn": " WARN ",
            "success": " SUCCESS ",
            "attention": " ATTENTION ",
            "trace": " TRACE ",
            "debug": "",
            "log": "",
            "raw": "",
        }
        level_prefix = level_prefixes.get(entry["level"], "")
        if level_prefix:
            parts.append(level_prefix)

        # Message
        parts.append(entry["message"])

        return " ".join(parts)

    @staticmethod
    def parse_child_log(line: str) -> LogEntry | None:
        """Parse a JSON log line from a child process."""
        try:
            parsed = json.loads(line)
            if parsed.get("type") == "log" and parsed.get("entry"):
                return cast(LogEntry, parsed["entry"])
        except (json.JSONDecodeError, KeyError):
            pass
        return None
