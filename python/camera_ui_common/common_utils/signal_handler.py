"""Signal handling utilities for graceful shutdown."""

from __future__ import annotations

import asyncio
import contextlib
import signal
import traceback
from collections.abc import Callable, Coroutine
from typing import Any, TypedDict

from camera_ui_sdk import LoggerService


class SignalHandlerOptions(TypedDict):
    """Options for configuring the signal handler."""

    display_name: str
    logger: LoggerService
    timeout_duration: int
    close_function: Callable[..., Coroutine[Any, Any, Any]]


class SignalHandler:
    """Handles system signals for graceful shutdown."""

    display_name: str
    logger: LoggerService
    timeout_duration: int
    close_function: Callable[..., Coroutine[Any, Any, Any]]
    is_shutting_down: bool
    shutdown_event: asyncio.Event

    def __init__(self, options: SignalHandlerOptions) -> None:
        self.display_name: str = options["display_name"]
        self.logger = options["logger"]
        self.timeout_duration = options.get("timeout_duration", 5)
        self.close_function = options["close_function"]
        self.is_shutting_down = False
        self.shutdown_event = asyncio.Event()

    def setup_handlers(self) -> None:
        loop = asyncio.get_running_loop()
        with contextlib.suppress(NotImplementedError):
            for signame in ("SIGINT", "SIGTERM"):

                def signal_callback() -> None:
                    with contextlib.suppress(asyncio.CancelledError):
                        asyncio.create_task(self.gracefully_close(signame))

                sig = getattr(signal, signame)
                loop.add_signal_handler(sig, signal_callback)

        loop.set_exception_handler(self.handle_exception)

    async def gracefully_close(self, signame: str) -> None:
        if self.is_shutting_down:
            return

        self.is_shutting_down = True
        self.logger.log(f"{self.display_name} Received {signame}. Stopping...")

        try:
            close_task = asyncio.create_task(self.close_function())
            await asyncio.wait_for(close_task, timeout=self.timeout_duration)
        except asyncio.TimeoutError:
            self.logger.warn(
                f"{self.display_name} Failed to gracefully close before timeout. Force quitting!"
            )
        except Exception as e:
            self.logger.error(f"Error during shutdown: {str(e)}\n{traceback.format_exc()}")
        finally:
            self.shutdown_event.set()

    def handle_exception(self, loop: asyncio.AbstractEventLoop, context: dict[str, Any]) -> None:
        exception = context.get("exception")
        message = context.get("message")
        task = context.get("task")  # Das Task Objekt

        if isinstance(exception, asyncio.CancelledError) and self.is_shutting_down:
            return

        error_message = f"{self.display_name} Caught exception: {message}"
        if task:
            # Task Stack ausgeben
            stack = task.get_stack()
            if stack:
                error_message += "\nTask Stack:"
                for frame in stack:
                    error_message += f"\n  File {frame.f_code.co_filename}, line {frame.f_lineno}, in {frame.f_code.co_name}"

        if exception:
            error_message += f"\n{type(exception).__name__}: {str(exception)}"
            if not isinstance(exception, asyncio.CancelledError):
                error_message += f"\n{traceback.format_exc()}"

        self.logger.error(error_message)

        if not self.is_shutting_down:
            asyncio.create_task(self.gracefully_close("uncaughtException"))
