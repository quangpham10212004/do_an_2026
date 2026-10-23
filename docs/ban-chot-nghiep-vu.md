# Bản chốt nghiệp vụ và thông số — MentorHub

> **Trạng thái**: DỰ THẢO chờ nhóm review · 21/10/2026
> **Căn cứ**: tài liệu "Phạm vi đồ án Mentor-Mentee" (bản chốt phạm vi) + đối chiếu mã nguồn nhánh `main` (`c7a50ff`).
> **Quy ước**: mọi mục "cần xác nhận" trong bản chốt phạm vi đều đã được chốt ở đây. Cột **Hiện tại** là giá trị
> trong code; ✔ = giữ nguyên, ✎ = sửa cấu hình, ⚒ = phải viết thêm code.
> Mọi thông số nằm trong cấu hình (`application.yml` / `config.py` / biến môi trường), không viết cứng.

---

## 1. Nguyên tắc chốt

1. **Ví là nơi duy nhất trả học phí.** Cổng MoMo/VNPay/sandbox chỉ dùng để **nạp ví**, không trả thẳng cho buổi học.
2. **Một đơn vị tiền: VND nguyên.** Bỏ hệ "điểm thưởng"; mọi khoản thưởng, khuyến mãi, xin lỗi là **tiền khuyến mãi** trong ví.
3. **Số dư = tổng các bút toán**, không có cột "balance" sửa trực tiếp; mọi thao tác tiền có khoá idempotency.
4. **Không có buổi miễn phí.** Buổi rẻ nhất là buổi trải nghiệm có phí.
5. **Giá do khung cấp độ quyết định**, mentor chỉ chọn trong khung.
6. Ưu tiên giữ thông số code đang có khi bản chốt phạm vi không nói khác — giảm việc phải làm lại.

---

## 2. Tài khoản và an toàn

| Nội dung | Chốt | Hiện tại |
|---|---|---|
| Đăng nhập sai | 5 lần liên tiếp → khoá đăng nhập **15 phút** | ✔ 5 lần / 15 phút |
| Giới hạn theo IP | 5 lần đăng nhập/phút/IP | ✔ |
| Link khôi phục mật khẩu | hiệu lực **15 phút**, dùng một lần | ✎ đang 30 phút |
| Phiên đăng nhập | access token 30 phút, refresh 7 ngày; refresh hết hạn → đăng nhập lại | ✔ |
| Admin khoá tài khoản | bắt buộc ghi lý do; xử lý buổi học theo mục 2.1 | ⚒ một phần (US-27 chỉ cho mentor) |
| Mentor chưa duyệt | sửa hồ sơ, làm phỏng vấn được; **không** hiện trong đề xuất/tìm kiếm, không nhận đặt lịch | ✔ |

### 2.1 Khoá tài khoản

- **Khoá mentor**: mọi buổi chưa diễn ra bị huỷ, mentee được hoàn **100%** về ví (nguồn tiền như lúc trả). Thu nhập
  đang chờ của mentor bị **đóng băng** đến khi admin kết luận (giải phóng hoặc hoàn cho mentee).
- **Khoá mentee**: mọi buổi chưa diễn ra bị huỷ, hoàn 100% về ví; ví bị đóng băng (không đặt, không hoàn ra nguồn)
  đến khi mở khoá.
- **Mở khoá**: chỉ khôi phục quyền truy cập, không tự khôi phục buổi đã huỷ.
- Cả hai bên nhận thông báo trong hệ thống + email.

---

## 3. Đánh giá năng lực và cấp độ mentor

