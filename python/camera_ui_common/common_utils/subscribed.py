from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class Unsubscribable(Protocol):
    def dispose(self) -> None: ...


class Subscribed:
    _subscriptions: list[Unsubscribable]
    _additional_subscriptions: list[Unsubscribable]

    def __init__(self) -> None:
        self._subscriptions = []
        self._additional_subscriptions = []

    def add_subscriptions(self, *subscriptions: Unsubscribable) -> None:
        self._subscriptions.extend(subscriptions)

    def unsubscribe(self) -> None:
        for subscription in self._subscriptions:
            subscription.dispose()
