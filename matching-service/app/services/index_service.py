"""
Chỉ mục embedding của matching-service (FR-2.5, FR-4.1, FR-4.2, NFR-7).

matching-service sở hữu toàn bộ vòng đời embedding:

    profile_db (read-only)  --normalize-->  text  --model-->  vector
                                                                |
                                              matching_db (mentor/mentee_embeddings)

profile-service chỉ báo "hồ sơ này vừa đổi" qua POST /internal/embeddings/reindex
và KHÔNG chờ kết quả. Thông báo đó chỉ để giảm độ trễ: IndexSyncJob (reconcile)
định kỳ so hash giữa profile_db và chỉ mục nên chỉ mục luôn tự hội tụ về nguồn sự
thật kể cả khi thông báo bị mất hoặc matching-service đang down.

NFR-7 — tái sử dụng embedding: lưu SHA-256 của text chuẩn hoá; text không đổi và
đã có vector thì bỏ qua, không chạy model lại.
Khi embed lỗi: giữ nguyên vector cũ (matching vẫn chạy được) và đặt text_hash =
NULL để vòng quét sau thử lại.
"""
import logging
from dataclasses import dataclass

from starlette.concurrency import run_in_threadpool

from app.db import get_matching_pool, get_profile_pool
from app.services.embedding_service import embed_text
from app.services.profile_text import MENTEE, MENTOR, normalize, text_hash

log = logging.getLogger(__name__)

# Trạng thái chỉ mục trả về cho caller.
UPDATED = "UPDATED"      # vừa embed lại xong
UNCHANGED = "UNCHANGED"  # text không đổi, tái dùng vector cũ (NFR-7)
PENDING = "PENDING"      # chưa có vector khớp text hiện tại — vòng quét sau sẽ thử lại
NOT_FOUND = "NOT_FOUND"  # không có hồ sơ nào với user_id này

ROLES = (MENTOR, MENTEE)

# Các cột tạo nên text nguồn — chỉ đọc đúng những cột này từ profile_db.
_SPEC = {
    MENTOR: {
        "profile_table": "mentor_profiles",
        "index_table": "mentor_embeddings",
        "columns": "user_id, domain, skills, years_experience, bio",
    },
    MENTEE: {
        "profile_table": "mentee_profiles",
        "index_table": "mentee_embeddings",
        "columns": "user_id, domain, skills, current_level, goal",
    },
}


@dataclass(frozen=True)
class IndexResult:
    user_id: str
    role: str | None
    status: str
    indexed_at: object | None = None


def _spec(role: str) -> dict:
    if role not in _SPEC:
        raise ValueError(f"role không hợp lệ: {role}")
    return _SPEC[role]


# ---------------- đọc dữ liệu ----------------


async def _fetch_profile(role: str, user_id: str) -> dict | None:
    spec = _spec(role)
    pool = await get_profile_pool()
    row = await pool.fetchrow(
        f"SELECT {spec['columns']} FROM {spec['profile_table']} WHERE user_id = $1::uuid", user_id
    )
    return dict(row) if row else None


async def _fetch_all_profiles(role: str) -> list[dict]:
    spec = _spec(role)
    pool = await get_profile_pool()
    rows = await pool.fetch(f"SELECT {spec['columns']} FROM {spec['profile_table']}")
    return [dict(r) for r in rows]


async def _fetch_index_row(role: str, user_id: str) -> dict | None:
    spec = _spec(role)
    pool = await get_matching_pool()
    row = await pool.fetchrow(
        f"SELECT user_id, text_hash, indexed_at, (embedding IS NOT NULL) AS has_vector "
        f"FROM {spec['index_table']} WHERE user_id = $1::uuid",
        user_id,
    )
    return dict(row) if row else None


async def detect_role(user_id: str) -> str | None:
    """Một user_id chỉ là mentor HOẶC mentee — tra cứu xem hồ sơ nằm ở bảng nào."""
    pool = await get_profile_pool()
    row = await pool.fetchrow(
        """
        SELECT 'MENTOR' AS role FROM mentor_profiles WHERE user_id = $1::uuid
        UNION ALL
        SELECT 'MENTEE' FROM mentee_profiles WHERE user_id = $1::uuid
        LIMIT 1
        """,
        user_id,
    )
    return row["role"] if row else None


async def has_embedding(role: str, user_id: str) -> bool:
    spec = _spec(role)
    pool = await get_matching_pool()
    return bool(await pool.fetchval(
        f"SELECT 1 FROM {spec['index_table']} WHERE user_id = $1::uuid AND embedding IS NOT NULL", user_id
    ))


# ---------------- ghi chỉ mục ----------------


def _to_pgvector(vector: list[float]) -> str:
    return "[" + ",".join(repr(float(v)) for v in vector) + "]"


async def _store_vector(role: str, user_id: str, vector: list[float], hash_: str):
    spec = _spec(role)
    pool = await get_matching_pool()
    return await pool.fetchval(
        f"""
        INSERT INTO {spec['index_table']} (user_id, embedding, text_hash, indexed_at, attempts, last_error, updated_at)
        -- $2::text::vector chứ không phải $2::vector: asyncpg không có codec cho kiểu
        -- `vector`, nên tham số phải được gửi dưới dạng text rồi để Postgres tự ép kiểu.
        VALUES ($1::uuid, $2::text::vector, $3, now(), 0, NULL, now())
        ON CONFLICT (user_id) DO UPDATE
            SET embedding = EXCLUDED.embedding, text_hash = EXCLUDED.text_hash,
                indexed_at = now(), attempts = 0, last_error = NULL, updated_at = now()
        RETURNING indexed_at
        """,
        user_id, _to_pgvector(vector), hash_,
    )


