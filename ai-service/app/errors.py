class AiError(Exception):
    """Lỗi nghiệp vụ trả về client với mã lỗi ổn định (format chung { error: { code, message } })."""

    def __init__(self, code: str, message: str, status: int = 400, extra: dict | None = None,
                 headers: dict[str, str] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        # Trường bổ sung đặt cạnh code/message trong "error" (vd. retryAfter của INTERVIEW_COOLDOWN).
        self.extra = extra or {}
        self.headers = headers or {}  # vd. Retry-After của RATE_LIMITED (US-46)


def bad_request(code: str, message: str) -> AiError:
    return AiError(code, message, status=400)


def forbidden(message: str) -> AiError:
    return AiError("FORBIDDEN", message, status=403)


def not_found(code: str, message: str) -> AiError:
    return AiError(code, message, status=404)


def conflict(code: str, message: str, extra: dict | None = None) -> AiError:
    return AiError(code, message, status=409, extra=extra)
