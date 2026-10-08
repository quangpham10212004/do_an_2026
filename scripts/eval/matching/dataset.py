"""
US-26 (PRD-AIM-1, PRD-AIM-3) — bộ dữ liệu đánh giá AI Matching.

Pool mentor RIÊNG cho đánh giá (seed_demo.py chỉ có 6 mentor đã duyệt — quá ít để đo NDCG@10): 37 mentor ở 5
lĩnh vực, mỗi lĩnh vực ≤ 10 mentor để top-10 của một mentee luôn là TOÀN BỘ pool hợp lệ cùng lĩnh vực (hard
filter của pipeline loại khác lĩnh vực). Nhờ vậy mọi biến thể (trọng số mới, model khác) chỉ hoán vị cùng một
tập mentor và mọi cặp (mentee, mentor) cần chấm đều có nhãn trong CSV.

30 mentee: 17 mục tiêu tiếng Việt, 13 tiếng Anh; đủ 3 trình độ; có/không có sở thích lịch học.

`strong` / `partial` của mỗi mentee là nhãn NHÁP do người viết bộ dữ liệu chấm theo nội dung (mentor có giúp
được đúng mục tiêu không), KHÔNG xét giá, rating hay lịch: 2 = rất phù hợp, 1 = phù hợp một phần, 0 = không phù
hợp (cùng lĩnh vực nhưng khác chuyên môn). Đây chỉ là draft_label — số liệu là TẠM THỜI (PROVISIONAL) cho tới khi
2 thành viên nhóm chấm rater1/rater2.
"""

