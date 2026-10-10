import os

# Giá trị dev mặc định — chỉ để chạy local/test; dev_secret_warnings() cảnh báo khi còn dùng.
_DEV_JWT_SECRET = "dev-only-secret-change-me-0123456789-abcdefghijklmnopqrstuvwxyz"
_DEV_INTERNAL_API_KEY = "dev-internal-key"

# DB của chính matching-service: chứa chỉ mục embedding (mentor_embeddings,
# mentee_embeddings). matching-service là service DUY NHẤT ghi vào đây.
MATCHING_DB_URL = os.getenv(
    "MATCHING_DB_URL",
    "postgresql://postgres:postgres@localhost:5439/matching_db",
)
# Ngoại lệ đã được duyệt: matching-service đọc TRỰC TIẾP (read-only) DB của
# profile-service để lấy text nguồn cho embedding và dữ liệu lọc/xếp hạng mentor.
# Dùng role `matching_reader` chỉ có quyền SELECT.
PROFILE_DB_URL = os.getenv(
    "PROFILE_DB_URL",
    "postgresql://matching_reader:matching_reader@localhost:5434/profile_db",
)
# NFR-9 — APP_ENV=prod: từ chối khởi động nếu còn dùng khoá dev mặc định (prod_secret_errors()).
APP_ENV = os.getenv("APP_ENV", "dev").strip().lower()
JWT_SECRET = os.getenv("JWT_SECRET", _DEV_JWT_SECRET)
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", _DEV_INTERNAL_API_KEY)
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
PRELOAD_MODEL = os.getenv("PRELOAD_MODEL", "true").lower() == "true"

# IndexSyncJob — lưới an toàn cho thông báo best-effort của profile-service:
# quét profile_db, embed lại hồ sơ có text đã đổi và dọn chỉ mục của hồ sơ đã xoá.
INDEX_SYNC_ENABLED = os.getenv("INDEX_SYNC_ENABLED", "true").lower() == "true"
INDEX_SYNC_INTERVAL = float(os.getenv("INDEX_SYNC_INTERVAL", "60"))  # giây
INDEX_SYNC_BATCH = int(os.getenv("INDEX_SYNC_BATCH", "200"))  # số hồ sơ embed lại mỗi vòng

# US-35 (PRD-MATCH-3) — trọng số xếp hạng: similarity, rating, kinh nghiệm, độ khớp lịch, tốc độ phản hồi.
# Mặc định theo PRD (0.6 / 0.15 / 0.1 / 0.1 / 0.05); đổi bằng biến môi trường, không cần sửa code.
MATCH_WEIGHT_SIMILARITY = float(os.getenv("MATCH_WEIGHT_SIMILARITY", "0.6"))
MATCH_WEIGHT_RATING = float(os.getenv("MATCH_WEIGHT_RATING", "0.15"))
MATCH_WEIGHT_EXPERIENCE = float(os.getenv("MATCH_WEIGHT_EXPERIENCE", "0.1"))
MATCH_WEIGHT_SCHEDULE = float(os.getenv("MATCH_WEIGHT_SCHEDULE", "0.1"))
MATCH_WEIGHT_RESPONSIVENESS = float(os.getenv("MATCH_WEIGHT_RESPONSIVENESS", "0.05"))

# US-11 — áp dụng matching-service/migrations/*.sql lúc khởi động (bảng schema_migrations).
MIGRATE_ON_STARTUP = os.getenv("MIGRATE_ON_STARTUP", "true").lower() == "true"


def is_prod() -> bool:
    return APP_ENV == "prod"


def prod_secret_errors() -> list[str]:
    """NFR-9 — tên các biến còn dùng giá trị dev mặc định khi chạy ở APP_ENV=prod (rỗng = an toàn)."""
    if not is_prod():
        return []
    problems = []
    if JWT_SECRET == _DEV_JWT_SECRET:
        problems.append("JWT_SECRET")
    if INTERNAL_API_KEY == _DEV_INTERNAL_API_KEY:
        problems.append("INTERNAL_API_KEY")
    return problems


def dev_secret_warnings() -> list[str]:
    """
    Cảnh báo (log lúc khởi động) khi JWT_SECRET / INTERNAL_API_KEY đang dùng giá trị dev
    mặc định. Không chặn khởi động để local dev và test vẫn chạy được, nhưng khi triển
    khai thật bắt buộc phải đặt hai biến này (xem .env.example).
    """
    warnings = []
    if JWT_SECRET == _DEV_JWT_SECRET:
        warnings.append("!!! JWT_SECRET chưa được đặt — đang dùng khoá DEV mặc định, ai cũng có thể "
                        "giả mạo token. KHÔNG dùng cấu hình này khi triển khai thật !!!")
    if INTERNAL_API_KEY == _DEV_INTERNAL_API_KEY:
        warnings.append("!!! INTERNAL_API_KEY chưa được đặt — đang dùng khoá DEV mặc định cho /internal/**. "
                        "KHÔNG dùng cấu hình này khi triển khai thật !!!")
    return warnings

# US-46 (NFR-10): số lần gọi GET /api/matching/mentors tối đa mỗi phút cho một người dùng
MATCHING_PER_MINUTE = int(os.getenv("MATCHING_RATE_LIMIT_PER_MINUTE", "20"))
