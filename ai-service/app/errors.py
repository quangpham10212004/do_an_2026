class AiError(Exception):
    """Lỗi nghiệp vụ trả về client với mã lỗi ổn định (format chung { error: { code, message } })."""

    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
