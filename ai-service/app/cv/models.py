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
