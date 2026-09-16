"""Trích xuất văn bản từ file PDF (pypdf) kèm các kiểm tra đầu vào."""
import io
import logging

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from app import config
from app.errors import AiError

MAX_PAGES = 10
MIN_TEXT_LENGTH = 50

logging.getLogger("pypdf").setLevel(logging.ERROR)


def extract_text(pdf_bytes: bytes) -> str:
    if not pdf_bytes or not pdf_bytes.startswith(b"%PDF-"):
        raise AiError("INVALID_FILE_TYPE", "File CV phải là định dạng PDF")
    if len(pdf_bytes) > config.MAX_CV_BYTES:
        raise AiError("FILE_TOO_LARGE", "File CV không được vượt quá 5MB", status=413)
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        if reader.is_encrypted:
            raise AiError("ENCRYPTED_PDF", "File PDF đang được đặt mật khẩu")
        if len(reader.pages) > MAX_PAGES:
            raise AiError("CV_TOO_LONG", f"CV không được dài quá {MAX_PAGES} trang")
        text = "\n".join((page.extract_text() or "") for page in reader.pages).replace("\x00", "").strip()
    except AiError:
        raise
    except (PdfReadError, ValueError, KeyError, OSError):
        raise AiError("INVALID_PDF", "Không thể đọc file PDF")
    if len(text) < MIN_TEXT_LENGTH:
        raise AiError("CV_NO_TEXT", "Không đọc được nội dung CV (có thể là ảnh scan). Vui lòng dùng file PDF có lớp văn bản.")
    return text
