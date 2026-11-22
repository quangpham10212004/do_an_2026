#!/usr/bin/env python3
"""
Seed nội dung cho hệ thống: ảnh đại diện, khoá học (có bài học Markdown), roadmap và bài blog.

Chạy SAU `scripts/seed_demo.py` (cần các tài khoản demo đã có hồ sơ) và khi docker compose đã sẵn sàng:
    python scripts/seed_demo.py
    python scripts/seed_content.py

Chạy lại nhiều lần an toàn (idempotent):
  - ảnh đại diện: ghi đè bằng cùng một ảnh;
  - khoá học / bài học / roadmap / bước: khớp theo tiêu đề, có thì cập nhật, chưa có thì tạo; bài học và bước
    không còn trong nội dung chuẩn của một khoá/roadmap do script quản lý sẽ bị xoá để danh sách đúng thứ tự;
  - bài blog: khớp theo tiêu đề trong bài của tác giả, đã có thì bỏ qua.

Ảnh bìa là SVG sinh bởi scripts/seed_data/make_covers.py, nằm trong frontend/public/seed/ (cần build lại image
frontend khi thêm ảnh mới). Ảnh đại diện lấy từ scripts/seed_data/avatars/ (xem README ở đó).
"""
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_data"))

from common import AUTH, LEARNING, PROFILE, ApiError, call, multipart_file  # noqa: E402
from blog_content import BOOKMARKS, COMMENTS, FOLLOWS, LIKES, POSTS  # noqa: E402
from learning_content import COURSES, ROADMAPS  # noqa: E402

try:  # In tiếng Việt được trên console Windows
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

PASSWORD = "Demo@123"
ADMIN = ("admin@mmp.local", "Admin@123")
AVATAR_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_data", "avatars")

AVATARS = {
    "mentor.java@demo.local": "men-32.jpg",
    "mentor.node@demo.local": "women-44.jpg",
    "mentor.python@demo.local": "men-45.jpg",
    "mentor.react@demo.local": "women-68.jpg",
    "mentor.devops@demo.local": "men-75.jpg",
    "mentor.data@demo.local": "women-65.jpg",
    "mentor.full@demo.local": "men-22.jpg",
    "mentee@demo.local": "men-12.jpg",
    "mentee.frontend@demo.local": "women-26.jpg",
}

_sessions = {}


def login(email, password=PASSWORD):
    if email not in _sessions:
        _sessions[email] = call("POST", f"{AUTH}/api/auth/login", {"email": email, "password": password})
    return _sessions[email]


def token(email):
    return login(email)["accessToken"]


def uid(email):
    return login(email)["userId"]


# ---------------------------------------------------------------- ảnh đại diện

def seed_avatars():
    print("Ảnh đại diện")
    for email, filename in AVATARS.items():
        try:
            with open(os.path.join(AVATAR_DIR, filename), "rb") as f:
                data = f.read()
            body, ctype = multipart_file("file", filename, data, mime="image/jpeg")
            call("PUT", f"{PROFILE}/api/profile/{uid(email)}/avatar", token=token(email), raw_body=body, content_type=ctype)
            print(f"  ok   {email}")
        except ApiError as e:
            print(f"  bỏ qua {email}: {e} (đã chạy seed_demo.py chưa?)")


# ---------------------------------------------------------------- khoá học và roadmap

def seed_courses(admin):
    print("Khoá học")
    base = f"{LEARNING}/api/learning"
    existing = {c["title"]: c for c in call("GET", f"{base}/courses", token=admin)}
    ids = {}
    for spec in COURSES:
        payload = {
            "title": spec["title"], "description": spec["description"], "domain": spec["domain"], "level": spec["level"],
            "skills": spec["skills"], "coverUrl": spec["cover"], "instructor": spec["instructor"], "outcomes": spec["outcomes"],
        }
        if spec["title"] in existing:
            cid = existing[spec["title"]]["id"]
            call("PUT", f"{base}/admin/courses/{cid}", payload, token=admin)
        else:
            cid = call("POST", f"{base}/admin/courses", payload, token=admin)["id"]
        ids[spec["title"]] = cid

        have = {m["title"]: m for m in call("GET", f"{base}/courses/{cid}", token=admin)["materials"]}
        wanted = set()
        for i, (title, mtype, url, minutes, content) in enumerate(spec["lessons"], start=1):
            wanted.add(title)
            m = {"title": title, "type": mtype, "url": url, "content": content, "orderIndex": i, "durationMinutes": minutes}
            if title in have:
                call("PUT", f"{base}/admin/materials/{have[title]['id']}", m, token=admin)
            else:
                call("POST", f"{base}/admin/courses/{cid}/materials", m, token=admin)
        for title, m in have.items():
            if title not in wanted:
                call("DELETE", f"{base}/admin/materials/{m['id']}", token=admin)
        print(f"  ok   {spec['title']} ({len(spec['lessons'])} bài)")
    return ids


