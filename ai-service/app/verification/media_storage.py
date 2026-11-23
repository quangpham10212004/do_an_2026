"""
Lưu video / âm thanh vòng 1: object storage (MinIO / S3) khi có cấu hình S3_*, ngược lại trên đĩa
(docker volume `verification-media`, không dùng chung với CV). Xem app/blobstore.py.

Cấu trúc key: <interview_id>/<kind>/<n>.part (đoạn) rồi <interview_id>/<kind>.bin (ghép khi kết thúc),
kind = video | audio. Thư mục gốc trên đĩa đọc lúc gọi để test đổi được.
"""
import os
import tempfile
from collections.abc import Iterator

from app import config
from app.blobstore import Store
from app.errors import AiError

KINDS = ("video", "audio")

_store = Store("verification", lambda: config.VERIFICATION_STORAGE_DIR)


def _forbidden() -> AiError:
    return AiError("FORBIDDEN", "Đường dẫn file không hợp lệ", status=403)


def write_chunk(storage_dir: str, kind: str, n: int, data: bytes) -> None:
    try:
        _store.put(f"{storage_dir}/{kind}/{n:06d}.part", data)
    except PermissionError:
        raise _forbidden() from None
    except OSError as e:
        raise AiError("STORAGE_ERROR", "Không thể lưu đoạn video", status=500) from e


def write_blob(storage_dir: str, name: str, data: bytes) -> None:
    """Lưu nguyên một tệp (video của một câu trả lời) thành `<storage_dir>/<name>.bin`."""
    try:
        _store.put(f"{storage_dir}/{name}.bin", data)
    except PermissionError:
        raise _forbidden() from None
    except OSError as e:
        raise AiError("STORAGE_ERROR", "Không thể lưu video", status=500) from e


def assemble(storage_dir: str, kind: str, chunk_numbers: list[int]) -> int:
    """Ghép các đoạn theo thứ tự n thành `<kind>.bin`; trả về số byte. Không có đoạn nào thì không tạo file (trả 0)."""
    total = 0
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, prefix="assemble-") as tmp:
            tmp_path = tmp.name
            for n in sorted(chunk_numbers):
                try:
                    data = _store.get(f"{storage_dir}/{kind}/{n:06d}.part")
                except FileNotFoundError:
                    continue
                tmp.write(data)
                total += len(data)
        if total:
            _store.put_file(f"{storage_dir}/{kind}.bin", tmp_path)
        else:
            _store.delete(f"{storage_dir}/{kind}.bin")
        _store.delete_prefix(f"{storage_dir}/{kind}")
    except PermissionError:
        raise _forbidden() from None
    except OSError as e:
        raise AiError("STORAGE_ERROR", "Không thể ghép video", status=500) from e
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
    return total


def file_size(storage_dir: str, kind: str) -> int | None:
    try:
        return _store.size(f"{storage_dir}/{kind}.bin")
    except PermissionError:
        raise _forbidden() from None


def read_all(storage_dir: str, kind: str) -> bytes | None:
    try:
        return _store.get(f"{storage_dir}/{kind}.bin")
    except FileNotFoundError:
        return None
    except PermissionError:
        raise _forbidden() from None


def iter_range(storage_dir: str, kind: str, start: int, end: int, block: int = 256 * 1024) -> Iterator[bytes]:
    """Đọc [start, end] (bao gồm cả hai đầu) theo từng khối, cho phản hồi 206 / 200 dạng stream."""
    try:
        yield from _store.iter_range(f"{storage_dir}/{kind}.bin", start, end)
    except PermissionError:
        raise _forbidden() from None


def delete_blob(storage_dir: str, name: str) -> bool:
    try:
        return _store.delete(f"{storage_dir}/{name}.bin")
    except PermissionError:
        raise _forbidden() from None


def delete(storage_dir: str) -> bool:
    """Xoá toàn bộ file của một buổi. Đã mất thì bỏ qua (trả False)."""
    try:
        return _store.delete_prefix(storage_dir)
    except PermissionError:
        raise _forbidden() from None
