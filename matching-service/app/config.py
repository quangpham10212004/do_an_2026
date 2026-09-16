import os

# Ngoại lệ đã được duyệt: matching-service đọc TRỰC TIẾP (read-only) DB của
# profile-service. Dùng role `matching_reader` chỉ có quyền SELECT.
PROFILE_DB_URL = os.getenv(
    "PROFILE_DB_URL",
    "postgresql://matching_reader:matching_reader@localhost:5434/profile_db",
)
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-secret-change-me-0123456789-abcdefghijklmnopqrstuvwxyz")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "dev-internal-key")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
PRELOAD_MODEL = os.getenv("PRELOAD_MODEL", "true").lower() == "true"
