"""
Gộp các trường của hồ sơ thành 1 đoạn text chuẩn hoá trước khi đưa vào embedding
model, và băm đoạn text đó để phát hiện thay đổi.

Trước đây logic này nằm ở profile-service (ProfileTextNormalizer.java); nó đã
chuyển về matching-service vì format text là một phần của thuật toán matching —
profile-service không cần biết hồ sơ được biểu diễn thế nào trong không gian vector.

Mentor và mentee dùng CÙNG cấu trúc (Domain → Skills → mô tả) để hai loại vector
nằm trong cùng không gian ngữ nghĩa, giúp cosine similarity giữa mentee và mentor
có ý nghĩa. Thay đổi format này ảnh hưởng trực tiếp tới chất lượng matching — nếu
đổi, mọi hash đều lệch và IndexSyncJob sẽ tự embed lại toàn bộ hồ sơ (hoặc gọi
POST /api/matching/admin/embeddings/rebuild?force=true để làm ngay).

Các hàm ở đây là hàm thuần, không truy cập DB, để test độc lập.
"""
import hashlib
import re

MENTOR = "MENTOR"
MENTEE = "MENTEE"

_WHITESPACE = re.compile(r"\s+")


def _clean(value: str | None) -> str:
    return "" if value is None else _WHITESPACE.sub(" ", value.strip())


def _join_skills(skills) -> str:
    if not skills:
        return ""
    return ", ".join(s for s in (_clean(x) for x in skills) if s)


def normalize_mentor(profile: dict) -> str:
    return ". ".join([
        "Domain: " + _clean(profile.get("domain")),
        "Skills: " + _join_skills(profile.get("skills")),
        f"Experience: {profile.get('years_experience') or 0} years",
        "About: " + _clean(profile.get("bio")),
    ])


def normalize_mentee(profile: dict) -> str:
    return ". ".join([
        "Domain: " + _clean(profile.get("domain")),
        "Skills: " + _join_skills(profile.get("skills")),
        "Level: " + (profile.get("current_level") or "BEGINNER").lower(),
        "Goal: " + _clean(profile.get("goal")),
    ])


def normalize(role: str, profile: dict) -> str:
    return normalize_mentor(profile) if role == MENTOR else normalize_mentee(profile)


def text_hash(text: str) -> str:
    """NFR-7 — hash của text chuẩn hoá; trùng hash nghĩa là không cần embed lại."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
