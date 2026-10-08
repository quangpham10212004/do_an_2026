"""
Bộ dữ liệu đánh giá AI Matching (tổng hợp, có nhãn theo rubric).

Mỗi mentor/mentee có một nhãn tiềm ẩn `topic` (KHÔNG đưa vào text khi embed). Nhãn mức phù hợp:
    3 = cùng topic          (mentor đúng chuyên môn mentee cần)
    2 = topic liên quan     (RELATED, ví dụ Java ~ Node.js ~ Python backend)
    0 = còn lại
Mentor không đủ điều kiện (chưa duyệt / hết chỗ / tắt nhận mentee) luôn có nhãn 0 dù cùng topic —
vì hệ thống KHÔNG được gợi ý họ (hard filter).

Mentee viết theo 4 phong cách để kiểm tra độ bền ngôn ngữ:
    vi      tiếng Việt có dấu         vi_nodiac  tiếng Việt không dấu, viết tắt kiểu chat
    mixed   Việt–Anh xen kẽ, ngắn     vague      mô tả mơ hồ, ít từ khoá kỹ thuật

Hạn chế (phải nêu trong báo cáo): đây là dữ liệu tổng hợp, nhãn theo rubric chứ không phải do nhiều
người gán độc lập; kết quả phản ánh xu hướng giữa các cấu hình hơn là con số tuyệt đối.
"""
import random

RELATED = [
    {"backend-java", "backend-node", "backend-python"},
    {"frontend-react", "mobile"},
    {"devops", "security"},
    {"data-ml", "data-analyst"},
]

DOMAIN = {
    "backend-java": "backend", "backend-node": "backend", "backend-python": "backend",
    "frontend-react": "frontend", "mobile": "mobile", "devops": "devops",
    "data-ml": "data", "data-analyst": "data", "qa": "qa", "security": "security",
}

