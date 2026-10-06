import os

# Không load model thật khi chạy test (tránh tải ~90MB và làm test chậm)
os.environ.setdefault("PRELOAD_MODEL", "false")
# Không chạy IndexSyncJob trong test — job cần cả hai database thật.
os.environ.setdefault("INDEX_SYNC_ENABLED", "false")

import pytest


@pytest.fixture
def anyio_backend():
    """Cho phép @pytest.mark.anyio chạy test async bằng plugin pytest của anyio."""
    return "asyncio"