async def _mark_pending(role: str, user_id: str, error: str) -> None:
    """Giữ nguyên vector cũ (nếu có) để matching vẫn chạy được, chỉ xoá hash."""
    spec = _spec(role)
    pool = await get_matching_pool()
    await pool.execute(
        f"""
        INSERT INTO {spec['index_table']} (user_id, text_hash, attempts, last_error, updated_at)
        VALUES ($1::uuid, NULL, 1, $2, now())
        ON CONFLICT (user_id) DO UPDATE
            SET text_hash = NULL, attempts = {spec['index_table']}.attempts + 1,
                last_error = EXCLUDED.last_error, updated_at = now()
        """,
        user_id, error[:500],
    )


async def _index(role: str, profile: dict, force: bool) -> IndexResult:
    """Embed 1 hồ sơ đã đọc sẵn. Không mở transaction quanh lời gọi model."""
    user_id = str(profile["user_id"])
    text = normalize(role, profile)
    hash_ = text_hash(text)

    if not force:
        current = await _fetch_index_row(role, user_id)
        if current and current["has_vector"] and current["text_hash"] == hash_:
            return IndexResult(user_id, role, UNCHANGED, current["indexed_at"])

    try:
        # Model chạy đồng bộ => đẩy sang threadpool để không chặn event loop.
        vector = await run_in_threadpool(embed_text, text)
    except Exception as exc:  # model chưa load được / hết bộ nhớ ...
        log.warning("Embed thất bại cho %s %s: %s", role, user_id, exc)
        await _mark_pending(role, user_id, str(exc))
        return IndexResult(user_id, role, PENDING)

    indexed_at = await _store_vector(role, user_id, vector, hash_)
    return IndexResult(user_id, role, UPDATED, indexed_at)


# ---------------- API dùng bởi router & job ----------------


async def reindex(user_id: str, role: str | None = None, force: bool = False) -> IndexResult:
    """Sinh lại embedding cho 1 hồ sơ. role = None => tự phát hiện."""
    role = role or await detect_role(user_id)
    if role is None:
        return IndexResult(user_id, None, NOT_FOUND)
    profile = await _fetch_profile(role, user_id)
    if profile is None:
        return IndexResult(user_id, role, NOT_FOUND)
    return await _index(role, profile, force)


async def status(user_id: str, role: str | None = None) -> IndexResult:
    """
    Trạng thái chỉ mục hiện tại: UPDATED khi vector khớp đúng nội dung hồ sơ đang
    lưu, PENDING khi hồ sơ đã đổi/chưa embed được.
    """
    role = role or await detect_role(user_id)
    if role is None:
        return IndexResult(user_id, None, NOT_FOUND)
    profile = await _fetch_profile(role, user_id)
    if profile is None:
        return IndexResult(user_id, role, NOT_FOUND)
    current = await _fetch_index_row(role, user_id)
    if current and current["has_vector"] and current["text_hash"] == text_hash(normalize(role, profile)):
        return IndexResult(user_id, role, UPDATED, current["indexed_at"])
    return IndexResult(user_id, role, PENDING, current["indexed_at"] if current else None)


async def _prune(role: str, live_ids: set) -> int:
    """Xoá chỉ mục của hồ sơ đã bị xoá ở profile_db (không có FK giữa 2 database)."""
    spec = _spec(role)
    pool = await get_matching_pool()
    indexed = {r["user_id"] for r in await pool.fetch(f"SELECT user_id FROM {spec['index_table']}")}
    orphans = list(indexed - live_ids)
    if not orphans:
        return 0
    await pool.execute(f"DELETE FROM {spec['index_table']} WHERE user_id = ANY($1::uuid[])", orphans)
    return len(orphans)


async def reconcile(batch: int) -> dict:
    """
    Một vòng đồng bộ: so hash text của mọi hồ sơ với chỉ mục, embed lại phần lệch
    (tối đa `batch` hồ sơ mỗi vai trò mỗi vòng) và dọn chỉ mục mồ côi.
    """
    stats = {"reindexed": 0, "pending": 0, "pruned": 0, "stale": 0}
    for role in ROLES:
        spec = _spec(role)
        profiles = await _fetch_all_profiles(role)
        live_ids = {p["user_id"] for p in profiles}
        stats["pruned"] += await _prune(role, live_ids)

        pool = await get_matching_pool()
        indexed = {
            r["user_id"]: r["text_hash"]
            for r in await pool.fetch(
                f"SELECT user_id, text_hash FROM {spec['index_table']} WHERE embedding IS NOT NULL"
            )
        }
        stale = [p for p in profiles if indexed.get(p["user_id"]) != text_hash(normalize(role, p))]
        stats["stale"] += len(stale)
        for profile in stale[:batch]:
            result = await _index(role, profile, force=True)
            stats["reindexed" if result.status == UPDATED else "pending"] += 1
    return stats


async def rebuild_all(force: bool) -> dict:
    """Sinh embedding còn thiếu (force=False) hoặc sinh lại toàn bộ (force=True)."""
    stats = {"mentors": 0, "mentees": 0, "pending": 0}
    for role, key in ((MENTOR, "mentors"), (MENTEE, "mentees")):
        for profile in await _fetch_all_profiles(role):
            result = await _index(role, profile, force)
            stats["pending" if result.status == PENDING else key] += 1
    return stats
