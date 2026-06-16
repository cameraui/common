"""Subscription management utilities."""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class Unsubscribable(Protocol):
    """Protocol for objects that can be disposed/unsubscribed."""

    def dispose(self) -> None:
        """Dispose of the subscription."""
        ...


class Subscribed:
    """Base class for managing subscriptions."""

    _subscriptions: list[Unsubscribable]
    _additional_subscriptions: list[Unsubscribable]

    def __init__(self) -> None:
        self._subscriptions = []
        self._additional_subscriptions = []

    def add_subscriptions(self, *subscriptions: Unsubscribable) -> None:
        """Add subscriptions to be managed."""
        self._subscriptions.extend(subscriptions)

    def unsubscribe(self) -> None:
        """Dispose all managed subscriptions."""
        for subscription in self._subscriptions:
            subscription.dispose()
