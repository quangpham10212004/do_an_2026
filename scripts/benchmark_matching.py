#!/usr/bin/env python3
"""
Đo hiệu năng AI Matching (NFR-1: < 2 giây với vài nghìn profile).

Chèn tạm N hồ sơ mentor tổng hợp (display_name bắt đầu bằng 'BENCH-') vào profile-db
và vector ngẫu nhiên tương ứng vào matching-db, gọi API matching nhiều lần để đo độ
trễ, rồi xoá dữ liệu tạm ở cả hai DB.

Lưu ý: hồ sơ và vector nằm ở hai database vì mỗi service sở hữu phần việc của mình
(CONVENTIONS.md mục 1 & 7) — script phải ghi vào đúng DB của từng bên.
Yêu cầu: hệ thống đang chạy bằng docker compose và đã chạy seed_demo.py.

    python3 scripts/benchmark_matching.py --mentors 5000 --requests 50
"""
import argparse
import statistics
import subprocess
import time

from common import AUTH, MATCHING, call


def psql(service, database, sql):
    res = subprocess.run(["docker", "compose", "exec", "-T", service, "psql", "-q", "-U", "postgres", "-d", database,
                          "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(res.stderr)
    return res.stdout


def profile_db(sql):
    return psql("profile-db", "profile_db", sql)


def matching_db(sql):
    return psql("matching-db", "matching_db", sql)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mentors", type=int, default=5000)
    parser.add_argument("--requests", type=int, default=50)
    args = parser.parse_args()

    # user_id sinh tất định từ g (md5) nên hai database ghi cùng bộ ID mà không
    # cần truyền danh sách ID qua lại.
    print(f"Chèn {args.mentors} mentor tổng hợp vào profile-db...")
    profile_db(f"""
        INSERT INTO mentor_profiles (user_id, display_name, skills, domain, bio, years_experience, capacity,
                                     verification_status, rating, rating_count)
        SELECT md5('bench-' || g)::uuid, 'BENCH-' || g,
               ARRAY['Java','Python','React','Docker'], (ARRAY['backend','frontend','devops','data'])[1 + g % 4],
               'synthetic', g % 15, 3, 'APPROVED', (g % 50) / 10.0, g % 20
        FROM generate_series(1, {args.mentors}) g;
        INSERT INTO mentor_availability (mentor_id, day_of_week, start_time, end_time)
        SELECT user_id, 1, '19:00', '21:00' FROM mentor_profiles WHERE display_name LIKE 'BENCH-%';
        ANALYZE mentor_profiles;
    """)

    # Vector của các mentor đó thuộc matching-service => ghi thẳng vào matching-db.
    # text_hash = 'bench' vừa đánh dấu dữ liệu benchmark để dọn, vừa KHÁC hash thật
    # nên IndexSyncJob sẽ coi chúng là lệch và embed lại: đặt INDEX_SYNC_ENABLED=false
    # cho matching-service khi benchmark để job không tranh CPU với phép đo.
    print("Chèn vector ngẫu nhiên vào matching-db...")
    matching_db(f"""
        INSERT INTO mentor_embeddings (user_id, embedding, text_hash, indexed_at)
        SELECT md5('bench-' || g)::uuid,
               (SELECT array_agg(random() - 0.5) FROM generate_series(1, 384) WHERE g > 0)::vector,
               'bench', now()
        FROM generate_series(1, {args.mentors}) g
        ON CONFLICT (user_id) DO NOTHING;
        ANALYZE mentor_embeddings;
    """)
    try:
        auth = call("POST", f"{AUTH}/api/auth/login", {"email": "mentee@demo.local", "password": "Demo@123"})
        url = f"{MATCHING}/api/matching/mentors?menteeId={auth['userId']}&limit=10"
        call("GET", url, token=auth["accessToken"])  # warm-up
        latencies = []
        for _ in range(args.requests):
            t = time.perf_counter()
            res = call("GET", url, token=auth["accessToken"])
            latencies.append((time.perf_counter() - t) * 1000)
        latencies.sort()
        p95 = latencies[int(len(latencies) * 0.95) - 1]
        print(f"Số mentor trong DB  : ~{args.mentors + 7}")
        print(f"Số request          : {args.requests}")
        print(f"Độ trễ trung bình   : {statistics.mean(latencies):.1f} ms")
        print(f"p50 / p95 / max     : {latencies[len(latencies) // 2]:.1f} / {p95:.1f} / {latencies[-1]:.1f} ms")
        print(f"Pipeline lần cuối   : {res['pipeline']}")
        print("NFR-1 (< 2000 ms)   :", "ĐẠT" if latencies[-1] < 2000 else "KHÔNG ĐẠT")
    finally:
        matching_db("DELETE FROM mentor_embeddings WHERE text_hash = 'bench';")
        profile_db("DELETE FROM mentor_profiles WHERE display_name LIKE 'BENCH-%';")
        print("Đã xoá dữ liệu benchmark ở cả profile-db và matching-db.")


if __name__ == "__main__":
    main()
