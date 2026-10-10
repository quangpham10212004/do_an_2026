"""US-46 (NFR-10) — giới hạn tần suất cửa sổ cố định, đếm trong bộ nhớ (service chạy một instance)."""
import math
import time
from threading import Lock
from typing import Callable

_CLEANUP_THRESHOLD = 10_000


class RateLimiter:
    def __init__(self, max_calls: int, window_seconds: float, clock: Callable[[], float] = time.monotonic) -> None:
        self.max_calls = max_calls
        self.window = window_seconds
        self._clock = clock
        self._lock = Lock()
        self._windows: dict[str, tuple[int, float]] = {}  # key -> (số lần, hết hạn lúc)

    def hit(self, key: str) -> int:
        """Ghi nhận 1 lần; 0 nếu còn trong giới hạn, ngược lại số giây phải chờ (Retry-After)."""
        now = self._clock()
        with self._lock:
            if len(self._windows) > _CLEANUP_THRESHOLD:
                self._windows = {k: w for k, w in self._windows.items() if w[1] > now}
            count, expires = self._windows.get(key, (0, 0.0))
            if expires <= now:
                count, expires = 0, now + self.window
            count += 1
            self._windows[key] = (count, expires)
        return 0 if count <= self.max_calls else max(1, math.ceil(expires - now))

    def reset(self) -> None:
        with self._lock:
            self._windows.clear()