| Nội dung | Chốt | Hiện tại |
|---|---|---|
| Cấp độ | **Junior / Senior / Expert**, do admin phê duyệt; số năm kinh nghiệm chỉ để hiển thị | ⚒ chưa có cấp độ |
| Đề xuất cấp độ từ điểm AI (thang 0–100) | < 60 không đạt · 60–74 Junior · 75–87 Senior · ≥ 88 Expert | ⚒ |
| Admin | được chọn cấp khác đề xuất hoặc từ chối; **bắt buộc ghi lý do** (≥ 10 ký tự) | ⚒ một phần (đã có duyệt/từ chối + lý do) |
| Tiếp tục khi gián đoạn | trong **24 giờ** kể từ lúc bắt đầu; quá hạn → ABANDONED, tính một lượt | ✎ đang 72 giờ |
| Làm lại khi không đạt | sau **7 ngày** | ✔ |
| Số lượt | tối đa 3 lượt; hết lượt cần admin mở khoá | ✔ |
| Xin nâng cấp | mentor đã duyệt được phỏng vấn lại để nâng cấp sau **90 ngày** kể từ lần đổi cấp hoặc lần xin nâng cấp gần nhất. Không tính vào 3 lượt / chờ 7 ngày; chỉ duyệt lên cấp cao hơn; không đạt → giữ APPROVED + cấp cũ; trong lúc chờ duyệt vẫn nhận đặt lịch (chốt 23/10/2026) | ✔ |
| Dấu hiệu bất thường | cờ của AI (trả lời quá nhanh, trùng mẫu…) → hàng chờ admin xem xét, không tự từ chối | ✔ (US-23 flags) |

---

## 4. Học phí

| Cấp | Khung giá / buổi 60 phút |
|---|---|
| Junior | 100.000 – 200.000 đ |
| Senior | 200.000 – 400.000 đ |
| Expert | 400.000 – 700.000 đ |

- Buổi học thường **cố định 60 phút**. Mentor chọn giá theo bước **10.000 đ** trong khung (⚒ — hiện `hourlyRate` 0 – 100 triệu).
- Đổi giá lúc nào cũng được, chỉ áp dụng cho **yêu cầu đặt mới**. Buổi đã gửi yêu cầu (kể cả đang chờ mentor
  xác nhận) giữ giá lúc đặt.
- **Đổi cấp độ**: nếu giá hiện tại nằm ngoài khung mới, hệ thống tự kẹp về biên gần nhất của khung mới và báo
  mentor. Buổi đã đặt không đổi giá.
- **Đổi mentor**: huỷ buổi cũ theo chính sách huỷ (mục 7) rồi đặt buổi mới theo giá mentor mới; không bù chênh lệch.
- Khung giá là giả định; nhóm khảo sát xong thì chỉ cần sửa cấu hình.

---

## 5. Đặt lịch

| Nội dung | Chốt | Hiện tại |
|---|---|---|
| Đặt trước tối thiểu | **3 giờ** trước giờ bắt đầu | ✎ đang 1 giờ |
| Đặt xa nhất | 60 ngày | ✔ |
| Giữ chỗ khi ví không đủ tiền | **15 phút** để nạp; hết hạn → nhả khung giờ | ✎ đang 30 phút (giữ chỗ chờ thanh toán) |
| Hạn mentor xác nhận | **sớm hơn** trong hai mốc: 24 giờ sau khi gửi, hoặc 1 giờ trước giờ bắt đầu | ✎ đang 72 giờ |
| Quá hạn / mentor từ chối | huỷ, hoàn 100% khoản tạm giữ, gợi ý 3 mentor tương tự | ✔ một phần (US-15 gợi ý) |
| Số yêu cầu chờ của một mentee | tối đa 3 | ✔ |
| Mentor đầy chỗ | đạt `capacity` → tự dừng nhận yêu cầu mới, ẩn khỏi đề xuất | ✔ |
| Dời lịch | giữ cơ chế hiện có: hai bên đồng ý, đề xuất ≥ 2 giờ trước giờ bắt đầu, tối đa 2 lần/buổi | ✔ |

**Luồng**: chọn mentor + khung giờ → kiểm tra trùng lịch → kiểm tra số dư → **tạm giữ học phí** (mục 8.3) →
gửi yêu cầu → mentor xác nhận → buổi `CONFIRMED`.
Mỗi buổi đều phải được mentor xác nhận. Lần đầu với một mentor, mentee điền mẫu mục tiêu (US-14).

---

## 6. Tham gia, hoàn thành, vắng mặt

