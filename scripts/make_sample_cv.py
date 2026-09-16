#!/usr/bin/env python3
"""Sinh file CV mẫu (PDF) để demo tính năng CV Parsing: python3 scripts/make_sample_cv.py"""
import pathlib

from common import SAMPLE_CV_LINES, make_pdf

out = pathlib.Path(__file__).parent / "sample-cv.pdf"
out.write_bytes(make_pdf(SAMPLE_CV_LINES))
print(f"Đã tạo {out}")
