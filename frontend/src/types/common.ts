/** Kiểu dùng chung, suy ra từ contracts/*.yaml. Thời gian là chuỗi ISO-8601 (date-time). */
export type Uuid = string;
export type IsoDateTime = string;

/** Định dạng lỗi thống nhất (CONVENTIONS.md mục 3). */
export interface ErrorResponse {
  error: { code: string; message: string };
}

/** Trang kết quả phân trang (PageResponse<T> ở các service Java). */
export interface PageResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}
