"""Lớp lưu trữ file: đĩa, S3 (client giả trong bộ nhớ), file cũ trên đĩa khi đã bật S3, chống path traversal."""
import io
import uuid

import pytest
from botocore.exceptions import ClientError

from app import blobstore, config, storage
from app.errors import AiError
from app.verification import media_storage


class FakeBody:
    def __init__(self, data: bytes):
        self._io = io.BytesIO(data)

    def read(self):
        return self._io.read()

    def iter_chunks(self, size):
        while chunk := self._io.read(size):
            yield chunk

    def close(self):
        pass


class FakeS3:
    """Đủ các lời gọi blobstore dùng: put/get/head/delete/list/upload_file."""

    def __init__(self):
        self.objects: dict[str, bytes] = {}

    def _missing(self, op):
        return ClientError({"Error": {"Code": "NoSuchKey"}}, op)

    def put_object(self, Bucket, Key, Body):
        self.objects[Key] = bytes(Body)

    def upload_file(self, source, Bucket, Key):
        with open(source, "rb") as f:
            self.objects[Key] = f.read()

    def get_object(self, Bucket, Key, Range=None):
        if Key not in self.objects:
            raise self._missing("GetObject")
        data = self.objects[Key]
        if Range:
            start, end = Range.removeprefix("bytes=").split("-")
            data = data[int(start):int(end) + 1]
        return {"Body": FakeBody(data)}

    def head_object(self, Bucket, Key):
        if Key not in self.objects:
            raise ClientError({"Error": {"Code": "404"}}, "HeadObject")
        return {"ContentLength": len(self.objects[Key])}

    def delete_object(self, Bucket, Key):
        self.objects.pop(Key, None)

    def delete_objects(self, Bucket, Delete, **_):
        for o in Delete["Objects"]:
            self.objects.pop(o["Key"], None)

    def list_objects_v2(self, Bucket, Prefix, **_):
        return {"Contents": [{"Key": k} for k in sorted(self.objects) if k.startswith(Prefix)], "IsTruncated": False}


@pytest.fixture
def s3(monkeypatch):
    fake = FakeS3()
    monkeypatch.setenv("S3_ENDPOINT_URL", "http://minio.test:9000")
    monkeypatch.setattr(blobstore, "_s3_client", lambda: fake)
    return fake


def test_cv_on_s3_roundtrip(s3):
    user = uuid.uuid4()
    key = storage.save(user, b"%PDF-demo")
    assert s3.objects[f"cv/{key}"] == b"%PDF-demo"
    assert storage.read(key) == b"%PDF-demo"
    assert storage.delete(key) is True
    assert storage.delete(key) is False
    with pytest.raises(AiError) as e:
        storage.read(key)
    assert e.value.status == 404


def test_cv_on_disk_when_s3_not_configured(monkeypatch):
    monkeypatch.delenv("S3_ENDPOINT_URL", raising=False)
    key = storage.save(uuid.uuid4(), b"local")
    assert storage.read(key) == b"local"


def test_legacy_disk_file_still_readable_and_deletable_after_s3_enabled(monkeypatch):
    monkeypatch.delenv("S3_ENDPOINT_URL", raising=False)
    key = storage.save(uuid.uuid4(), b"old-file")
    monkeypatch.setenv("S3_ENDPOINT_URL", "http://minio.test:9000")
    fake = FakeS3()
    monkeypatch.setattr(blobstore, "_s3_client", lambda: fake)
    assert storage.read(key) == b"old-file"
    assert storage.delete(key) is True
    with pytest.raises(AiError):
        storage.read(key)


@pytest.mark.parametrize("bad", ["../x.pdf", "a/../../x.pdf", "/etc/passwd", "a//b"])
def test_path_traversal_rejected(bad, s3):
    with pytest.raises(AiError) as e:
        storage.read(bad)
    assert e.value.status == 403


def test_video_chunks_assemble_stream_and_delete_on_s3(s3):
    d = f"{uuid.uuid4()}"
    media_storage.write_chunk(d, "video", 1, b"BBB")
    media_storage.write_chunk(d, "video", 0, b"AAA")
    media_storage.write_chunk(d, "video", 2, b"CC")
    assert media_storage.assemble(d, "video", [0, 1, 2]) == 8
    assert s3.objects[f"verification/{d}/video.bin"] == b"AAABBBCC"
    assert not [k for k in s3.objects if k.endswith(".part")]
    assert media_storage.file_size(d, "video") == 8
    assert b"".join(media_storage.iter_range(d, "video", 2, 5)) == b"ABBB"
    assert media_storage.read_all(d, "audio") is None
    assert media_storage.delete(d) is True
    assert media_storage.file_size(d, "video") is None


def test_assemble_without_chunks_creates_nothing(s3):
    d = f"{uuid.uuid4()}"
    assert media_storage.assemble(d, "audio", []) == 0
    assert media_storage.file_size(d, "audio") is None


def test_live_blob_on_s3(s3):
    d = f"live/{uuid.uuid4()}"
    media_storage.write_blob(d, "a1", b"clip")
    assert media_storage.file_size(d, "a1") == 4
    assert media_storage.delete_blob(d, "a1") is True
    assert media_storage.delete_blob(d, "a1") is False


def test_s3_server_error_becomes_storage_error(monkeypatch):
    class Broken(FakeS3):
        def put_object(self, **_):
            raise ClientError({"Error": {"Code": "InternalError"}}, "PutObject")

    monkeypatch.setenv("S3_ENDPOINT_URL", "http://minio.test:9000")
    monkeypatch.setattr(blobstore, "_s3_client", lambda: Broken())
    with pytest.raises(AiError) as e:
        storage.save(uuid.uuid4(), b"x")
    assert e.value.code == "STORAGE_ERROR"


def test_disk_assemble_matches_previous_behavior(monkeypatch):
    monkeypatch.delenv("S3_ENDPOINT_URL", raising=False)
    d = f"{uuid.uuid4()}"
    media_storage.write_chunk(d, "video", 0, b"12")
    media_storage.write_chunk(d, "video", 1, b"345")
    assert media_storage.assemble(d, "video", [0, 1]) == 5
    assert media_storage.read_all(d, "video") == b"12345"
    assert b"".join(media_storage.iter_range(d, "video", 1, 3)) == b"234"
