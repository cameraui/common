"""Common utility functions."""

from __future__ import annotations

import asyncio
import copy
from collections.abc import Callable, Coroutine
from typing import Any, ParamSpec, TypeVar, cast

TSource = TypeVar("TSource", bound=dict[Any, Any] | list[Any] | Any)
TTarget = TypeVar("TTarget", bound=dict[Any, Any] | list[Any] | Any)
TKey = str | int | None
Customizer = Callable[[Any, Any, TKey, TSource, TTarget, list[dict[Any, Any]]], Any]

R = TypeVar("R")
P = ParamSpec("P")


def make_sync(async_func: Callable[P, Coroutine[Any, Any, R]]) -> Callable[P, R]:
    """Convert an async function to a sync function."""

    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        try:
            loop = asyncio.get_running_loop()
            return asyncio.run_coroutine_threadsafe(async_func(*args, **kwargs), loop).result()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            return loop.run_until_complete(async_func(*args, **kwargs))

    return wrapper


def merge_with(
    source_object: TSource,
    target_object: TTarget | None,
    customizer: Customizer[Any, Any] | None = None,
    stack: list[dict[Any, Any]] | None = None,
) -> TSource | TTarget:
    """Merge target_object into source_object with optional customizer."""
    if stack is None:
        stack = []

    if isinstance(source_object, list) and isinstance(target_object, list):
        customized_value = (
            customizer(source_object, target_object, None, source_object, target_object, stack)
            if customizer
            else None
        )
        if customized_value is not None:
            return cast(TSource | TTarget, customized_value)
        else:
            return cast(TSource | TTarget, source_object + target_object)

    if isinstance(source_object, dict) and isinstance(target_object, dict):
        for key in target_object:
            obj_value = source_object.get(key)
            src_value = target_object[key]

            stack.append({"key": key, "source_object": source_object, "target_object": target_object})

            customized_value = (
                customizer(obj_value, src_value, key, source_object, target_object, stack)
                if customizer
                else None
            )

            if customized_value is not None:
                source_object[key] = customized_value
            elif isinstance(obj_value, (dict, list)) and isinstance(src_value, (dict, list)):
                source_object[key] = merge_with(
                    copy.deepcopy(cast(Any, obj_value)),
                    cast(Any, src_value),
                    customizer,
                    stack,
                )
            else:
                source_object[key] = src_value

            stack.pop()
    else:
        if not isinstance(target_object, (dict, list)):
            return source_object

    return source_object


def merge(
    source: Any,
    target: Any,
    key: TKey,
    source_object: dict[Any, Any] | list[Any] | Any,
    target_object: dict[Any, Any] | list[Any] | Any,
    stack: list[Any],
) -> Any:
    """Default merge customizer that replaces lists instead of concatenating."""
    if isinstance(source, list):
        return target
    return None
