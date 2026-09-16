import os

INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "dev-internal-key")

# DeepSeek (API tương thích OpenAI). Để trống DEEPSEEK_API_KEY => chỉ dùng engine rule-based.
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-flash")
DEEPSEEK_MAX_TOKENS = int(os.getenv("DEEPSEEK_MAX_TOKENS", "4000"))
DEEPSEEK_TIMEOUT_SECONDS = float(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "60"))

MAX_CV_BYTES = 5 * 1024 * 1024
