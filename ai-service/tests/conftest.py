import os

# Test luôn chạy không có DEEPSEEK_API_KEY thật (engine rule-based); client DeepSeek được test bằng MockTransport.
os.environ["DEEPSEEK_API_KEY"] = ""
