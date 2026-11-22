"""
Nội dung Learning Hub: khoá học (bài học Markdown) và roadmap.

seed_content.py nạp qua API admin, khớp theo tiêu đề nên chạy lại nhiều lần không tạo trùng.
Khoá học 1-5 trùng tiêu đề với dữ liệu mẫu trong migration V1 nên được CẬP NHẬT (thêm ảnh bìa, bài học thật).
"""

# (tiêu đề bài, loại, url tham khảo hoặc None, phút, nội dung Markdown)
COURSES = [
    {
        "title": "Java Spring Boot căn bản",
        "cover": "/seed/courses/java-spring-boot.svg",
        "domain": "backend", "level": "BEGINNER",
        "instructor": "Nguyễn Hoàng Long",
        "description": "Xây dựng REST API với Spring Boot, JPA và PostgreSQL: từ tạo project tới API CRUD có validate và kiểm thử.",
        "skills": ["Java", "Spring Boot", "REST API", "PostgreSQL"],
        "outcomes": [
            "Tạo và cấu hình một project Spring Boot",
            "Thiết kế REST controller có validate đầu vào",
            "Lưu dữ liệu với Spring Data JPA và PostgreSQL",
            "Tách tầng controller, service, repository đúng trách nhiệm",
        ],
        "lessons": [
            ("Giới thiệu Spring Boot", "ARTICLE", "https://spring.io/guides/gs/spring-boot", 12,
             """## Spring Boot giải quyết vấn đề gì?

Spring Framework rất mạnh nhưng cấu hình dài dòng. **Spring Boot** thêm hai thứ để bạn chạy được ngay:

- **Starter**: một dependency kéo theo cả bộ thư viện hay đi cùng nhau (`spring-boot-starter-web` có Tomcat, Jackson, Spring MVC).
- **Auto-configuration**: thấy thư viện nào trên classpath thì tự cấu hình bean tương ứng.

### Project đầu tiên

```java
@SpringBootApplication
public class DemoApplication {
    public static void main(String[] args) {
        SpringApplication.run(DemoApplication.class, args);
    }
}
```

`@SpringBootApplication` gộp ba annotation: `@Configuration`, `@EnableAutoConfiguration`, `@ComponentScan`.

> Mẹo: tạo project bằng start.spring.io, chọn Web, Validation, Data JPA, PostgreSQL Driver.

**Việc cần làm:** chạy ứng dụng, mở `http://localhost:8080` và đọc log khởi động để thấy những bean nào được tự cấu hình."""),
            ("Xây dựng REST controller", "VIDEO", "https://spring.io/guides/gs/rest-service", 18,
             """## REST controller

Một controller nhận request HTTP, gọi service rồi trả JSON.

```java
@RestController
@RequestMapping("/api/books")
class BookController {
    private final BookService service;
    BookController(BookService service) { this.service = service; }

    @GetMapping("/{id}")
    BookDto get(@PathVariable Long id) { return service.get(id); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    BookDto create(@Valid @RequestBody CreateBook body) { return service.create(body); }
}
```

### Validate đầu vào

```java
record CreateBook(@NotBlank @Size(max = 200) String title,
                  @Min(1) int pages) {}
```

Request sai sẽ trả `400` mà bạn không cần viết `if`. Gom lỗi về một định dạng chung bằng `@RestControllerAdvice`.

**Quy tắc nhớ:** controller chỉ làm việc với HTTP (đọc request, chọn status code); logic nghiệp vụ nằm ở service."""),
            ("Spring Data JPA với PostgreSQL", "DOCUMENT", "https://spring.io/guides/gs/accessing-data-jpa", 20,
             """## Lưu dữ liệu với JPA

Khai báo entity và repository, Spring sinh phần còn lại.

```java
@Entity
class Book {
    @Id @GeneratedValue(strategy = GenerationType.UUID) UUID id;
    @Column(nullable = false) String title;
    int pages;
}

interface BookRepository extends JpaRepository<Book, UUID> {
    List<Book> findByTitleContainingIgnoreCase(String keyword);
}
```

Tên method được dịch thành câu SQL: `findByTitleContainingIgnoreCase` → `WHERE lower(title) LIKE lower('%?%')`.

### Cấu hình kết nối

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/library
    username: postgres
    password: postgres
  jpa:
    hibernate.ddl-auto: validate
```

Dùng `validate` (không dùng `update`) ở môi trường thật và quản lý schema bằng Flyway để thay đổi được kiểm soát qua migration."""),
            ("Tách tầng service và xử lý lỗi", "ARTICLE", None, 15,
             """## Controller → Service → Repository

| Tầng | Trách nhiệm | Không nên |
|---|---|---|
| Controller | HTTP, validate, status code | Truy cập DB trực tiếp |
| Service | Quy tắc nghiệp vụ, transaction | Biết về `HttpServletRequest` |
| Repository | Đọc/ghi dữ liệu | Chứa logic nghiệp vụ |

### Ném lỗi có nghĩa

```java
class NotFoundException extends RuntimeException {
    NotFoundException(String msg) { super(msg); }
}

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(NotFoundException.class)
    ResponseEntity<Map<String, String>> notFound(NotFoundException e) {
        return ResponseEntity.status(404).body(Map.of("message", e.getMessage()));
    }
}
```

Service ném `NotFoundException`, handler chung đổi thành `404`. Controller không cần `try/catch`.

**Transaction:** đặt `@Transactional` ở method service ghi nhiều bảng để hoặc cùng thành công, hoặc cùng quay lui."""),
            ("Bài tập: API quản lý sách", "EXERCISE", None, 45,
             """## Yêu cầu

Xây dựng API quản lý sách với các endpoint:

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/books?keyword=` | Tìm theo tiêu đề |
| GET | `/api/books/{id}` | Xem chi tiết, `404` nếu không có |
| POST | `/api/books` | Tạo mới, validate tiêu đề và số trang |
| PUT | `/api/books/{id}` | Cập nhật |
| DELETE | `/api/books/{id}` | Xoá, trả `204` |

## Tiêu chí hoàn thành

- [ ] Có đủ ba tầng controller, service, repository
- [ ] Dữ liệu lưu PostgreSQL, schema tạo bằng Flyway
- [ ] Request sai trả `400` kèm thông báo rõ ràng
- [ ] Có ít nhất 3 test cho service (dùng Mockito)

Đẩy code lên GitHub và gửi link cho mentor để được review."""),
        ],
    },
    {
        "title": "System Design cho phỏng vấn",
        "cover": "/seed/courses/system-design.svg",
        "domain": "backend", "level": "ADVANCED",
        "instructor": "Nguyễn Hoàng Long",
        "description": "Các khối cơ bản của hệ thống phân tán (load balancer, cache, queue, sharding) và quy trình trả lời một câu hỏi thiết kế trong 45 phút.",
        "skills": ["System Design", "Redis", "Kafka", "Microservices"],
        "outcomes": [
            "Áp dụng quy trình 4 bước để mở đầu câu hỏi thiết kế",
            "Chọn đúng cache, queue và chiến lược chia dữ liệu",
            "Ước lượng tải (QPS, dung lượng) bằng phép tính nhanh",
            "Nêu và bảo vệ được các đánh đổi trong thiết kế",
        ],
        "lessons": [
            ("Quy trình trả lời câu hỏi thiết kế", "ARTICLE", "https://github.com/donnemartin/system-design-primer", 15,
             """## Đừng vẽ sơ đồ ngay

Nhà tuyển dụng đánh giá cách bạn suy nghĩ, không phải bản vẽ đẹp. Dùng 4 bước:

1. **Làm rõ yêu cầu (5 phút)**: chức năng chính, người dùng, quy mô, độ trễ chấp nhận được. Hỏi: "Đọc nhiều hay ghi nhiều?"
2. **Ước lượng (5 phút)**: ví dụ 10 triệu người dùng/ngày, mỗi người 5 lượt đọc → ~580 QPS trung bình, đỉnh gấp 3-5 lần.
3. **Thiết kế tổng thể (15 phút)**: client → load balancer → service → cache → database. Nói rõ luồng dữ liệu.
4. **Đào sâu và đánh đổi (15 phút)**: nút thắt cổ chai, lỗi một điểm, nhất quán dữ liệu.

> Câu cần nói nhiều nhất: "Tôi chọn X vì Y, đổi lại Z."

**Bài tập nhỏ:** thiết kế dịch vụ rút gọn URL. Viết ra yêu cầu chức năng và ước lượng QPS trước khi vẽ gì cả."""),
            ("Scalability cơ bản", "ARTICLE", "https://github.com/donnemartin/system-design-primer", 18,
             """## Scale dọc và scale ngang

- **Vertical**: máy mạnh hơn. Đơn giản nhưng có trần và là điểm lỗi duy nhất.
- **Horizontal**: thêm nhiều máy. Cần service **stateless** để request nào cũng đi tới máy nào cũng được.

### Load balancer

Chia request cho các máy phía sau. Thuật toán thường gặp: round-robin, least connections, consistent hashing (khi cần giữ cache theo khoá).

### Stateless nghĩa là gì?

Không giữ session trong bộ nhớ của một instance. Đẩy trạng thái ra ngoài:

- Session → Redis
- File upload → object storage (S3)
- Thông báo nền → message queue

### Replication

Một node ghi (primary), nhiều node đọc (replica). Đọc scale tốt, nhưng replica có thể **trễ** so với primary, bạn cần biết dữ liệu nào chấp nhận đọc cũ."""),
            ("Caching với Redis", "ARTICLE", "https://redis.io/docs/latest/", 20,
             """## Cache-aside

Mẫu phổ biến nhất: ứng dụng tự quản lý cache.

```python
def get_user(user_id):
    cached = redis.get(f"user:{user_id}")
    if cached:
        return json.loads(cached)
    user = db.query_user(user_id)
    redis.setex(f"user:{user_id}", 300, json.dumps(user))  # TTL 5 phút
    return user
```

Khi cập nhật: **xoá** khoá cache (đừng ghi đè) để lần đọc sau nạp dữ liệu mới.

### Ba sự cố kinh điển

| Sự cố | Nguyên nhân | Cách giảm |
|---|---|---|
| Cache stampede | Khoá nóng hết hạn, hàng nghìn request cùng đập DB | Khoá mutex khi nạp lại, TTL ngẫu nhiên |
| Cache penetration | Truy vấn khoá không tồn tại | Cache cả kết quả rỗng, Bloom filter |
| Dữ liệu cũ | Cập nhật DB nhưng cache chưa xoá | TTL ngắn, xoá cache sau khi commit |

**Eviction:** khi đầy bộ nhớ, `allkeys-lru` loại khoá lâu không dùng nhất."""),
            ("Message queue và kiến trúc hướng sự kiện", "VIDEO", "https://kafka.apache.org/documentation/", 22,
             """## Vì sao cần queue?

Tách người gửi khỏi người xử lý: request trả về ngay, việc nặng (gửi email, resize ảnh) làm nền. Queue cũng làm **bộ đệm** khi tải tăng đột biến.

### Kafka trong 1 phút

- **Topic** chia thành nhiều **partition**; thứ tự chỉ được đảm bảo *trong một partition*.
- **Consumer group**: mỗi partition chỉ do một consumer trong nhóm xử lý, thêm consumer để tăng thông lượng.
- Tin nhắn được giữ theo thời gian lưu trữ, nên có thể đọc lại.

### Giao hàng "ít nhất một lần"

Consumer có thể nhận trùng tin khi lỗi giữa chừng. Hãy làm xử lý **idempotent**: xử lý hai lần cho kết quả như một lần (ví dụ dùng `order_id` làm khoá chống trùng).

```text
Order Service --(OrderCreated)--> Kafka --> Email Service
                                        --> Inventory Service
```

Mỗi service nghe sự kiện và tự làm phần của mình, không gọi trực tiếp nhau."""),
            ("Sharding và nhất quán dữ liệu", "DOCUMENT", None, 20,
             """## Khi một database không đủ

Thứ tự nên thử: **index đúng → cache → replica đọc → sharding**. Sharding là biện pháp cuối vì làm phức tạp mọi truy vấn.

### Chọn shard key

Khoá tốt phân bố đều và để các truy vấn phổ biến chỉ trúng một shard.

- Hash theo `user_id`: đều, nhưng truy vấn theo khoảng thời gian phải hỏi mọi shard.
- Range theo ngày: dễ lưu trữ lạnh, nhưng shard mới nhận hết tải ghi (hot shard).

### Định lý CAP, hiểu đúng

Khi mạng bị chia cắt, bạn phải chọn giữa **nhất quán (C)** và **sẵn sàng (A)**. Không có lựa chọn đúng chung, hãy hỏi nghiệp vụ:

- Số dư tài khoản → ưu tiên nhất quán.
- Số lượt thích → chấp nhận nhất quán cuối cùng.

### Chốt lại khi phỏng vấn

Nêu rõ con số bạn dùng, chỉ ra điểm lỗi duy nhất, và nói bạn sẽ theo dõi chỉ số nào (độ trễ p99, tỉ lệ lỗi, độ trễ replica)."""),
        ],
    },
    {
        "title": "React & Next.js thực chiến",
        "cover": "/seed/courses/react-nextjs.svg",
        "domain": "frontend", "level": "INTERMEDIATE",
        "instructor": "Phạm Minh Anh",
        "description": "Component, hooks, routing và lấy dữ liệu với Next.js App Router, kèm các thói quen giúp giao diện nhanh và dễ bảo trì.",
        "skills": ["React", "Next.js", "JavaScript", "TypeScript"],
        "outcomes": [
            "Viết component và hook có kiểu TypeScript rõ ràng",
            "Phân biệt Server Component và Client Component",
            "Lấy dữ liệu, xử lý trạng thái tải và lỗi đúng cách",
            "Tránh các lỗi render lại không cần thiết",
        ],
        "lessons": [
            ("React hooks cốt lõi", "ARTICLE", "https://react.dev/reference/react", 20,
             """## useState và useEffect

```tsx
function Counter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    document.title = `Đã bấm ${count} lần`;
  }, [count]);

  return <button onClick={() => setCount((c) => c + 1)}>Bấm {count}</button>;
}
```

### Quy tắc dễ sai

- **Cập nhật theo giá trị trước:** dùng `setCount((c) => c + 1)` khi giá trị mới phụ thuộc giá trị cũ.
- **Mảng phụ thuộc:** liệt kê mọi biến dùng trong effect. Để trống `[]` chỉ chạy một lần khi mount.
- **Dọn dẹp:** effect đăng ký (timer, listener) phải trả về hàm huỷ.

```tsx
useEffect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}, []);
```

> Trước khi viết `useEffect`, tự hỏi: giá trị này có thể *tính* trực tiếp từ props/state khi render không? Nếu có, không cần effect."""),
            ("Custom hook và chia sẻ logic", "ARTICLE", "https://react.dev/learn/reusing-logic-with-custom-hooks", 18,
             """## Tách logic ra khỏi giao diện

Khi hai component cùng lặp một đoạn logic với state, gom vào hook bắt đầu bằng `use`.

```tsx
function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// dùng
const keyword = useDebounced(input);
useEffect(() => { search(keyword); }, [keyword]);
```

### Lợi ích

- Component gọn: chỉ còn việc hiển thị.
- Test logic độc lập.
- Mỗi lần gọi hook có state **riêng**, hai component dùng chung hook không chia sẻ state.

**Đừng** tạo hook khi chỉ có một chỗ dùng và logic ngắn: bạn chỉ thêm một tầng gián tiếp."""),
            ("Next.js App Router", "ARTICLE", "https://nextjs.org/docs/app", 22,
             """## Cấu trúc thư mục là routing

```text
app/
  layout.tsx          # khung chung
  page.tsx            # /
  courses/
    page.tsx          # /courses
    [id]/page.tsx     # /courses/123
    loading.tsx       # hiển thị khi đang tải
    error.tsx         # hiển thị khi lỗi
```

### Server Component và Client Component

Mặc định mọi component là **Server Component**: chạy trên server, không gửi JS của nó về trình duyệt, được `await` dữ liệu trực tiếp.

```tsx
// Server Component
export default async function Page({ params }: { params: { id: string } }) {
  const course = await getCourse(params.id);
  return <h1>{course.title}</h1>;
}
```

Thêm `"use client"` ở đầu file khi cần `useState`, `useEffect` hoặc sự kiện trình duyệt.

**Nguyên tắc:** đẩy `"use client"` xuống thấp nhất có thể (chỉ nút bấm, ô nhập) để phần còn lại giữ ở server."""),
            ("Lấy dữ liệu, trạng thái tải và lỗi", "VIDEO", None, 20,
             """## Ba trạng thái luôn phải có

Mọi màn hình lấy dữ liệu cần hiển thị: **đang tải**, **lỗi**, **rỗng**, rồi mới tới **có dữ liệu**.

```tsx
function Courses() {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ok"; items: Course[] }
  >({ status: "loading" });

  useEffect(() => {
    let active = true;
    fetchCourses()
      .then((items) => active && setState({ status: "ok", items }))
      .catch((e) => active && setState({ status: "error", message: e.message }));
    return () => { active = false; };
  }, []);

  if (state.status === "loading") return <Spinner />;
  if (state.status === "error") return <ErrorBox message={state.message} />;
  if (state.items.length === 0) return <Empty />;
  return <List items={state.items} />;
}
```

Cờ `active` chặn việc cập nhật state sau khi component đã unmount hoặc request cũ về sau request mới (race condition).

Với dự án lớn hơn, dùng TanStack Query hoặc SWR để có cache, thử lại và đồng bộ sẵn."""),
            ("Bài tập: Todo app", "EXERCISE", None, 60,
             """## Yêu cầu

Xây dựng ứng dụng todo bằng Next.js (App Router) và TypeScript.

### Chức năng

- Thêm, đánh dấu hoàn thành, xoá công việc
- Lọc: Tất cả / Đang làm / Đã xong
- Lưu vào `localStorage` để tải lại trang không mất dữ liệu
- Hiển thị trạng thái rỗng thân thiện

### Tiêu chí hoàn thành

- [ ] Không có cảnh báo `key` hoặc lỗi hydrate trong console
- [ ] Logic lưu trữ tách thành custom hook `useTodos`
- [ ] Điều hướng bằng bàn phím được (Tab, Enter)
- [ ] Có ít nhất 2 test cho hook (Vitest + Testing Library)

### Nâng cao (tuỳ chọn)

Thêm trang `/todos/[id]` xem chi tiết và đồng bộ với một API thật."""),
        ],
    },
    {
        "title": "Docker & CI/CD nhập môn",
        "cover": "/seed/courses/docker-cicd.svg",
        "domain": "devops", "level": "BEGINNER",
        "instructor": "Đỗ Thành Nam",
        "description": "Container hoá ứng dụng bằng Docker, chạy nhiều dịch vụ với Compose và dựng pipeline CI/CD bằng GitHub Actions.",
        "skills": ["Docker", "GitHub Actions", "Linux", "CI/CD"],
        "outcomes": [
            "Viết Dockerfile nhỏ gọn bằng multi-stage build",
            "Chạy cả hệ thống nhiều dịch vụ với Docker Compose",
            "Dựng pipeline build, test, đóng gói tự động",
            "Xử lý bí mật và biến môi trường an toàn",
        ],
        "lessons": [
            ("Dockerfile và image", "ARTICLE", "https://docs.docker.com/get-started/", 18,
             """## Image và container

**Image** là bản đóng gói bất biến (code + runtime + thư viện). **Container** là một tiến trình đang chạy từ image đó.

### Dockerfile cho ứng dụng Node

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### Mẹo tận dụng cache layer

Mỗi dòng tạo một layer, Docker chỉ build lại từ layer đầu tiên thay đổi. Vì vậy **copy file khai báo thư viện trước, code sau**: sửa code không làm cài lại thư viện.

```bash
docker build -t myapp:1.0 .
docker run --rm -p 3000:3000 myapp:1.0
```

Thêm `.dockerignore` (`node_modules`, `.git`, `.env`) để image nhỏ và không lộ bí mật."""),
            ("Multi-stage build", "ARTICLE", "https://docs.docker.com/build/building/multi-stage/", 15,
             """## Image production không cần compiler

Build cần JDK, Maven; chạy chỉ cần JRE. Multi-stage cho phép dùng nhiều `FROM` và chỉ giữ kết quả cuối.

```dockerfile
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -q dependency:go-offline
COPY src ./src
RUN mvn -q package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /src/target/app.jar app.jar
USER 1000
ENTRYPOINT ["java", "-jar", "app.jar"]
```

### Kết quả

| | Một giai đoạn | Multi-stage |
|---|---|---|
| Kích thước | ~700 MB | ~200 MB |
| Có Maven, mã nguồn | Có | Không |

Thêm `USER` không phải root để giảm thiệt hại nếu ứng dụng bị khai thác."""),
            ("Docker Compose", "ARTICLE", "https://docs.docker.com/compose/", 20,
             """## Chạy nhiều container cùng lúc

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes: [db-data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
  api:
    build: ./api
    ports: ["8080:8080"]
    environment:
      DB_HOST: db
    depends_on:
      db: { condition: service_healthy }
volumes:
  db-data:
```

### Điều cần nhớ

- Các service gọi nhau bằng **tên service** (`db`), không dùng `localhost`.
- **Volume** giữ dữ liệu khi container bị xoá.
- `depends_on` + `healthcheck` đảm bảo API chỉ khởi động khi database sẵn sàng.

```bash
docker compose up --build -d
docker compose logs -f api
docker compose down      # giữ volume; thêm -v để xoá cả dữ liệu
```"""),
            ("GitHub Actions: pipeline đầu tiên", "VIDEO", "https://docs.github.com/actions", 25,
             """## CI chạy mỗi lần đẩy code

Tạo `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
```

### Khái niệm

- **Workflow** gồm các **job**; mỗi job chạy trên một máy riêng, gồm các **step**.
- **matrix**: chạy cùng job với nhiều phiên bản (Node 18, 20).
- **cache**: lưu thư viện giữa các lần chạy để nhanh hơn.

### Bí mật

Không ghi mật khẩu vào file. Thêm vào *Settings → Secrets*, dùng bằng `${{ secrets.TEN_BI_MAT }}`.

Đặt nhánh `main` ở chế độ **bắt buộc CI xanh mới được merge**."""),
            ("Bài tập: Đóng gói và tự động hoá", "EXERCISE", None, 60,
             """## Yêu cầu

Lấy một ứng dụng web nhỏ (có thể là API bạn đã làm ở khoá Spring Boot) và:

1. Viết `Dockerfile` multi-stage, image cuối dưới 250 MB.
2. Viết `docker-compose.yml` chạy ứng dụng cùng PostgreSQL, có healthcheck.
3. Viết workflow GitHub Actions: build, chạy test, build image khi push lên `main`.

## Tiêu chí hoàn thành

- [ ] `docker compose up` chạy được từ máy sạch chỉ với file `.env.example`
- [ ] Không có mật khẩu nào nằm trong repo
- [ ] Pipeline xanh trên một pull request mẫu
- [ ] README ghi cách chạy trong 3 dòng lệnh

Chia sẻ repo cho mentor DevOps để được góp ý về độ an toàn của image."""),
        ],
    },
    {
        "title": "Machine Learning với Python",
        "cover": "/seed/courses/ml-python.svg",
        "domain": "data", "level": "INTERMEDIATE",
        "instructor": "Vũ Khánh Linh",
        "description": "Pandas, scikit-learn và quy trình huấn luyện mô hình đúng cách: chia dữ liệu, tránh rò rỉ, đánh giá và đọc kết quả.",
        "skills": ["Python", "Pandas", "scikit-learn", "Machine Learning"],
        "outcomes": [
            "Làm sạch và khám phá dữ liệu với Pandas",
            "Xây pipeline tiền xử lý và huấn luyện bằng scikit-learn",
            "Chọn thước đo đánh giá phù hợp bài toán",
            "Nhận ra và tránh rò rỉ dữ liệu (data leakage)",
        ],
        "lessons": [
            ("Pandas cơ bản", "ARTICLE", "https://pandas.pydata.org/docs/", 20,
             """## DataFrame là bảng trong bộ nhớ

```python
import pandas as pd

df = pd.read_csv("students.csv")
df.info()                      # kiểu dữ liệu, số giá trị thiếu
df.describe()                  # thống kê mô tả

df["gpa"].isna().sum()         # đếm giá trị thiếu
df = df.dropna(subset=["gpa"])
df["passed"] = df["gpa"] >= 5.0

df.groupby("major")["gpa"].agg(["mean", "count"]).sort_values("mean", ascending=False)
```

### Ba thói quen tốt

1. Luôn `df.info()` và `df.head()` đầu tiên: nhìn dữ liệu trước khi làm gì.
2. Dùng thao tác theo cột (vectorized) thay vì vòng `for` qua từng dòng, nhanh hơn hàng chục lần.
3. Không sửa dữ liệu gốc, tạo bản sao đã làm sạch để còn đối chiếu.

**Việc cần làm:** tải một bộ dữ liệu công khai (ví dụ Titanic) và trả lời 3 câu hỏi bằng `groupby`."""),
            ("Chia dữ liệu và tránh rò rỉ", "ARTICLE", "https://scikit-learn.org/stable/", 22,
             """## Mô hình phải được thử trên dữ liệu chưa từng thấy

```python
from sklearn.model_selection import train_test_split

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
```

- `random_state` để kết quả lặp lại được.
- `stratify=y` giữ tỉ lệ các lớp như nhau ở hai tập (quan trọng khi lớp lệch).

### Rò rỉ dữ liệu (data leakage)

Là khi thông tin của tập test lọt vào lúc huấn luyện, khiến điểm đẹp giả tạo. Lỗi hay gặp nhất:

```python
# SAI: chuẩn hoá trên toàn bộ dữ liệu rồi mới chia
X_scaled = StandardScaler().fit_transform(X)

# ĐÚNG: fit trên tập train, chỉ transform tập test
scaler = StandardScaler().fit(X_train)
X_train_s, X_test_s = scaler.transform(X_train), scaler.transform(X_test)
```

Cách an toàn nhất là đặt mọi bước tiền xử lý vào một `Pipeline` (bài kế tiếp)."""),
            ("Pipeline scikit-learn", "ARTICLE", "https://scikit-learn.org/stable/modules/compose.html", 22,
             """## Một đối tượng cho toàn bộ quy trình

```python
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestClassifier

num = Pipeline([("fill", SimpleImputer(strategy="median")), ("scale", StandardScaler())])
cat = OneHotEncoder(handle_unknown="ignore")

pre = ColumnTransformer([("num", num, ["age", "gpa"]), ("cat", cat, ["major"])])
model = Pipeline([("pre", pre), ("clf", RandomForestClassifier(n_estimators=200, random_state=42))])

model.fit(X_train, y_train)
print(model.score(X_test, y_test))
```

### Vì sao nên dùng Pipeline

- Tránh rò rỉ: mỗi bước chỉ `fit` trên dữ liệu train.
- Cross-validation và lưu mô hình (`joblib.dump(model, ...)`) chỉ cần làm với một đối tượng.
- Khi triển khai, dữ liệu mới đi qua đúng quy trình như lúc huấn luyện."""),
            ("Đánh giá mô hình", "ARTICLE", None, 20,
             """## Accuracy không phải lúc nào cũng đúng

Nếu 95% khách hàng không gian lận, mô hình luôn trả "không gian lận" đạt 95% accuracy nhưng vô dụng.

| Thước đo | Trả lời câu hỏi | Dùng khi |
|---|---|---|
| Precision | Trong số dự đoán dương, bao nhiêu đúng? | Báo động sai gây tốn kém |
| Recall | Trong số thật sự dương, bắt được bao nhiêu? | Bỏ sót gây hậu quả (bệnh, gian lận) |
| F1 | Trung bình điều hoà precision, recall | Cần cân bằng, lớp lệch |

```python
from sklearn.metrics import classification_report, confusion_matrix
pred = model.predict(X_test)
print(confusion_matrix(y_test, pred))
print(classification_report(y_test, pred))
```

### Cross-validation

Một lần chia có thể may rủi. Dùng `cross_val_score(model, X, y, cv=5)` để có trung bình và độ dao động.

Luôn so sánh với **baseline** đơn giản (đoán lớp phổ biến nhất) để biết mô hình thực sự cải thiện bao nhiêu."""),
            ("Bài tập: Dự đoán rời bỏ dịch vụ", "EXERCISE", None, 90,
             """## Yêu cầu

Dùng bộ dữ liệu *Telco Customer Churn* (công khai trên Kaggle) để dự đoán khách hàng có rời bỏ dịch vụ hay không.

### Các bước

1. Khám phá dữ liệu: giá trị thiếu, phân bố lớp, 3 biểu đồ có ý nghĩa.
2. Xây `Pipeline` tiền xử lý + một mô hình (Logistic Regression hoặc Random Forest).
3. Đánh giá bằng cross-validation 5 fold, báo cáo precision/recall/F1 của lớp "rời bỏ".
4. So với baseline và giải thích vì sao bạn chọn thước đo đó.

### Tiêu chí hoàn thành

- [ ] Notebook chạy từ đầu tới cuối không lỗi
- [ ] Không có rò rỉ dữ liệu (mọi bước tiền xử lý nằm trong Pipeline)
- [ ] Có phần kết luận 5 dòng cho người không chuyên

Gửi notebook cho mentor Data để được nhận xét."""),
        ],
    },
    {
        "title": "SQL và thiết kế cơ sở dữ liệu",
        "cover": "/seed/courses/sql-database.svg",
        "domain": "backend", "level": "BEGINNER",
        "instructor": "Lê Quốc Bảo",
        "description": "Truy vấn SQL từ cơ bản tới JOIN và tổng hợp, chuẩn hoá bảng, chọn index và hiểu transaction để dữ liệu luôn đúng.",
        "skills": ["SQL", "PostgreSQL", "Database Design", "Index"],
        "outcomes": [
            "Viết truy vấn SELECT, JOIN, GROUP BY chính xác",
            "Thiết kế bảng và khoá theo chuẩn hoá hợp lý",
            "Chọn index và đọc kế hoạch thực thi bằng EXPLAIN",
            "Dùng transaction để bảo vệ tính toàn vẹn dữ liệu",
        ],
        "lessons": [
            ("Truy vấn cơ bản", "ARTICLE", "https://www.postgresql.org/docs/current/tutorial.html", 18,
             """## SELECT, WHERE, ORDER BY

```sql
SELECT title, price
FROM   books
WHERE  price BETWEEN 50000 AND 200000
  AND  title ILIKE '%java%'
ORDER  BY price DESC
LIMIT  10;
```

### Thứ tự thực thi (khác thứ tự viết)

`FROM` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `ORDER BY` → `LIMIT`

Vì vậy bạn **không dùng được alias của SELECT trong WHERE**, nhưng dùng được trong ORDER BY.

### NULL

`NULL` nghĩa là "không biết", không phải 0 hay chuỗi rỗng. So sánh phải dùng `IS NULL`, `IS NOT NULL`; `price = NULL` không bao giờ đúng.

```sql
SELECT COALESCE(discount, 0) AS discount FROM books;
```

**Luyện tập:** viết truy vấn tìm 5 sách đắt nhất chưa từng được mượn."""),
            ("JOIN và tổng hợp dữ liệu", "ARTICLE", None, 22,
             """## Ghép bảng

```sql
SELECT u.name, COUNT(o.id) AS orders, COALESCE(SUM(o.total), 0) AS revenue
FROM   users u
LEFT   JOIN orders o ON o.user_id = u.id
GROUP  BY u.id, u.name
HAVING COUNT(o.id) >= 1
ORDER  BY revenue DESC;
```

| JOIN | Giữ lại |
|---|---|
| `INNER` | Chỉ dòng khớp ở cả hai bảng |
| `LEFT` | Mọi dòng bảng trái, bảng phải không khớp là NULL |

### WHERE và HAVING

- `WHERE` lọc **dòng** trước khi gom nhóm.
- `HAVING` lọc **nhóm** sau khi tổng hợp.

### Lỗi hay gặp

Đặt điều kiện của bảng phải vào `WHERE` sau `LEFT JOIN` sẽ biến nó thành `INNER JOIN` (dòng NULL bị loại). Hãy đặt điều kiện đó trong mệnh đề `ON`.

**Kiểm tra nhanh:** đếm số dòng trước và sau JOIN, nếu tăng bất ngờ nghĩa là quan hệ một-nhiều đang nhân bản dòng."""),
            ("Thiết kế bảng và chuẩn hoá", "DOCUMENT", None, 20,
             """## Mỗi sự thật chỉ lưu một chỗ

| Dạng chuẩn | Quy tắc ngắn gọn |
|---|---|
| 1NF | Mỗi ô một giá trị, không lưu danh sách trong một cột |
| 2NF | Cột không khoá phụ thuộc *toàn bộ* khoá chính |
| 3NF | Cột không khoá không phụ thuộc cột không khoá khác |

### Ví dụ

Bảng `orders(id, customer_name, customer_email, ...)` lặp thông tin khách mỗi đơn. Tách:

```sql
CREATE TABLE customers (
  id    UUID PRIMARY KEY,
  name  TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE orders (
  id          UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  total       NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Dùng ràng buộc (`NOT NULL`, `UNIQUE`, `CHECK`, khoá ngoại) để **cơ sở dữ liệu tự chặn dữ liệu sai**, đừng chỉ tin vào code ứng dụng.

Đôi khi cố ý phi chuẩn hoá (lưu thêm tổng tiền) để đọc nhanh, nhưng hãy ghi lại lý do."""),
            ("Index và EXPLAIN", "ARTICLE", "https://www.postgresql.org/docs/current/indexes.html", 22,
             """## Index làm truy vấn nhanh thế nào?

Không có index, database quét **toàn bộ bảng** (Seq Scan). Index B-tree cho phép nhảy thẳng tới dòng cần.

```sql
CREATE INDEX idx_orders_customer_created ON orders (customer_id, created_at DESC);

EXPLAIN ANALYZE
SELECT * FROM orders
WHERE customer_id = '...' ORDER BY created_at DESC LIMIT 20;
```

Trong kết quả, tìm `Index Scan` thay vì `Seq Scan`, và so sánh `actual time`.

### Quy tắc chọn index

- Cột hay xuất hiện trong `WHERE`, `JOIN`, `ORDER BY`.
- Index nhiều cột: cột **bằng** đặt trước, cột **khoảng/sắp xếp** đặt sau.
- Hàm bao quanh cột (`WHERE lower(email) = ...`) làm index thường vô dụng; tạo index trên biểu thức đó.

### Cái giá

Mỗi index làm **chậm ghi** và tốn dung lượng. Đừng index mọi cột; hãy đo bằng `EXPLAIN` rồi mới thêm."""),
            ("Transaction và tính toàn vẹn", "ARTICLE", None, 18,
             """## Tất cả hoặc không gì cả

Chuyển tiền giữa hai tài khoản phải trừ và cộng **cùng lúc**.

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100000 WHERE id = 1 AND balance >= 100000;
UPDATE accounts SET balance = balance + 100000 WHERE id = 2;
COMMIT;   -- hoặc ROLLBACK nếu có lỗi
```

### ACID

- **A**tomicity: trọn vẹn hoặc huỷ hết.
- **C**onsistency: luôn thoả các ràng buộc.
- **I**solation: các transaction đồng thời không giẫm lên nhau.
- **D**urability: đã commit thì không mất.

### Hai người cùng sửa một dòng

Dùng khoá dòng khi đọc rồi ghi:

```sql
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;
```

Hoặc viết điều kiện vào câu `UPDATE` (như `balance >= 100000` ở trên) để kiểm tra và ghi trong **một** câu lệnh nguyên tử.

Giữ transaction **ngắn**: không gọi API bên ngoài trong lúc đang mở transaction."""),
        ],
    },
    {
        "title": "Git và làm việc nhóm",
        "cover": "/seed/courses/git-teamwork.svg",
        "domain": "devops", "level": "BEGINNER",
        "instructor": "Bùi Đức Thắng",
        "description": "Dùng Git hằng ngày cho đúng: nhánh ngắn hạn, commit rõ ràng, pull request và xử lý xung đột, thứ nhà tuyển dụng nào cũng mong ở một fresher.",
        "skills": ["Git", "GitHub", "Code Review", "Teamwork"],
        "outcomes": [
            "Làm việc với nhánh ngắn hạn và squash merge",
            "Viết commit message theo Conventional Commits",
            "Tạo pull request dễ review",
            "Giải quyết xung đột merge bình tĩnh",
        ],
        "lessons": [
            ("Mô hình tư duy của Git", "ARTICLE", "https://git-scm.com/book/en/v2", 15,
             """## Git lưu ảnh chụp, không phải khác biệt

Mỗi **commit** là một ảnh chụp toàn bộ dự án kèm con trỏ tới commit cha. **Nhánh** chỉ là một con trỏ có tên tới một commit, vì vậy tạo nhánh gần như miễn phí.

### Ba khu vực

```text
Working directory  --git add-->  Staging area  --git commit-->  Repository
```

```bash
git status                 # xem đang ở đâu
git add -p                 # chọn từng đoạn thay đổi để stage
git commit -m "feat(auth): thêm đăng nhập bằng email"
git log --oneline --graph  # xem lịch sử dạng đồ thị
```

### Hoàn tác an toàn

| Muốn | Lệnh |
|---|---|
| Bỏ thay đổi chưa stage của một file | `git restore file` |
| Bỏ stage | `git restore --staged file` |
| Đảo ngược commit đã đẩy lên | `git revert <hash>` |

Tránh `git reset --hard` và `push --force` trên nhánh dùng chung."""),
            ("Nhánh ngắn hạn và pull request", "ARTICLE", None, 18,
             """## Quy trình hằng ngày

```bash
git switch main && git pull
git switch -c feature/login-email     # nhánh mới từ main mới nhất
# ... code, commit nhỏ ...
git push -u origin feature/login-email
# mở Pull Request trên GitHub
```

### Một pull request tốt

- **Nhỏ**: dưới ~400 dòng đổi, một mục đích. PR lớn thường bị duyệt qua loa.
- **Mô tả rõ**: vấn đề là gì, cách giải quyết, cách kiểm tra.
- **Tự review trước**: đọc lại diff của chính mình, xoá `console.log` còn sót.
- **CI xanh** rồi mới nhờ review.

### Commit message

`<loại>(<phạm vi>): <mô tả ngắn>`

- `feat`: tính năng mới
- `fix`: sửa lỗi
- `refactor`, `docs`, `test`, `chore`

Ví dụ: `fix(payment): chặn trừ tiền hai lần khi bấm đúp`.

Sau khi merge (squash), xoá nhánh để kho gọn gàng."""),
            ("Xử lý xung đột merge", "VIDEO", None, 15,
             """## Xung đột là bình thường

Xảy ra khi hai nhánh sửa cùng vùng của một file. Git dừng lại và đánh dấu:

```text
<<<<<<< HEAD
const timeout = 5000;
=======
const timeout = 8000;
>>>>>>> feature/retry
```

### Quy trình

1. `git merge main` (hoặc `git rebase main`) trên nhánh của bạn.
2. Mở từng file xung đột, **đọc cả hai phía** rồi viết lại đoạn đúng. Không phải lúc nào cũng chọn một bên.
3. Xoá mọi dấu `<<<<<<<`, `=======`, `>>>>>>>`.
4. `git add file` → `git merge --continue`.
5. **Chạy lại test**, vì code gộp đúng cú pháp chưa chắc đúng logic.

### Giảm xung đột từ gốc

- Kéo `main` về nhánh của bạn thường xuyên.
- Nhánh sống ngắn, PR nhỏ.
- Không format lại cả file khi chỉ sửa vài dòng.

Không chắc phía nào đúng? Hỏi tác giả của dòng đó, dùng `git blame file`."""),
            ("Code review: nhận và cho nhận xét", "ARTICLE", None, 15,
             """## Review là đối thoại, không phải phán xét

### Khi bạn là người được review

- Đừng coi nhận xét là chỉ trích cá nhân; mục tiêu là code tốt hơn.
- Không hiểu thì hỏi lại. Không đồng ý thì nêu lý do bằng dữ kiện.
- Sửa xong thì trả lời từng bình luận ("Đã sửa", hoặc giải thích vì sao giữ).

### Khi bạn là người review

1. Bắt đầu bằng điều làm tốt.
2. Phân loại mức độ: **chặn** (lỗi, bảo mật), **nên sửa**, **gợi ý** (ghi rõ "nit").
3. Nhận xét **code**, không nhận xét người: "Đoạn này có thể null" thay vì "Bạn quên kiểm tra null".
4. Đưa ví dụ hoặc đề xuất cụ thể.

### Checklist nhanh

- [ ] Có đúng yêu cầu không?
- [ ] Có xử lý trường hợp lỗi và biên không?
- [ ] Có test cho phần mới không?
- [ ] Tên biến, hàm có dễ hiểu không?

Review nhanh trong ngày làm việc: PR chờ lâu làm cả nhóm chậm."""),
        ],
    },
    {
        "title": "Chuẩn bị phỏng vấn kỹ thuật",
        "cover": "/seed/courses/technical-interview.svg",
        "domain": "fullstack", "level": "INTERMEDIATE",
        "instructor": "Trần Thu Hà",
        "description": "Cách luyện thuật toán có hệ thống, nói to khi giải bài, trả lời câu hỏi hành vi và thương lượng offer đầu tiên.",
        "skills": ["Algorithms", "Interview", "Communication", "Career"],
        "outcomes": [
            "Có kế hoạch luyện thuật toán theo chủ đề trong 6 tuần",
            "Giải bài bằng quy trình nói to rõ ràng",
            "Trả lời câu hỏi hành vi theo khung STAR",
            "Chuẩn bị câu hỏi ngược và đàm phán offer",
        ],
        "lessons": [
            ("Kế hoạch luyện thuật toán 6 tuần", "ARTICLE", None, 15,
             """## Luyện theo chủ đề, không theo số lượng

Làm 100 bài ngẫu nhiên kém hiệu quả hơn làm 40 bài có chủ đề và ôn lại.

| Tuần | Chủ đề | Mục tiêu |
|---|---|---|
| 1 | Mảng, chuỗi, hash map | Nhận ra khi nào dùng bảng băm |
| 2 | Hai con trỏ, cửa sổ trượt | Giảm O(n²) xuống O(n) |
| 3 | Stack, queue, linked list | Thao tác con trỏ không lỗi |
| 4 | Cây, đồ thị (BFS/DFS) | Duyệt và đếm thành phần |
| 5 | Đệ quy, quy hoạch động cơ bản | Xác định trạng thái và công thức |
| 6 | Ôn lại + mô phỏng phỏng vấn | Giải trong 25-30 phút |

### Cách học một bài

1. Tự làm tối đa 25 phút.
2. Xem lời giải, hiểu **vì sao** nó đúng.
3. Hôm sau làm lại **không nhìn**.
4. Ghi vào sổ: dạng bài, ý tưởng chính, lỗi bạn đã mắc.

Bài làm lại sau 1 ngày, 1 tuần mới thật sự là của bạn."""),
            ("Nói to khi giải bài", "VIDEO", None, 18,
             """## Người phỏng vấn đánh giá cách bạn nghĩ

Im lặng 10 phút rồi viết ra đáp án đúng vẫn có thể bị đánh giá thấp hơn người nói rõ suy nghĩ nhưng cần gợi ý.

### Quy trình 6 bước

1. **Nhắc lại đề** bằng lời của bạn, hỏi các trường hợp biên (mảng rỗng? có số âm? có trùng?).
2. **Đưa ví dụ** nhỏ và tự giải tay.
3. **Nói cách vét cạn** và độ phức tạp của nó; đó là điểm khởi đầu hợp lệ.
4. **Tối ưu**: "Phần nào đang lặp lại? Có cấu trúc dữ liệu nào giúp tra cứu nhanh hơn?"
5. **Chốt hướng** với người phỏng vấn trước khi viết code.
6. **Viết code, rồi chạy thử** bằng ví dụ ở bước 2.

### Khi bí

Nói thẳng: "Tôi đang thử hướng X nhưng gặp vấn đề Y." Người phỏng vấn thường sẽ gợi ý, và cách bạn tiếp nhận gợi ý cũng là một điểm cộng.

Luyện bằng cách giải bài trong khi thu âm, hoặc nhờ mentor thực hiện buổi phỏng vấn thử."""),
            ("Câu hỏi hành vi với khung STAR", "ARTICLE", None, 15,
             """## Họ muốn biết bạn làm việc với người khác ra sao

Câu hỏi thường gặp: "Kể về lần bạn bất đồng với đồng đội", "Lần bạn thất bại", "Lần bạn học một thứ mới nhanh".

### Khung STAR

- **S**ituation: bối cảnh ngắn (1-2 câu).
- **T**ask: nhiệm vụ/trách nhiệm của *bạn*.
- **A**ction: bạn đã làm gì, cụ thể, dùng "tôi" thay vì "chúng tôi". Đây là phần dài nhất.
- **R**esult: kết quả, nếu được thì có con số, và bài học.

### Ví dụ rút gọn

> Trong đồ án nhóm, API trả chậm 4 giây (S). Tôi nhận việc tìm nguyên nhân (T). Tôi bật log truy vấn, phát hiện lỗi N+1 và thêm `JOIN FETCH` kèm index (A). Thời gian giảm còn 300 ms, và tôi thêm test hiệu năng vào CI (R).

### Chuẩn bị

Viết sẵn **4-5 câu chuyện** thật từ đồ án, thực tập, câu lạc bộ. Mỗi chuyện dùng được cho nhiều câu hỏi. Thất bại cũng là một câu chuyện tốt nếu bạn nêu rõ bài học."""),
            ("Câu hỏi ngược và thương lượng offer", "ARTICLE", None, 12,
             """## Cuối buổi phỏng vấn: "Bạn có câu hỏi nào không?"

Luôn có. Câu hỏi tốt cho thấy bạn nghiêm túc:

- "Một ngày làm việc điển hình của người ở vị trí này như thế nào?"
- "Quy trình review code và triển khai của nhóm ra sao?"
- "Người mới thường được giao việc gì trong 3 tháng đầu?"
- "Nhóm đo lường thành công của vị trí này bằng gì?"

Tránh hỏi những điều có ngay trên website tuyển dụng.

## Khi nhận offer

1. **Cảm ơn và xin thời gian** (1-3 ngày) để cân nhắc; việc này bình thường.
2. Xem toàn bộ gói: lương, thưởng, bảo hiểm, thời gian thử việc, cơ hội học tập.
3. Nếu muốn thương lượng, dựa vào **dữ kiện** (mặt bằng thị trường, kỹ năng đặc biệt), nói bằng giọng hợp tác: "Tôi rất muốn gia nhập, liệu mức X có khả thi không?"
4. Cân nhắc mentor, người đi trước ở công ty đó để hiểu văn hoá thật.

Đừng chọn chỉ vì lương: người hướng dẫn tốt trong năm đầu có giá trị lâu dài hơn."""),
        ],
    },
]