Học trực tuyến diễn ra **trong phòng học của hệ thống** (mục 11). Hệ thống ghi lại thời điểm từng bên vào phòng,
và đó là căn cứ duy nhất để xác định vắng mặt.

| Nội dung | Chốt | Hiện tại |
|---|---|---|
| Mở phòng | 10 phút trước giờ bắt đầu, đóng 30 phút sau giờ kết thúc | ⚒ |
| Thời gian chờ | **10 phút** (buổi trải nghiệm: **5 phút**) sau giờ bắt đầu | ⚒ |
| Báo vắng mặt | bên có mặt bấm "Bên kia vắng mặt" sau thời gian chờ; hệ thống đối chiếu nhật ký vào phòng | ⚒ |
| Tự hoàn thành | **24 giờ** sau giờ kết thúc nếu không có báo cáo vắng mặt hay khiếu nại | ✎ đang 48 giờ (US-12) |

| Tình huống | Mentee | Mentor | Ghi chú |
|---|---|---|---|
| Hai bên có mặt | trả 100% | nhận giá − hoa hồng | |
| Mentor vắng | hoàn 100% | 0 + 1 lỗi vi phạm | |
| Mentee vắng | **không hoàn** | nhận giá − hoa hồng | |
| Cả hai vắng | hoàn 100% | 0, không tính lỗi vi phạm | ghi nhận để admin theo dõi |
| Hai bên báo ngược nhau | tạm giữ, chuyển admin | tạm giữ | xử lý như khiếu nại |

**Lỗi vi phạm của mentor**: 3 lỗi (vắng mặt hoặc huỷ) trong 30 ngày → hồ sơ `PAUSED` và báo admin ✔ (US-02).

---

## 7. Chính sách huỷ buổi

| Ai huỷ | Thời điểm | Mentee được hoàn | Mentor nhận |
|---|---|---|---|
| Mentee | trước khi mentor xác nhận | 100% | 0 |
| Mentee | ≥ **24 giờ** trước giờ bắt đầu | 100% | 0 |
| Mentee | từ **4 giờ** đến dưới 24 giờ trước | **50%** | 50% giá − hoa hồng trên 50% đó |
| Mentee | < 4 giờ trước, hoặc vắng mặt | 0% | giá − hoa hồng |
| Mentor | bất kỳ lúc nào | 100% | 0 + 1 lỗi vi phạm |
| Hệ thống / admin | bất kỳ (khoá tài khoản, mentor không xác nhận…) | 100% | 0 |

- Buổi trải nghiệm: mentee huỷ ≥ 2 giờ trước → hoàn 100%; muộn hơn → 0%.
- **Bỏ** điểm xin lỗi khi mentor huỷ (20 điểm) và **bỏ** cơ chế chặn huỷ muộn phiên miễn phí, vì không còn buổi miễn phí.
- Hiện tại: ≥ 72 giờ hoàn 100%, còn lại 0% → ✎ đổi mốc + ⚒ thêm bậc 50%.

---

## 8. Ví

### 8.1 Cấu trúc

- Mỗi người dùng một ví VND. Số dư có hai phần: **tiền nạp** (tiền thật) và **tiền khuyến mãi** (thưởng giới thiệu,
  khuyến mãi do admin cấp).
- Trạng thái của tiền: **khả dụng** · **tạm giữ** (đang gắn với một buổi) · **đóng băng** (tài khoản bị khoá).
- Mentor nhận thu nhập vào **sổ thu nhập** riêng (đã có, US-25), không vào ví chi tiêu.

### 8.2 Nạp tiền

| Nội dung | Chốt |
|---|---|
| Kênh | sandbox (mặc định) / MoMo test / VNPay sandbox (đã có US-56, chuyển mục đích sang nạp ví) |
| Mỗi lần nạp | tối thiểu 50.000 đ, tối đa 5.000.000 đ |
| Trần tiền nạp khả dụng | 20.000.000 đ |
| Giao dịch lỗi / huỷ / trùng IPN | không đổi số dư (idempotent theo mã giao dịch cổng) |

### 8.3 Trả học phí

