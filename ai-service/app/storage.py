"""Lưu file CV trên đĩa (docker volume). Có thể thay bằng object storage (S3/MinIO) khi triển khai thật."""
import uuid
from pathlib import Path

from app import config
from app.errors import AiError

_root = Path(config.CV_STORAGE_DIR).resolve()


def save(user_id: uuid.UUID, content: bytes) -> str:
    try:
        folder = _root / str(user_id)
        folder.mkdir(parents=True, exist_ok=True)
        file = folder / f"{uuid.uuid4()}.pdf"
        file.write_bytes(content)
        return str(file.relative_to(_root))
    except OSError as e:
        raise AiError("STORAGE_ERROR", "Không thể lưu file CV", status=500) from e


def read(relative_path: str) -> bytes:
    file = (_root / relative_path).resolve()
    if not file.is_relative_to(_root):
        raise AiError("FORBIDDEN", "Đường dẫn file không hợp lệ", status=403)
    try:
        return file.read_bytes()
    except OSError:
        raise AiError("CV_FILE_NOT_FOUND", "Không tìm thấy file CV", status=404) from None
