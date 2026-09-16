"""
Ngân hàng câu hỏi cho engine phỏng vấn rule-based, chia theo lĩnh vực. Mỗi chủ đề gồm câu hỏi mở,
câu hỏi đào sâu, bộ "khái niệm kỳ vọng" (chấm độ bao phủ) và kỹ năng liên quan (chọn chủ đề mở đầu).
"""
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Topic:
    name: str
    question: str
    deepen_question: str
    expected_concepts: tuple[str, ...]
    related_skills: tuple[str, ...]


BY_DOMAIN: dict[str, list[Topic]] = {
    "backend": [
        Topic(
            "Thiết kế REST API",
            "Hãy mô tả cách bạn thiết kế một REST API cho hệ thống đặt lịch: đặt tên resource, mã trạng thái HTTP, phân trang và versioning.",
            "Khi API cần thay đổi không tương thích ngược, bạn triển khai thế nào để client cũ không bị ảnh hưởng? Nêu ví dụ thực tế.",
            ("resource", "status code", "200", "201", "404", "phân trang", "pagination", "version", "idempotent", "http", "validation", "backward"),
            ("rest", "api", "spring", "spring boot", "express", "fastapi", "django"),
        ),
        Topic(
            "Cơ sở dữ liệu & transaction",
            "Bạn chọn index cho bảng như thế nào và làm sao phát hiện một truy vấn chậm trong PostgreSQL/MySQL?",
            "Giải thích các mức isolation của transaction và một tình huống bạn từng gặp lỗi do race condition. Bạn đã xử lý ra sao?",
            ("index", "explain", "b-tree", "query plan", "transaction", "isolation", "lock", "deadlock", "n+1", "normalization", "race condition"),
            ("postgresql", "mysql", "sql", "jpa", "hibernate", "mongodb"),
        ),
        Topic(
            "Caching & hiệu năng",
            "Khi nào bạn quyết định dùng cache (ví dụ Redis)? Trình bày chiến lược cache-aside và cách xử lý invalidation.",
            "Làm sao tránh cache stampede và dữ liệu cache không nhất quán khi hệ thống có nhiều instance?",
            ("cache", "redis", "ttl", "invalidation", "cache-aside", "eviction", "stampede", "consistency", "latency", "hot key"),
            ("redis", "memcached", "performance"),
        ),
        Topic(
            "Kiến trúc microservices",
            "So sánh kiến trúc monolith và microservices. Bạn giao tiếp giữa các service bằng cách nào và vì sao?",
            "Làm thế nào để đảm bảo nhất quán dữ liệu khi một nghiệp vụ trải qua nhiều service (ví dụ đặt lịch + thanh toán)?",
            ("monolith", "microservice", "rest", "grpc", "message queue", "kafka", "saga", "eventual consistency", "outbox", "circuit breaker", "timeout", "retry"),
            ("microservices", "kafka", "rabbitmq", "docker", "kubernetes"),
        ),
        Topic(
            "Bảo mật ứng dụng",
            "Trình bày cách bạn triển khai xác thực và phân quyền cho API (JWT, session, OAuth2) và các lỗ hổng cần phòng tránh.",
            "Refresh token nên được lưu và thu hồi như thế nào? Bạn xử lý ra sao khi nghi ngờ token bị đánh cắp?",
            ("jwt", "oauth", "session", "bcrypt", "hash", "sql injection", "xss", "csrf", "rbac", "refresh token", "https", "owasp"),
            ("security", "spring security", "oauth2", "jwt"),
        ),
        Topic(
            "Kiểm thử & chất lượng mã",
            "Bạn tổ chức kiểm thử cho một service backend như thế nào (unit, integration, e2e)? Công cụ bạn dùng là gì?",
            "Kể về một lần test đã giúp bạn phát hiện bug quan trọng trước khi lên production. Bạn cân bằng tốc độ và độ phủ test ra sao?",
            ("unit test", "integration", "mock", "junit", "testcontainers", "coverage", "ci", "tdd", "e2e", "regression"),
            ("junit", "testing", "ci/cd"),
        ),
    ],
    "frontend": [
        Topic(
            "React & quản lý state",
            "Trình bày cách bạn quản lý state trong một ứng dụng React vừa và lớn. Khi nào dùng local state, context hay thư viện ngoài?",
            "Bạn đã tối ưu re-render như thế nào? Hãy nêu một trường hợp cụ thể và công cụ dùng để đo.",
            ("state", "props", "context", "redux", "zustand", "usememo", "usecallback", "re-render", "profiler", "hooks", "immutable"),
            ("react", "redux", "next.js", "javascript", "typescript"),
        ),
        Topic(
            "Hiệu năng web",
            "Những chỉ số nào bạn theo dõi để đánh giá hiệu năng trang web và bạn cải thiện chúng ra sao?",
            "Giải thích sự khác biệt giữa SSR, SSG và CSR, và bạn chọn phương án nào cho trang danh sách sản phẩm có SEO?",
            ("lcp", "cls", "inp", "core web vitals", "lazy load", "code splitting", "bundle", "cache", "cdn", "ssr", "ssg", "hydration"),
            ("next.js", "performance", "webpack", "vite"),
        ),
        Topic(
            "CSS & giao diện responsive",
            "Bạn xây dựng layout responsive và hệ thống design token như thế nào để giao diện nhất quán?",
            "Bạn đảm bảo khả năng truy cập (accessibility) cho form và component tương tác ra sao?",
            ("flexbox", "grid", "media query", "responsive", "design system", "token", "accessibility", "aria", "contrast", "semantic"),
            ("css", "tailwind", "sass", "html"),
        ),
        Topic(
            "TypeScript & kiến trúc frontend",
            "Lợi ích của TypeScript trong dự án frontend là gì? Bạn tổ chức thư mục/feature như thế nào?",
            "Bạn xử lý gọi API, lỗi mạng và trạng thái loading một cách nhất quán trên toàn ứng dụng như thế nào?",
            ("type", "interface", "generic", "feature folder", "module", "error boundary", "loading", "retry", "react query", "swr", "abort"),
            ("typescript", "react query", "axios"),
        ),
        Topic(
            "Kiểm thử frontend",
            "Bạn viết test cho component React như thế nào và test điều gì là quan trọng nhất?",
            "Khi nào bạn cần e2e test (Playwright/Cypress) thay vì unit test? Nêu một ví dụ.",
            ("jest", "testing library", "unit", "snapshot", "mock", "e2e", "playwright", "cypress", "user behavior"),
            ("jest", "cypress", "playwright"),
        ),
    ],
    "devops": [
        Topic(
            "Container & Docker",
            "Trình bày cách bạn viết Dockerfile tối ưu cho một ứng dụng production (kích thước image, cache layer, bảo mật).",
            "Bạn debug một container liên tục restart trong môi trường production như thế nào?",
            ("multi-stage", "layer", "cache", "base image", "alpine", "non-root", "healthcheck", "logs", "exit code", "volume"),
            ("docker", "container"),
        ),
        Topic(
            "CI/CD",
            "Mô tả một pipeline CI/CD bạn đã xây dựng: các bước, cách chạy test, và chiến lược deploy.",
            "Bạn triển khai blue-green hoặc canary như thế nào và rollback ra sao khi phát hiện lỗi?",
            ("pipeline", "build", "test", "artifact", "deploy", "blue-green", "canary", "rollback", "github actions", "jenkins", "gitlab"),
            ("github actions", "jenkins", "gitlab ci", "ci/cd"),
        ),
        Topic(
            "Kubernetes",
            "Giải thích các đối tượng Pod, Deployment, Service, Ingress trong Kubernetes và vai trò của chúng.",
            "Bạn cấu hình autoscaling và resource limits như thế nào để hệ thống vừa ổn định vừa tiết kiệm?",
            ("pod", "deployment", "service", "ingress", "replica", "hpa", "autoscaling", "requests", "limits", "probe", "configmap", "secret"),
            ("kubernetes", "k8s", "helm"),
        ),
        Topic(
            "Giám sát & sự cố",
            "Bạn thiết lập monitoring và alerting cho hệ thống như thế nào? Những chỉ số nào quan trọng nhất?",
            "Kể lại một sự cố production bạn từng xử lý: phát hiện, khắc phục và postmortem.",
            ("prometheus", "grafana", "metrics", "logs", "tracing", "alert", "sla", "slo", "latency", "error rate", "postmortem", "on-call"),
            ("prometheus", "grafana", "elk", "monitoring"),
        ),
        Topic(
            "Hạ tầng dưới dạng mã",
            "Bạn quản lý hạ tầng cloud bằng mã (Terraform/Ansible) như thế nào? Lợi ích so với cấu hình tay?",
            "Bạn quản lý state và secret trong Terraform ra sao khi nhiều người cùng làm việc?",
            ("terraform", "ansible", "state", "module", "plan", "apply", "drift", "secret", "vault", "remote backend", "lock"),
            ("terraform", "ansible", "aws", "gcp", "azure"),
        ),
    ],
    "data": [
        Topic(
            "Quy trình huấn luyện mô hình",
            "Mô tả quy trình bạn xây dựng một mô hình machine learning từ dữ liệu thô tới đánh giá.",
            "Bạn phát hiện và xử lý overfitting, data leakage như thế nào? Nêu ví dụ cụ thể.",
            ("feature", "train", "test", "validation", "cross-validation", "overfitting", "regularization", "leakage", "metric", "baseline", "pipeline"),
            ("python", "scikit-learn", "machine learning", "pandas"),
        ),
        Topic(
            "Đánh giá mô hình",
            "Khi dữ liệu mất cân bằng, bạn chọn metric nào để đánh giá mô hình phân loại và tại sao?",
            "Bạn giải thích kết quả mô hình cho người không chuyên như thế nào?",
            ("precision", "recall", "f1", "auc", "roc", "confusion matrix", "imbalanced", "smote", "threshold", "shap", "explainability"),
            ("machine learning", "statistics"),
        ),
        Topic(
            "Xử lý dữ liệu",
            "Bạn làm sạch và xử lý dữ liệu lớn như thế nào (missing values, outlier, định dạng)?",
            "Khi dữ liệu không vừa bộ nhớ, bạn dùng công cụ/kỹ thuật gì?",
            ("missing", "outlier", "pandas", "spark", "chunk", "etl", "sql", "join", "aggregation", "partition", "parquet"),
            ("pandas", "spark", "sql", "airflow"),
        ),
        Topic(
            "Deep learning & NLP",
            "Trình bày kiến trúc Transformer và lý do nó hiệu quả với dữ liệu ngôn ngữ.",
            "Embedding là gì và bạn dùng embedding cho bài toán tìm kiếm ngữ nghĩa như thế nào?",
            ("attention", "transformer", "embedding", "tokenizer", "fine-tune", "bert", "vector", "cosine", "similarity", "llm"),
            ("pytorch", "tensorflow", "nlp", "deep learning"),
        ),
        Topic(
            "Triển khai mô hình",
            "Bạn đưa mô hình ML vào production như thế nào và theo dõi chất lượng mô hình sau triển khai ra sao?",
            "Data drift là gì và bạn phát hiện nó như thế nào?",
            ("api", "serving", "docker", "mlflow", "monitoring", "drift", "retrain", "latency", "batch", "a/b test", "versioning"),
            ("mlops", "mlflow", "docker"),
        ),
    ],
    "mobile": [
        Topic(
            "Kiến trúc ứng dụng di động",
            "Bạn tổ chức kiến trúc cho một ứng dụng mobile (MVVM, Clean Architecture, BLoC...) như thế nào?",
            "Bạn xử lý trạng thái offline và đồng bộ dữ liệu khi có mạng trở lại ra sao?",
            ("mvvm", "clean architecture", "bloc", "repository", "state", "offline", "sync", "cache", "dependency injection", "layer"),
            ("flutter", "android", "ios", "react native", "kotlin", "swift"),
        ),
        Topic(
            "Hiệu năng mobile",
            "Những nguyên nhân phổ biến khiến app giật/lag và cách bạn tối ưu?",
            "Bạn đo và giảm thời gian khởi động ứng dụng như thế nào?",
            ("main thread", "frame", "jank", "memory leak", "profiler", "lazy", "image cache", "startup", "list virtualization", "battery"),
            ("android", "ios", "flutter"),
        ),
        Topic(
            "Phát hành & vận hành",
            "Quy trình build, ký ứng dụng và phát hành lên store của bạn diễn ra như thế nào?",
            "Bạn theo dõi crash và triển khai tính năng theo từng nhóm người dùng (feature flag) ra sao?",
            ("signing", "build variant", "store", "review", "crashlytics", "sentry", "feature flag", "staged rollout", "versioning", "ci"),
            ("firebase", "fastlane", "ci/cd"),
        ),
    ],
    "general": [
        Topic(
            "Kinh nghiệm dự án",
            "Hãy kể về dự án phần mềm bạn tự hào nhất: vai trò của bạn, công nghệ sử dụng và thách thức lớn nhất.",
            "Nếu làm lại dự án đó, bạn sẽ thay đổi quyết định kỹ thuật nào và vì sao?",
            ("vai trò", "role", "kiến trúc", "architecture", "trade-off", "đánh đổi", "thách thức", "kết quả", "team", "deadline"),
            (),
        ),
        Topic(
            "Giải quyết vấn đề",
            "Trình bày cách bạn tiếp cận khi gặp một bug khó tái hiện trong hệ thống.",
            "Bạn làm thế nào để một bug tương tự không lặp lại?",
            ("log", "tái hiện", "reproduce", "debug", "giả thuyết", "hypothesis", "root cause", "test", "monitoring", "postmortem"),
            (),
        ),
        Topic(
            "Clean code & review",
            "Theo bạn thế nào là code tốt? Bạn thực hiện code review như thế nào?",
            "Bạn xử lý bất đồng quan điểm kỹ thuật trong team như thế nào?",
            ("readable", "dễ đọc", "naming", "solid", "refactor", "test", "review", "convention", "duplicate", "complexity"),
            (),
        ),
        Topic(
            "Năng lực mentoring",
            "Bạn sẽ hướng dẫn một mentee mới bắt đầu học lập trình như thế nào trong 3 tháng đầu?",
            "Khi mentee gặp khó khăn và mất động lực, bạn hỗ trợ họ ra sao? Nêu ví dụ nếu có.",
            ("lộ trình", "roadmap", "mục tiêu", "goal", "bài tập", "feedback", "phản hồi", "dự án", "project", "động lực", "kiên nhẫn", "đánh giá"),
            (),
        ),
    ],
}