- Khi đặt lịch, học phí chuyển từ khả dụng sang tạm giữ: **tiền khuyến mãi trừ trước**, thiếu bao nhiêu thì trừ
  tiền nạp. Hệ thống ghi lại phần nào đến từ nguồn nào.
- Hoàn tiền buổi học (huỷ, vắng, khiếu nại): trả về **đúng nguồn đã trừ**, theo tỷ lệ. Nếu tiền khuyến mãi đã hết
  hạn trong lúc tạm giữ, phần đó hoàn lại với hạn mới là 30 ngày.
- Buổi hoàn thành: khoản tạm giữ được tất toán, chia cho mentor và nền tảng (mục 9).

### 8.4 Hoàn tiền nạp về nguồn thanh toán

- Chỉ áp dụng cho **tiền nạp**, trong **7 ngày** kể từ lần nạp gần nhất.
- Số tiền hoàn tối đa là giá trị **nhỏ hơn** giữa (a) tiền nạp đang khả dụng (không tính tạm giữ, không tính khuyến mãi)
  và (b) tổng tiền nạp trong 7 ngày gần nhất.
- Hoàn vào các giao dịch nạp **mới nhất trước**, qua API hoàn tiền của cổng (sandbox xử lý ngay).
- Tối đa **2 yêu cầu/tháng**; các trường hợp khác do admin xử lý thủ công, có ghi lý do.
- Người học không rút tiền tự do (ngoài phạm vi).

### 8.5 Thời hạn số dư

- **Tiền khuyến mãi**: mỗi khoản hết hạn sau 12 tháng kể từ lúc cấp, dùng khoản sắp hết hạn trước. Hết hạn thì bị
  trừ khỏi ví (có ghi bút toán).
- **Tiền nạp**: không bị tịch thu. Ví **không phát sinh giao dịch 12 tháng** thì tiền nạp chuyển sang "ngủ"; người
  dùng bấm "Kích hoạt lại" là dùng tiếp, không cần admin. Cách này đáp ứng yêu cầu "số dư có thời hạn" mà không
  chiếm tiền thật của người học.
- Nhắc trước **30 ngày** và 7 ngày (thông báo trong hệ thống + email).

---

## 9. Hoa hồng và thu nhập mentor

| Nội dung | Chốt | Hiện tại |
|---|---|---|
| Hoa hồng nền tảng | **15%**, một mức cho mọi buổi (kể cả buổi trải nghiệm), chốt vào bút toán lúc tất toán | ✔ 15% |
| Thời gian chờ thu nhập | **72 giờ** sau khi buổi `COMPLETED` → khả dụng | ✎ đang 48 giờ |
| Khiếu nại | mentee mở được cho đến khi thu nhập khả dụng (tối đa giờ kết thúc + 24 giờ + 72 giờ); khiếu nại đang mở → thu nhập bị giữ đến khi admin kết luận | ✎ đang mở trong 7 ngày (US-32) |
| Nhận tiền | tối thiểu 200.000 đ, một yêu cầu mở cùng lúc, phải có tài khoản ngân hàng, admin đánh dấu đã chuyển | ✔ (US-42) |

Làm tròn: hoa hồng làm tròn xuống đến đồng, phần lẻ thuộc mentor.

---

## 10. Buổi trải nghiệm

| Nội dung | Chốt |
|---|---|
| Thời lượng | 15 phút |
| Phí | **30.000 đ** cố định toàn nền tảng, không phụ thuộc cấp độ |
| Giới hạn | mỗi cặp mentee–mentor 1 lần; mỗi mentee tối đa 3 buổi trải nghiệm chưa diễn ra |
| Mentor | bật/tắt nhận buổi trải nghiệm (mặc định bật) |
| Quy trình | như buổi thường: tạm giữ từ ví, mentor xác nhận, phòng học trong hệ thống, hoa hồng 15% |
| Đánh giá | **không** chấm sao, không tính vào điểm uy tín; sau buổi chỉ hỏi "Bạn có muốn học tiếp với mentor này?" |
| Sau buổi | nút "Đặt buổi học" với mentor đó |

