"""Lưu file CV: object storage (MinIO / S3) khi có cấu hình S3_*, ngược lại lưu trên đĩa (docker volume). Xem app/blobstore.py."""
import uuid

from app import config
from app.blobstore import Store
from app.errors import AiError

_store = Store("cv", lambda: config.CV_STORAGE_DIR)


def save(user_id: uuid.UUID, content: bytes) -> str:
    key = f"{user_id}/{uuid.uuid4()}.pdf"
    try:
        _store.put(key, content)
    except OSError as e:
        raise AiError("STORAGE_ERROR", "Không thể lưu file CV", status=500) from e
    return key


def read(relative_path: str) -> bytes:
    try:
        return _store.get(relative_path)
    except PermissionError:
        raise AiError("FORBIDDEN", "Đường dẫn file không hợp lệ", status=403) from None
    except OSError:
        raise AiError("CV_FILE_NOT_FOUND", "Không tìm thấy file CV", status=404) from None


def delete(relative_path: str) -> bool:
    """Xoá file CV. File đã mất thì bỏ qua (trả False) — không làm hỏng việc xoá CV."""
    try:
        return _store.delete(relative_path)
    except PermissionError:
        raise AiError("FORBIDDEN", "Đường dẫn file không hợp lệ", status=403) from None