# (topic, tên, kỹ năng, số năm, bio)
_MENTORS = [
    ("backend-java", "Nguyễn Hoàng Long", ["Java", "Spring Boot", "PostgreSQL", "Kafka"], 9,
     "Senior backend engineer 9 năm xây dựng hệ thống thanh toán bằng Java và Spring Boot. Hướng dẫn system design và luyện phỏng vấn backend."),
    ("backend-java", "Lê Văn Tuấn", ["Java", "Hibernate", "Microservices", "MySQL"], 6,
     "Kỹ sư Java làm microservices cho ngân hàng. Giúp người mới nắm vững OOP, JPA và thiết kế REST API."),
    ("backend-java", "Phan Thị Mai", ["Java", "Spring Cloud", "Docker", "Redis"], 5,
     "Backend developer Java, kinh nghiệm tối ưu hiệu năng truy vấn và cache. Mentor lộ trình từ fresher lên middle."),
    ("backend-node", "Trần Thu Hà", ["Node.js", "TypeScript", "MongoDB", "Express"], 5,
     "Backend developer chuyên Node.js và TypeScript, từng làm startup thương mại điện tử. Hỗ trợ xây dựng API và triển khai."),
    ("backend-node", "Đặng Quang Huy", ["NestJS", "Node.js", "GraphQL", "PostgreSQL"], 4,
     "Lập trình viên NestJS và GraphQL, quen kiến trúc hướng sự kiện. Mentor về thiết kế API và testing cho Node.js."),
    ("backend-node", "Hoàng Minh Châu", ["Node.js", "Redis", "WebSocket", "AWS"], 7,
     "Xây dựng dịch vụ realtime chat bằng Node.js và WebSocket phục vụ hàng trăm nghìn người dùng."),
    ("backend-python", "Lê Quốc Bảo", ["Python", "FastAPI", "Django", "PostgreSQL"], 6,
     "Kỹ sư Python backend, xây API hiệu năng cao với FastAPI. Mentor về clean code, testing và tối ưu cơ sở dữ liệu."),
    ("backend-python", "Vũ Thanh Tùng", ["Python", "Flask", "Celery", "RabbitMQ"], 5,
     "Phát triển hệ thống xử lý nền bằng Python, Celery và RabbitMQ. Hướng dẫn thiết kế hàng đợi tác vụ."),
    ("backend-python", "Ngô Phương Linh", ["Django", "Python", "REST", "Docker"], 4,
     "Backend Django cho các sản phẩm giáo dục trực tuyến. Giúp bạn mới làm quen Django và deploy ứng dụng."),
    ("frontend-react", "Phạm Minh Anh", ["React", "Next.js", "TypeScript", "CSS"], 7,
     "Frontend lead 7 năm kinh nghiệm React và Next.js. Hướng dẫn xây dựng giao diện hiệu năng cao, accessibility."),
    ("frontend-react", "Bùi Khánh Vy", ["React", "Redux", "JavaScript", "Testing"], 4,
     "Frontend developer React, thành thạo quản lý state và viết unit test cho component. Mentor cho người chuyển ngành."),
    ("frontend-react", "Đinh Gia Bảo", ["Vue", "React", "Tailwind", "JavaScript"], 5,
     "Chuyên làm giao diện web responsive với React và Tailwind. Hỗ trợ xây dựng portfolio và chuẩn bị phỏng vấn frontend."),
    ("mobile", "Trịnh Công Sơn", ["Flutter", "Dart", "Firebase", "Android"], 5,
     "Lập trình ứng dụng di động bằng Flutter, đã phát hành nhiều app lên App Store và Google Play."),
    ("mobile", "Lý Hải Yến", ["Swift", "iOS", "SwiftUI", "Core Data"], 6,
     "iOS developer dùng Swift và SwiftUI. Hướng dẫn kiến trúc MVVM và quy trình đưa app lên App Store."),
    ("mobile", "Cao Đức Minh", ["React Native", "Kotlin", "Android", "Redux"], 4,
     "Phát triển app di động React Native và Kotlin. Mentor cho người muốn làm mobile developer."),
    ("devops", "Đỗ Thành Nam", ["Docker", "Kubernetes", "AWS", "Terraform"], 8,
     "DevOps engineer vận hành Kubernetes cho hệ thống hàng triệu người dùng. Mentor CI/CD, cloud và SRE."),
    ("devops", "Mai Anh Tuấn", ["Jenkins", "GitLab CI", "Linux", "Ansible"], 6,
     "Xây dựng pipeline CI/CD tự động và quản trị máy chủ Linux. Hướng dẫn lộ trình DevOps cho sysadmin."),
    ("devops", "Võ Thị Hạnh", ["AWS", "Terraform", "Prometheus", "Grafana"], 5,
     "Cloud engineer chuyên hạ tầng dưới dạng mã và giám sát hệ thống với Prometheus, Grafana."),
    ("data-ml", "Vũ Khánh Linh", ["Python", "Machine Learning", "PyTorch", "NLP"], 4,
     "Data scientist chuyên xử lý ngôn ngữ tự nhiên và hệ gợi ý. Hướng dẫn quy trình ML từ dữ liệu tới triển khai mô hình."),
    ("data-ml", "Tạ Quốc Việt", ["TensorFlow", "Computer Vision", "Python", "MLOps"], 6,
     "Kỹ sư học máy làm thị giác máy tính và MLOps. Mentor nghiên cứu, huấn luyện và đưa mô hình lên production."),
    ("data-ml", "Lương Bích Ngọc", ["Deep Learning", "scikit-learn", "Pandas", "Statistics"], 5,
     "Nghiên cứu học sâu và thống kê. Giúp sinh viên làm đồ án machine learning và đọc bài báo khoa học."),
    ("data-analyst", "Nguyễn Thu Trang", ["SQL", "Power BI", "Excel", "Tableau"], 5,
     "Chuyên viên phân tích dữ liệu kinh doanh, xây dashboard Power BI và Tableau. Hướng dẫn kể chuyện bằng dữ liệu."),
    ("data-analyst", "Hà Văn Đạt", ["SQL", "Python", "Data Warehouse", "dbt"], 6,
     "Data analyst chuyển sang analytics engineer, xây kho dữ liệu và mô hình hoá với dbt."),
    ("data-analyst", "Kiều Mỹ Duyên", ["Google Analytics", "SQL", "A/B Testing", "Excel"], 4,
     "Phân tích hành vi người dùng và thiết kế thí nghiệm A/B cho sản phẩm số."),
    ("qa", "Dương Thanh Bình", ["Selenium", "Java", "Test Automation", "Jira"], 6,
     "QA automation engineer viết kiểm thử tự động bằng Selenium. Hướng dẫn xây khung test và quy trình kiểm thử."),
    ("qa", "Ông Bảo Ngân", ["Cypress", "Postman", "API Testing", "Manual Testing"], 4,
     "Tester chuyên kiểm thử API và web với Cypress, Postman. Giúp fresher vào nghề kiểm thử phần mềm."),
    ("qa", "Châu Nhật Anh", ["Playwright", "Performance Testing", "JMeter", "CI"], 5,
     "Kiểm thử hiệu năng với JMeter và kiểm thử end-to-end với Playwright trong pipeline CI."),
    ("security", "Lâm Hữu Phúc", ["Penetration Testing", "OWASP", "Burp Suite", "Linux"], 7,
     "Chuyên gia an toàn thông tin, kiểm thử xâm nhập ứng dụng web theo OWASP Top 10. Mentor CTF và chứng chỉ bảo mật."),
    ("security", "Tống Mỹ Hoa", ["SOC", "SIEM", "Incident Response", "Network Security"], 5,
     "Analyst vận hành trung tâm giám sát an ninh mạng, xử lý sự cố bằng SIEM. Hướng dẫn vào nghề blue team."),
    ("security", "Quách Đình Khải", ["Cryptography", "Secure Coding", "Reverse Engineering", "C"], 8,
     "Nghiên cứu mật mã và lập trình an toàn. Hướng dẫn dịch ngược và phân tích mã độc cơ bản."),
]