Nhánh `feature/mentoring-intro-reschedule-packages` đã có buổi làm quen 15 phút → dùng lại phần lịch, bổ sung thu phí.

---

## 11. Giới thiệu người học

| Nội dung | Chốt | Hiện tại |
|---|---|---|
| Ai có mã | mentee đã **hoàn thành ít nhất 1 buổi thường đã thanh toán** với mentor M → có một mã riêng cho M | ⚒ đang một mã cho mỗi người dùng |
| Ai được dùng | tài khoản mentee **chưa từng hoàn thành buổi nào với M**, không phải người giới thiệu | ⚒ |
| Khi nào dùng | nhập lúc gửi **yêu cầu đặt buổi thường đầu tiên** với M; người mới **không** được giảm giá | ⚒ |
| Điều kiện thưởng | buổi đó `COMPLETED`, đã thanh toán, rồi qua **7 ngày** mà không bị hoàn tiền | ⚒ |
| Thưởng | **30.000 đ tiền khuyến mãi** cho người giới thiệu | ✎ đang 100 điểm |
| Giới hạn | tối đa 5 lượt thưởng/tháng/người giới thiệu (150.000 đ); vượt trần vẫn ghi nhận nhưng không thưởng | ✎ đang 5 lượt/ngày |
| Bất thường | > 3 lượt dùng mã trong 24 giờ, hoặc người giới thiệu và người được giới thiệu trùng tài khoản nhận tiền / thiết bị → chuyển admin, thưởng giữ lại | ⚒ |

Mã không hợp lệ, tự giới thiệu hoặc người đã học với M thì bị báo lỗi ngay lúc nhập; việc đặt lịch vẫn tiếp tục
nếu người dùng bỏ mã.

---

## 12. Học liệu, thông báo, phòng học, chống giao dịch ngoài

| Nội dung | Chốt | Hiện tại |
|---|---|---|
| Học liệu | khoá học / lộ trình, đánh dấu tiến độ; tiến độ đã ghi được giữ lại kể cả khi học liệu bị gỡ | ✔ learning-service |
| Nhắc lịch | **24 giờ và 15 phút** trước giờ bắt đầu; dời hoặc huỷ lịch thì nhắc lại theo lịch mới | ✎ đang 24 giờ và 1 giờ |
| Kênh thông báo | trong hệ thống (luôn có) + email (nếu email lỗi thì vẫn còn thông báo trong hệ thống) | ✔ (US-38 outbox) |
| Phòng học | gọi video + chat trong hệ thống; **Jitsi Meet tự host** (docker) xác thực bằng JWT do mentoring-service cấp, chỉ người tham gia buổi lấy được token; rớt mạng thì vào lại bằng token cũ trong giờ phòng mở | ⚒ đang dùng link họp ngoài do mentor dán |
| Chặn thông tin liên hệ | tin nhắn **luôn** che số điện thoại, email, tài khoản mạng xã hội và đường dẫn ngoài; mỗi lần bị che ghi một vi phạm; 3 vi phạm/30 ngày → báo admin | ✎ hiện chỉ che đến buổi trả phí đầu tiên |
| Đánh giá | chỉ buổi thường `COMPLETED`, mỗi buổi một lượt, trong 14 ngày, được sửa trong 48 giờ | ✔ (US-41) |

---

## 13. Ngoài phạm vi

- Người học rút tiền tự do, xác minh danh tính (KYC), chống gian lận chuyên sâu.
- Hoa hồng thay đổi theo số buổi, gói đăng ký định kỳ cho mentor.
- **Gói buổi giảm giá (combo 4/8 buổi)** ở nhánh `feature/mentoring-intro-reschedule-packages` — **không merge** phần
  gói, chỉ lấy buổi làm quen và chính sách dời lịch.
- Thanh toán tiền thật, lớp học nhóm, ứng dụng di động.
- Bộ lọc "miễn phí" trong đề xuất mentor (không còn buổi miễn phí).
- Phỏng vấn giọng nói (mục 16): ghi âm/ghi hình và phát lại cho admin, luyện phỏng vấn có phí ngoài lượt miễn phí, đưa buổi luyện
  vào lịch sử của mentoring-service, đánh giá chất lượng tiếng Việt của OpenAI Realtime so với ElevenLabs.

