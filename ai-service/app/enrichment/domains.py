"""
Lĩnh vực của hồ sơ (khớp DOMAINS ở frontend/src/features/profile/api.ts) và suy ra lĩnh vực từ câu trả lời chatbot.

Vì sao cần: lĩnh vực trong hồ sơ là lựa chọn lúc đăng ký và matching ưu tiên mentor cùng lĩnh vực đó. Mentee đổi hướng
(hồ sơ ghi frontend nhưng nói với chatbot "muốn học product management") mà không sửa hồ sơ thì chỉ thấy mentor frontend.
Khi hội thoại xong, ta suy ra lĩnh vực từ CÂU TRẢ LỜI của mentee (không từ CV — CV là quá khứ, câu trả lời là hướng muốn
đi) và nếu khác hồ sơ thì đề nghị đổi lúc xác nhận mục tiêu.

Suy luận bằng từ khoá (đã bỏ dấu, khớp nguyên từ), không phụ thuộc engine: chạy được cả khi không có DeepSeek, kết quả
xác định và kiểm thử được.
"""
import re

from app.enrichment.rule_based import strip_accents

DOMAINS = ("backend", "frontend", "fullstack", "devops", "data", "mobile", "product")

# Từ khoá viết thường, không dấu; cụm dài được khớp trước (xem scores).
KEYWORDS: dict[str, tuple[str, ...]] = {
    "product": ("product manager", "product management", "product owner", "quan ly san pham", "product", "pm",
                "business analyst"),
    "mobile": ("react native", "mobile", "android", "ios", "flutter", "kotlin", "swift", "app di dong", "ung dung di dong"),
    "fullstack": ("fullstack", "full stack", "full-stack"),
    "frontend": ("frontend", "front-end", "front end", "react", "next.js", "nextjs", "vue", "angular", "giao dien", "ui", "css"),
    "backend": ("backend", "back-end", "back end", "spring", "spring boot", "django", "fastapi", "microservices",
                "microservice", "system design", "api"),
    "devops": ("devops", "kubernetes", "k8s", "terraform", "ci/cd", "cloud", "aws", "sre", "ha tang"),
    # Không dùng "ai" đứng một mình: bỏ dấu thì trùng chữ "ai" (đại từ) trong tiếng Việt.
    "data": ("data", "machine learning", "ml", "ai engineer", "tri tue nhan tao", "deep learning", "nlp", "du lieu",
             "data science", "data engineer"),
}

_PATTERNS = {domain: [re.compile(r"(?<![\w])" + re.escape(k) + r"(?![\w])") for k in words]
             for domain, words in KEYWORDS.items()}


def normalize(domain: str | None) -> str | None:
    value = (domain or "").strip().lower()
    return value if value in DOMAINS else None


def scores(text: str) -> dict[str, int]:
    """Số từ khoá khác nhau của từng lĩnh vực xuất hiện trong text. Cụm dài được xoá sau khi khớp để không tính hai lần
    ("react native" → mobile, không cộng thêm cho frontend vì "react")."""
    remaining = strip_accents(text or "").lower()
    result: dict[str, int] = {}
    hits: list[tuple[str, re.Pattern]] = sorted(((d, p) for d, ps in _PATTERNS.items() for p in ps),
                                                key=lambda x: -len(x[1].pattern))
    for domain, pattern in hits:
        if pattern.search(remaining):
            result[domain] = result.get(domain, 0) + 1
            remaining = pattern.sub(" ", remaining)
    return result


def infer(answers: list[str], current: str | None) -> str | None:
    """
    Lĩnh vực mentee muốn theo các câu trả lời. None khi không rõ: không có từ khoá nào, hoặc hoà giữa nhiều lĩnh vực.
    Lĩnh vực hiện tại thắng mọi thế hoà có nó (không đề nghị đổi khi chưa chắc).
    """
    s = scores("\n".join(a for a in answers if a))
    if not s:
        return None
    best = max(s.values())
    current = normalize(current)
    if current is not None and s.get(current) == best:
        return current
    top = [d for d, n in s.items() if n == best]
    return top[0] if len(top) == 1 else None


def suggest(answers: list[str], current: str | None) -> str | None:
    """Lĩnh vực đề nghị đổi sang — chỉ khi suy ra được và khác lĩnh vực hiện tại trong hồ sơ."""
    inferred = infer(answers, current)
    return inferred if inferred is not None and inferred != normalize(current) else None