# Mentor đúng topic nhưng KHÔNG đủ điều kiện (hard filter phải loại) — bẫy cho cấu hình thiếu bước lọc.
_INELIGIBLE = [
    ("backend-java", "Chu Văn Hải", ["Java", "Spring Boot", "Hibernate"], 3, "pending",
     "Backend developer Java, Spring Boot 3 năm, mới đăng ký làm mentor và chưa phỏng vấn."),
    ("backend-node", "Lại Thị Hoa", ["Node.js", "Express", "MongoDB"], 4, "full",
     "Backend Node.js và Express, hiện đã nhận đủ số mentee tối đa."),
    ("backend-python", "Tăng Minh Quân", ["Python", "FastAPI", "PostgreSQL"], 5, "pending",
     "Kỹ sư Python FastAPI, hồ sơ đang chờ admin duyệt."),
    ("frontend-react", "Mạc Thị Lan", ["React", "Next.js", "TypeScript"], 6, "full",
     "Frontend React Next.js, tạm hết chỗ nhận mentee."),
    ("devops", "Âu Quốc Hưng", ["Docker", "Kubernetes", "AWS"], 7, "unavailable",
     "DevOps Kubernetes AWS, đang tạm ngưng nhận mentee."),
    ("data-ml", "Thái Gia Hân", ["Machine Learning", "PyTorch", "NLP"], 4, "pending",
     "Data scientist NLP, PyTorch, chưa hoàn thành phỏng vấn."),
]

