"""
Chép CV và video đang nằm trên volume (đĩa) lên bucket S3/MinIO. Chạy một lần sau khi bật S3_ENDPOINT_URL:

    docker compose exec ai-service python -m app.migrate_files [--delete-local]

Không bắt buộc: file cũ vẫn đọc được từ đĩa khi đã bật S3 (xem app/blobstore.py). Chạy lại nhiều lần an toàn
(file đã có trên bucket bị bỏ qua).
"""
import sys
from pathlib import Path

from app import config
from app.blobstore import S3Store, _bucket, _s3_client, s3_enabled


def _migrate(prefix: str, root: Path, delete_local: bool) -> tuple[int, int]:
    remote = S3Store(prefix, _s3_client, _bucket)
    copied = skipped = 0
    if not root.is_dir():
        return copied, skipped
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        key = path.relative_to(root).as_posix()
        if remote.size(key) is None:
            remote.put_file(key, str(path))
            copied += 1
        else:
            skipped += 1
        if delete_local:
            path.unlink()
    return copied, skipped


def main() -> int:
    if not s3_enabled():
        print("Chưa cấu hình S3_ENDPOINT_URL (hoặc S3_ENABLED=true) — không có đích để chép.")
        return 1
    delete_local = "--delete-local" in sys.argv
    for prefix, root in (("cv", config.CV_STORAGE_DIR), ("verification", config.VERIFICATION_STORAGE_DIR)):
        copied, skipped = _migrate(prefix, Path(root).resolve(), delete_local)
        print(f"{prefix}: chép {copied}, bỏ qua {skipped} (đã có trên bucket)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
