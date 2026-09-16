import os

# Không load model thật khi chạy test (tránh tải ~90MB và làm test chậm)
os.environ.setdefault("PRELOAD_MODEL", "false")