# (topic, phong cách, domain khai báo, kỹ năng, mục tiêu)
_MENTEES = [
    ("backend-java", "vi", ["Java", "SQL"], "Muốn trở thành lập trình viên backend Java, chuẩn bị phỏng vấn trong 6 tháng tới và học thêm system design."),
    ("backend-java", "vi_nodiac", ["Java"], "em muon lam backend java, hoc spring boot de di lam sau 6 thang nua, can nguoi chi lo trinh"),
    ("backend-java", "mixed", ["Spring"], "Muốn master Spring Boot + JPA, đi interview junior Java dev."),
    ("backend-java", "vague", [], "Mình mới ra trường, muốn làm việc xây dựng hệ thống phía máy chủ cho ngân hàng bằng ngôn ngữ của Oracle."),
    ("backend-node", "vi", ["JavaScript"], "Tôi muốn học xây dựng API bằng Node.js và TypeScript rồi triển khai lên đám mây cho dự án startup của mình."),
    ("backend-node", "vi_nodiac", ["JavaScript", "Express"], "minh dang tu hoc node js voi express, muon biet cach viet api cho chuan va test nhu the nao"),
    ("backend-node", "mixed", ["TypeScript"], "Learn NestJS, GraphQL để làm backend cho app realtime."),
    ("backend-node", "vague", ["JavaScript"], "Mình là dev frontend muốn sang viết phần server bằng chính JavaScript."),
    ("backend-python", "vi", ["Python"], "Tôi muốn trở thành lập trình viên backend Python, làm quen FastAPI hoặc Django và tối ưu cơ sở dữ liệu."),
    ("backend-python", "vi_nodiac", ["Python"], "em hoc python roi, muon lam web api bang fastapi hoac django, can mentor review code"),
    ("backend-python", "mixed", ["Python"], "Cần mentor Django REST + Celery task queue cho dự án cá nhân."),
    ("backend-python", "vague", [], "Mình thích ngôn ngữ rắn, muốn dùng nó để làm dịch vụ web và xử lý tác vụ chạy nền."),
    ("frontend-react", "vi", ["HTML", "CSS", "JavaScript"], "Muốn nâng cao kỹ năng React và Next.js để ứng tuyển vị trí lập trình viên giao diện web."),
    ("frontend-react", "vi_nodiac", ["HTML", "CSS"], "em muon hoc react de lam frontend, can nguoi chi cach quan ly state va viet component"),
    ("frontend-react", "mixed", ["JavaScript"], "Level up React hooks, performance, và testing cho frontend job."),
    ("frontend-react", "vague", ["CSS"], "Mình thích làm trang web đẹp, mượt, chạy tốt trên điện thoại và muốn làm nghề này."),
    ("mobile", "vi", ["Java"], "Tôi muốn phát triển ứng dụng di động và đưa ứng dụng đầu tiên lên App Store và Google Play."),
    ("mobile", "vi_nodiac", ["Dart"], "em muon hoc flutter de lam app dien thoai ca android va ios"),
    ("mobile", "mixed", ["Swift"], "Học iOS với SwiftUI, build app và publish lên store."),
    ("mobile", "vague", [], "Mình muốn làm ứng dụng chạy trên điện thoại của mọi người, không biết bắt đầu từ đâu."),
    ("devops", "vi", ["Linux"], "Muốn chuyển sang DevOps, học Kubernetes, CI/CD và hạ tầng đám mây AWS."),
    ("devops", "vi_nodiac", ["Linux", "Docker"], "em dang hoc docker va jenkins, muon lam devops, can nguoi huong dan lo trinh ci cd"),
    ("devops", "mixed", ["Docker"], "Learn Terraform + AWS, setup pipeline và monitoring cho hệ thống."),
    ("devops", "vague", [], "Mình muốn làm người giữ cho hệ thống luôn chạy ổn định, tự động hoá việc triển khai phần mềm."),
    ("data-ml", "vi", ["Python"], "Tôi muốn làm về học máy và xử lý ngôn ngữ tự nhiên, thực hiện đồ án tốt nghiệp về mô hình học sâu."),
    ("data-ml", "vi_nodiac", ["Python"], "em muon hoc machine learning va deep learning, lam do an nhan dien hinh anh"),
    ("data-ml", "mixed", ["Python"], "Muốn học PyTorch, NLP, train model và deploy lên production."),
    ("data-ml", "vague", ["Python"], "Mình muốn dạy máy tính tự học từ dữ liệu để dự đoán và gợi ý sản phẩm."),
    ("data-analyst", "vi", ["Excel", "SQL"], "Muốn làm phân tích dữ liệu kinh doanh, học Power BI và xây dựng báo cáo trực quan cho doanh nghiệp."),
    ("data-analyst", "vi_nodiac", ["Excel"], "em muon lam data analyst, hoc sql va power bi de ve dashboard bao cao"),
    ("data-analyst", "mixed", ["SQL"], "Learn dbt + data warehouse, làm analytics cho team product."),
    ("data-analyst", "vague", ["Excel"], "Mình giỏi con số, muốn đọc dữ liệu để giúp công ty đưa ra quyết định."),
    ("qa", "vi", ["Manual Testing"], "Muốn chuyển sang kiểm thử tự động, học Selenium và viết khung test cho dự án."),
    ("qa", "vi_nodiac", [], "em muon vao nghe tester, hoc test api voi postman va cypress"),
    ("qa", "mixed", ["Java"], "Learn Playwright + CI, performance testing với JMeter."),
    ("qa", "vague", [], "Mình tỉ mỉ, thích tìm lỗi của phần mềm trước khi người dùng gặp phải."),
    ("security", "vi", ["Linux", "Network"], "Muốn theo nghề an toàn thông tin, học kiểm thử xâm nhập web theo OWASP và luyện CTF."),
    ("security", "vi_nodiac", ["Linux"], "em muon hoc pentest va ctf, de lam nghe bao mat thong tin"),
    ("security", "mixed", ["Network"], "Vào SOC blue team, học SIEM và incident response."),
    ("security", "vague", [], "Mình muốn bảo vệ hệ thống khỏi tin tặc và tìm ra lỗ hổng trước khi bị khai thác."),
]


