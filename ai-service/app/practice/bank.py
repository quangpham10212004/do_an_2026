"""
FR-10.x — ngân hàng câu hỏi luyện phỏng vấn của mentee, theo dạng phỏng vấn × cấp độ (cùng danh mục với phỏng vấn thử
với mentor US-58: BACKEND | FRONTEND | SYSTEM_DESIGN | BEHAVIORAL × INTERN | FRESHER | JUNIOR).

Khác ngân hàng câu hỏi xác thực mentor (interview/question_bank.py): câu hỏi của nhà tuyển dụng cho vị trí mentee nhắm
tới, không có chủ đề "năng lực mentoring". BEHAVIORAL theo khung STAR (Situation – Task – Action – Result).
Mỗi chủ đề có câu hỏi chính, câu đào sâu gợi ý, "khái niệm kỳ vọng" (engine rule-based chấm độ bao phủ) và các cấp độ áp dụng.
"""
from dataclasses import dataclass

TYPES = ("BACKEND", "FRONTEND", "SYSTEM_DESIGN", "BEHAVIORAL")
LEVELS = ("INTERN", "FRESHER", "JUNIOR")
ALL = LEVELS
EARLY = ("INTERN", "FRESHER")
LATER = ("FRESHER", "JUNIOR")


@dataclass(frozen=True)
class PracticeTopic:
    name: str
    question: str
    follow_up: str
    expected_concepts: tuple[str, ...]
    levels: tuple[str, ...] = ALL


