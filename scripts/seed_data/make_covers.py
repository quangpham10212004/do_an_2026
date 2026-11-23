#!/usr/bin/env python3
"""
Sinh ảnh bìa SVG (1200x630) cho bài blog vào frontend/public/seed/.

Không phụ thuộc mạng hay ảnh có bản quyền: mỗi ảnh là nền gradient theo lĩnh vực + hoạ tiết hình học
+ nhãn công nghệ. Chạy lại cho kết quả giống hệt (xác định theo slug), nên có thể commit kết quả.

    python scripts/seed_data/make_covers.py
"""
import hashlib
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "frontend", "public", "seed")

# (màu đầu, màu cuối, màu nhấn) theo lĩnh vực
PALETTES = {
    "backend": ("#14532d", "#4d7c0f", "#bef264"),
    "frontend": ("#1e3a8a", "#0e7490", "#67e8f9"),
    "devops": ("#7c2d12", "#b45309", "#fcd34d"),
    "data": ("#4c1d95", "#9d174d", "#f9a8d4"),
    "career": ("#134e4a", "#0f766e", "#99f6e4"),
    "general": ("#1f2937", "#4b5563", "#e5e7eb"),
}

# slug -> (thư mục, lĩnh vực, nhãn lớn, nhãn nhỏ)
COVERS = {
    # Blog
    "blog-spring-layers": ("blog", "backend", "Spring Boot", "Blog"),
    "blog-n-plus-one": ("blog", "backend", "N+1 Query", "Blog"),
    "blog-system-design-interview": ("blog", "backend", "System Design", "Blog"),
    "blog-react-state": ("blog", "frontend", "React State", "Blog"),
    "blog-nextjs-server-components": ("blog", "frontend", "Server Components", "Blog"),
    "blog-docker-multistage": ("blog", "devops", "Docker", "Blog"),
    "blog-ci-cd-small-team": ("blog", "devops", "CI/CD", "Blog"),
    "blog-ml-leakage": ("blog", "data", "Data Leakage", "Blog"),
    "blog-first-mentor": ("blog", "career", "Tìm mentor", "Blog"),
    "blog-fresher-cv": ("blog", "career", "CV Fresher", "Blog"),
    "blog-learning-in-public": ("blog", "career", "Learn in public", "Blog"),
    "blog-mentee-6-months": ("blog", "career", "6 tháng", "Blog"),
}


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def svg(slug, domain, title, sub):
    c1, c2, accent = PALETTES[domain]
    h = int(hashlib.sha256(slug.encode()).hexdigest(), 16)
    shapes = []
    # Vài vòng tròn / hình chữ nhật mờ, vị trí xác định theo slug
    for i in range(5):
        x = 600 + ((h >> (i * 9)) % 700) - 100
        y = ((h >> (i * 7 + 3)) % 630)
        r = 60 + ((h >> (i * 5 + 1)) % 160)
        op = 0.06 + ((h >> (i * 3)) % 10) / 100
        if i % 2 == 0:
            shapes.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{accent}" opacity="{op:.2f}"/>')
        else:
            shapes.append(f'<rect x="{x}" y="{y}" width="{r * 1.6:.0f}" height="{r:.0f}" rx="18" fill="{accent}" opacity="{op:.2f}" transform="rotate({(h >> i) % 40 - 20} {x} {y})"/>')
    font = 78 if len(title) <= 16 else 60
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" role="img" aria-label="{esc(title)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#fff" stroke-opacity="0.07"/></pattern>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect width="1200" height="630" fill="url(#grid)"/>
  {"".join(shapes)}
  <rect x="80" y="250" width="72" height="8" rx="4" fill="{accent}"/>
  <text x="80" y="{250 + font + 20}" font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif" font-size="{font}" font-weight="700" fill="#fff">{esc(title)}</text>
  <text x="80" y="{250 + font + 74}" font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif" font-size="30" fill="#fff" fill-opacity="0.8">{esc(sub)}</text>
</svg>
'''


def main():
    for slug, (folder, domain, title, sub) in COVERS.items():
        d = os.path.join(OUT, folder)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, f"{slug.removeprefix('blog-')}.svg"), "w", encoding="utf-8") as f:
            f.write(svg(slug, domain, title, sub))
    print(f"Đã sinh {len(COVERS)} ảnh bìa vào {OUT}")


if __name__ == "__main__":
    main()
