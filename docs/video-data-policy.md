# Chính sách dữ liệu video — MentorHub

Vòng 1 xác thực mentor bắt buộc **camera**. Video là dữ liệu cá nhân nhạy cảm, nên tài liệu này mô tả **chính xác những gì mã nguồn đang làm** và ghi rõ
những gì **chưa hiện thực**, theo khuôn [cv-data-policy.md](cv-data-policy.md). Thiết kế gốc: [design-mentor-verification.md](design-mentor-verification.md) §5.

> Nguồn đối chiếu: `ai-service/migrations/014_interview_videos.sql`, `app/verification/media_storage.py`, `video_service.py`, `video_rules.py`,
> `video_repository.py`, `app/routers/verification.py`, `app/config.py`, `docker-compose.yml`; frontend `features/ai/useRealtimeVoice.ts`, `VideoCard.tsx`.

## 1. Tóm tắt

| Câu hỏi | Trả lời ngắn | Trạng thái |
|---|---|---|
| Quay gì? | Hai luồng từ cùng camera + micro: (a) video có tiếng cho admin xem; (b) **chỉ âm thanh**, nhỏ, để server chép lời lại | ✅ |
| Có phân tích khuôn mặt không? | **Không.** Video không đưa cho LLM nào, không có thị giác máy tính (D5). Cờ camera chỉ suy ra từ khoảng trống giữa các đoạn tải lên | ✅ |
| Phải được đồng ý không? | Có: `consentVideo` bắt buộc khi bắt đầu (400 `VIDEO_CONSENT_REQUIRED`), tách khỏi `consentExternalAi` (âm thanh được OpenAI xử lý) | ✅ |
| Lưu ở đâu? | File trên volume Docker **`verification-media`** (`VERIFICATION_STORAGE_DIR=/data/verification`), không dùng chung với `cv-storage`; metadata, cờ, hai bản chép lời trong bảng `interview_videos` của `ai_db` | ✅ |
| Lưu bao lâu? | **60 ngày** kể từ lúc chốt video (`VIDEO_RETENTION_DAYS`); job nền xoá file và đánh dấu `deleted_at` | ✅ |
| Ai xem được? | **Admin** xem và xoá được mọi video; **mentor** chỉ xem video của chính mình, không xoá được; người khác không truy cập được | ✅ |
| Phát video thế nào? | Qua endpoint có kiểm quyền, token JWT ngắn hạn (10 phút) gắn video + người dùng, hỗ trợ `Range`. Không có đường dẫn file công khai | ✅ |
| Có nhật ký không? | Có: mỗi lần admin lấy link xem (`VIDEO_VIEWED`), xoá (`VIDEO_DELETED`) và hết hạn tự xoá (`VIDEO_EXPIRED`) ghi vào audit log (auth-service) | ✅ |
| Mã hoá khi lưu? | Không — file lưu dạng rõ trên volume | ❌ chưa hiện thực |
| Object storage? | Chưa; khi triển khai thật nên chuyển sang S3/MinIO có mã hoá và vòng đời | ❌ chưa hiện thực |

## 2. Dữ liệu được lưu

- **Đoạn video/âm thanh**: trình duyệt cắt đoạn mỗi 10 giây (`MediaRecorder`), tải `PUT /api/ai/verification/videos/{interviewId}/chunks/{n}` và
  `.../audio-chunks/{n}` (≤ 8 MB mỗi đoạn). Khi chốt (`POST .../finish`), server ghép thành `video.bin` và `audio.bin`; các đoạn rời bị xoá.
- **Bảng `interview_videos`** (một dòng mỗi buổi): đồng ý quay, MIME, danh sách đoạn (mốc thời gian, kích thước), kích thước tổng, thời lượng, `gap_detected`,
  `gap_total_seconds`, `flags` (`CAMERA_OFF`, `TRANSCRIPT_MISMATCH`), `server_transcript`, `transcript_diff`, `transcript_check` (`OK`/`MISMATCH`/`UNAVAILABLE`),
  `expires_at`, `deleted_at`, `deleted_by`.
- Kích thước tham khảo: 640×360, ~500 kbps → buổi 30 phút ≈ 110 MB video + ≈ 7 MB âm thanh. 100 mentor ≈ 11 GB trong 60 ngày (cần theo dõi ổ đĩa).

## 3. Âm thanh gửi cho bên thứ ba

Âm thanh buổi phỏng vấn đi tới **OpenAI (Mỹ)** ở hai chỗ: phiên Realtime (trình duyệt nối trực tiếp) và **chép lời lại phía server**
(`POST {OPENAI_BASE_URL}/audio/transcriptions` với luồng chỉ âm thanh). Cả hai nằm trong phần đồng ý `consentExternalAi`. **Video (hình ảnh) không bao giờ rời hệ thống.**

## 4. Chép lời kép và cờ

Server chép lời lại âm thanh rồi so với bản trình duyệt gửi (chuẩn hoá chữ thường, bỏ dấu câu, so theo từ). Khác biệt vượt `TRANSCRIPT_MISMATCH_THRESHOLD` (0,30, khởi đầu)
thì gắn cờ `TRANSCRIPT_MISMATCH`. Chép lời lại lỗi hoặc không có khoá OpenAI thì `UNAVAILABLE`, **không** gắn cờ và **không** chặn. Cờ chỉ là tín hiệu cho admin:
buộc khuyến nghị AI thành `NEEDS_REVIEW`, **không tự loại** mentor.

## 5. Xoá

- Admin xoá sớm: file bị xoá vĩnh viễn; bản ghi, cờ, hai bản chép lời và điểm vẫn giữ làm căn cứ.
- Hết 60 ngày: job `maintenance_forever` (10 phút/lần) xoá file như trên.
- **Chưa có** luồng mentor yêu cầu xoá dữ liệu của mình (chỉ admin xoá được) — cần bổ sung nếu áp dụng nghiêm ngặt quyền xoá dữ liệu cá nhân.

## 6. Việc phải kiểm bằng tay (chưa tự động hoá được)

- Quay camera 30 phút trên máy thật (Chrome, Edge, Safari), mạng yếu: mất đoạn, camera ngắt, kết nối lại. Camera chỉ chạy qua `https` hoặc `localhost`.
- File âm thanh ~7 MB `webm/opus` có được API chép lời chấp nhận không (giới hạn 25 MB); nếu không, cắt đoạn hoặc đổi định dạng.
- Rớt WebRTC giữa chừng nhưng camera vẫn sống: bản quay liên tục (một recorder). Camera bị ngắt thật rồi mở lại sẽ tạo thêm một đoạn WebM có header mới trong file ghép —
  phát lại tới hết đoạn đầu chắc chắn được, đoạn sau cần thử trên trình duyệt thật.
- Ngưỡng `TRANSCRIPT_MISMATCH_THRESHOLD` có báo nhầm nhiều không (hai lần nhận dạng giọng nói vốn khác nhau): hiệu chỉnh bằng dữ liệu thật.
