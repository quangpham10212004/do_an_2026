import os

# Giá trị dev mặc định — chỉ để chạy local/test; dev_secret_warnings() cảnh báo khi còn dùng.
_DEV_JWT_SECRET = "dev-only-secret-change-me-0123456789-abcdefghijklmnopqrstuvwxyz"
_DEV_INTERNAL_API_KEY = "dev-internal-key"

INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", _DEV_INTERNAL_API_KEY)
JWT_SECRET = os.getenv("JWT_SECRET", _DEV_JWT_SECRET)

# CSDL riêng của ai-service (CONVENTIONS.md mục 7 — 1 database cho mỗi service).
AI_DB_URL = os.getenv("AI_DB_URL", "postgresql://postgres:postgres@localhost:5438/ai_db")

# Service khác mà ai-service gọi tới (header X-Internal-Token).
PROFILE_SERVICE_URL = os.getenv("PROFILE_SERVICE_URL", "http://localhost:8082")
MENTORING_SERVICE_URL = os.getenv("MENTORING_SERVICE_URL", "http://localhost:8083")
SERVICE_TIMEOUT_SECONDS = float(os.getenv("SERVICE_TIMEOUT_SECONDS", "20"))
# Kiểm tra quyền mentor tải CV (gọi mentoring-service) nằm trên đường request => timeout ngắn.
RELATIONSHIP_CHECK_TIMEOUT_SECONDS = float(os.getenv("RELATIONSHIP_CHECK_TIMEOUT_SECONDS", "3"))

# DeepSeek (API tương thích OpenAI). Để trống DEEPSEEK_API_KEY => chỉ dùng engine rule-based.
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-flash")
DEEPSEEK_MAX_TOKENS = int(os.getenv("DEEPSEEK_MAX_TOKENS", "4000"))
DEEPSEEK_TIMEOUT_SECONDS = float(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "60"))

# FR-7.3 / FR-8.4 — số lượt hỏi-đáp cố định của mỗi tính năng.
INTERVIEW_MAX_TURNS = int(os.getenv("INTERVIEW_MAX_TURNS", "5"))
ENRICHMENT_MAX_TURNS = int(os.getenv("ENRICHMENT_MAX_TURNS", "4"))
MAX_ANSWER_LENGTH = 5000

# Lưu file CV (docker volume). Có thể thay bằng object storage (S3/MinIO) khi triển khai thật.
CV_STORAGE_DIR = os.getenv("CV_STORAGE_DIR", "./data/cv")
MAX_CV_BYTES = 5 * 1024 * 1024

# Job thử lại đồng bộ goal sang profile-service khi profile-service tạm thời lỗi.
PROFILE_SYNC_RETRY_SECONDS = float(os.getenv("PROFILE_SYNC_RETRY_SECONDS", "120"))


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
