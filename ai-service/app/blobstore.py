"""
Lớp lưu trữ file dùng chung cho ai-service (CV, video phỏng vấn).

- Có S3_ENDPOINT_URL (MinIO trong docker compose, Cloudflare R2) hoặc S3_ENABLED=true (AWS S3): lưu lên object storage.
- Không cấu hình: lưu trên đĩa như trước (docker volume / thư mục tạm khi chạy test).

Khi dùng object storage, file cũ còn nằm trên đĩa vẫn đọc và xoá được (`legacy`), nên không cần di chuyển dữ liệu
trước khi bật; `scripts/migrate_files_to_s3.py` chép phần còn lại lên bucket khi muốn dọn volume.

Mọi key là đường dẫn tương đối dạng `a/b/c.ext`. Lỗi trả về: FileNotFoundError (không có file) hoặc OSError (lỗi lưu trữ);
nơi gọi tự đổi sang AiError phù hợp.
"""
import os
import shutil
import threading
from collections.abc import Callable, Iterator
from pathlib import Path

BLOCK = 256 * 1024


def _check_key(key: str) -> str:
    parts = key.split("/")
    if not key or key.startswith("/") or "\\" in key or any(p in ("", ".", "..") for p in parts):
        raise PermissionError("Đường dẫn file không hợp lệ")
    return key


