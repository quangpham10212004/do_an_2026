#!/usr/bin/env python3
"""
Đo hiệu năng AI Matching (NFR-1: < 2 giây với vài nghìn profile).

Chèn tạm N hồ sơ mentor tổng hợp (vector ngẫu nhiên đã chuẩn hoá, display_name bắt đầu
bằng 'BENCH-') vào profile-db, gọi API matching nhiều lần để đo độ trễ, rồi xoá dữ liệu tạm.
Yêu cầu: hệ thống đang chạy bằng docker compose và đã chạy seed_demo.py.

    python3 scripts/benchmark_matching.py --mentors 5000 --requests 50
"""
import argparse
import statistics
import subprocess
import time

from common import AUTH, MATCHING, call


def psql(sql):
    res = subprocess.run(["docker", "compose", "exec", "-T", "profile-db", "psql", "-q", "-U", "postgres", "-d", "profile_db",
                          "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(res.stderr)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mentors", type=int, default=5000)
    parser.add_argument("--requests", type=int, default=50)
    args = parser.parse_args()

    print(f"Chèn {args.mentors} mentor tổng hợp...")
    psql(f"""
        INSERT INTO mentor_profiles (user_id, display_name, skills, domain, bio, years_experience, capacity,
                                     verification_status, rating, rating_count, embedding, embedding_text_hash)
        SELECT gen_random_uuid(), 'BENCH-' || g,
               ARRAY['Java','Python','React','Docker'], (ARRAY['backend','frontend','devops','data'])[1 + g % 4],
               'synthetic', g % 15, 3, 'APPROVED', (g % 50) / 10.0, g % 20,
               (SELECT array_agg(random() - 0.5) FROM generate_series(1, 384) WHERE g > 0)::vector, 'bench'
        FROM generate_series(1, {args.mentors}) g;
        INSERT INTO mentor_availability (mentor_id, day_of_week, start_time, end_time)
        SELECT user_id, 1, '19:00', '21:00' FROM mentor_profiles WHERE display_name LIKE 'BENCH-%';
        ANALYZE mentor_profiles;
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
        psql("DELETE FROM mentor_profiles WHERE display_name LIKE 'BENCH-%';")
        print("Đã xoá dữ liệu benchmark.")


if __name__ == "__main__":
    main()