# key, tên, lĩnh vực, kỹ năng, số năm, bio, giá/giờ, rating, số lượt đánh giá, lịch rảnh [(thứ, bắt đầu, kết thúc)]
MENTORS = [
    # ---------------- backend (10)
    ("b1", "Nguyễn Hoàng Long", "backend", ["Java", "Spring Boot", "Microservices", "Kafka", "PostgreSQL"], 9,
     "Senior backend engineer 9 năm xây dựng hệ thống thanh toán bằng Java Spring Boot và microservices. Hướng dẫn "
     "thiết kế API, Kafka và chuẩn bị phỏng vấn backend.", 300000, 4.8, 20, [(1, "19:00", "22:00"), (3, "19:00", "22:00")]),
    ("b2", "Trần Thu Hà", "backend", ["Node.js", "TypeScript", "NestJS", "MongoDB", "REST API"], 5,
     "Backend developer chuyên Node.js, TypeScript và NestJS, từng làm startup thương mại điện tử. Hỗ trợ người mới "
     "xây dựng REST API và triển khai lên cloud.", 150000, 4.5, 12, [(2, "20:00", "22:00"), (4, "20:00", "22:00")]),
    ("b3", "Lê Quốc Bảo", "backend", ["Python", "FastAPI", "Django", "PostgreSQL", "Redis"], 6,
     "Python backend engineer building high-performance APIs with FastAPI and Django. I mentor on clean code, testing "
     "and PostgreSQL query tuning.", 0, 4.2, 8, [(1, "07:00", "09:00"), (6, "14:00", "18:00")]),
    ("b4", "Hoàng Gia Huy", "backend", ["Go", "gRPC", "Distributed Systems", "Redis", "Kubernetes"], 7,
     "Go engineer working on distributed systems: gRPC services, caching with Redis, consistency and scaling. Happy to "
     "review designs of microservices.", 280000, 4.9, 30, [(2, "19:00", "21:00"), (5, "19:00", "21:00")]),
    ("b5", "Phan Thị Mai", "backend", ["C#", ".NET", "ASP.NET Core", "SQL Server", "Entity Framework"], 10,
     "10 năm phát triển ứng dụng doanh nghiệp bằng C# và ASP.NET Core, SQL Server. Hướng dẫn chuyển sang .NET và kiến "
     "trúc ứng dụng lớn.", 250000, 4.0, 5, [(6, "08:00", "12:00"), (7, "08:00", "12:00")]),
    ("b6", "Đặng Văn Tùng", "backend", ["Java", "Spring", "Hibernate", "Oracle", "Banking"], 12,
     "Kiến trúc sư phần mềm ngân hàng 12 năm với Java, Spring, Hibernate và Oracle. Chia sẻ kinh nghiệm hệ thống "
     "giao dịch, bảo mật và phỏng vấn Java.", 400000, 3.9, 15, [(1, "20:00", "22:00")]),
    ("b7", "Vũ Minh Quân", "backend", ["PHP", "Laravel", "MySQL", "Clean Code"], 4,
     "Lập trình viên PHP Laravel 4 năm, làm nhiều dự án web với MySQL. Hỗ trợ thiết kế cơ sở dữ liệu và viết code sạch.",
     100000, 0.0, 0, [(3, "18:00", "21:00"), (5, "18:00", "21:00")]),
    ("b8", "Ngô Thanh Sơn", "backend", ["System Design", "Java", "Scalability", "Interview Preparation", "Caching"], 11,
     "Staff engineer at a large tech company. I run system design interview practice: scalability, caching, sharding, "
     "message queues and distributed systems trade-offs.", 450000, 4.7, 40, [(6, "09:00", "12:00"), (7, "14:00", "17:00")]),
    ("b9", "Trịnh Bảo Ngọc", "backend", ["Node.js", "GraphQL", "AWS Lambda", "Serverless", "DynamoDB"], 3,
     "Backend developer focused on serverless: AWS Lambda, API Gateway, DynamoDB and GraphQL APIs with Node.js.",
     120000, 0.0, 0, [(2, "12:00", "13:30"), (4, "12:00", "13:30")]),
    ("b10", "Lý Hải Đăng", "backend", ["Rust", "C++", "Performance", "Systems Programming", "Concurrency"], 6,
     "Systems programmer writing Rust and C++: performance profiling, concurrency, memory safety. I mentor people "
     "moving into low-level and high-performance backend work.", 300000, 4.6, 6, [(3, "20:00", "22:30")]),
    # ---------------- frontend (7)
    ("f1", "Phạm Minh Anh", "frontend", ["React", "Next.js", "TypeScript", "Redux"], 7,
     "Frontend lead with 7 years of React and Next.js. I help with component architecture, state management and "
     "frontend interviews.", 250000, 4.7, 18, [(2, "19:00", "21:30"), (6, "09:00", "12:00")]),
    ("f2", "Đỗ Khánh Vy", "frontend", ["Vue.js", "Nuxt", "JavaScript", "Pinia"], 5,
     "Frontend developer chuyên Vue.js và Nuxt, nhận nhiều dự án freelance. Hướng dẫn xây dựng SPA và làm việc với khách hàng.",
     150000, 4.3, 9, [(1, "19:00", "21:00"), (4, "19:00", "21:00")]),
    ("f3", "Trương Quang Vinh", "frontend", ["Angular", "RxJS", "TypeScript", "Enterprise UI"], 8,
     "Angular developer building enterprise dashboards with RxJS and TypeScript; large codebase architecture and testing.",
     220000, 4.1, 7, [(3, "19:00", "21:00")]),
    ("f4", "Lâm Ngọc Hân", "frontend", ["CSS", "Design Systems", "Accessibility", "Figma", "HTML"], 6,
     "UI engineer 6 năm: CSS, HTML, design system, accessibility và làm việc với Figma. Giúp người mới nắm vững nền "
     "tảng giao diện web.", 180000, 4.8, 22, [(6, "14:00", "17:00"), (7, "14:00", "17:00")]),
    ("f5", "Huỳnh Tấn Phát", "frontend", ["React", "Jest", "Cypress", "Testing Library", "Performance"], 4,
     "React developer obsessed with testing: unit tests with Jest and Testing Library, end-to-end tests with Cypress.",
     160000, 0.0, 0, [(2, "20:00", "22:00"), (5, "20:00", "22:00")]),
    ("f6", "Cao Thị Lan", "frontend", ["Web Performance", "Webpack", "Vite", "JavaScript", "Core Web Vitals"], 9,
     "Front-end performance specialist: Core Web Vitals, bundling with Webpack and Vite, lazy loading and caching.",
     300000, 4.5, 11, [(1, "12:00", "13:00"), (3, "12:00", "13:00")]),
    ("f7", "Mai Anh Tuấn", "frontend", ["HTML", "CSS", "JavaScript", "Svelte"], 2,
     "Mentor cho người mới bắt đầu: HTML, CSS, JavaScript cơ bản và làm website đầu tiên với Svelte.", 0, 4.0, 3,
     [(6, "19:00", "21:00"), (7, "19:00", "21:00")]),
    # ---------------- data (8)
    ("d1", "Vũ Khánh Linh", "data", ["Python", "Machine Learning", "scikit-learn", "Pandas"], 5,
     "Data scientist 5 năm, hướng dẫn machine learning cơ bản với Python, scikit-learn và Pandas: từ dữ liệu tới mô hình.",
     200000, 4.6, 14, [(4, "19:00", "21:00"), (6, "13:00", "16:00")]),
    ("d2", "Nguyễn Đức Minh", "data", ["Deep Learning", "PyTorch", "Computer Vision", "CNN"], 6,
     "Research engineer in deep learning and computer vision with PyTorch: CNNs, detection and segmentation models.",
     280000, 4.8, 10, [(2, "20:00", "22:00")]),
    ("d3", "Trần Thảo Nguyên", "data", ["NLP", "Transformers", "LLM", "Python"], 4,
     "Kỹ sư NLP xử lý tiếng Việt, mô hình Transformers và ứng dụng mô hình ngôn ngữ lớn (LLM).", 250000, 4.7, 9,
     [(3, "19:00", "21:00"), (7, "09:00", "11:00")]),
    ("d4", "Bùi Thanh Hải", "data", ["Data Engineering", "Spark", "Airflow", "Kafka", "Python"], 8,
     "Data engineer building batch and streaming pipelines with Spark, Airflow and Kafka on cloud data platforms.",
     300000, 4.4, 13, [(1, "19:00", "21:00"), (5, "19:00", "21:00")]),
    ("d5", "Lê Thị Hồng", "data", ["SQL", "Power BI", "Data Analysis", "Excel", "Visualization"], 6,
     "Chuyên viên phân tích dữ liệu: SQL, Power BI, Excel và trực quan hoá dữ liệu cho báo cáo kinh doanh.", 150000,
     4.5, 16, [(6, "08:00", "11:00")]),
    ("d6", "Phạm Quốc Khánh", "data", ["Statistics", "A/B Testing", "R", "Experiment Design"], 10,
     "Statistician with 10 years in experimentation: A/B testing, hypothesis testing and R for analysis.", 220000, 4.0, 4,
     [(2, "12:00", "13:00")]),
    ("d7", "Đinh Hoài Nam", "data", ["MLOps", "MLflow", "Kubernetes", "Model Deployment", "Docker"], 5,
     "MLOps engineer: deploying ML models to production, MLflow tracking, monitoring and serving on Kubernetes.",
     260000, 0.0, 0, [(4, "20:00", "22:00")]),
    ("d8", "Hồ Ngọc Diệp", "data", ["Data Warehouse", "dbt", "BigQuery", "Snowflake", "SQL"], 7,
     "Kỹ sư dữ liệu xây dựng kho dữ liệu với dbt, BigQuery và Snowflake; mô hình hoá dữ liệu cho phân tích.", 240000,
     4.2, 6, [(3, "19:00", "21:00")]),
    # ---------------- devops (6)
    ("o1", "Đỗ Thành Nam", "devops", ["Kubernetes", "Docker", "Helm", "Microservices"], 8,
     "DevOps engineer vận hành Kubernetes cho hệ thống hàng triệu người dùng. Hướng dẫn Docker, Helm và triển khai "
     "microservices.", 350000, 4.7, 19, [(3, "20:00", "22:00"), (7, "14:00", "17:00")]),
    ("o2", "Kiều Minh Trí", "devops", ["AWS", "Terraform", "Cloud Architecture", "Infrastructure as Code"], 9,
     "Cloud architect: AWS, Terraform and infrastructure as code. I help people prepare for AWS certifications.",
     380000, 4.6, 12, [(6, "09:00", "12:00")]),
    ("o3", "Phùng Thị Thu", "devops", ["CI/CD", "GitHub Actions", "Jenkins", "GitLab CI"], 5,
     "Xây dựng pipeline CI/CD với GitHub Actions, Jenkins và GitLab CI cho nhiều team phát triển.", 180000, 4.3, 8,
     [(2, "19:00", "21:00"), (4, "19:00", "21:00")]),
    ("o4", "Tạ Quang Dũng", "devops", ["Linux", "Networking", "Bash", "SRE", "Incident Response"], 12,
     "Site reliability engineer: Linux internals, networking, Bash automation and incident response on-call.", 300000,
     4.1, 5, [(1, "20:00", "22:00")]),
    ("o5", "Lương Bích Ngọc", "devops", ["Azure", "DevSecOps", "Security", "Kubernetes"], 6,
     "DevSecOps on Azure: security scanning in pipelines, policy as code and secure Kubernetes clusters.", 260000, 0.0, 0,
     [(5, "19:00", "21:00")]),
    ("o6", "Nghiêm Văn Lực", "devops", ["Prometheus", "Grafana", "Observability", "ELK"], 7,
     "Chuyên gia giám sát hệ thống: Prometheus, Grafana, ELK, thiết lập cảnh báo và observability cho production.",
     240000, 4.5, 10, [(6, "14:00", "17:00")]),
    # ---------------- mobile (6)
    ("m1", "Hà Văn Thịnh", "mobile", ["Android", "Kotlin", "Jetpack Compose", "MVVM"], 6,
     "Lập trình viên Android 6 năm với Kotlin và Jetpack Compose, kiến trúc MVVM. Hướng dẫn làm app Android từ đầu.",
     220000, 4.6, 12, [(2, "19:00", "21:00"), (6, "09:00", "11:00")]),
    ("m2", "Doãn Thu Trang", "mobile", ["iOS", "Swift", "SwiftUI", "App Store"], 7,
     "iOS engineer with Swift and SwiftUI; I guide people through their first App Store release.", 260000, 4.7, 15,
     [(3, "19:00", "21:00")]),
    ("m3", "Châu Gia Bảo", "mobile", ["Flutter", "Dart", "Firebase", "Cross-platform"], 4,
     "Phát triển ứng dụng đa nền tảng bằng Flutter và Dart, tích hợp Firebase cho cả Android và iOS.", 170000, 4.4, 9,
     [(5, "19:00", "21:00"), (7, "09:00", "11:00")]),
    ("m4", "Viên Minh Khôi", "mobile", ["React Native", "TypeScript", "Expo", "Cross-platform"], 5,
     "React Native developer using TypeScript and Expo to ship cross-platform apps.", 200000, 4.2, 7,
     [(1, "20:00", "22:00")]),
    ("m5", "Tôn Nữ Quỳnh", "mobile", ["Mobile UI", "UX", "Figma", "App Store", "Google Play"], 3,
     "Thiết kế giao diện ứng dụng di động, trải nghiệm người dùng và phát hành lên App Store, Google Play.", 0, 0.0, 0,
     [(6, "14:00", "16:00")]),
    ("m6", "Quách Đình Phong", "mobile", ["Kotlin Multiplatform", "Android", "Clean Architecture", "Kotlin"], 9,
     "Android architect: Kotlin, Kotlin Multiplatform and clean architecture for large mobile codebases.", 300000, 4.0, 4,
     [(4, "20:00", "22:00")]),
]