class LocalStore:
    """Lưu trên đĩa dưới một thư mục gốc; thư mục gốc đọc lúc gọi (test đổi được)."""

    def __init__(self, root: Callable[[], str]):
        self._root_fn = root

    def _root(self) -> Path:
        return Path(self._root_fn()).resolve()

    def _path(self, key: str) -> Path:
        _check_key(key)
        path = (self._root() / key).resolve()
        if not path.is_relative_to(self._root()):
            raise PermissionError("Đường dẫn file không hợp lệ")
        return path

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def put_file(self, key: str, source: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, path)

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def size(self, key: str) -> int | None:
        path = self._path(key)
        return path.stat().st_size if path.is_file() else None

    def iter_range(self, key: str, start: int, end: int) -> Iterator[bytes]:
        with self._path(key).open("rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = f.read(min(BLOCK, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    def delete(self, key: str) -> bool:
        path = self._path(key)
        existed = path.is_file()
        path.unlink(missing_ok=True)
        return existed

    def delete_prefix(self, prefix: str) -> bool:
        folder = self._path(prefix.rstrip("/"))
        if not folder.exists():
            return False
        shutil.rmtree(folder, ignore_errors=True)
        return True


class S3Store:
    """Object storage chuẩn S3. Mọi key nằm dưới `<prefix>/` trong bucket."""

    def __init__(self, prefix: str, client_factory: Callable[[], object], bucket: Callable[[], str]):
        self._prefix = prefix.strip("/")
        self._client_factory = client_factory
        self._bucket_fn = bucket

    def _client(self):
        return self._client_factory()

    def _key(self, key: str) -> str:
        return f"{self._prefix}/{_check_key(key)}"

    def _call(self, fn, *args, **kwargs):
        from botocore.exceptions import BotoCoreError, ClientError
        try:
            return fn(*args, **kwargs)
        except ClientError as e:
            code = str(e.response.get("Error", {}).get("Code", ""))
            if code in ("404", "NoSuchKey", "NotFound", "NoSuchBucket"):
                raise FileNotFoundError(code) from e
            raise OSError(f"S3 {code}: {e}") from e
        except BotoCoreError as e:
            raise OSError(f"S3: {e}") from e

    def put(self, key: str, data: bytes) -> None:
        self._call(self._client().put_object, Bucket=self._bucket_fn(), Key=self._key(key), Body=data)

    def put_file(self, key: str, source: str) -> None:
        self._call(self._client().upload_file, source, self._bucket_fn(), self._key(key))

    def get(self, key: str) -> bytes:
        return self._call(self._client().get_object, Bucket=self._bucket_fn(), Key=self._key(key))["Body"].read()

    def size(self, key: str) -> int | None:
        try:
            return int(self._call(self._client().head_object, Bucket=self._bucket_fn(), Key=self._key(key))["ContentLength"])
        except FileNotFoundError:
            return None

    def iter_range(self, key: str, start: int, end: int) -> Iterator[bytes]:
        body = self._call(self._client().get_object, Bucket=self._bucket_fn(), Key=self._key(key),
                          Range=f"bytes={start}-{end}")["Body"]
        try:
            yield from body.iter_chunks(BLOCK)
        finally:
            body.close()

    def delete(self, key: str) -> bool:
        existed = self.size(key) is not None
        self._call(self._client().delete_object, Bucket=self._bucket_fn(), Key=self._key(key))
        return existed

    def delete_prefix(self, prefix: str) -> bool:
        full = f"{self._prefix}/{_check_key(prefix.rstrip('/'))}/"
        client, bucket, found = self._client(), self._bucket_fn(), False
        token = None
        while True:
            kwargs = {"Bucket": bucket, "Prefix": full}
            if token:
                kwargs["ContinuationToken"] = token
            page = self._call(client.list_objects_v2, **kwargs)
            keys = [{"Key": o["Key"]} for o in page.get("Contents", [])]
            if keys:
                found = True
                self._call(client.delete_objects, Bucket=bucket, Delete={"Objects": keys, "Quiet": True})
            if not page.get("IsTruncated"):
                return found
            token = page.get("NextContinuationToken")


class Store:
    """S3 (nếu cấu hình) kèm đọc/xoá ngược trên đĩa cho file cũ; không cấu hình S3 thì chỉ dùng đĩa."""

    def __init__(self, prefix: str, local_root: Callable[[], str]):
        self._prefix = prefix
        self._local = LocalStore(local_root)

    def _remote(self) -> S3Store | None:
        return S3Store(self._prefix, _s3_client, _bucket) if s3_enabled() else None

    def put(self, key: str, data: bytes) -> None:
        (self._remote() or self._local).put(key, data)

    def put_file(self, key: str, source: str) -> None:
        (self._remote() or self._local).put_file(key, source)

    def get(self, key: str) -> bytes:
        remote = self._remote()
        if remote is None:
            return self._local.get(key)
        try:
            return remote.get(key)
        except FileNotFoundError:
            return self._local.get(key)

    def size(self, key: str) -> int | None:
        remote = self._remote()
        if remote is None:
            return self._local.size(key)
        size = remote.size(key)
        return size if size is not None else self._local.size(key)

    def iter_range(self, key: str, start: int, end: int) -> Iterator[bytes]:
        remote = self._remote()
        if remote is not None and remote.size(key) is not None:
            return remote.iter_range(key, start, end)
        return self._local.iter_range(key, start, end)

    def delete(self, key: str) -> bool:
        removed = self._local.delete(key)
        remote = self._remote()
        return (remote.delete(key) if remote else False) or removed

    def delete_prefix(self, prefix: str) -> bool:
        removed = self._local.delete_prefix(prefix)
        remote = self._remote()
        return (remote.delete_prefix(prefix) if remote else False) or removed


# ---- cấu hình S3 (đọc từ môi trường lúc gọi, test đổi được) ----

def s3_enabled() -> bool:
    """Có S3_ENDPOINT_URL (MinIO/R2), hoặc S3_ENABLED=true khi dùng AWS S3 (endpoint mặc định của AWS)."""
    return bool(os.getenv("S3_ENDPOINT_URL", "").strip()) or os.getenv("S3_ENABLED", "").strip().lower() == "true"


def _bucket() -> str:
    return os.getenv("S3_BUCKET", "mmp-files")


_client_lock = threading.Lock()
_client_cache: tuple[tuple, object] | None = None


def _s3_client():
    """boto3 client dùng lại giữa các lời gọi; tạo lại khi cấu hình đổi."""
    global _client_cache
    import boto3
    from botocore.config import Config

    settings = (os.getenv("S3_ENDPOINT_URL", ""), os.getenv("S3_ACCESS_KEY", ""), os.getenv("S3_SECRET_KEY", ""),
                os.getenv("S3_REGION", "us-east-1"))
    with _client_lock:
        if _client_cache is None or _client_cache[0] != settings:
            endpoint, access, secret, region = settings
            client = boto3.client(
                "s3", endpoint_url=endpoint or None, aws_access_key_id=access or None,
                aws_secret_access_key=secret or None, region_name=region,
                config=Config(signature_version="s3v4", s3={"addressing_style": "path"},
                              retries={"max_attempts": 3, "mode": "standard"},
                              connect_timeout=5, read_timeout=60),
            )
            _client_cache = (settings, client)
        return _client_cache[1]
