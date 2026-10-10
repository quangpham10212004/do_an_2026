"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Button, Card, CardBody, CardFooter, Checkbox, Chip, Chips, Field, Input, Select } from "@/components/ui";
import { LANGUAGE_LABELS, SESSION_TYPE_LABELS, TIME_OF_DAY_LABELS } from "@/features/profile/api";
import type { LanguageCode, MatchFilterName, MatchFilterValues, SessionType, TimeOfDay } from "@/types";

const SHORT_DAYS = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const RATINGS = [3, 4, 4.5];

export const NO_FILTERS: MatchFilterValues = {
  maxRate: null, days: [], timeOfDay: null, language: [], sessionType: null, minRating: null, freeOnly: false,
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

/** Bỏ một bộ lọc ("Nới điều kiện") — chỉ cho lượt tìm hiện tại, không đổi hồ sơ. */
export function dropFilter(filters: MatchFilterValues, name: MatchFilterName): MatchFilterValues {
  return { ...filters, [name]: NO_FILTERS[name] };
}

/** Mô tả ngắn một bộ lọc, ví dụ "giá ≤ 150.000đ" — dùng trong thông báo "N mentor bị loại bởi ...". */
export function describeFilter(name: MatchFilterName, f: MatchFilterValues): string {
  switch (name) {
    case "maxRate":
      return `giá ≤ ${(f.maxRate ?? 0).toLocaleString("vi-VN")}đ`;
    case "days":
      return `ngày ${f.days.map((d) => SHORT_DAYS[d]).join(", ")}`;
    case "timeOfDay":
      return f.timeOfDay ? TIME_OF_DAY_LABELS[f.timeOfDay].toLowerCase() : "buổi học";
    case "language":
      return `ngôn ngữ ${f.language.map((l) => LANGUAGE_LABELS[l]).join(" / ")}`;
    case "sessionType":
      return f.sessionType ? `loại phiên ${SESSION_TYPE_LABELS[f.sessionType]}` : "loại phiên";
    case "minRating":
      return `đánh giá ≥ ${f.minRating}`;
    case "freeOnly":
      return "chỉ mentor miễn phí";
  }
}

/** Bộ lọc loại nhiều mentor nhất (để gợi ý nới); null nếu không bộ lọc nào loại ai. */
export function biggestBlocker(excludedBy: Partial<Record<MatchFilterName, number>>): [MatchFilterName, number] | null {
  let best: [MatchFilterName, number] | null = null;
  for (const [name, n] of Object.entries(excludedBy) as [MatchFilterName, number][]) {
    if (n > 0 && (!best || n > best[1])) best = [name, n];
  }
  return best;
}

interface Props {
  value: MatchFilterValues;
  fromProfile: MatchFilterName[];
  busy: boolean;
  onSearch: (filters: MatchFilterValues) => void;
  onUseProfile: () => void;
}

/** US-18 — thanh lọc trên /matching, điền sẵn bộ lọc hiệu lực (gồm sở thích hồ sơ). Không lưu vào hồ sơ. */
export default function MatchingFilters({ value, fromProfile, busy, onSearch, onUseProfile }: Props) {
  const [f, setF] = useState<MatchFilterValues>(value);
  const [rate, setRate] = useState(value.maxRate === null ? "" : String(value.maxRate));

  useEffect(() => {
    setF(value);
    setRate(value.maxRate === null ? "" : String(value.maxRate));
  }, [value]);

  const tag = (name: MatchFilterName) => (fromProfile.includes(name) ? <span className="ml-1 font-normal text-ink-subtle">· từ hồ sơ</span> : null);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSearch({ ...f, maxRate: rate.trim() === "" ? null : Math.max(0, Number(rate)) });
  }

  return (
    <form onSubmit={submit}>
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={<>Giá tối đa (đ/giờ){tag("maxRate")}</>} id="mf-rate">
              <Input id="mf-rate" type="number" min={0} step={10000} value={rate} placeholder="Không giới hạn" onChange={(e) => setRate(e.target.value)} />
            </Field>
            <Field label={<>Buổi{tag("timeOfDay")}</>} id="mf-time">
              <Select id="mf-time" value={f.timeOfDay || ""} onChange={(e) => setF({ ...f, timeOfDay: (e.target.value || null) as TimeOfDay | null })}>
                <option value="">Giờ nào cũng được</option>
                {(Object.keys(TIME_OF_DAY_LABELS) as TimeOfDay[]).map((t) => <option key={t} value={t}>{TIME_OF_DAY_LABELS[t]}</option>)}
              </Select>
            </Field>
            <Field label="Loại phiên" id="mf-type">
              <Select id="mf-type" value={f.sessionType || ""} onChange={(e) => setF({ ...f, sessionType: (e.target.value || null) as SessionType | null })}>
                <option value="">Mọi loại phiên</option>
                {(Object.keys(SESSION_TYPE_LABELS) as SessionType[]).map((t) => <option key={t} value={t}>{SESSION_TYPE_LABELS[t]}</option>)}
              </Select>
            </Field>
            <Field label="Đánh giá tối thiểu" id="mf-rating">
              <Select id="mf-rating" value={f.minRating ?? ""} onChange={(e) => setF({ ...f, minRating: e.target.value === "" ? null : Number(e.target.value) })}>
                <option value="">Không yêu cầu</option>
                {RATINGS.map((r) => <option key={r} value={r}>Từ {r} sao</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
            <Field label={<>Ngày{tag("days")}</>}>
              <Chips>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <Chip key={d} selected={f.days.includes(d)} onClick={() => setF({ ...f, days: toggle(f.days, d).sort((a, b) => a - b) })}>{SHORT_DAYS[d]}</Chip>
                ))}
              </Chips>
            </Field>
            <Field label={<>Ngôn ngữ{tag("language")}</>}>
              <Chips>
                {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((l) => (
                  <Chip key={l} selected={f.language.includes(l)} onClick={() => setF({ ...f, language: toggle(f.language, l) })}>{LANGUAGE_LABELS[l]}</Chip>
                ))}
              </Chips>
            </Field>
            <Checkbox className="mt-7" label="Chỉ mentor miễn phí" checked={f.freeOnly} onChange={() => setF({ ...f, freeOnly: !f.freeOnly })} />
          </div>
        </CardBody>
        <CardFooter>
          <span className="mr-auto self-center text-small text-ink-muted">Bộ lọc chỉ áp dụng cho lượt tìm này, không thay đổi hồ sơ.</span>
          <Button variant="ghost" disabled={busy} onClick={onUseProfile}>Dùng sở thích trong hồ sơ</Button>
          <Button type="submit" variant="primary" icon={Search} loading={busy}>Tìm mentor</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
