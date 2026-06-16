"""Reactive property utilities."""

from __future__ import annotations

from copy import deepcopy
from typing import Generic, TypeVar, cast

from camera_ui_sdk import BehaviorSubject, Observable, ReplaySubject, distinct_until_changed, share

T = TypeVar("T")


class ReactiveProperty(Generic[T]):
    """A reactive property that wraps a BehaviorSubject with observable access."""

    __subject: BehaviorSubject[T]
    observable: Observable[T]

    def __init__(
        self, initial_value: T | BehaviorSubject[T], observable: Observable[T] | None = None
    ) -> None:
        if isinstance(initial_value, BehaviorSubject):
            self.__subject = cast(BehaviorSubject[T], initial_value)
        else:
            self.__subject = BehaviorSubject(initial_value)

        self.observable = observable or self.__create_state_observable(self.__subject)

    @property
    def value(self) -> T:
        val = self.__subject.value

        if isinstance(val, dict | list) or hasattr(val, "__dict__"):
            return deepcopy(val)  # pyright: ignore[reportUnknownVariableType, reportUnknownArgumentType]

        return val

    def next(self, value: T) -> None:
        self.__subject.next(value)

    def complete(self) -> None:
        self.__subject.complete()

    def __create_state_observable(self, state_subject: BehaviorSubject[T]) -> Observable[T]:
        return state_subject.pipe(distinct_until_changed(), share(lambda: ReplaySubject(1)))