MENTORING_TOPIC = BY_DOMAIN["general"][3]


def resolve_domain(domain: str | None) -> str:
    d = (domain or "").lower()
    if "front" in d or "web ui" in d or "react" in d:
        return "frontend"
    if "devops" in d or "cloud" in d or "sre" in d or "infra" in d:
        return "devops"
    if "data" in d or "machine" in d or re.search(r"\b(ai|ml)\b", d):
        return "data"
    if "mobile" in d or "android" in d or "ios" in d or "flutter" in d:
        return "mobile"
    if "back" in d or "server" in d or "api" in d or "fullstack" in d:
        return "backend"
    return "general"


def topics_for(domain: str | None, skills: list[str]) -> list[Topic]:
    """Chủ đề của lĩnh vực, ưu tiên chủ đề liên quan tới kỹ năng mentor khai báo (sắp xếp ổn định).
    Luôn có chủ đề "Năng lực mentoring" ở vị trí thứ 3."""
    skill_set = {s.lower() for s in skills}
    topics = sorted(BY_DOMAIN.get(resolve_domain(domain), BY_DOMAIN["general"]),
                    key=lambda t: -sum(1 for s in t.related_skills if s in skill_set))
    if MENTORING_TOPIC not in topics:
        topics.insert(min(2, len(topics)), MENTORING_TOPIC)
    return topics