# key, tên, lĩnh vực, trình độ, kỹ năng, mục tiêu, ngôn ngữ mục tiêu (vi/en), ngày ưa thích, buổi, strong, partial
MENTEES = [
    # ---------------- backend (9)
    ("e01", "Trần Minh Khoa", "backend", "BEGINNER", ["Java", "SQL", "Git"],
     "Muốn trở thành backend developer Java, học Spring Boot và microservices, chuẩn bị phỏng vấn trong 6 tháng tới.",
     "vi", [1, 3], "EVENING", ["b1", "b6", "b8"], ["b4", "b5"]),
    ("e02", "Lê Thị Hoa", "backend", "BEGINNER", ["JavaScript", "HTML"],
     "Mình đang học Node.js, muốn xây dựng REST API với TypeScript và triển khai ứng dụng lên cloud.",
     "vi", [2, 4], "EVENING", ["b2", "b9"], ["b3", "b1"]),
    ("e03", "Kevin Nguyen", "backend", "INTERMEDIATE", ["Python", "SQL"],
     "I want to build high-performance APIs in Python with FastAPI and learn PostgreSQL query tuning.",
     "en", [6], "AFTERNOON", ["b3"], ["b4", "b2", "b10"]),
    ("e04", "Phạm Đức Anh", "backend", "ADVANCED", ["Java", "Kafka", "Docker"],
     "Chuẩn bị phỏng vấn system design cho các công ty lớn, cần luyện thiết kế hệ thống phân tán và khả năng mở rộng.",
     "vi", [6, 7], None, ["b8", "b4", "b1"], ["b10", "b6"]),
    ("e05", "Anna Tran", "backend", "INTERMEDIATE", ["Go", "Docker"],
     "Looking for guidance on Go microservices, gRPC communication and distributed caching with Redis.",
     "en", [2, 5], "EVENING", ["b4"], ["b1", "b8", "b10"]),
    ("e06", "Nguyễn Văn Hùng", "backend", "INTERMEDIATE", ["PHP", "Laravel", "MySQL"],
     "Em là lập trình viên PHP Laravel, muốn cải thiện thiết kế cơ sở dữ liệu MySQL và viết code sạch hơn.",
     "vi", [3, 5], "EVENING", ["b7"], ["b3", "b5"]),
    ("e07", "David Le", "backend", "BEGINNER", ["C#"],
     "Career switch into .NET backend development for enterprise applications with ASP.NET Core and SQL Server.",
     "en", [], None, ["b5"], ["b6", "b1"]),
    ("e08", "Đoàn Quang Minh", "backend", "ADVANCED", ["C++", "Linux"],
     "Muốn tìm hiểu lập trình hệ thống, tối ưu hiệu năng và học ngôn ngữ Rust.",
     "vi", [3], "EVENING", ["b10"], ["b4"]),
    ("e09", "Sophie Pham", "backend", "BEGINNER", ["JavaScript", "Node.js"],
     "I want to learn serverless backends with AWS Lambda and build GraphQL APIs.",
     "en", [2, 4], "AFTERNOON", ["b9"], ["b2"]),
    # ---------------- frontend (6)
    ("e10", "Ngô Bảo Châu", "frontend", "INTERMEDIATE", ["HTML", "CSS", "JavaScript"],
     "Muốn nâng cao kỹ năng React và Next.js để ứng tuyển vị trí frontend developer.",
     "vi", [2, 6], None, ["f1"], ["f5", "f6"]),
    ("e11", "Mark Vu", "frontend", "INTERMEDIATE", ["React", "JavaScript"],
     "I need help writing reliable tests for my React app with Jest and Cypress.",
     "en", [5], "EVENING", ["f5"], ["f1"]),
    ("e12", "Hoàng Thị Yến", "frontend", "BEGINNER", ["HTML", "CSS"],
     "Mình muốn học Vue.js và Nuxt để nhận dự án freelance.",
     "vi", [1, 4], "EVENING", ["f2"], ["f7"]),
    ("e13", "Linda Do", "frontend", "INTERMEDIATE", ["CSS", "Figma"],
     "Improve my UI skills and build an accessible design system and component library.",
     "en", [6, 7], "AFTERNOON", ["f4"], ["f1", "f3"]),
    ("e14", "Phan Văn Tài", "frontend", "BEGINNER", [],
     "Người mới hoàn toàn, muốn học HTML, CSS và JavaScript cơ bản để tự làm website.",
     "vi", [6, 7], "EVENING", ["f7", "f4"], ["f2"]),
    ("e15", "Chris Hoang", "frontend", "ADVANCED", ["React", "Webpack"],
     "Our web app loads slowly; I want to master web performance and bundling with Vite and Webpack.",
     "en", [1, 3], "AFTERNOON", ["f6"], ["f5", "f1"]),
    # ---------------- data (6)
    ("e16", "Trịnh Thu Trang", "data", "BEGINNER", ["Python", "Excel"],
     "Muốn bắt đầu với machine learning bằng Python, học scikit-learn và các thuật toán cơ bản.",
     "vi", [4, 6], None, ["d1"], ["d6", "d2"]),
    ("e17", "Jason Bui", "data", "INTERMEDIATE", ["Python", "NumPy"],
     "I want to work on computer vision projects using deep learning and PyTorch.",
     "en", [2], "EVENING", ["d2"], ["d3", "d1"]),
    ("e18", "Lê Hoàng Phúc", "data", "INTERMEDIATE", ["Python", "Machine Learning"],
     "Quan tâm xử lý ngôn ngữ tự nhiên tiếng Việt và ứng dụng mô hình ngôn ngữ lớn.",
     "vi", [3, 7], None, ["d3"], ["d2", "d1"]),
    ("e19", "Emily Ngo", "data", "INTERMEDIATE", ["SQL", "Python"],
     "Become a data engineer: build data pipelines with Spark and Airflow, including streaming data.",
     "en", [1, 5], "EVENING", ["d4", "d8"], ["d7"]),
    ("e20", "Đặng Minh Thư", "data", "BEGINNER", ["Excel"],
     "Muốn làm data analyst, thành thạo SQL, Power BI và trực quan hoá dữ liệu.",
     "vi", [6], "MORNING", ["d5"], ["d8", "d6"]),
    ("e21", "Võ Thành Đạt", "data", "ADVANCED", ["Python", "Machine Learning", "Docker"],
     "Học cách triển khai mô hình machine learning lên production, theo dõi và vận hành mô hình.",
     "vi", [4], "EVENING", ["d7"], ["d1", "d4"]),
    # ---------------- devops (5)
    ("e22", "Nguyễn Thanh Tâm", "devops", "BEGINNER", ["Linux"],
     "Muốn học Docker và Kubernetes để triển khai ứng dụng microservices.",
     "vi", [3, 7], None, ["o1"], ["o3", "o2"]),
    ("e23", "Ryan Tran", "devops", "INTERMEDIATE", ["AWS", "Linux"],
     "Preparing for the AWS certification and learning infrastructure as code with Terraform.",
     "en", [6], "MORNING", ["o2"], ["o5"]),
    ("e24", "Bùi Thị Ngân", "devops", "INTERMEDIATE", ["Git", "Docker"],
     "Xây dựng pipeline CI/CD tự động cho team bằng GitHub Actions.",
     "vi", [2, 4], "EVENING", ["o3"], ["o1"]),
    ("e25", "Tom Dinh", "devops", "INTERMEDIATE", ["Docker", "Linux"],
     "Set up monitoring and alerting for production systems with Prometheus and Grafana.",
     "en", [6], "AFTERNOON", ["o6"], ["o4"]),
    ("e26", "Lý Văn Khang", "devops", "INTERMEDIATE", ["Linux"],
     "Muốn trở thành SRE, củng cố kiến thức Linux, mạng máy tính và xử lý sự cố.",
     "vi", [1], "EVENING", ["o4"], ["o6", "o1"]),
    # ---------------- mobile (4)
    ("e27", "Hồ Minh Nhật", "mobile", "BEGINNER", ["Java"],
     "Muốn phát triển ứng dụng Android bằng Kotlin và Jetpack Compose.",
     "vi", [2, 6], None, ["m1", "m6"], ["m3"]),
    ("e28", "Grace Lam", "mobile", "BEGINNER", ["Swift"],
     "Learn iOS development with Swift and SwiftUI to publish my first app.",
     "en", [3], "EVENING", ["m2"], ["m5"]),
    ("e29", "Trần Quốc Việt", "mobile", "INTERMEDIATE", ["Dart"],
     "Muốn làm app đa nền tảng bằng Flutter cho cả Android và iOS.",
     "vi", [5, 7], None, ["m3"], ["m4"]),
    ("e30", "Henry Phan", "mobile", "INTERMEDIATE", ["TypeScript", "React"],
     "Build cross-platform mobile apps with React Native using my TypeScript experience.",
     "en", [1], "EVENING", ["m4"], ["m3"]),
]

