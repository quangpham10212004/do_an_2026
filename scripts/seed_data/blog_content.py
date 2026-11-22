"""Bài blog mẫu (tác giả là tài khoản demo trong seed_demo.py). Ảnh bìa nằm ở frontend/public/seed/blog/."""

POSTS = [
    {
        "author": "mentor.java@demo.local",
        "cover": "/seed/blog/spring-layers.svg",
        "title": "Controller, service, repository: mỗi tầng chịu trách nhiệm gì?",
        "summary": "Ba tầng quen thuộc của Spring Boot dễ bị lẫn lộn. Đây là cách tôi phân chia để code dễ test và dễ đọc.",
        "tags": ["Java", "Spring Boot"],
        "days_ago": 20,
        "content": """Hầu hết mentee tôi hướng dẫn đều viết được controller, service, repository, nhưng *đặt logic sai chỗ*. Hậu quả là test khó, và đổi một yêu cầu phải sửa ba nơi.

## Quy tắc một câu cho mỗi tầng

- **Controller**: biến HTTP thành lời gọi hàm và ngược lại. Đọc request, validate hình dạng dữ liệu, chọn status code.
- **Service**: nơi quy tắc nghiệp vụ sống. Không biết gì về HTTP.
- **Repository**: đọc và ghi dữ liệu. Không chứa quyết định nghiệp vụ.

## Dấu hiệu đặt sai chỗ

1. Service nhận `HttpServletRequest`. Nghiệp vụ không nên biết request đến từ đâu.
2. Controller có `if (user.getBalance() < price)`. Đó là quy tắc nghiệp vụ, hãy chuyển xuống service.
3. Repository có method `approveOrder()`. Repository chỉ nên có `save` và các truy vấn.

## Vì sao điều này quan trọng?

Khi service thuần Java, bạn test nó bằng một unit test chạy trong vài mili giây, không cần khởi động Spring. Khi quy tắc nằm ở controller, bạn phải dựng cả web layer để kiểm tra một phép so sánh.

> Nếu bạn khó đặt tên cho một method vì nó "vừa làm A vừa làm B", gần như chắc chắn nó đang ở sai tầng hoặc cần tách làm đôi.

Bài tập cho tuần này: mở một controller của bạn, gạch chân mọi dòng không phải là xử lý HTTP, rồi chuyển chúng xuống service.""",
    },
    {
        "author": "mentor.java@demo.local",
        "cover": "/seed/blog/n-plus-one.svg",
        "title": "Lỗi N+1 query: vì sao API của bạn chậm khi dữ liệu tăng",
        "summary": "Một lỗi hiệu năng kinh điển với JPA: 1 truy vấn lấy danh sách, rồi N truy vấn nữa cho từng phần tử. Cách nhận ra và sửa.",
        "tags": ["Java", "Spring Boot", "Database"],
        "days_ago": 14,
        "content": """API trả 20 đơn hàng nhanh ổn, nhưng khi có 2.000 đơn thì mất vài giây. Nguyên nhân thường gặp: **N+1 query**.

## Nó xảy ra thế nào?

```java
List<Order> orders = orderRepository.findAll();      // 1 truy vấn
for (Order o : orders) {
    System.out.println(o.getCustomer().getName());   // mỗi vòng thêm 1 truy vấn (lazy load)
}
```

Tổng cộng 1 + N truy vấn. Mỗi truy vấn nhỏ, nhưng độ trễ mạng cộng dồn.

## Cách phát hiện

Bật log SQL ở môi trường dev (`spring.jpa.show-sql=true`) và đếm số câu lệnh cho một request. Nếu số câu lệnh tăng theo số dòng trả về, đó là N+1.

## Cách sửa

1. **`JOIN FETCH`** lấy luôn quan hệ trong một truy vấn:
   ```java
   @Query("select o from Order o join fetch o.customer")
   List<Order> findAllWithCustomer();
   ```
2. **`@EntityGraph`** khi không muốn viết JPQL.
3. **Trả DTO bằng truy vấn riêng** chỉ chọn cột cần dùng, cách nhẹ nhất cho API chỉ đọc.

## Lưu ý

`JOIN FETCH` với quan hệ một-nhiều kèm phân trang (`Pageable`) có thể kéo cả bảng vào bộ nhớ. Khi đó hãy dùng `@BatchSize` hoặc tách thành hai truy vấn.

Hãy đo trước và sau: thêm một test đếm số câu lệnh để lỗi không quay lại.""",
    },
    {
        "author": "mentor.java@demo.local",
        "cover": "/seed/blog/system-design-interview.svg",
        "title": "5 sai lầm khi trả lời câu hỏi System Design",
        "summary": "Từ kinh nghiệm phỏng vấn thử cho hàng chục mentee: những lỗi lặp đi lặp lại và cách tránh.",
        "tags": ["System Design", "Interview", "Career"],
        "days_ago": 9,
        "content": """Tôi đã phỏng vấn thử system design cho hơn 30 bạn. Năm lỗi sau lặp lại gần như mọi lần.

## 1. Vẽ ngay mà không hỏi yêu cầu
Mười phút đầu nên dành cho câu hỏi: ai dùng, bao nhiêu người, đọc nhiều hay ghi nhiều, độ trễ chấp nhận được. Thiết kế khác nhau hoàn toàn cho 1.000 và 10 triệu người dùng.

## 2. Nói tên công nghệ thay vì lý do
"Tôi dùng Kafka" chưa nói gì. "Tôi dùng queue để tách bước gửi email khỏi request, chịu được đột biến tải" mới cho thấy bạn hiểu.

## 3. Bỏ qua con số
Một phép ước lượng thô (QPS, dung lượng lưu trữ mỗi năm) giúp bạn biết có cần sharding hay chỉ cần một database tốt và cache.

## 4. Không nói về điểm lỗi
Hãy tự hỏi: nếu thành phần này chết thì sao? Nhà tuyển dụng rất thích ứng viên chủ động chỉ ra single point of failure.

## 5. Tối ưu quá sớm
Đừng đưa microservice, sharding, multi-region vào ngay từ đầu. Bắt đầu đơn giản, rồi *chỉ ra nút thắt cổ chai* và nâng cấp đúng chỗ.

### Cách luyện
Chọn một sản phẩm quen thuộc (rút gọn URL, chat, bảng tin), đặt đồng hồ 45 phút, tự trả lời thành tiếng rồi nhờ mentor nhận xét. Khoá "System Design cho phỏng vấn" trong Learning Hub có sẵn quy trình bốn bước để bạn bám theo.""",
    },
    {
        "author": "mentor.react@demo.local",
        "cover": "/seed/blog/react-state.svg",
        "title": "Đừng lưu state có thể tính được",
        "summary": "Một nguyên tắc nhỏ giúp component React ít lỗi hơn hẳn: chỉ lưu nguồn sự thật, còn lại hãy tính khi render.",
        "tags": ["React", "TypeScript"],
        "days_ago": 17,
        "content": """Đoạn code này rất phổ biến:

```tsx
const [items, setItems] = useState<Item[]>([]);
const [count, setCount] = useState(0);

useEffect(() => { setCount(items.length); }, [items]);
```

Nó chạy, nhưng có hai vấn đề: một lần render với `count` cũ, và hai biến state có thể lệch nhau nếu ai đó quên cập nhật một trong hai.

## Cách đúng

```tsx
const [items, setItems] = useState<Item[]>([]);
const count = items.length;      // tính trực tiếp khi render
```

## Quy tắc

- **Lưu** dữ liệu gốc (danh sách, nội dung ô nhập, mục đang chọn).
- **Tính** mọi thứ suy ra được: tổng, danh sách đã lọc, cờ "form hợp lệ".
- Nếu phép tính nặng, dùng `useMemo`, nhưng chỉ sau khi đo thấy chậm.

## Với mục đang chọn

Thay vì lưu cả object `selectedItem`, hãy lưu `selectedId` rồi tìm trong danh sách. Khi danh sách cập nhật từ server, bạn không bị giữ bản sao cũ.

Hãy rà lại component của bạn: mỗi `useEffect` chỉ để gọi `setState` gần như luôn là dấu hiệu của state thừa.""",
    },
    {
        "author": "mentor.react@demo.local",
        "cover": "/seed/blog/nextjs-server-components.svg",
        "title": "Server Component trong Next.js: khi nào dùng, khi nào không",
        "summary": "Hiểu ranh giới giữa Server và Client Component để gửi ít JavaScript hơn và vẫn giữ được tương tác.",
        "tags": ["Next.js", "React", "TypeScript"],
        "days_ago": 6,
        "content": """Với App Router, mọi component mặc định chạy trên **server**. Điều đó thay đổi cách chúng ta nghĩ về giao diện.

## Server Component mạnh ở đâu?

- Lấy dữ liệu trực tiếp bằng `await`, không cần `useEffect` và trạng thái tải thủ công.
- JavaScript của component **không** được gửi tới trình duyệt, nên trang nhẹ hơn.
- Truy cập an toàn tài nguyên chỉ server có (biến môi trường bí mật, database).

## Khi nào cần Client Component?

Thêm `"use client"` khi bạn cần:

- State và effect (`useState`, `useEffect`)
- Sự kiện trình duyệt (`onClick`, `onChange`)
- API chỉ có ở trình duyệt (`localStorage`, `window`)

## Mẹo thực tế

Đẩy ranh giới `"use client"` **xuống lá**. Thay vì biến cả trang thành client chỉ vì có một nút "Thích", hãy tách nút đó ra:

```tsx
// page.tsx (server)
const post = await getPost(slug);
return <article>{post.title}<LikeButton postId={post.id} /></article>;
```

Chỉ `LikeButton` là client. Phần còn lại vẫn nhẹ.

## Lỗi hay gặp

Truyền hàm (callback) từ Server sang Client Component sẽ báo lỗi vì hàm không serialize được. Hãy truyền dữ liệu thuần, và để client tự định nghĩa hàm xử lý.""",
    },
    {
        "author": "mentor.devops@demo.local",
        "cover": "/seed/blog/docker-multistage.svg",
        "title": "Giảm image Docker từ 700 MB xuống 150 MB",
        "summary": "Multi-stage build, image nền nhỏ và vài thói quen khác giúp deploy nhanh hơn và giảm bề mặt tấn công.",
        "tags": ["Docker", "DevOps"],
        "days_ago": 12,
        "content": """Image lớn không chỉ tốn băng thông. Càng nhiều thành phần thì càng nhiều lỗ hổng tiềm ẩn. Ba bước sau cho tôi mức giảm lớn nhất.

## 1. Multi-stage build

Giai đoạn build có JDK và Maven; giai đoạn chạy chỉ cần JRE và file jar.

```dockerfile
FROM maven:3.9-eclipse-temurin-21 AS build
COPY . /src
RUN mvn -q -f /src/pom.xml package -DskipTests

FROM eclipse-temurin:21-jre-alpine
COPY --from=build /src/target/app.jar /app.jar
USER 1000
ENTRYPOINT ["java", "-jar", "/app.jar"]
```

## 2. Chọn image nền nhỏ

`-alpine` hoặc `-slim` thường nhỏ hơn 3-5 lần so với bản đầy đủ. Hãy kiểm tra thư viện native của bạn có chạy được trên musl (Alpine) trước khi chuyển.

## 3. Dùng `.dockerignore`

Loại `.git`, `node_modules`, `target`, `.env`. Vừa nhỏ hơn vừa **không lộ bí mật** vào layer.

## Kiểm tra kết quả

```bash
docker images myapp
docker history myapp:latest     # xem layer nào nặng
```

Cuối cùng, hãy chạy container bằng user không phải root. Đó là thay đổi một dòng nhưng giảm đáng kể hậu quả nếu ứng dụng bị khai thác.""",
    },
    {
        "author": "mentor.devops@demo.local",
        "cover": "/seed/blog/ci-cd-small-team.svg",
        "title": "CI/CD cho nhóm nhỏ: bắt đầu từ ba việc đơn giản",
        "summary": "Không cần hạ tầng phức tạp. Với ba bước, nhóm 3-5 người đã có pipeline đáng tin cậy.",
        "tags": ["DevOps", "Docker"],
        "days_ago": 3,
        "content": """Nhiều nhóm sinh viên nghĩ CI/CD là thứ của công ty lớn. Thực ra bạn có thể có pipeline hữu ích chỉ sau một buổi chiều.

## Bước 1: Mỗi pull request tự chạy test

Một workflow GitHub Actions chạy build và test khi có PR. Mục tiêu duy nhất: **không ai merge code làm hỏng main** mà không biết.

## Bước 2: Bắt buộc CI xanh mới được merge

Bật branch protection cho `main`: yêu cầu CI pass và ít nhất một người review. Hai thiết lập này tạo ra thói quen tốt hơn mọi buổi nhắc nhở.

## Bước 3: Tự động đóng gói

Khi merge vào `main`, build image Docker và đẩy lên registry với tag là mã commit. Giờ bất kỳ phiên bản nào cũng có thể chạy lại hoặc quay về.

## Những thứ nên để sau

- Kubernetes
- Triển khai blue/green
- Hệ thống giám sát phức tạp

Chúng hữu ích, nhưng chỉ khi ba bước trên đã ổn định.

## Một cảnh báo về bí mật

Mật khẩu và khoá API đặt trong *Secrets* của CI, không bao giờ nằm trong repo, kể cả repo riêng tư. Nếu lỡ commit, hãy coi như đã lộ và **đổi khoá ngay**.""",
    },
    {
        "author": "mentor.data@demo.local",
        "cover": "/seed/blog/ml-leakage.svg",
        "title": "Rò rỉ dữ liệu: vì sao mô hình đạt 99% rồi thất bại khi triển khai",
        "summary": "Điểm số quá đẹp thường là dấu hiệu của rò rỉ dữ liệu. Ba tình huống phổ biến và cách phòng tránh.",
        "tags": ["Machine Learning", "Python"],
        "days_ago": 8,
        "content": """Nếu mô hình đầu tiên của bạn đạt độ chính xác 99%, hãy nghi ngờ trước khi ăn mừng. Rất có thể đó là **rò rỉ dữ liệu (data leakage)**.

## Rò rỉ là gì?

Là khi thông tin mà bạn *sẽ không có* lúc dự đoán thật lại lọt vào quá trình huấn luyện.

## Ba tình huống hay gặp

1. **Tiền xử lý trước khi chia**: chuẩn hoá hay điền giá trị thiếu trên toàn bộ dữ liệu rồi mới chia train/test. Thống kê của tập test đã ảnh hưởng tới train.
2. **Đặc trưng "nhìn thấy tương lai"**: dự đoán khách hàng rời bỏ nhưng có cột `ngay_huy_hop_dong`. Cột đó chỉ tồn tại *sau* sự kiện.
3. **Trùng lặp giữa train và test**: cùng một người xuất hiện ở cả hai tập (nhiều dòng cho một khách hàng).

## Cách phòng tránh

- Đặt mọi bước tiền xử lý vào `Pipeline` để chỉ `fit` trên tập train.
- Với dữ liệu theo thời gian, chia theo mốc thời gian chứ không chia ngẫu nhiên.
- Với dữ liệu có nhóm (một người nhiều dòng), dùng `GroupKFold`.
- Tự hỏi với từng cột: "lúc dự đoán thật, mình có biết giá trị này không?"

Một mô hình 85% trung thực luôn tốt hơn một mô hình 99% gian lận chính mình.""",
    },
    {
        "author": "mentee@demo.local",
        "cover": "/seed/blog/first-mentor.svg",
        "title": "Tôi đã chọn mentor đầu tiên như thế nào",
        "summary": "Chia sẻ của một mentee mới: cách đọc hồ sơ, chuẩn bị câu hỏi và điều tôi ước mình biết sớm hơn.",
        "tags": ["Career", "Interview"],
        "days_ago": 11,
        "content": """Hồi mới tham gia, tôi mất cả tuần để chọn mentor vì danh sách dài và ai cũng có vẻ giỏi. Đây là cách tôi quyết định.

## Bắt đầu từ mục tiêu, không phải từ tên tuổi

Tôi viết một câu: *"Trong 6 tháng nữa tôi muốn qua được phỏng vấn backend Java."* Sau đó chỉ xem những mentor có kỹ năng khớp với câu đó. Gợi ý của hệ thống giúp thu hẹp từ hàng chục xuống còn 3 người.

## Đọc hồ sơ thế nào?

- **Kỹ năng và số năm kinh nghiệm** có khớp mục tiêu của mình không.
- **Đánh giá của mentee trước**: tôi đọc phần nhận xét chữ chứ không chỉ nhìn số sao.
- **Lịch rảnh** có hợp với giờ học của mình không. Một mentor tuyệt vời mà không có lịch cũng vô ích.

## Buổi đầu tiên

Tôi chuẩn bị 3 câu hỏi cụ thể và gửi trước. Buổi học vì thế đi thẳng vào vấn đề thay vì mất nửa giờ để làm quen.

## Điều tôi ước biết sớm hơn

Mentor không làm bài thay mình. Họ chỉ ra *hướng* và *lỗ hổng*. Công việc là của mình. Những tuần tôi làm bài tập trước buổi học luôn hiệu quả hơn hẳn những tuần tôi chỉ đến để hỏi.""",
    },
    {
        "author": "mentor.node@demo.local",
        "cover": "/seed/blog/fresher-cv.svg",
        "title": "CV một trang cho fresher: viết gì, bỏ gì",
        "summary": "Nhà tuyển dụng đọc CV trong khoảng 30 giây. Cách để 30 giây đó làm việc cho bạn.",
        "tags": ["Career", "Interview"],
        "days_ago": 5,
        "content": """Khi tôi sàng lọc CV cho nhóm, mỗi bản được xem chừng nửa phút. Với fresher chưa có kinh nghiệm, đây là điều thực sự gây ấn tượng.

## Nên có

- **Một trang**. Không ai cần trang hai của một sinh viên mới ra trường.
- **Dự án có kết quả đo được**. "Xây dựng API đặt lịch" ít sức nặng hơn "Xây dựng API đặt lịch cho 200 người dùng thử, thời gian phản hồi trung bình 120 ms".
- **Liên kết GitHub** tới repo có README rõ ràng và hướng dẫn chạy.
- **Kỹ năng phân nhóm**: ngôn ngữ, framework, công cụ.

## Nên bỏ

- Thanh đo trình độ kiểu "Java 80%". Con số đó không có nghĩa gì.
- Sở thích chung chung ("nghe nhạc", "đọc sách").
- Mục tiêu nghề nghiệp dài dòng. Thay bằng hai dòng tóm tắt nêu vị trí bạn nhắm tới.
- Ảnh thẻ, ngày sinh, tình trạng hôn nhân khi vị trí không yêu cầu.

## Cách mô tả một dự án

Dùng công thức: **làm gì + bằng công nghệ nào + kết quả**.

> Thiết kế REST API quản lý khoá học bằng Spring Boot và PostgreSQL; thêm cache Redis giảm thời gian tải danh sách từ 800 ms xuống 90 ms.

Cuối cùng, nhờ một mentor đọc và góp ý trước khi gửi. Ba mươi phút review có thể tăng đáng kể tỉ lệ được mời phỏng vấn.""",
    },
    {
        "author": "mentee.frontend@demo.local",
        "cover": "/seed/blog/learning-in-public.svg",
        "title": "Học công khai: vì sao tôi viết lại mọi thứ mình học",
        "summary": "Viết blog giúp tôi hiểu sâu hơn, có sản phẩm để cho nhà tuyển dụng xem, và quen với những người cùng đường.",
        "tags": ["Career", "React"],
        "days_ago": 4,
        "content": """Ba tháng trước tôi bắt đầu viết lại mỗi tuần một điều mình học. Không phải vì nghĩ mình giỏi, mà vì các lý do rất thực dụng.

## 1. Viết ra là bài kiểm tra cho sự hiểu biết

Tôi tưởng mình hiểu `useEffect` cho tới khi phải giải thích nó cho người khác. Đoạn nào tôi viết ấp úng, đoạn đó là chỗ tôi chưa hiểu. Quay lại học, rồi viết lại.

## 2. Có thứ để cho người khác xem

Thay vì nói "em đang học React", tôi gửi đường dẫn tới ba bài viết và hai dự án nhỏ. Người đọc thấy được cách tôi suy nghĩ.

## 3. Nhận phản hồi sớm

Một bình luận từ mentor chỉ ra tôi đã nhầm về thứ tự chạy của effect. Sửa ngay từ tuần đầu rẻ hơn nhiều so với sửa khi đã thành thói quen.

## Cách bắt đầu nhỏ

- Mỗi tuần **một** chủ đề, 300-500 từ.
- Viết cho chính mình của tuần trước.
- Đính kèm đoạn code nhỏ chạy được.
- Không chờ hoàn hảo: bản nháp đăng được còn hơn bản đẹp nằm mãi trong máy.

Nếu bạn đang học và chưa biết bắt đầu từ đâu, hãy thử viết bài đầu tiên ngay hôm nay. Chủ đề có thể đơn giản như "Tuần này tôi hiểu thêm điều gì?".""",
    },
    {
        "author": "mentee@demo.local",
        "cover": "/seed/blog/mentee-6-months.svg",
        "title": "Sáu tháng học backend: kế hoạch, thất bại và điều đã hiệu quả",
        "summary": "Nhìn lại lộ trình từ Java cơ bản tới dự án đầu tiên: những gì tôi sẽ làm lại và những gì tôi sẽ bỏ.",
        "tags": ["Java", "Career", "Spring Boot"],
        "days_ago": 1,
        "content": """Sáu tháng trước tôi chỉ biết in "Hello World" bằng Java. Hôm nay tôi có một API chạy thật và đã qua vòng phỏng vấn đầu tiên. Tôi muốn ghi lại để bạn khỏi mất thời gian như tôi.

## Điều hiệu quả

- **Một lộ trình cố định**. Tuần đầu tôi nhảy giữa ba khoá khác nhau và chẳng học được gì. Khi chọn một roadmap và đi theo từng bước, tiến độ rõ ràng hẳn.
- **Làm dự án sớm**. Tôi bắt đầu API quản lý sách ở tuần thứ 6, không đợi "học đủ". Phần lớn kiến thức đọng lại khi bị lỗi và phải sửa.
- **Buổi mentoring hai tuần một lần** với một mục tiêu cụ thể mỗi buổi.

## Điều tôi sẽ làm lại

- Học SQL và index sớm hơn. Tôi mất cả tháng debug một truy vấn chậm mà một chỉ mục là giải quyết.
- Viết test từ đầu thay vì thêm vào cuối.
- Dùng Git đúng cách ngay từ ngày một: commit nhỏ, nhánh ngắn.

## Điều tôi bỏ

Xem video hướng dẫn thụ động. Nếu không gõ code theo thì một tuần sau tôi không nhớ gì.

## Lời khuyên ngắn

1. Chọn một đích (ví dụ backend Java) và bám nó ít nhất 3 tháng.
2. Mỗi tuần có một sản phẩm nhỏ nhìn thấy được.
3. Hỏi mentor khi bí quá **một giờ**, đừng im lặng cả ngày.

Cảm ơn mentor Long đã chỉ ra những lỗ hổng mà tôi không tự thấy.""",
    },
]