def _related(a: str, b: str) -> bool:
    return any(a in g and b in g for g in RELATED)


def relevance(mentee_topic: str, mentor_topic: str, eligible: bool) -> int:
    if not eligible:
        return 0
    if mentee_topic == mentor_topic:
        return 3
    return 2 if _related(mentee_topic, mentor_topic) else 0


def build() -> dict:
    """Trả về {mentors, mentees}. rating/kinh nghiệm sinh ngẫu nhiên có seed, KHÔNG tương quan với nhãn."""
    rng = random.Random(2026)
    mentors = []
    for i, (topic, name, skills, years, bio) in enumerate(_MENTORS):
        rated = rng.random() < 0.8
        mentors.append({
            "mentor_id": f"m{i:02d}", "display_name": name, "topic": topic, "domain": DOMAIN[topic],
            "skills": skills, "years_experience": years, "bio": bio,
            "rating": round(rng.uniform(3.0, 5.0), 1) if rated else 0.0, "rating_count": rng.randint(1, 30) if rated else 0,
            "capacity": 3, "active_mentee_count": rng.randint(0, 2), "is_available": True, "has_schedule": True,
            "verification_status": "APPROVED", "eligible": True,
        })
    for j, (topic, name, skills, years, why, bio) in enumerate(_INELIGIBLE):
        m = {
            "mentor_id": f"x{j:02d}", "display_name": name, "topic": topic, "domain": DOMAIN[topic],
            "skills": skills, "years_experience": years, "bio": bio, "rating": 4.8, "rating_count": 20,
            "capacity": 3, "active_mentee_count": 0, "is_available": True, "has_schedule": True,
            "verification_status": "APPROVED", "eligible": False,
        }
        if why == "pending":
            m["verification_status"] = "PENDING_REVIEW"
        elif why == "full":
            m["active_mentee_count"] = 3
        else:
            m["is_available"] = False
        mentors.append(m)
    mentees = [
        {"mentee_id": f"e{k:02d}", "topic": topic, "domain": DOMAIN[topic], "style": style, "skills": skills,
         "goal": goal, "level": "beginner"}
        for k, (topic, style, skills, goal) in enumerate(_MENTEES)
    ]
    for e in mentees:
        e["relevance"] = {m["mentor_id"]: relevance(e["topic"], m["topic"], m["eligible"]) for m in mentors}
    return {"mentors": mentors, "mentees": mentees}


def mentor_text(m: dict) -> str:
    """Cùng định dạng ProfileTextNormalizer.normalizeMentor của profile-service."""
    return f"Domain: {m['domain']}. Skills: {', '.join(m['skills'])}. Experience: {m['years_experience']} years. About: {m['bio']}"


def mentee_text(e: dict) -> str:
    """Cùng định dạng ProfileTextNormalizer.normalizeMentee."""
    return f"Domain: {e['domain']}. Skills: {', '.join(e['skills'])}. Level: {e['level']}. Goal: {e['goal']}"
