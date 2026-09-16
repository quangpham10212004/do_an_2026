"""
Từ điển kỹ năng/công nghệ: tên chuẩn → các biến thể thường gặp trong CV.
Khớp theo ranh giới từ (chỉ tính ký tự ASCII chữ/số là "từ") để tránh nhận nhầm, ví dụ "Go" trong "Google".
"""
import re

_WORD = "A-Za-z0-9_"

SKILL_VARIANTS: list[tuple[str, list[str]]] = [
    ("Java", ['java(?!\\s*script)']),
    ("Spring Boot", ['spring\\s*boot', 'spring framework', 'spring mvc']),
    ("Kotlin", ['kotlin']),
    ("Python", ['python']),
    ("JavaScript", ['javascript', 'js(?![A-Za-z0-9_-])', 'es6']),
    ("TypeScript", ['typescript', 'ts(?![A-Za-z0-9_-])']),
    ("Node.js", ['node\\.?js', 'nodejs']),
    ("Express", ['express\\.?js', 'expressjs']),
    ("NestJS", ['nest\\.?js']),
    ("React", ['react(?!\\s*native)', 'reactjs', 'react\\.js']),
    ("Next.js", ['next\\.?js']),
    ("Vue.js", ['vue\\.?js', 'vuejs', 'vue']),
    ("Angular", ['angular']),
    ("HTML", ['html5?']),
    ("CSS", ['css3?', 'sass', 'scss']),
    ("Tailwind CSS", ['tailwind']),
    ("C#", ['c#', 'c sharp']),
    (".NET", ['\\.net', 'asp\\.net', 'dotnet']),
    ("C++", ['c\\+\\+']),
    ("Go", ['golang', 'go(?=\\s*(lang|developer|backend))']),
    ("Rust", ['rust']),
    ("PHP", ['php']),
    ("Laravel", ['laravel']),
    ("Ruby", ['ruby', 'rails']),
    ("Django", ['django']),
    ("FastAPI", ['fastapi']),
    ("Flask", ['flask']),
    ("SQL", ['sql(?!\\s*server)']),
    ("PostgreSQL", ['postgres(ql)?']),
    ("MySQL", ['mysql']),
    ("SQL Server", ['sql\\s*server', 'mssql']),
    ("MongoDB", ['mongo(db)?']),
    ("Redis", ['redis']),
    ("Elasticsearch", ['elastic\\s*search', 'elk']),
    ("Kafka", ['kafka']),
    ("RabbitMQ", ['rabbit\\s*mq']),
    ("GraphQL", ['graphql']),
    ("REST API", ['rest(ful)?\\s*api', 'restful']),
    ("gRPC", ['grpc']),
    ("Microservices", ['micro-?services?']),
    ("System Design", ['system design', 'thiết kế hệ thống']),
    ("Docker", ['docker']),
    ("Kubernetes", ['kubernetes', 'k8s']),
    ("Helm", ['helm']),
    ("Terraform", ['terraform']),
    ("Ansible", ['ansible']),
    ("AWS", ['aws', 'amazon web services']),
    ("Google Cloud", ['gcp', 'google cloud']),
    ("Azure", ['azure']),
    ("Linux", ['linux', 'ubuntu', 'centos']),
    ("Git", ['git(?!hub|lab)']),
    ("GitHub Actions", ['github actions']),
    ("Jenkins", ['jenkins']),
    ("GitLab CI", ['gitlab\\s*ci']),
    ("CI/CD", ['ci\\s*/\\s*cd']),
    ("Prometheus", ['prometheus']),
    ("Grafana", ['grafana']),
    ("Nginx", ['nginx']),
    ("JUnit", ['junit']),
    ("Jest", ['jest']),
    ("Cypress", ['cypress']),
    ("Playwright", ['playwright']),
    ("Selenium", ['selenium']),
    ("Hibernate", ['hibernate', 'jpa']),
    ("Android", ['android']),
    ("iOS", ['ios']),
    ("Swift", ['swift']),
    ("Flutter", ['flutter']),
    ("Dart", ['dart']),
    ("React Native", ['react\\s*native']),
    ("Machine Learning", ['machine learning', 'học máy', 'ml(?![A-Za-z0-9_-])']),
    ("Deep Learning", ['deep learning', 'học sâu']),
    ("NLP", ['nlp', 'natural language processing', 'xử lý ngôn ngữ tự nhiên']),
    ("Computer Vision", ['computer vision', 'thị giác máy tính']),
    ("PyTorch", ['pytorch']),
    ("TensorFlow", ['tensorflow', 'keras']),
    ("scikit-learn", ['scikit-?learn', 'sklearn']),
    ("Pandas", ['pandas']),
    ("NumPy", ['numpy']),
    ("Spark", ['spark', 'pyspark']),
    ("Airflow", ['airflow']),
    ("Power BI", ['power\\s*bi']),
    ("Figma", ['figma']),
    ("Agile/Scrum", ['agile', 'scrum', 'kanban']),
    ("OOP", ['oop', 'object[- ]oriented', 'hướng đối tượng']),
    ("Data Structures & Algorithms", ['data structures?', 'algorithms?', 'cấu trúc dữ liệu', 'giải thuật', 'thuật toán']),
]


_PATTERNS: list[tuple[str, re.Pattern]] = [
    (name, re.compile(r"(?<![" + _WORD + r".#+])(" + "|".join(variants) + r")(?![" + _WORD + r"#+])", re.IGNORECASE))
    for name, variants in SKILL_VARIANTS
]


def find_skills(text: str | None) -> list[str]:
    """Kỹ năng chuẩn hoá xuất hiện trong văn bản, sắp theo số lần xuất hiện (kỹ năng nhắc nhiều thường là
    kỹ năng chính), hoà thì theo vị trí xuất hiện đầu tiên."""
    if not text or not text.strip():
        return []
    hits = []
    for name, pattern in _PATTERNS:
        matches = list(pattern.finditer(text))
        if matches:
            hits.append((name, len(matches), matches[0].start()))
    hits.sort(key=lambda h: (-h[1], h[2]))
    return [h[0] for h in hits]