# (người bình luận, chỉ số bài trong POSTS, nội dung)
COMMENTS = [
    ("mentee@demo.local", 1, "Cảm ơn thầy! Em vừa bật log SQL và đếm được 41 câu lệnh cho một request danh sách, đúng là N+1. Đã sửa bằng JOIN FETCH."),
    ("mentee.frontend@demo.local", 3, "Rà lại component của em thì có 3 chỗ useEffect chỉ để setState. Em sẽ tính trực tiếp khi render."),
    ("mentee@demo.local", 2, "Mục số 3 (bỏ qua con số) đúng là lỗi em hay mắc. Em sẽ luyện ước lượng QPS trước mỗi bài."),
    ("mentor.java@demo.local", 11, "Chúc mừng em! Phần SQL và index đúng là thứ nhiều bạn đánh giá thấp. Hẹn buổi tới mình ôn tiếp phần system design nhé."),
    ("mentor.react@demo.local", 10, "Thói quen viết lại mỗi tuần rất tốt, và bài này có cấu trúc rõ ràng. Gợi ý: thêm một ví dụ code nhỏ chạy được cho mỗi chủ đề."),
    ("mentee@demo.local", 5, "Image 700MB của em xuống còn 190MB nhờ multi-stage. Một dòng USER không phải root cũng dễ làm hơn em nghĩ."),
    ("mentee.frontend@demo.local", 4, "Em hay truyền callback từ server sang client và gặp đúng lỗi này. Bài viết giải thích rất dễ hiểu."),
    ("mentor.python@demo.local", 7, "Điểm số quá đẹp luôn là dấu hiệu để kiểm tra lại. Bổ sung: với dữ liệu theo thời gian nên dùng TimeSeriesSplit."),
    ("mentee.frontend@demo.local", 9, "Cảm ơn chị! Em sẽ bỏ thanh đo trình độ trong CV và viết lại phần dự án theo công thức làm gì, công nghệ nào, kết quả."),
]