---

## 14. Bảng thông số tổng hợp

| Khoá cấu hình (đề xuất) | Giá trị | Service |
|---|---|---|
| `login-protection.max-failed-attempts` / `block-duration` | 5 / PT15M | auth |
| `password-reset.ttl` | PT15M | auth |
| `interview.resume-window` / `cooldown` / `max-attempts` | PT24H / P7D / 3 | ai |
| `interview.tier-thresholds` | 60 / 75 / 88 | ai |
| `VOICE_INTERVIEW_TOPICS` / `VOICE_SESSION_MINUTES` / `PRACTICE_FREE_LIMIT` | 4 / 30 / 1 | ai |
| `OPENAI_REALTIME_MODEL` / `OPENAI_REALTIME_VOICE` / `OPENAI_TRANSCRIBE_MODEL` | `gpt-realtime` / `marin` / `gpt-4o-transcribe` | ai |
| `pricing.tiers` | JUNIOR 100k–200k · SENIOR 200k–400k · EXPERT 400k–700k, bước 10k | profile |
| `booking.min-lead-time` / `max-advance` | PT3H / P60D | mentoring |
| `booking.insufficient-balance-hold` | PT15M | mentoring |
| `requests.confirm-within` / `confirm-before-start` | PT24H / PT1H | mentoring |
| `attendance.grace` / `grace-trial` / `auto-complete-after` | PT10M / PT5M / PT24H | mentoring |
| `cancellation.full-refund-before` / `half-refund-before` | PT24H / PT4H | mentoring |
| `trial.duration` / `fee` / `full-refund-before` | 15 phút / 30.000 / PT2H | mentoring |
| `reminders.before` | PT24H, PT15M | mentoring |
| `strikes.threshold` / `window` | 3 / P30D | mentoring |
| `payment.platform-fee-rate` | 0.15 | payment |
| `earnings.release-delay` | PT72H | payment |
| `payout.min-amount` | 200.000 | payment |
| `wallet.topup-min` / `topup-max` / `cash-cap` | 50.000 / 5.000.000 / 20.000.000 | payment |
| `wallet.refund-window` / `refund-requests-per-month` | P7D / 2 | payment |
| `wallet.promo-expiry` / `dormant-after` / `expiry-reminders` | P12M / P12M / P30D, P7D | payment |
| `referral.reward` / `pending` / `monthly-cap` | 30.000 / P7D / 5 | payment |

---

## 15. Tác động lên code (để lập sprint)

| # | Việc | Service | Cỡ |
|---|---|---|---|
| 1 | Ví: bút toán, nạp ví qua cổng, tạm giữ/tất toán/hoàn theo nguồn, hoàn về nguồn 7 ngày, hết hạn và trạng thái "ngủ" | payment | L |
| 2 | Đặt lịch trả bằng ví (thay checkout trực tiếp), giữ chỗ 15 phút khi thiếu tiền | mentoring, payment, frontend | M |
| 3 | Cấp độ mentor + khung giá + gán cấp lúc duyệt phỏng vấn | ai, profile, frontend | M |
| 4 | Chính sách huỷ 3 bậc, bỏ phiên miễn phí và điểm xin lỗi | mentoring, matching | S |
| 5 | Phòng học Jitsi + nhật ký vào phòng + quy tắc vắng mặt + tự hoàn thành 24 giờ | mentoring, frontend, docker-compose | L |
| 6 | Buổi trải nghiệm có phí (dựa trên nhánh intro) | mentoring, frontend | M |
| 7 | Giới thiệu theo cặp mentor, thưởng tiền khuyến mãi chờ 7 ngày, trần theo tháng | payment, mentoring | M |
| 8 | Đổi thông số (mục 14) + luôn che thông tin liên hệ | tất cả | S |
| 9 | Admin khoá mentee + đóng băng ví | auth, mentoring, payment | S |
| 10 | Cập nhật SRD, business-domain, database-design, api-reference, contracts theo bản này | docs | M |
| 11 | Phỏng vấn giọng nói cho mentor + luyện phỏng vấn với AI cho mentee (mục 16; migration ai `010_voice_interviews.sql`) | ai, frontend, contracts | M |

