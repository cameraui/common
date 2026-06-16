"""Promise/Deferred utilities for async operations."""

from __future__ import annotations

import asyncio
from typing import Generic, TypeVar

T = TypeVar("T")


class Deferred(Generic[T]):
    """A deferred promise that can be resolved or rejected externally."""

    def __init__(self) -> None:
        self._loop = asyncio.get_event_loop()
        self._future: asyncio.Future[T] = self._loop.create_future()

    @property
    def promise(self) -> asyncio.Future[T]:
        """The underlying future/promise."""
        return self._future

    @property
    def is_done(self) -> bool:
        """Whether the deferred has been resolved or rejected."""
        return self._future.done()

    def resolve(self, value: T) -> None:
        """Resolve the deferred with a value."""
        if not self._future.done():
            self._future.set_result(value)

    def reject(self, reason: Exception | None = None) -> None:
        """Reject the deferred with an exception."""
        if not self._future.done():
            self._future.set_exception(reason or Exception("Rejected"))

    def cancel(self, reason: str = "Cancelled") -> None:
        """Cancel the deferred."""
        if not self._future.done():
            self._future.set_exception(asyncio.CancelledError(reason))