# (người thích, chỉ số bài)
LIKES = [
    ("mentee@demo.local", [0, 1, 2, 3, 5, 6, 9]),
    ("mentee.frontend@demo.local", [3, 4, 5, 9, 11]),
    ("mentor.java@demo.local", [10, 11, 3, 4]),
    ("mentor.react@demo.local", [10, 1, 7]),
    ("mentor.devops@demo.local", [0, 1, 3, 11]),
    ("mentor.data@demo.local", [1, 2, 6]),
    ("mentor.python@demo.local", [1, 6, 7, 9]),
    ("mentor.node@demo.local", [3, 4, 10, 11]),
]

BOOKMARKS = [
    ("mentee@demo.local", [1, 2, 9]),
    ("mentee.frontend@demo.local", [3, 4, 9]),
]

# (người theo dõi, [tác giả])
FOLLOWS = [
    ("mentee@demo.local", ["mentor.java@demo.local", "mentor.devops@demo.local", "mentor.data@demo.local", "mentor.node@demo.local"]),
    ("mentee.frontend@demo.local", ["mentor.react@demo.local", "mentor.node@demo.local", "mentor.devops@demo.local", "mentor.java@demo.local"]),
    ("mentor.java@demo.local", ["mentor.react@demo.local", "mentor.devops@demo.local", "mentee@demo.local"]),
    ("mentor.react@demo.local", ["mentor.java@demo.local", "mentee.frontend@demo.local"]),
    ("mentor.devops@demo.local", ["mentor.java@demo.local", "mentor.data@demo.local"]),
    ("mentor.data@demo.local", ["mentor.java@demo.local", "mentor.python@demo.local"]),
    ("mentor.python@demo.local", ["mentor.java@demo.local", "mentor.data@demo.local", "mentor.node@demo.local"]),
    ("mentor.node@demo.local", ["mentor.react@demo.local", "mentor.java@demo.local"]),
]