---

## 16. Phỏng vấn giọng nói và luyện phỏng vấn với AI (v2.1 — chốt 23/10/2026)

Giọng nói chạy bằng **OpenAI Realtime** (speech-to-speech, WebRTC trực tiếp từ trình duyệt). AI giọng nói **chỉ dẫn dắt
cuộc hỏi**; chấm điểm vẫn do engine hiện có (DeepSeek / rule-based) trên bản chép lời. Lý do chọn: SRD D21.

### 16.1 Phỏng vấn xác thực mentor bằng giọng nói

| Nội dung | Chốt | Hiện tại |
|---|---|---|
| Chọn chế độ | trên `/interview` mentor chọn **chat** (như cũ) hoặc **giọng nói**; trang thử nghiệm `/interview/voice` bị gỡ | ⚒ |
| Quy tắc chung với chat | 3 lượt, chờ 7 ngày khi không đạt, xin nâng cấp sau 90 ngày, admin duyệt, cùng rubric và trọng số | ✔ dùng lại |
| Tiếp tục khi gián đoạn | **không** áp dụng 24 giờ — buổi giọng nói là một lần ngồi. Rớt cuộc gọi trong **30 phút** đầu thì vào lại cùng buổi (client secret mới); quá 30 phút chưa gửi bản chép lời → `ABANDONED`, **tính một lượt** | ⚒ |
| Số chủ đề | 4 chủ đề (`VOICE_INTERVIEW_TOPICS`). **AI soạn** (DeepSeek, một lần lúc bắt đầu, chốt 23/10/2026): 3 chủ đề kỹ thuật cốt lõi của lĩnh vực — đúng một chủ đề đào sâu dự án của chính mentor nếu CV / giới thiệu có dự án — cùng độ khó cho mọi mentor; chủ đề "năng lực hướng dẫn" **luôn lấy từ ngân hàng câu hỏi** để điểm giữa các mentor so sánh được. Không có DeepSeek / AI soạn lỗi → ngân hàng câu hỏi theo lĩnh vực | ⚒ |
| Phản hồi cho mentor | như chat: chỉ thấy nhận xét từng câu sau khi admin quyết định | ✔ |
| Admin | trang duyệt có nhãn "Giọng nói", xem các lượt (đã gộp theo chủ đề) như hiện nay | ⚒ |
| Ghi âm | **không** lưu âm thanh ở bản này (bước tiếp theo) | — |

### 16.2 Luyện phỏng vấn với AI (mentee)

| Nội dung | Chốt | Hiện tại |
|---|---|---|
| Ai dùng | mentee; chọn loại (BACKEND / FRONTEND / SYSTEM_DESIGN / BEHAVIORAL), cấp độ (INTERN / FRESHER / JUNIOR), vị trí ứng tuyển (2–120 ký tự), công ty (tuỳ chọn, ≤ 120 ký tự) | ⚒ |
| Lượt miễn phí | **1 lượt mỗi mentee, trọn đời** (`PRACTICE_FREE_LIMIT = 1`) | ⚒ |
| Câu hỏi | **AI soạn riêng** (DeepSeek, một lần lúc bắt đầu) từ loại, cấp độ, vị trí, công ty, mục tiêu trong hồ sơ và CV đã xác nhận: đúng một câu về dự án trong CV (nếu có), ít nhất một câu gắn mục tiêu / công việc nhắm tới (nếu có). Không có DeepSeek / AI soạn lỗi → `practice_bank` theo loại × cấp độ | ⚒ |
| Thế nào là "đã dùng" | buổi luyện chuyển `COMPLETED` (đã nộp bản chép lời và chấm xong) **hoặc** `ABANDONED` (bỏ dở quá 30 phút). Buổi đang làm chưa tính | ⚒ |
| Tiếp tục | buổi `IN_PROGRESS` dưới **30 phút** → vào lại cùng buổi với client secret mới; quá 30 phút → `ABANDONED` (đã dùng lượt). Mỗi mentee tối đa **một** buổi `IN_PROGRESS` | ⚒ |
| Hết lượt | 409 `PRACTICE_FREE_USED` + nút "Đặt phỏng vấn thử với mentor" (luồng phỏng vấn thử với mentor đã có, US-58). Luyện có phí: **chưa chốt** (câu hỏi mở) | ⚒ |
| Kết quả | trả **ngay** cho mentee: nhận xét từng câu, 3 điểm mạnh, 3 điểm cần cải thiện (danh sách việc cần làm dạng văn bản), điểm tổng 0–100 | ⚒ |
| Báo cáo nói | số từ đệm ("ừm", "à", "ờ", "uh", "um", "kiểu như", "thì là"), số từ trung bình mỗi câu trả lời, số câu trả lời dưới 20 từ | ⚒ |
| Người duyệt | không có; buổi luyện không ảnh hưởng hồ sơ, matching hay lịch sử mentoring | — |

