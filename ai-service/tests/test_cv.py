from datetime import date

import pytest

from app.cv import rule_based
from app.cv.extractor import extract_text
from app.cv.skills import find_skills
from app.errors import AiError
from tests.helpers import make_pdf

CV = """
NGUYỄN VĂN A
Junior Backend Developer
Email: a@example.com

MỤC TIÊU NGHỀ NGHIỆP
Trở thành kỹ sư backend giỏi.

KINH NGHIỆM LÀM VIỆC
Công ty ABC — Backend Developer (03/2022 - 03/2024)
- Phát triển REST API với Spring Boot, PostgreSQL
- Triển khai Docker và GitHub Actions

DỰ ÁN
Hệ thống đặt vé xem phim
- Xây dựng microservices với Java, Kafka, Redis
Website bán hàng
- Frontend React, backend Node.js

HỌC VẤN
Học viện Công nghệ Bưu chính Viễn thông — Công nghệ thông tin (2018 - 2022)

KỸ NĂNG
Java, Spring Boot, JavaScript, Git
"""


def test_extracts_structured_data():
    cv = rule_based.parse(CV)
    assert {"Java", "Spring Boot", "PostgreSQL", "Docker", "GitHub Actions", "Kafka", "Redis", "React",
            "Node.js", "REST API", "Microservices", "JavaScript", "Git"} <= set(cv.skills)
    assert cv.current_role == "Junior Backend Developer"
    assert cv.years_experience == 2
    assert [p.name for p in cv.projects] == ["Hệ thống đặt vé xem phim", "Website bán hàng"]
    assert cv.projects[0].technologies == ["Microservices", "Java", "Kafka", "Redis"]
    assert len(cv.education) == 1


def test_explicit_years_win_over_date_ranges():
    cv = rule_based.parse("Senior Java Engineer with 8+ years of experience\nKinh nghiệm\nABC 2020 - 2021")
    assert cv.years_experience == 8


def test_ongoing_range_counts_until_today():
    years = rule_based.extract_years("x", ["Công ty X 01/2023 - nay"], today=date(2026, 7, 1))
    assert years == 4  # 42 tháng → làm tròn 4 năm


def test_education_years_are_not_counted_as_experience():
    cv = rule_based.parse("Sinh viên năm 4\nHọc vấn\nĐại học Bách khoa 2021 - 2025\nKỹ năng\nPython")
    assert cv.years_experience is None


def test_most_frequent_skills_come_first():
    assert find_skills("Docker. Java project. Java API. Java tests. Docker compose. Redis") == ["Java", "Docker", "Redis"]


def test_skill_matching_uses_word_boundaries():
    assert find_skills("Tôi dùng Google Docs và JavaScript") == ["JavaScript"]
    assert {"Go", "C#", "C++", ".NET"} <= set(find_skills("Golang developer, C#, C++ và .NET"))
    assert find_skills("React Native app") == ["React Native"]


def test_extract_text_from_pdf():
    text = extract_text(make_pdf(["Backend Developer", "Skills: Java, Spring Boot, PostgreSQL, Docker", "Projects: Booking system"]))
    assert "Spring Boot" in text and "Booking system" in text


def test_rejects_non_pdf():
    with pytest.raises(AiError) as e:
        extract_text(b"hello world, not a pdf")
    assert e.value.code == "INVALID_FILE_TYPE"


def test_rejects_pdf_without_text():
    with pytest.raises(AiError) as e:
        extract_text(make_pdf(["Hi"]))
    assert e.value.code == "CV_NO_TEXT"