TIME_WINDOWS = {"MORNING": ("06:00", "12:00"), "AFTERNOON": ("12:00", "18:00"), "EVENING": ("18:00", "23:00")}


def mentor_dicts() -> list[dict]:
    keys = ["key", "display_name", "domain", "skills", "years_experience", "bio", "hourly_rate", "rating",
            "rating_count", "slots"]
    return [dict(zip(keys, m)) for m in MENTORS]


def mentee_dicts() -> list[dict]:
    keys = ["key", "display_name", "domain", "current_level", "skills", "goal", "goal_language", "preferred_days",
            "preferred_time_of_day", "strong", "partial"]
    return [dict(zip(keys, m)) for m in MENTEES]


def draft_label(mentee: dict, mentor_key: str) -> int:
    """Nhãn nháp của người viết bộ dữ liệu: 2 rất phù hợp, 1 phù hợp một phần, 0 không phù hợp."""
    if mentor_key in mentee["strong"]:
        return 2
    if mentor_key in mentee["partial"]:
        return 1
    return 0


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def availability_overlap(mentor: dict, mentee: dict) -> float:
    """
    Tín hiệu "trùng lịch" (PRD-MATCH-3) cho biến thể trọng số mới: tỉ lệ ngày mentee muốn học mà mentor có ít nhất
    một khung rảnh giao với buổi mentee chọn. Mentee không khai báo sở thích => 1.0 cho mọi mentor (trung tính).
    """
    days = mentee["preferred_days"] or list(range(1, 8))
    window = TIME_WINDOWS.get(mentee["preferred_time_of_day"] or "", ("00:00", "24:00"))
    w_start, w_end = _minutes(window[0]), _minutes(window[1])
    if not mentee["preferred_days"] and not mentee["preferred_time_of_day"]:
        return 1.0
    hit = 0
    for d in days:
        if any(day == d and _minutes(s) < w_end and _minutes(e) > w_start for day, s, e in mentor["slots"]):
            hit += 1
    return hit / len(days)


def check_dataset() -> None:
    """Ràng buộc của bộ dữ liệu (chạy trong test): pool ≤ 10/lĩnh vực, nhãn trỏ tới mentor cùng lĩnh vực."""
    mentors = {m["key"]: m for m in mentor_dicts()}
    assert len(mentors) == len(MENTORS)
    for domain in {m["domain"] for m in mentors.values()}:
        assert sum(1 for m in mentors.values() if m["domain"] == domain) <= 10, domain
    mentees = mentee_dicts()
    assert len(mentees) == 30
    for e in mentees:
        assert e["goal_language"] in ("vi", "en")
        assert not set(e["strong"]) & set(e["partial"]), e["key"]
        for k in e["strong"] + e["partial"]:
            assert mentors[k]["domain"] == e["domain"], (e["key"], k)
