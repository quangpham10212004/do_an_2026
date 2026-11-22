// Nhiều lĩnh vực cho mentor (tối đa MAX_MENTOR_DOMAINS). Mỗi lĩnh vực được xác thực riêng.

export const MAX_MENTOR_DOMAINS = 3;

/** VERIFIED: đã xác thực, hiện công khai. PENDING: đang qua CV / phỏng vấn AI / kết quả. REJECTED: chưa đạt hoặc bị từ chối. */
export type DomainVerificationState = "VERIFIED" | "PENDING" | "REJECTED";

export type DomainStepState = "DONE" | "CURRENT" | "TODO";

export interface DomainStep {
  key: "CV" | "TEST" | "VIDEO" | "ADMIN";
  label: string;
  state: DomainStepState;
  /** Ghi chú ngắn, vd. "Đạt · 82%" hoặc "Hạn nộp 27/11". */
  note?: string;
}

export interface MentorDomain {
  /** Mã lĩnh vực, khớp DOMAINS ở features/profile/api (vd. "backend"). */
  domain: string;
  state: DomainVerificationState;
  /** Lĩnh vực chính (chỉ một, phải đã xác thực). */
  primary: boolean;
  addedAt: string;
  verifiedAt?: string | null;
  /** Mô tả ngắn / kỹ năng của lĩnh vực này. */
  summary?: string | null;
  hourlyRate?: number | null;
  sessionsTaught?: number | null;
  rating?: number | null;
  /** Các bước xác thực khi PENDING. */
  steps?: DomainStep[];
  /** Lý do / ghi chú khi REJECTED. */
  rejectedReason?: string | null;
  /** Ngày được làm lại (ISO) khi REJECTED. */
  retryAt?: string | null;
}

export interface MentorDomainsResponse {
  domains: MentorDomain[];
  max: number;
}

export interface AddDomainInput {
  domain: string;
  /** CV mới tập trung vào lĩnh vực này (PDF/DOCX, tối đa 5 MB). Bỏ trống = dùng lại CV hiện tại. */
  cv?: File | null;
}
