import type { VerifyOverview, VerifyTrack } from "@/types/verification";
import { domainLabel } from "@/features/profile/api";

const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

/**
 * Khớp tham số ?domain=<id> (mã lĩnh vực như "data", từ nút "Thi thêm lĩnh vực") với một chuỗi lĩnh vực của backend
 * (có thể là mã hoặc nhãn như "Backend Java"). So khớp không phân biệt hoa thường/dấu, chấp nhận chứa nhau.
 */
export function domainMatches(param: string, value: string): boolean {
  const p = norm(param);
  const v = norm(value);
  if (!p || !v) return false;
  const label = norm(domainLabel(param));
  return v === p || v === label || v.includes(p) || (label !== "" && v.includes(label)) || p.includes(v);
}

export function findTrackByDomain(tracks: VerifyTrack[], param: string | null | undefined): VerifyTrack | undefined {
  if (!param) return undefined;
  return tracks.find((t) => t.id === param) ?? tracks.find((t) => domainMatches(param, t.domain));
}

export function findAvailableDomain(o: VerifyOverview, param: string | null | undefined): string | undefined {
  if (!param) return undefined;
  return o.availableDomains.find((d) => domainMatches(param, d));
}
