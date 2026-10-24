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
# US-46 (NFR-10): số CV tải lên (upload + parse) tối đa mỗi giờ cho một người dùng
CV_UPLOADS_PER_HOUR = int(os.getenv("CV_UPLOAD_RATE_LIMIT_PER_HOUR", "5"))
# auth-service giữ nhật ký kiểm toán (US-30): POST /internal/audit, gọi kiểu bắn-rồi-quên.
AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://localhost:8081")
AUDIT_TIMEOUT_SECONDS = float(os.getenv("AUDIT_TIMEOUT_SECONDS", "3"))
SERVICE_TIMEOUT_SECONDS = float(os.getenv("SERVICE_TIMEOUT_SECONDS", "20"))
# Kiểm tra quyền mentor tải CV (gọi mentoring-service) nằm trên đường request => timeout ngắn.
RELATIONSHIP_CHECK_TIMEOUT_SECONDS = float(os.getenv("RELATIONSHIP_CHECK_TIMEOUT_SECONDS", "3"))

# DeepSeek (API tương thích OpenAI). Để trống DEEPSEEK_API_KEY => chỉ dùng engine rule-based.
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-flash")
DEEPSEEK_MAX_TOKENS = int(os.getenv("DEEPSEEK_MAX_TOKENS", "4000"))
DEEPSEEK_TIMEOUT_SECONDS = float(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "60"))

# Phỏng vấn giọng nói qua OpenAI Realtime (FR-7.7 mentor, FR-10.x mentee luyện phỏng vấn). Để trống OPENAI_API_KEY:
# APP_ENV=prod => 503 VOICE_UNAVAILABLE; dev/test => vẫn tạo buổi, trả voice = null để gửi bản ghi giả lập.
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_REALTIME_MODEL = os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime")
OPENAI_REALTIME_VOICE = os.getenv("OPENAI_REALTIME_VOICE", "marin")
OPENAI_TRANSCRIBE_MODEL = os.getenv("OPENAI_TRANSCRIBE_MODEL", "gpt-4o-transcribe")
VOICE_INTERVIEW_TOPICS = int(os.getenv("VOICE_INTERVIEW_TOPICS", "4"))
# Buổi giọng nói là một lần ngồi: IN_PROGRESS quá VOICE_SESSION_MINUTES phút mà chưa có bản ghi => ABANDONED.
VOICE_SESSION_MINUTES = float(os.getenv("VOICE_SESSION_MINUTES", "30"))
# FR-10.x — số buổi luyện phỏng vấn với AI miễn phí của mỗi mentee (trọn đời).
PRACTICE_FREE_LIMIT = int(os.getenv("PRACTICE_FREE_LIMIT", "1"))

# FR-7.3 / FR-8.4 — số lượt hỏi-đáp cố định của mỗi tính năng.
INTERVIEW_MAX_TURNS = int(os.getenv("INTERVIEW_MAX_TURNS", "5"))
ENRICHMENT_MAX_TURNS = int(os.getenv("ENRICHMENT_MAX_TURNS", "4"))

# US-22 (PRD-AIV-4) — số lần phỏng vấn tối đa (lần = buổi đã có kết quả) và thời gian chờ sau khi bị từ chối.
INTERVIEW_MAX_ATTEMPTS = int(os.getenv("INTERVIEW_MAX_ATTEMPTS", "3"))
INTERVIEW_COOLDOWN_DAYS = float(os.getenv("INTERVIEW_COOLDOWN_DAYS", "7"))
MAX_ANSWER_LENGTH = 5000

# Lưu file CV (docker volume). Có thể thay bằng object storage (S3/MinIO) khi triển khai thật.
CV_STORAGE_DIR = os.getenv("CV_STORAGE_DIR", "./data/cv")
MAX_CV_BYTES = 5 * 1024 * 1024

# Job thử lại đồng bộ goal sang profile-service khi profile-service tạm thời lỗi.
PROFILE_SYNC_RETRY_SECONDS = float(os.getenv("PROFILE_SYNC_RETRY_SECONDS", "120"))


def is_prod() -> bool:
    """APP_ENV=prod (tương đương Spring profile prod ở các service Java)."""
    return os.getenv("APP_ENV", "dev").strip().lower() == "prod"


def enforce_prod_secrets() -> None:
    """NFR-9 — APP_ENV=prod mà JWT_SECRET / INTERNAL_API_KEY còn giá trị dev mặc định => không khởi động."""
    names = [n for n, v, dev in (("JWT_SECRET", JWT_SECRET, _DEV_JWT_SECRET),
                                 ("INTERNAL_API_KEY", INTERNAL_API_KEY, _DEV_INTERNAL_API_KEY)) if v == dev]
    if is_prod() and names:
        raise RuntimeError(f"APP_ENV=prod: {', '.join(names)} đang dùng giá trị DEV mặc định — "
                           "đặt biến môi trường thật trước khi khởi động")


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
