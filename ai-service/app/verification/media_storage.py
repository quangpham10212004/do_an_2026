"""
Lưu video / âm thanh vòng 1 trên đĩa (docker volume `verification-media`); không dùng chung volume với CV.
Có thể thay bằng object storage khi triển khai thật. Mẫu chống path traversal giống app/storage.py.

Cấu trúc: <root>/<interview_id>/<kind>/<n>.part (đoạn) rồi <root>/<interview_id>/<kind>.bin (ghép khi kết thúc),
kind = video | audio. Thư mục gốc đọc lúc gọi để test đổi được.
"""
import shutil
from collections.abc import Iterator
from pathlib import Path

from app import config
from app.errors import AiError

KINDS = ("video", "audio")


def _root() -> Path:
    return Path(config.VERIFICATION_STORAGE_DIR).resolve()


def _safe(relative: str) -> Path:
    path = (_root() / relative).resolve()
    if not path.is_relative_to(_root()):
        raise AiError("FORBIDDEN", "Đường dẫn file không hợp lệ", status=403)
    return path


def write_chunk(storage_dir: str, kind: str, n: int, data: bytes) -> None:
    try:
        folder = _safe(f"{storage_dir}/{kind}")
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{n:06d}.part").write_bytes(data)
    except OSError as e:
        raise AiError("STORAGE_ERROR", "Không thể lưu đoạn video", status=500) from e


def assemble(storage_dir: str, kind: str, chunk_numbers: list[int]) -> int:
    """Ghép các đoạn theo thứ tự n thành `<kind>.bin`; trả về số byte. Không có đoạn nào thì không tạo file (trả 0)."""
    folder = _safe(f"{storage_dir}/{kind}")
    out = _safe(f"{storage_dir}/{kind}.bin")
    total = 0
    try:
        with out.open("wb") as target:
            for n in sorted(chunk_numbers):
                part = folder / f"{n:06d}.part"
                if part.is_file():
                    data = part.read_bytes()
                    target.write(data)
                    total += len(data)
        shutil.rmtree(folder, ignore_errors=True)
    except OSError as e:
        raise AiError("STORAGE_ERROR", "Không thể ghép video", status=500) from e
    if total == 0:
        out.unlink(missing_ok=True)
    return total


def file_size(storage_dir: str, kind: str) -> int | None:
    path = _safe(f"{storage_dir}/{kind}.bin")
    return path.stat().st_size if path.is_file() else None


def read_all(storage_dir: str, kind: str) -> bytes | None:
    path = _safe(f"{storage_dir}/{kind}.bin")
    return path.read_bytes() if path.is_file() else None


def iter_range(storage_dir: str, kind: str, start: int, end: int, block: int = 256 * 1024) -> Iterator[bytes]:
    """Đọc [start, end] (bao gồm cả hai đầu) theo từng khối, cho phản hồi 206 / 200 dạng stream."""
    path = _safe(f"{storage_dir}/{kind}.bin")
    with path.open("rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            chunk = f.read(min(block, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def delete(storage_dir: str) -> bool:
    """Xoá toàn bộ file của một buổi. Đã mất thì bỏ qua (trả False)."""
    folder = _safe(storage_dir)
    if not folder.exists():
        return False
    shutil.rmtree(folder, ignore_errors=True)
    return True