def seed_roadmaps(admin, course_ids):
    print("Roadmap")
    base = f"{LEARNING}/api/learning"
    existing = {r["title"]: r for r in call("GET", f"{base}/roadmaps", token=admin)}
    for spec in ROADMAPS:
        payload = {
            "title": spec["title"], "track": spec["track"], "description": spec["description"],
            "coverUrl": spec["cover"], "level": spec["level"], "estimatedWeeks": spec["weeks"],
        }
        if spec["title"] in existing:
            rid = existing[spec["title"]]["id"]
            call("PUT", f"{base}/admin/roadmaps/{rid}", payload, token=admin)
        else:
            rid = call("POST", f"{base}/admin/roadmaps", payload, token=admin)["id"]

        have = {i["title"]: i for i in call("GET", f"{base}/roadmaps/{rid}", token=admin)["items"]}
        wanted = set()
        for n, (stage, title, desc, hours, course_title) in enumerate(spec["items"], start=1):
            wanted.add(title)
            item = {"title": title, "description": desc, "orderIndex": n, "stage": stage, "estimatedHours": hours,
                    "courseId": course_ids[course_title] if course_title else None}
            if title in have:
                call("PUT", f"{base}/admin/roadmap-items/{have[title]['id']}", item, token=admin)
            else:
                call("POST", f"{base}/admin/roadmaps/{rid}/items", item, token=admin)
        for title, i in have.items():
            if title not in wanted:
                call("DELETE", f"{base}/admin/roadmap-items/{i['id']}", token=admin)
        print(f"  ok   {spec['title']} ({len(spec['items'])} bước)")


# ---------------------------------------------------------------- blog

def seed_blog():
    print("Blog")
    base = f"{LEARNING}/api/learning/blog"
    post_ids = []
    for post in POSTS:
        t = token(post["author"])
        mine = {p["title"]: p for p in call("GET", f"{base}/me/posts", token=t)}
        if post["title"] in mine:
            post_ids.append(mine[post["title"]]["id"])
            print(f"  có sẵn {post['title']}")
            continue
        created = call("POST", f"{base}/posts", {
            "title": post["title"], "summary": post["summary"], "contentMd": post["content"],
            "coverUrl": post["cover"], "tags": post["tags"],
        }, token=t)
        call("POST", f"{base}/posts/{created['id']}/publish", token=t)
        post_ids.append(created["id"])
        print(f"  ok   {post['title']}")

    for email, indexes in LIKES:
        for i in indexes:
            call("PUT", f"{base}/posts/{post_ids[i]}/like", token=token(email))
    for email, indexes in BOOKMARKS:
        for i in indexes:
            call("PUT", f"{base}/posts/{post_ids[i]}/bookmark", token=token(email))
    for email, authors in FOLLOWS:
        for author in authors:
            call("PUT", f"{base}/authors/{uid(author)}/follow", token=token(email))
    for email, i, body in COMMENTS:
        t = token(email)
        existing = call("GET", f"{base}/posts/{post_ids[i]}/comments", token=t)
        if any(c["body"] == body for c in existing):
            continue
        call("POST", f"{base}/posts/{post_ids[i]}/comments", {"body": body}, token=t)
    print("  đã thêm lượt thích, lưu, theo dõi và bình luận")
    return post_ids


def backdate(post_ids):
    """Rải ngày đăng để dòng thời gian trông tự nhiên (best-effort; cần docker compose và quyền exec vào learning-db)."""
    statements = []
    for post, pid in zip(POSTS, post_ids):
        d = post["days_ago"]
        statements.append(
            f"UPDATE blog_posts SET published_at = now() - interval '{d} days' - interval '{(d * 37) % 600} minutes', "
            f"created_at = now() - interval '{d} days' - interval '1 hour' WHERE id = '{pid}';")
    try:
        subprocess.run(["docker", "compose", "exec", "-T", "learning-db", "psql", "-U", "postgres", "-d", "learning_db"],
                       input="\n".join(statements).encode(), check=True, capture_output=True, timeout=60,
                       cwd=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
        print("  đã rải ngày đăng bài")
    except (OSError, subprocess.SubprocessError):
        print("  (bỏ qua rải ngày đăng: không chạy được docker compose exec; bài đều hiển thị là vừa đăng)")


def main():
    print(f"Seeding content via {LEARNING} / {PROFILE}")
    admin = login(*ADMIN)["accessToken"]
    seed_avatars()
    course_ids = seed_courses(admin)
    seed_roadmaps(admin, course_ids)
    post_ids = seed_blog()
    backdate(post_ids)
    print("\nXong. Mở /learning, /blog và trang mentor để xem kết quả.")


if __name__ == "__main__":
    try:
        main()
    except ApiError as e:
        print("Seed failed:", e, file=sys.stderr)
        sys.exit(1)
