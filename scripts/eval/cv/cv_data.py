"""
US-29 — nội dung 20 CV mẫu dùng cho đánh giá CV parsing (PRD 6.2 Evaluation).

Mỗi CV: id, ngôn ngữ, kiểu bố cục và nội dung. Bố cục:
  - classic     : một cột, tiêu đề mục + gạch đầu dòng
  - two-column  : cột trái (liên hệ, kỹ năng) và cột phải (kinh nghiệm) được vẽ XEN KẼ theo từng dòng như CV xuất
                  từ Word/Canva — khi trích văn bản, hai cột bị trộn trên cùng một dòng
  - table       : kỹ năng dạng bảng "Nhóm | Công nghệ"
  - compact     : không có mục Kỹ năng riêng, công nghệ nằm trong đoạn tóm tắt / mô tả công việc
  - timeline    : mốc thời gian nằm trên dòng riêng, tách khỏi tên công ty

Nhãn chuẩn (kỹ năng, số năm kinh nghiệm) KHÔNG nằm ở đây mà ở gold.csv để người chấm sửa độc lập.
Thời điểm tham chiếu cho "nay/present": 11/2026 (Sprint 3).
"""

CVS = [
    {
        "id": "CV01", "lang": "vi", "layout": "classic",
        "lines": [
            "NGUYỄN VĂN AN", "Lập trình viên Backend", "Email: an.nguyen@example.com | Hà Nội", "",
            "TÓM TẮT", "Hơn 4 năm kinh nghiệm phát triển hệ thống thanh toán và thương mại điện tử.", "",
            "KINH NGHIỆM LÀM VIỆC",
            "Công ty Cổ phần Thanh toán Số (01/2024 - 10/2026)",
            "- Thiết kế REST API bằng Java, Spring Boot cho cổng thanh toán",
            "- Dùng Kafka xử lý sự kiện giao dịch, Redis làm cache số dư",
            "Công ty TNHH Phần mềm Sao Mai (06/2022 - 12/2023)",
            "- Xây dựng microservices, triển khai bằng Docker", "",
            "KỸ NĂNG", "Java, Spring Boot, PostgreSQL, Redis, Kafka, Docker, Git, JUnit", "",
            "HỌC VẤN", "Đại học Bách khoa Hà Nội - Kỹ thuật phần mềm (2018 - 2022)",
        ],
    },
    {
        "id": "CV02", "lang": "en", "layout": "classic",
        "lines": [
            "EMILY TRAN", "Frontend Engineer", "emily.tran@example.com", "",
            "SUMMARY", "Frontend engineer with 3 years of experience building dashboards and e-commerce sites.", "",
            "WORK EXPERIENCE",
            "Shopify Partner Agency - Frontend Engineer (2023 - 2026)",
            "- Built storefronts with React, Next.js and TypeScript",
            "- Wrote component tests with Jest and end-to-end tests with Cypress",
            "", "SKILLS", "React, Next.js, TypeScript, JavaScript, HTML, CSS, Tailwind CSS, Jest, Cypress, Figma",
            "", "EDUCATION", "University of Science - Computer Science (2019 - 2023)",
        ],
    },
    {
        "id": "CV03", "lang": "vi", "layout": "two-column",
        "left": ["LIÊN HỆ", "0912 345 678", "minh.le@example.com", "", "KỸ NĂNG", "Python", "Pandas", "NumPy",
                 "scikit-learn", "PyTorch", "SQL", "Airflow", "Power BI"],
        "right": ["LÊ HOÀNG MINH", "Data Scientist", "", "KINH NGHIỆM LÀM VIỆC",
                  "Ngân hàng TMCP Đông Á (03/2022 - 02/2026)", "- Xây dựng mô hình chấm điểm tín dụng",
                  "- Dự báo rời bỏ khách hàng bằng học máy", "", "HỌC VẤN",
                  "Đại học Kinh tế Quốc dân - Toán ứng dụng (2017 - 2021)"],
    },
    {
        "id": "CV04", "lang": "en", "layout": "table",
        "lines": [
            "DAVID PHAM", "DevOps Engineer", "", "PROFILE", "DevOps engineer with 6 years of experience running cloud platforms.", "",
            "TECHNICAL SKILLS",
            "Cloud        | AWS, Google Cloud",
            "Containers   | Docker, Kubernetes, Helm",
            "IaC          | Terraform, Ansible",
            "CI/CD        | Jenkins, GitHub Actions, GitLab CI",
            "Monitoring   | Prometheus, Grafana",
            "OS           | Linux, Nginx", "",
            "EXPERIENCE", "CloudOps Vietnam - Senior DevOps (2022 - 2026)", "VNG - DevOps Engineer (2020 - 2022)", "",
            "EDUCATION", "FPT University - Information Systems",
        ],
    },
    {
        "id": "CV05", "lang": "vi", "layout": "compact",
        "lines": [
            "TRẦN THỊ BÌNH", "Kỹ sư phần mềm Mobile", "",
            "GIỚI THIỆU",
            "Tôi có 2 năm kinh nghiệm phát triển ứng dụng Flutter và Android (Kotlin), từng tích hợp Firebase và REST API.",
            "",
            "KINH NGHIỆM LÀM VIỆC",
            "Startup Giao Đồ Ăn (09/2024 - 09/2026)",
            "- Phát triển ứng dụng giao đồ ăn bằng Flutter, Dart; quản lý state với BLoC",
            "- Viết module thanh toán native bằng Kotlin cho Android", "",
            "HỌC VẤN", "Học viện Công nghệ Bưu chính Viễn thông (2020 - 2024)",
        ],
    },
    {
        "id": "CV06", "lang": "en", "layout": "timeline",
        "lines": [
            "KEVIN NGUYEN", "Full-stack Developer", "",
            "EXPERIENCE",
            "TechViet Solutions", "Full-stack Developer", "01/2021 - 12/2025",
            "- Node.js and Express backend with MongoDB", "- Vue.js admin portal",
            "Freelance", "Web Developer", "06/2019 - 12/2020",
            "- WordPress and PHP websites for small businesses", "",
            "SKILLS", "JavaScript, TypeScript, Node.js, Express, MongoDB, Vue.js, PHP, MySQL, Docker, Git", "",
            "EDUCATION", "Ho Chi Minh City University of Technology (2015 - 2019)",
        ],
    },
    {
        "id": "CV07", "lang": "vi", "layout": "table",
        "lines": [
            "PHẠM QUỐC HUY", "Kỹ sư kiểm thử tự động", "", "MỤC TIÊU NGHỀ NGHIỆP",
            "Trở thành Test Lead trong 2 năm tới.", "",
            "KỸ NĂNG",
            "Ngôn ngữ      | Java, Python",
            "Công cụ test  | Selenium, Playwright, JUnit",
            "CI/CD         | Jenkins",
            "Quy trình     | Agile/Scrum", "",
            "KINH NGHIỆM LÀM VIỆC", "FPT Software - QA Automation (2021 - 2026)", "",
            "HỌC VẤN", "Đại học Công nghệ - ĐHQGHN (2017 - 2021)",
        ],
    },
    {
        "id": "CV08", "lang": "en", "layout": "two-column",
        "left": ["CONTACT", "sara.vo@example.com", "", "SKILLS", "C#", ".NET", "SQL Server", "Azure", "Angular",
                 "TypeScript", "Git"],
        "right": ["SARA VO", "Software Engineer", "", "EXPERIENCE", "Bosch Global Software (2019 - 2026)",
                  "- Enterprise web apps on .NET and Angular", "- Migrated databases to Azure", "", "EDUCATION",
                  "Da Nang University of Technology (2015 - 2019)"],
    },
    {
        "id": "CV09", "lang": "vi", "layout": "classic",
        "lines": [
            "ĐỖ THU HÀ", "Sinh viên năm cuối - Thực tập sinh Frontend", "",
            "HỌC VẤN", "Đại học FPT - Kỹ thuật phần mềm (2022 - 2026)", "",
            "DỰ ÁN",
            "Website đặt phòng khách sạn",
            "- ReactJS, Redux, gọi REST API, giao diện responsive với Tailwind",
            "Ứng dụng ghi chú", "- HTML, CSS, JavaScript thuần", "",
            "KỸ NĂNG", "React, JavaScript, HTML, CSS, Tailwind CSS, Git",
        ],
    },
    {
        "id": "CV10", "lang": "en", "layout": "compact",
        "lines": [
            "MICHAEL HOANG", "Machine Learning Engineer", "",
            "ABOUT ME",
            "ML engineer with 5 years of experience in NLP and computer vision, shipping PyTorch and TensorFlow models "
            "to production on AWS with Docker.", "",
            "EXPERIENCE", "AI Lab Vietnam - ML Engineer (2021 - 2026)",
            "- Fine-tuned transformer models for Vietnamese NLP", "- Built data pipelines with Spark and Airflow", "",
            "EDUCATION", "MSc Computer Science, KAIST (2019 - 2021)",
        ],
    },
    {
        "id": "CV11", "lang": "vi", "layout": "timeline",
        "lines": [
            "VŨ ĐỨC THẮNG", "Lập trình viên Go", "",
            "KINH NGHIỆM LÀM VIỆC",
            "Công ty Fintech Ngân Lượng", "Backend Developer", "04/2022 - 04/2026",
            "- Xây dựng dịch vụ thanh toán bằng Golang, gRPC", "- Lưu trữ PostgreSQL, hàng đợi RabbitMQ", "",
            "KỸ NĂNG", "Golang, gRPC, PostgreSQL, RabbitMQ, Docker, Kubernetes, Linux", "",
            "HỌC VẤN", "Đại học Bách khoa TP.HCM (2018 - 2022)",
        ],
    },
    {
        "id": "CV12", "lang": "en", "layout": "classic",
        "lines": [
            "LINDA DANG", "iOS Developer", "",
            "SUMMARY", "iOS developer with 7 years of experience in banking apps.", "",
            "EXPERIENCE", "Techcombank - Senior iOS Developer (2020 - 2026)", "- Swift, SwiftUI, Combine",
            "Gameloft - iOS Developer (2018 - 2020)", "- Objective-C and Swift", "",
            "SKILLS", "Swift, iOS, Objective-C, SwiftUI, Git, CI/CD", "",
            "EDUCATION", "RMIT Vietnam - Software Engineering",
        ],
    },
    {
        "id": "CV13", "lang": "vi", "layout": "two-column",
        "left": ["THÔNG TIN", "Hồ Chí Minh", "", "KỸ NĂNG", "PHP", "Laravel", "MySQL", "Vue.js", "Redis", "Docker"],
        "right": ["NGÔ MINH TUẤN", "Lập trình viên PHP", "", "KINH NGHIỆM LÀM VIỆC",
                  "Công ty TNHH Web Việt (01/2020 - 01/2023)", "- Phát triển hệ thống bán hàng bằng Laravel",
                  "Công ty Cổ phần Bán lẻ Xanh (02/2023 - 02/2026)", "- Tối ưu truy vấn MySQL, cache Redis", "",
                  "HỌC VẤN", "Đại học Sư phạm Kỹ thuật (2016 - 2020)"],
    },
    {
        "id": "CV14", "lang": "en", "layout": "table",
        "lines": [
            "ANNA LY", "Data Engineer", "", "SUMMARY", "Data engineer with 4 years of experience.", "",
            "SKILLS",
            "Languages    | Python, SQL, Scala",
            "Big data     | Spark, Kafka, Airflow",
            "Storage      | PostgreSQL, Elasticsearch",
            "Cloud        | Google Cloud", "",
            "EXPERIENCE", "Tiki - Data Engineer (2022 - 2026)", "",
            "EDUCATION", "Hanoi University of Science and Technology",
        ],
    },
    {
        "id": "CV15", "lang": "vi", "layout": "compact",
        "lines": [
            "LÝ GIA BẢO", "Kỹ sư DevOps", "",
            "GIỚI THIỆU",
            "3 năm kinh nghiệm vận hành hạ tầng trên AWS: viết Terraform, dựng Kubernetes với Helm, pipeline GitLab CI "
            "và giám sát bằng Prometheus, Grafana.", "",
            "KINH NGHIỆM LÀM VIỆC", "Công ty Cổ phần Logistics Nhanh (2023 - 2026)", "",
            "HỌC VẤN", "Đại học Giao thông Vận tải (2018 - 2022)",
        ],
    },
    {
        "id": "CV16", "lang": "en", "layout": "timeline",
        "lines": [
            "JAMES BUI", "Backend Developer", "",
            "WORK EXPERIENCE",
            "Grab Vietnam", "Backend Engineer", "2023 - 2026",
            "- Python, Django and FastAPI services", "- PostgreSQL, Redis, Celery",
            "Momo", "Software Engineer Intern", "2022 - 2023", "- Flask REST API", "",
            "SKILLS", "Python, Django, FastAPI, Flask, PostgreSQL, Redis, Docker, AWS", "",
            "EDUCATION", "University of Information Technology (2018 - 2022)",
        ],
    },
    {
        "id": "CV17", "lang": "vi", "layout": "classic",
        "lines": [
            "PHAN THỊ LAN", "Kỹ sư phần mềm Full-stack", "",
            "TÓM TẮT", "6 năm kinh nghiệm phát triển web với Node.js, React và cơ sở dữ liệu NoSQL.", "",
            "KINH NGHIỆM LÀM VIỆC",
            "Công ty Phần mềm Hoa Sen (2020 - 2026)", "- NestJS, GraphQL, MongoDB; React và Next.js",
            "", "KỸ NĂNG", "Node.js, NestJS, GraphQL, MongoDB, React, Next.js, TypeScript, AWS", "",
            "HỌC VẤN", "Đại học Cần Thơ - Công nghệ thông tin",
        ],
    },
    {
        "id": "CV18", "lang": "en", "layout": "two-column",
        "left": ["CONTACT", "tom.ha@example.com", "", "SKILLS", "Kotlin", "Android", "Java", "React Native",
                 "Firebase", "Git"],
        "right": ["TOM HA", "Mobile Developer", "", "EXPERIENCE", "Zalo - Android Engineer (2021 - 2026)",
                  "- Chat features in Kotlin", "VCCorp - Mobile Developer (2019 - 2021)",
                  "- React Native news app", "", "EDUCATION", "Posts and Telecommunications Institute (2015 - 2019)"],
    },
    {
        "id": "CV19", "lang": "vi", "layout": "timeline",
        "lines": [
            "TRỊNH VĂN KHOA", "Kỹ sư phần mềm nhúng", "",
            "KINH NGHIỆM LÀM VIỆC",
            "Viettel High Tech", "Kỹ sư phần mềm", "07/2019 - 07/2025",
            "- Lập trình C++ trên Linux cho thiết bị viễn thông", "- Viết script tự động bằng Python", "",
            "KỸ NĂNG", "C++, Linux, Python, Git, cấu trúc dữ liệu và giải thuật", "",
            "HỌC VẤN", "Đại học Bách khoa Đà Nẵng - Điện tử viễn thông (2014 - 2019)",
        ],
    },
    {
        "id": "CV20", "lang": "en", "layout": "compact",
        "lines": [
            "OLIVIA TRUONG", "QA Engineer", "",
            "PROFILE",
            "QA engineer with 1 year of experience writing Playwright and Cypress tests in TypeScript, "
            "running them in GitHub Actions, and reporting bugs in an Agile team.", "",
            "EXPERIENCE", "KMS Technology - QA Engineer (2025 - 2026)", "",
            "EDUCATION", "Van Lang University (2020 - 2024)",
        ],
    },
]
