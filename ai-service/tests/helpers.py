import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "scripts"))
from common import make_pdf  # noqa: E402  (tái sử dụng bộ sinh PDF tối giản của scripts/)

__all__ = ["make_pdf"]
