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
JWT_SECRET = os.getenv("JWT_SECRET", _DEV_JWT_SECRET)
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", _DEV_INTERNAL_API_KEY)
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
PRELOAD_MODEL = os.getenv("PRELOAD_MODEL", "true").lower() == "true"

# IndexSyncJob — lưới an toàn cho thông báo best-effort của profile-service:
# quét profile_db, embed lại hồ sơ có text đã đổi và dọn chỉ mục của hồ sơ đã xoá.
INDEX_SYNC_ENABLED = os.getenv("INDEX_SYNC_ENABLED", "true").lower() == "true"
INDEX_SYNC_INTERVAL = float(os.getenv("INDEX_SYNC_INTERVAL", "60"))  # giây
INDEX_SYNC_BATCH = int(os.getenv("INDEX_SYNC_BATCH", "200"))  # số hồ sơ embed lại mỗi vòng


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
