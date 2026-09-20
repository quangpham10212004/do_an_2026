import asyncio
import os
import pathlib
import tempfile

# Test luôn chạy không có DEEPSEEK_API_KEY thật (engine rule-based); client DeepSeek được test bằng MockTransport.
os.environ["DEEPSEEK_API_KEY"] = ""
os.environ.setdefault("AI_DB_URL", "postgresql://postgres:postgres@localhost:5438/ai_db")
os.environ["CV_STORAGE_DIR"] = tempfile.mkdtemp(prefix="cv-test-")

import asyncpg  # noqa: E402
import jwt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import config  # noqa: E402
from app.main import app  # noqa: E402

SCHEMA = pathlib.Path(__file__).resolve().parents[2] / "db" / "init" / "ai-service.sql"
TABLES = "interview_turns, interviews, enrichment_messages, enrichment_conversations, cv_documents"


async def _reset_schema() -> None:
    conn = await asyncpg.connect(config.AI_DB_URL)
    try:
        await conn.execute(SCHEMA.read_text())
        await conn.execute(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE")
    finally:
        await conn.close()


@pytest.fixture
def db():
    """CSDL trống cho mỗi test. Bỏ qua test nếu không có Postgres (chạy pytest ngoài CI)."""
    try:
        asyncio.run(_reset_schema())
    except (OSError, asyncpg.PostgresError) as e:
        pytest.skip(f"Không kết nối được ai_db ({config.AI_DB_URL}): {e}")
    yield


@pytest.fixture
def client():
    """TestClient chạy cả lifespan (pool CSDL, job đồng bộ lại profile)."""
    with TestClient(app) as c:
        yield c


pytest_plugins = ["tests.fakes"]


def auth(user_id, role: str, email: str = "user@test.local") -> dict:
    token = jwt.encode({"sub": str(user_id), "email": email, "role": role, "typ": "access"},
                       config.JWT_SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}
