from __future__ import annotations

from collections.abc import Sequence
from typing import Any, cast

Path = Sequence[int | str] | str | int


def is_empty(value: list[int] | list[str] | Sequence[int | str] | None) -> bool:
    if value is None:
        return True
    return len(value) == 0


def get_key(key: str | int) -> int | str:
    if isinstance(key, int):
        return key
    if key.isdigit():
        return int(key)
    return key


class ObjectPath:
    @staticmethod
    def delete(obj: dict[Any, Any] | list[Any], path: Path) -> dict[Any, Any] | list[Any]:
        if isinstance(path, int):
            path = [path]
        elif isinstance(path, str):
            path = path.split(".")

        if is_empty(path):
            return obj

        current_path = get_key(path[0])

        if isinstance(obj, list):
            if isinstance(current_path, int) and 0 <= current_path < len(obj):
                if len(path) == 1:
                    obj.pop(current_path)
                else:
                    next_obj = obj[current_path]
                    if isinstance(next_obj, (dict, list)):
                        ObjectPath.delete(cast(Any, next_obj), path[1:])
        elif current_path in obj:
            if len(path) == 1:
                del obj[current_path]
            else:
                next_obj = obj[current_path]
                if isinstance(next_obj, (dict, list)):
                    ObjectPath.delete(cast(Any, next_obj), path[1:])

        return obj

    @staticmethod
    def has(obj: dict[Any, Any] | list[Any], path: Path) -> bool:
        if isinstance(path, int):
            path = [path]
        elif isinstance(path, str):
            path = path.split(".")

        if not path:
            return bool(obj)

        current: dict[Any, Any] | list[Any] | None = obj
        for item in path:
            key = get_key(item)

            if isinstance(current, list):
                if isinstance(key, int) and 0 <= key < len(current):
                    current = current[key]
                else:
                    return False
            elif isinstance(current, dict):
                if key in current:
                    current = current[key]
                else:
                    return False
            else:
                return False

        return True

    @staticmethod
    def get(obj: dict[Any, Any] | list[Any], path: Path, default_value: Any = None) -> Any:
        if isinstance(path, str) and not path or isinstance(path, Sequence) and not path:
            return obj

        if isinstance(path, int):
            path = [path]
        elif isinstance(path, str):
            path = path.split(".")

        current_path = get_key(path[0])
        next_obj = None

        if isinstance(obj, list):
            if isinstance(current_path, int) and 0 <= current_path < len(obj):
                next_obj = obj[current_path]
        else:
            next_obj = obj.get(current_path)

        if next_obj is None:
            return default_value

        if len(path) == 1:
            return next_obj

        return ObjectPath.get(next_obj, path[1:], default_value)

    @staticmethod
    def set(obj: dict[Any, Any] | list[Any], path: Path, value: Any, do_not_replace: bool = False) -> Any:
        if isinstance(path, int):
            path = [path]
        elif isinstance(path, str):
            path = [get_key(key) for key in path.split(".") if key]

        if not path:
            return obj

        current_path = path[0]

        if isinstance(obj, list):
            if isinstance(current_path, int):
                while len(obj) <= current_path:
                    obj.append(None)
                if len(path) == 1:
                    if not do_not_replace or obj[current_path] is None:
                        obj[current_path] = value
                else:
                    if obj[current_path] is None:
                        obj[current_path] = [] if isinstance(path[1], int) else {}
                    return ObjectPath.set(obj[current_path], path[1:], value, do_not_replace)
            return None

        if len(path) == 1:
            if not do_not_replace or current_path not in obj:
                obj[current_path] = value
            return obj.get(current_path)

        if current_path not in obj:
            obj[current_path] = [] if isinstance(path[1], int) else {}

        return ObjectPath.set(obj[current_path], path[1:], value, do_not_replace)

    @staticmethod
    def push(obj: dict[Any, Any] | list[Any], path: Path, *items: Any) -> None:
        target = ObjectPath.get(obj, path)
        if not isinstance(target, list):
            target = []
            ObjectPath.set(obj, path, target)
        target.extend(items)

    @staticmethod
    def coalesce(
        obj: dict[Any, Any] | list[Any],
        paths: Path | list[Path],
        default_value: Any = None,
    ) -> Any:
        paths_list = paths if isinstance(paths, list) else [paths]
        for path in paths_list:
            value = ObjectPath.get(obj, path)
            if value is not None:
                return value
        return default_value

    @staticmethod
    def empty(obj: dict[Any, Any] | list[Any], path: Path) -> Any:
        value = ObjectPath.get(obj, path)

        if value is None:
            return None

        if isinstance(value, str):
            return ObjectPath.set(obj, path, "")
        if isinstance(value, bool):
            return ObjectPath.set(obj, path, False)
        if isinstance(value, (int, float)):
            return ObjectPath.set(obj, path, 0)
        if isinstance(value, (list, dict)):
            value.clear()
            return cast(Any, value)
        return ObjectPath.set(obj, path, None)

    @staticmethod
    def ensure_exists(obj: dict[Any, Any] | list[Any], path: Path, value: Any) -> Any:
        return ObjectPath.set(obj, path, value, True)

    @staticmethod
    def insert(obj: dict[Any, Any] | list[Any], path: Path, value: Any, at: int = 0) -> None:
        target = ObjectPath.get(obj, path)
        if not isinstance(target, list):
            target = []
            ObjectPath.set(obj, path, target)
        target.insert(at, value)