### 16.3 Đồng ý xử lý âm thanh

- Âm thanh được OpenAI (Mỹ) xử lý → trước khi bắt đầu, người dùng **bắt buộc tick** ô đồng ý; thiếu → 400 `VOICE_CONSENT_REQUIRED`.
- Giá trị đồng ý lưu trên chính bản ghi (`consent_external_ai`). Hệ thống chỉ lưu **bản chép lời**, không lưu âm thanh.
- Câu hỏi chỉ dựa vào CV khi CV đó đã được người dùng **xác nhận** và **đồng ý gửi AI bên ngoài** (US-19); khi đó các trường
  đã xác nhận (vai trò, kỹ năng, dự án, học vấn) được gửi tới DeepSeek để soạn câu hỏi và nằm trong lời dặn gửi OpenAI.
- Chưa cấu hình `OPENAI_API_KEY`: production báo 503 `VOICE_UNAVAILABLE`, không tạo buổi, không tính lượt; giao diện hiện
  "Phỏng vấn giọng nói chưa được bật".

### 16.4 So sánh mentor và mentee

| | Phỏng vấn xác thực mentor | Luyện phỏng vấn của mentee |
|---|---|---|
| Mục đích | xác thực năng lực, gán cấp độ | luyện nói trong một buổi phỏng vấn thật |
| Vai AI đóng | người xác thực của MentorHub | người phỏng vấn tuyển dụng cho vị trí và cấp độ mentee chọn |
| Câu hỏi | AI soạn theo lĩnh vực (+ 1 câu về dự án của mentor), "năng lực hướng dẫn" cố định từ `question_bank`; dự phòng `question_bank` | AI soạn theo loại × cấp độ + CV + mục tiêu; BEHAVIORAL hỏi theo STAR; dự phòng `practice_bank` |
| Rubric (mỗi tiêu chí 0–10) | kỹ thuật 40 · chiều sâu 30 · giao tiếp 15 · hướng dẫn 15 | kỹ thuật 35 · giải quyết vấn đề & chiều sâu 25 · diễn đạt rõ ràng 25 · cấu trúc (STAR / cách tiếp cận) 15 |
| Phản hồi | ẩn đến khi admin quyết định | hiện ngay + báo cáo nói |
| Con người | admin quyết định | không; gợi ý đặt phỏng vấn thử với mentor |
| Giới hạn | 3 lượt, chờ 7 ngày | 1 lượt miễn phí trọn đời |
| Bỏ dở | > 30 phút → `ABANDONED`, tính một lượt | > 30 phút → `ABANDONED`, đã dùng lượt miễn phí |

### 16.5 Ngoài phạm vi (câu hỏi mở)

- Ghi âm/ghi hình buổi phỏng vấn và phát lại cho admin.
- Luyện phỏng vấn có phí ngoài lượt miễn phí (giá, kênh trả bằng ví).
- Đưa buổi luyện vào lịch sử của mentoring-service.
- Đánh giá chất lượng tiếng Việt của OpenAI Realtime so với ElevenLabs.
