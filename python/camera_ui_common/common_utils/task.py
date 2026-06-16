"""Task set utilities for managing async tasks."""

from __future__ import annotations

import asyncio
from collections.abc import Coroutine
from typing import Any


class TaskSet:
    """A set of async tasks that can be managed together."""

    tasks: set[asyncio.Task[Any]]
    name: str | None

    def __init__(self, name: str | None = None) -> None:
        self.tasks = set[asyncio.Task[Any]]()
        self.name = name

    def log_prefix(self) -> str:
        return f"[{self.name}]"

    def add(self, coroutine: Coroutine[Any, Any, Any]) -> asyncio.Task[Any]:
        task = asyncio.create_task(coroutine, name=self.name)
        self.tasks.add(task)
        task.add_done_callback(lambda _: self.remove(task))

        return task

    def remove(self, task: asyncio.Task[Any]) -> None:
        if task in self.tasks:
            if not task.cancelled():
                task.cancel()

            self.tasks.remove(task)

    def remove_all(self) -> None:
        tasks = self.tasks.copy()
        for task in tasks:
            self.remove(task)

        self.tasks.clear()

    def __await__(self) -> Any:
        return asyncio.gather(*self.tasks).__await__()
