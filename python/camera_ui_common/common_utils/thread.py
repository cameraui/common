"""Thread utilities for running blocking operations."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import TypeVar

T = TypeVar("T")

toThreadExecutor: ThreadPoolExecutor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="worker")


async def to_thread(f: Callable[[], T]) -> T:
    """Run a blocking function in a thread pool."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(toThreadExecutor, f)