# Roadmap: bước có "course" sẽ gắn với khoá học cùng tiêu đề ở trên.
ROADMAPS = [
    {
        "title": "Lộ trình Backend Developer", "track": "Backend", "cover": "/seed/roadmaps/backend.svg",
        "level": "BEGINNER", "weeks": 20,
        "description": "Từ lập trình Java cơ bản tới thiết kế hệ thống phân tán, theo từng giai đoạn có khoá học đi kèm.",
        "items": [
            ("Giai đoạn 1: Nền tảng", "Nắm vững Java core", "OOP, collection, exception, stream API. Làm 10 bài tập nhỏ sau mỗi chủ đề.", 25, None),
            ("Giai đoạn 1: Nền tảng", "Git và làm việc nhóm", "Nhánh ngắn hạn, pull request, xử lý xung đột.", 8, "Git và làm việc nhóm"),
            ("Giai đoạn 2: Xây dựng API", "REST API với Spring Boot", "Hoàn thành khoá Java Spring Boot căn bản và tự làm một API đầy đủ.", 30, "Java Spring Boot căn bản"),
            ("Giai đoạn 2: Xây dựng API", "Cơ sở dữ liệu quan hệ", "SQL, index, transaction, chuẩn hoá. Áp dụng vào API vừa làm.", 20, "SQL và thiết kế cơ sở dữ liệu"),
            ("Giai đoạn 3: Đưa lên môi trường thật", "Docker hoá ứng dụng", "Đóng gói service bằng Docker, dựng pipeline CI.", 15, "Docker & CI/CD nhập môn"),
            ("Giai đoạn 4: Mở rộng quy mô", "System Design", "Cache, queue, sharding và cách trả lời câu hỏi thiết kế.", 30, "System Design cho phỏng vấn"),
            ("Giai đoạn 4: Mở rộng quy mô", "Luyện phỏng vấn với mentor", "Đặt 2 buổi mentoring để phỏng vấn thử và nhận phản hồi.", 6, None),
        ],
    },
    {
        "title": "Lộ trình DevOps Engineer", "track": "DevOps", "cover": "/seed/roadmaps/devops.svg",
        "level": "INTERMEDIATE", "weeks": 16,
        "description": "Linux, container, CI/CD và vận hành hệ thống: những kỹ năng để đưa phần mềm lên chạy ổn định.",
        "items": [
            ("Giai đoạn 1: Nền tảng", "Linux và shell", "Lệnh cơ bản, phân quyền, process, mạng. Viết 3 script tự động hoá việc lặp lại.", 25, None),
            ("Giai đoạn 1: Nền tảng", "Git và làm việc nhóm", "Quy trình nhánh, review và release.", 8, "Git và làm việc nhóm"),
            ("Giai đoạn 2: Container và tự động hoá", "Container với Docker", "Dockerfile, Compose, image nhỏ và an toàn.", 20, "Docker & CI/CD nhập môn"),
            ("Giai đoạn 2: Container và tự động hoá", "Pipeline CI/CD", "Tự động build, test, triển khai với GitHub Actions.", 12, None),
            ("Giai đoạn 3: Vận hành", "Kubernetes cơ bản", "Pod, deployment, service, ConfigMap/Secret.", 30, None),
            ("Giai đoạn 3: Vận hành", "Giám sát và cảnh báo", "Metric, log, alert; đọc p99 và tỉ lệ lỗi.", 15, None),
        ],
    },
    {
        "title": "Lộ trình Frontend Developer", "track": "Frontend", "cover": "/seed/roadmaps/frontend.svg",
        "level": "BEGINNER", "weeks": 16,
        "description": "HTML/CSS, JavaScript, React và Next.js, kèm thói quen xây giao diện nhanh và dễ truy cập.",
        "items": [
            ("Giai đoạn 1: Nền tảng web", "HTML, CSS và bố cục", "Semantic HTML, Flexbox, Grid, responsive.", 25, None),
            ("Giai đoạn 1: Nền tảng web", "JavaScript hiện đại", "ES6+, bất đồng bộ (Promise, async/await), DOM.", 30, None),
            ("Giai đoạn 2: React", "React và Next.js", "Hoàn thành khoá React & Next.js thực chiến.", 35, "React & Next.js thực chiến"),
            ("Giai đoạn 2: React", "TypeScript trong React", "Kiểu cho props, state và API response.", 15, None),
            ("Giai đoạn 3: Chuyên nghiệp hoá", "Git và làm việc nhóm", "Pull request, review, xử lý xung đột.", 8, "Git và làm việc nhóm"),
            ("Giai đoạn 3: Chuyên nghiệp hoá", "Đưa lên chạy thật", "Đóng gói bằng Docker và tự động deploy.", 12, "Docker & CI/CD nhập môn"),
        ],
    },
    {
        "title": "Lộ trình Data và Machine Learning", "track": "Data", "cover": "/seed/roadmaps/data.svg",
        "level": "INTERMEDIATE", "weeks": 20,
        "description": "Từ Python và SQL tới xây dựng, đánh giá và triển khai mô hình học máy đầu tiên.",
        "items": [
            ("Giai đoạn 1: Công cụ", "Python cho phân tích dữ liệu", "Cú pháp, hàm, môi trường ảo, Jupyter.", 20, None),
            ("Giai đoạn 1: Công cụ", "SQL để lấy dữ liệu", "Truy vấn, JOIN, tổng hợp.", 20, "SQL và thiết kế cơ sở dữ liệu"),
            ("Giai đoạn 2: Học máy", "Pandas và scikit-learn", "Hoàn thành khoá Machine Learning với Python.", 40, "Machine Learning với Python"),
            ("Giai đoạn 2: Học máy", "Dự án cá nhân", "Chọn một bộ dữ liệu thật, làm từ khám phá tới báo cáo kết quả.", 30, None),
            ("Giai đoạn 3: Triển khai", "Đóng gói mô hình thành API", "FastAPI + Docker để người khác gọi được mô hình.", 15, "Docker & CI/CD nhập môn"),
        ],
    },
    {
        "title": "Lộ trình Fresher đi làm", "track": "Career", "cover": "/seed/roadmaps/fresher.svg",
        "level": "BEGINNER", "weeks": 8,
        "description": "8 tuần chuẩn bị cho vị trí đầu tiên: hồ sơ, kỹ năng làm việc nhóm và phỏng vấn kỹ thuật.",
        "items": [
            ("Tuần 1-2: Hồ sơ", "Hoàn thiện CV và hồ sơ trên nền tảng", "Một trang CV, 2-3 dự án có số liệu. Nhờ mentor góp ý.", 10, None),
            ("Tuần 1-2: Hồ sơ", "Dự án nổi bật trên GitHub", "README rõ ràng, hướng dẫn chạy trong 3 dòng lệnh.", 15, None),
            ("Tuần 3-4: Kỹ năng làm việc", "Git và làm việc nhóm", "Thói quen mà nhà tuyển dụng nào cũng kiểm tra.", 8, "Git và làm việc nhóm"),
            ("Tuần 5-8: Phỏng vấn", "Chuẩn bị phỏng vấn kỹ thuật", "Thuật toán, câu hỏi hành vi, thương lượng offer.", 20, "Chuẩn bị phỏng vấn kỹ thuật"),
            ("Tuần 5-8: Phỏng vấn", "Phỏng vấn thử với AI và mentor", "Làm ít nhất 2 buổi phỏng vấn thử và ghi lại điểm cần cải thiện.", 6, None),
        ],
    },
]
