/** Tạo và tải file CSV phía client (UTF-8 có BOM để Excel đọc đúng tiếng Việt). */
const cell = (v: string | number | null | undefined): string => {
  const s = v == null ? "" : String(v);
  // Chặn CSV injection: ô văn bản bắt đầu bằng = + - @ được thêm dấu nháy đơn (trừ số âm thuần).
  const risky = /^[=+@]/.test(s) || (/^-/.test(s) && !/^-\d+([.,]\d+)?$/.test(s));
  const safe = risky ? "'" + s : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]): void {
  const blob = new Blob(["﻿" + toCsv(header, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
