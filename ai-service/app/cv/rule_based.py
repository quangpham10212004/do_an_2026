"""
Parser CV dựa trên luật:
- Kỹ năng: khớp từ điển skills.py.
- Số năm kinh nghiệm: ưu tiên câu "X năm/years kinh nghiệm"; nếu không có thì cộng các khoảng thời gian
  "2019 - 2022", "03/2021 – nay" trong mục kinh nghiệm.
- Dự án / học vấn: tách theo tiêu đề mục (Projects, Dự án, Education, Học vấn...).
"""
import re
from datetime import date

from app.cv.models import ParsedCv, Project
from app.cv.skills import find_skills

NAME = "RULE_BASED"

YEARS_EXPLICIT = re.compile(r"(\d{1,2})\s*\+?\s*(năm|years?|yrs?)(\s+(of\s+)?(kinh nghiệm|experience))?", re.IGNORECASE)
DATE_RANGE = re.compile(
    r"(?:(\d{1,2})[/.-])?((?:19|20)\d{2})\s*[-–—~]+\s*(?:(\d{1,2})[/.-])?((?:19|20)\d{2}|nay|hiện tại|present|now|current)",
    re.IGNORECASE)
ROLE = re.compile(r".{0,60}(developer|engineer|lập trình viên|kỹ sư|sinh viên|student|intern|thực tập sinh|architect|"
                  r"tester|devops|data scientist|analyst).{0,40}", re.IGNORECASE)
BULLET = re.compile(r"^[•\-*+–▪●◦]")
BULLET_PREFIX = re.compile(r"^[•\-*+–▪●◦]\s*")

HEADINGS = [
    ("PROJECTS", r"(dự án|du an|projects?|personal projects?|project experience|dự án cá nhân|các dự án).*"),
    ("EXPERIENCE", r"(kinh nghiệm( làm việc)?|work experience|experience|employment( history)?|quá trình làm việc).*"),
    ("EDUCATION", r"(học vấn|education|trình độ học vấn|academic).*"),
    ("SKILLS", r"(kỹ năng|skills?|technical skills|công nghệ|technologies).*"),
    ("OTHER", r"(chứng chỉ|certificates?|certifications?|giải thưởng|awards?|sở thích|interests?|hoạt động|activities|"
              r"ngôn ngữ|languages|mục tiêu( nghề nghiệp)?|objective|summary|giới thiệu|about me|thông tin cá nhân|"
              r"contact|liên hệ|references?).*"),
]


def heading_of(line: str) -> str | None:
    l = re.sub(r"[:\-–•*#]", "", line.lower()).strip()
    if len(l) > 40:
        return None
    for section, pattern in HEADINGS:
        if re.fullmatch(pattern, l):
            return section
    return None


def split_sections(lines: list[str]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    current = "NONE"
    for line in lines:
        h = heading_of(line)
        if h is not None:
            current = h
            continue
        result.setdefault(current, []).append(line)
    return result


def _clamp_month(m: int) -> int:
    return 1 if m < 1 or m > 12 else m


def extract_years(full_text: str, experience_lines: list[str], today: date | None = None) -> int | None:
    explicit = -1
    for m in YEARS_EXPLICIT.finditer(full_text):
        # Chỉ nhận "X năm" khi đi kèm từ khoá kinh nghiệm để tránh nhầm "4 năm đại học"
        if m.group(3) is not None:
            v = int(m.group(1))
            if v <= 40:
                explicit = max(explicit, v)
    if explicit >= 0:
        return explicit

    today = today or date.today()
    total_months = 0
    for r in DATE_RANGE.finditer("\n".join(experience_lines)):
        start_month = _clamp_month(int(r.group(1))) if r.group(1) else 1
        start_year = int(r.group(2))
        end_raw = r.group(4)
        ongoing = not end_raw.isdigit()
        end_year = today.year if ongoing else int(end_raw)
        end_month = today.month if ongoing else (_clamp_month(int(r.group(3))) if r.group(3) else 12)
        months = (end_year - start_year) * 12 + (end_month - start_month)
        if 0 < months < 45 * 12:
            total_months += months
    return None if total_months == 0 else int(total_months / 12 + 0.5)


def _build_project(name: str, description: str) -> Project:
    d = description.strip()
    return Project(name=name, description=d[:400] + "…" if len(d) > 400 else d, technologies=find_skills(name + " " + d))


def extract_projects(lines: list[str]) -> list[Project]:
    projects: list[Project] = []
    name: str | None = None
    desc: list[str] = []
    for line in lines:
        bullet = bool(BULLET.match(line))
        if not bullet and len(line) <= 80 and (name is None or desc):
            if name is not None:
                projects.append(_build_project(name, " ".join(desc)))
            name = re.sub(r"^\d+[.)]\s*", "", line)
            desc = []
        elif name is None:
            name = BULLET_PREFIX.sub("", line)
        else:
            desc.append(BULLET_PREFIX.sub("", line))
        if len(projects) >= 8:
            break
    if name is not None and len(projects) < 8:
        projects.append(_build_project(name, " ".join(desc)))
    return projects


def parse(text: str) -> ParsedCv:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    sections = split_sections(lines)
    skills = find_skills(text)
    years = extract_years(text, sections.get("EXPERIENCE", []))
    projects = extract_projects(sections.get("PROJECTS", []))
    education = sections.get("EDUCATION", [])[:4]
    role = next((l for l in lines[:15] if ROLE.fullmatch(l)), None)
    summary = ((role or "Ứng viên")
               + (" có kỹ năng " + ", ".join(skills[:6]) if skills else "")
               + (f", khoảng {years} năm kinh nghiệm" if years else "") + ".")
    return ParsedCv(current_role=role, skills=skills, years_experience=years, projects=projects,
                    education=education, summary=summary)
