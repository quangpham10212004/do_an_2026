from typing import Annotated

from pydantic import AfterValidator, Field, StringConstraints

from app.schemas import CamelModel


class Project(CamelModel):
    name: str
    description: str = ""
    technologies: list[str] = []


class ParsedCv(CamelModel):
    """Dữ liệu có cấu trúc trích xuất từ CV (FR-8.2)."""
    current_role: str | None = None
    skills: list[str] = []
    years_experience: int | None = None
    projects: list[Project] = []
    education: list[str] = []
    summary: str | None = None


# ---------------- US-20: trường người dùng đã duyệt ----------------

def _clean_list(values: list[str]) -> list[str]:
    """Bỏ phần tử rỗng, bỏ trùng (không phân biệt hoa thường), giữ thứ tự người dùng sắp."""
    seen: set[str] = set()
    out = []
    for v in values:
        key = v.casefold()
        if v and key not in seen:
            seen.add(key)
            out.append(v)
    return out


def _blank_to_none(value: str | None) -> str | None:
    return value or None


def _text(max_length: int, min_length: int = 0):
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length)]


class ConfirmedProject(CamelModel):
    name: _text(120, min_length=1)
    description: _text(400) = ""
    technologies: Annotated[list[_text(60)], Field(max_length=15), AfterValidator(_clean_list)] = []


class ConfirmedFields(CamelModel):
    """
    US-20 — thông tin CV sau khi người dùng xem lại, sửa hoặc bỏ từng mục. Chỉ những trường này (không phải
    `parsed`) được chatbot dùng làm ngữ cảnh và được gửi sang hồ sơ khi người dùng xác nhận mục tiêu.
    """
    role: Annotated[_text(120) | None, AfterValidator(_blank_to_none)] = None
    skills: Annotated[list[_text(60)], Field(max_length=30), AfterValidator(_clean_list)] = []
    years_experience: Annotated[int | None, Field(ge=0, le=45)] = None
    projects: Annotated[list[ConfirmedProject], Field(max_length=8)] = []
    education: Annotated[list[_text(200)], Field(max_length=6), AfterValidator(_clean_list)] = []

    def as_parsed(self) -> ParsedCv:
        """Ngữ cảnh cho chatbot: cùng dạng ParsedCv nhưng chỉ chứa những gì người dùng giữ lại."""
        return ParsedCv(current_role=self.role, skills=self.skills, years_experience=self.years_experience,
                        projects=[Project(name=p.name, description=p.description, technologies=p.technologies)
                                  for p in self.projects],
                        education=self.education, summary=None)