BY_TYPE: dict[str, list[PracticeTopic]] = {
    "BACKEND": [
        PracticeTopic(
            "HTTP & REST cơ bản",
            "Khi trình duyệt gọi một API, chuyện gì xảy ra từ lúc gửi request tới lúc nhận response? Các phương thức GET, POST, PUT, DELETE khác nhau thế nào?",
            "Mã trạng thái 400, 401, 403, 404 và 500 khác nhau ra sao? Cho ví dụ khi nào bạn trả từng mã.",
            ("request", "response", "header", "body", "get", "post", "put", "delete", "status code", "json", "idempotent", "stateless"),
            EARLY),
        PracticeTopic(
            "SQL & cơ sở dữ liệu",
            "Bạn thiết kế bảng cho một ứng dụng đặt lịch học như thế nào? Khoá chính, khoá ngoại và quan hệ giữa các bảng ra sao?",
            "Index là gì, khi nào nên tạo index và nó có nhược điểm gì?",
            ("primary key", "khoá chính", "foreign key", "khoá ngoại", "join", "index", "quan hệ", "normalization", "chuẩn hoá", "transaction"),
            ALL),
        PracticeTopic(
            "Lập trình hướng đối tượng",
            "Hãy giải thích 4 tính chất của lập trình hướng đối tượng và cho ví dụ bạn đã áp dụng trong một bài tập hoặc dự án.",
            "Khi nào bạn dùng interface, khi nào dùng kế thừa? Kế thừa quá sâu gây ra vấn đề gì?",
            ("đóng gói", "encapsulation", "kế thừa", "inheritance", "đa hình", "polymorphism", "trừu tượng", "abstraction", "interface", "class"),
            EARLY),
        PracticeTopic(
            "Thiết kế REST API",
            "Hãy thiết kế REST API cho chức năng quản lý đơn hàng: đặt tên endpoint, mã trạng thái, phân trang và xử lý lỗi.",
            "Nếu client gửi trùng một request tạo đơn hàng do mạng chập chờn, bạn xử lý thế nào để không tạo hai đơn?",
            ("resource", "endpoint", "status code", "201", "404", "pagination", "phân trang", "validation", "idempotent", "version", "error"),
            LATER),
        PracticeTopic(
            "Transaction & đồng thời",
            "Transaction là gì? Hãy giải thích ACID và một tình huống hai người cùng đặt một chỗ trống cuối cùng.",
            "Bạn chọn khoá lạc quan hay khoá bi quan cho tình huống đó, vì sao?",
            ("transaction", "acid", "atomic", "isolation", "lock", "khoá", "race condition", "optimistic", "pessimistic", "rollback", "commit"),
            LATER),
        PracticeTopic(
            "Cache & hiệu năng",
            "Một API đọc dữ liệu bị chậm khi nhiều người dùng truy cập. Bạn tìm nguyên nhân và cải thiện như thế nào?",
            "Nếu dùng cache, bạn giữ dữ liệu cache đúng với cơ sở dữ liệu ra sao?",
            ("profiling", "log", "query", "index", "n+1", "cache", "redis", "ttl", "invalidation", "latency", "benchmark"),
            ("JUNIOR",)),
        PracticeTopic(
            "Kiểm thử",
            "Bạn viết test cho một service backend như thế nào? Unit test và integration test khác nhau ra sao?",
            "Kể một bug mà test đã giúp bạn phát hiện, hoặc một bug lẽ ra test phải bắt được.",
            ("unit test", "integration", "mock", "assert", "coverage", "junit", "pytest", "ci", "regression", "edge case"),
            ALL),
    ],
    "FRONTEND": [
        PracticeTopic(
            "HTML, CSS & responsive",
            "Bạn làm một trang responsive hiển thị tốt trên điện thoại và máy tính như thế nào? Flexbox và Grid khác nhau ra sao?",
            "Bạn đảm bảo trang dùng được với người dùng bàn phím hoặc trình đọc màn hình bằng cách nào?",
            ("media query", "flexbox", "grid", "viewport", "breakpoint", "mobile first", "semantic", "accessibility", "aria", "rem"),
            EARLY),
        PracticeTopic(
            "JavaScript cơ bản",
            "Hãy giải thích sự khác nhau giữa var, let, const và cách JavaScript xử lý bất đồng bộ với Promise và async/await.",
            "Event loop hoạt động thế nào? Vì sao một vòng lặp nặng làm giao diện bị đơ?",
            ("let", "const", "scope", "hoisting", "promise", "async", "await", "callback", "event loop", "closure"),
            ALL),
        PracticeTopic(
            "React & state",
            "Trong React, khi nào bạn dùng state, props và context? Hãy mô tả cách bạn chia component cho một trang danh sách có bộ lọc.",
            "Component bị re-render quá nhiều thì bạn phát hiện và xử lý thế nào?",
            ("state", "props", "context", "component", "hooks", "useeffect", "usememo", "usecallback", "re-render", "key", "lifting state"),
            ALL),
        PracticeTopic(
            "Gọi API & xử lý lỗi",
            "Bạn gọi API từ giao diện thế nào để xử lý trạng thái đang tải, lỗi và dữ liệu rỗng?",
            "Người dùng bấm tìm kiếm liên tục, bạn tránh gọi API thừa và kết quả cũ ghi đè kết quả mới ra sao?",
            ("loading", "error", "empty", "fetch", "axios", "try", "catch", "debounce", "abortcontroller", "cancel", "retry"),
            ALL),
        PracticeTopic(
            "Hiệu năng web",
            "Trang web của bạn tải chậm. Bạn đo bằng công cụ gì và cải thiện những chỉ số nào?",
            "SSR, SSG và CSR khác nhau thế nào, bạn chọn cách nào cho trang cần SEO?",
            ("lighthouse", "lcp", "cls", "inp", "core web vitals", "lazy load", "code splitting", "bundle", "image", "cache", "ssr", "ssg"),
            ("JUNIOR",)),
    ],
    "SYSTEM_DESIGN": [
        PracticeTopic(
            "Rút gọn link",
            "Hãy thiết kế một dịch vụ rút gọn link như bit.ly: các thành phần chính, cách sinh mã ngắn và lưu trữ.",
            "Nếu lượng truy cập tăng gấp 100 lần, phần nào sẽ quá tải trước và bạn xử lý thế nào?",
            ("api", "database", "hash", "base62", "unique", "cache", "redirect", "load balancer", "scale", "read heavy", "index"),
            ALL),
        PracticeTopic(
            "Ứng dụng chat",
            "Hãy thiết kế tính năng nhắn tin một-một cho một ứng dụng: tin nhắn đi từ người gửi tới người nhận như thế nào?",
            "Người nhận đang offline thì sao? Bạn đảm bảo tin nhắn không bị mất hoặc trùng thế nào?",
            ("websocket", "server", "database", "queue", "message", "offline", "push notification", "ack", "retry", "ordering", "scale"),
            ALL),
        PracticeTopic(
            "Đặt lịch & thanh toán",
            "Thiết kế hệ thống đặt lịch học có thanh toán: làm sao để một khung giờ không bị hai người đặt cùng lúc?",
            "Thanh toán thành công nhưng lưu lịch thất bại thì bạn xử lý thế nào?",
            ("transaction", "lock", "unique", "idempotent", "payment", "webhook", "retry", "saga", "outbox", "consistency", "timeout"),
            ALL),
        PracticeTopic(
            "Bảng tin (news feed)",
            "Thiết kế bảng tin hiển thị bài viết của người mình theo dõi, sắp theo thời gian mới nhất.",
            "Fan-out khi ghi và fan-out khi đọc khác nhau thế nào, bạn chọn cách nào cho người có hàng triệu người theo dõi?",
            ("fan-out", "cache", "timeline", "pagination", "database", "queue", "push", "pull", "celebrity", "sharding", "trade-off"),
            ("JUNIOR",)),
        PracticeTopic(
            "Giới hạn tần suất",
            "Thiết kế bộ giới hạn tần suất gọi API (rate limiter), ví dụ 100 request mỗi phút cho mỗi người dùng.",
            "Khi chạy nhiều server, bạn đếm số request chung thế nào?",
            ("rate limit", "token bucket", "sliding window", "fixed window", "redis", "counter", "429", "distributed", "ttl", "middleware"),
            EARLY),
    ],
    "BEHAVIORAL": [
        PracticeTopic(
            "Giới thiệu bản thân",
            "Hãy giới thiệu ngắn về bản thân và vì sao bạn phù hợp với vị trí này.",
            "Điều gì ở công việc này khiến bạn hứng thú nhất?",
            ("kinh nghiệm", "dự án", "kỹ năng", "mục tiêu", "phù hợp", "học", "đóng góp", "đam mê"),
            ALL),
        PracticeTopic(
            "Làm việc nhóm & bất đồng",
            "Kể về một lần bạn bất đồng ý kiến với thành viên trong nhóm. Tình huống là gì, bạn đã làm gì và kết quả ra sao?",
            "Nếu được làm lại, bạn sẽ làm khác điều gì?",
            ("tình huống", "nhóm", "lắng nghe", "trao đổi", "thống nhất", "giải pháp", "kết quả", "bài học", "team", "thoả hiệp"),
            ALL),
        PracticeTopic(
            "Áp lực & thời hạn",
            "Kể về một lần bạn phải hoàn thành công việc trong thời hạn rất gấp. Bạn sắp xếp ưu tiên thế nào và kết quả ra sao?",
            "Khi biết chắc không kịp hạn, bạn báo cho người liên quan như thế nào?",
            ("deadline", "thời hạn", "ưu tiên", "kế hoạch", "chia nhỏ", "báo cáo", "trao đổi", "kết quả", "bài học", "quản lý thời gian"),
            ALL),
        PracticeTopic(
            "Thất bại & học hỏi",
            "Kể về một lỗi hoặc thất bại của bạn trong học tập hoặc công việc. Bạn đã xử lý và rút ra điều gì?",
            "Bạn đã thay đổi cách làm việc thế nào để lỗi đó không lặp lại?",
            ("lỗi", "sai", "thất bại", "nhận trách nhiệm", "khắc phục", "bài học", "cải thiện", "quy trình", "kết quả"),
            ALL),
        PracticeTopic(
            "Tự học công nghệ mới",
            "Kể về lần bạn phải tự học nhanh một công nghệ mới để làm một việc cụ thể. Bạn học thế nào và áp dụng ra sao?",
            "Làm sao bạn biết mình đã hiểu đủ để dùng nó trong dự án thật?",
            ("tài liệu", "documentation", "khoá học", "thực hành", "dự án", "hỏi", "mentor", "kết quả", "thời gian", "áp dụng"),
            LATER),
    ],
}

# BEHAVIORAL: dấu hiệu từng phần của STAR (so khớp không dấu ở rule_based).
STAR_LABELS = {"S": "Tình huống", "T": "Nhiệm vụ", "A": "Hành động", "R": "Kết quả"}


def topics_for(interview_type: str, level: str, count: int) -> list[PracticeTopic]:
    """Các chủ đề đầu tiên áp dụng cho cấp độ (thứ tự cố định => kết nối lại vẫn ra đúng kế hoạch)."""
    return [t for t in BY_TYPE[interview_type] if level in t.levels][:count]


def find(interview_type: str, name: str) -> PracticeTopic | None:
    return next((t for t in BY_TYPE.get(interview_type, []) if t.name == name), None)
