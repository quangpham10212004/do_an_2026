"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Clock, Plus, Video } from "lucide-react";
import { Alert, Button, ButtonLink, Card, CardBody, Checkbox, Field, Loading, Select, Tabs } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import type { VerifyOverview, VerifyRules, VerifyTrack } from "@/types/verification";
import { verifyApi } from "./api";
import DeviceCheck, { type DeviceState } from "./DeviceCheck";
import { findAvailableDomain, findTrackByDomain } from "./domainParam";
import { VerifySteps } from "./VerifySteps";
import { DEFAULT_RULES, daysUntil, fmtScore, shortDate, shortDateTime, timeLeft } from "./utils";

function Lead({ tone, badge, title, sub }: { tone: "warning" | "danger" | "accent"; badge: React.ReactNode; title: string; sub?: React.ReactNode }) {
  return (
    <div className="vf-lead">
      <span className="vf-badge" data-tone={tone}>{badge}</span>
      <div className="min-w-0"><h2>{title}</h2>{sub && <div className="text-small text-ink-muted mt-0.5">{sub}</div>}</div>
    </div>
  );
}

/** Quy định + đồng ý + kiểm tra thiết bị + nút bắt đầu. Dùng cho lượt mới và cho lượt được phỏng vấn lại. */
function StartCard({ track, rules, note }: { track: VerifyTrack; rules: VerifyRules; note?: React.ReactNode }) {
  const router = useRouter();
  const [agree, setAgree] = useState(false);
  const [device, setDevice] = useState<DeviceState>({ micOk: false, camOk: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = agree && device.micOk;

  async function start() {
    setBusy(true);
    setError("");
    try {
      const iv = await verifyApi.start(track.id, true);
      router.push(`/interview/live?id=${encodeURIComponent(iv.id)}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="vf-card" data-tone="accent">
      <h2>Phỏng vấn AI trực tiếp · {track.domain}</h2>
      {note}
      <p className="mt-2 text-small leading-relaxed text-ink-muted">
        AI hỏi theo từng chủ đề của lĩnh vực, bạn trả lời trực tiếp bằng giọng nói và hệ thống quay video cả buổi. AI nghe xong sẽ nhận xét và hỏi tiếp câu phù hợp.
      </p>
      <div className="vf-tiles">
        <div className="vf-tile"><b>~{rules.maxMinutes}</b><span>phút tối đa</span></div>
        <div className="vf-tile"><b>{rules.topics.length || "—"}</b><span>chủ đề</span></div>
        <div className="vf-tile"><b>{fmtScore(rules.passScore)}</b><span>điểm đạt / 5</span></div>
      </div>
      {rules.topics.length > 0 && (
        <div className="mt-3.5">
          <div className="vf-eyebrow">Các chủ đề sẽ được hỏi</div>
          <ul className="mt-2 flex flex-wrap gap-2 p-0" style={{ listStyle: "none" }}>
            {rules.topics.map((t) => <li key={t} className="chip">{t}</li>)}
          </ul>
        </div>
      )}
      <ul className="vf-list">
        <li>Nói tự nhiên, rõ ràng. Có thể nhờ AI nhắc lại câu hỏi nhưng không được dùng người khác trả lời thay</li>
        <li>Hệ thống ghi hình và ghi âm cả buổi để chấm điểm; video được lưu cho quản trị viên xem lại khi cần</li>
        <li>Bị gián đoạn giữa chừng: tiếp tục được trong {rules.resumeHours} giờ, quá hạn thì lượt này tính là không hoàn thành</li>
        <li>Không đạt: được phỏng vấn lại sau {rules.retakeDays} ngày. Kết quả chưa rõ ràng sẽ chuyển quản trị viên xem xét</li>
      </ul>

      <DeviceCheck onChange={setDevice} />

      <div className="mt-4">
        <Checkbox label="Tôi đã đọc và đồng ý với quy định phỏng vấn, đồng ý cho hệ thống ghi hình và ghi âm buổi phỏng vấn." checked={agree} onChange={(e) => setAgree(e.target.checked)} />
      </div>
      <Alert className="mt-3">{error}</Alert>
      <Button variant="primary" size="lg" block icon={Video} className="mt-4" loading={busy} disabled={!ready} onClick={start}>Bắt đầu phỏng vấn</Button>
      {!ready && (
        <p className="mt-2 text-small text-ink-subtle" role="status">
          {!agree && !device.micOk ? "Cần đồng ý quy định và kiểm tra micro để bắt đầu." : !agree ? "Cần đồng ý quy định để bắt đầu." : "Cần kiểm tra micro sẵn sàng để bắt đầu."}
        </p>
      )}
    </div>
  );
}

function InProgressCard({ track }: { track: VerifyTrack }) {
  return (
    <div className="vf-card" data-tone="warning">
      <Lead tone="warning" badge={<Clock aria-hidden="true" />} title="Buổi phỏng vấn của bạn đang mở" sub={track.progressLabel ? `Đang ở ${track.progressLabel}` : undefined} />
      <div className="vf-note" data-tone="warning">
        <b>Hạn tiếp tục:</b> còn {timeLeft(track.resumeDeadline)} (đến {shortDateTime(track.resumeDeadline)}). Quá hạn thì lượt này kết thúc và tính là không hoàn thành.
      </div>
      <p className="mt-3 text-small leading-relaxed text-ink-muted">Những câu bạn đã trả lời được lưu. Bạn sẽ vào lại đúng câu đang dở.</p>
      <ButtonLink href={`/interview/live?id=${encodeURIComponent(track.interviewId ?? "")}`} variant="primary" size="lg" block icon={Video} className="mt-4">Tiếp tục phỏng vấn</ButtonLink>
    </div>
  );
}

function PendingCard({ track }: { track: VerifyTrack }) {
  return (
    <div className="vf-card" data-tone="soft-warning">
      <div className="vf-lead">
        <span className="vf-spin" aria-hidden="true" />
        <div><h2>Kết quả đang chờ quản trị viên xem xét</h2><div className="text-small text-ink-muted mt-0.5">Nộp lúc {shortDateTime(track.submittedAt)} · thường 1–3 ngày làm việc</div></div>
      </div>
      <p className="mt-3.5 text-small leading-relaxed text-ink-muted">AI chưa thể kết luận chắc chắn nên đã chuyển buổi phỏng vấn của bạn cho quản trị viên. Bạn sẽ nhận thông báo khi có quyết định.</p>
      {track.resultId && <ButtonLink href={`/interview/result?id=${encodeURIComponent(track.resultId)}`} size="lg" block className="mt-4">Xem điểm tạm tính</ButtonLink>}
    </div>
  );
}

function PassedCard({ track }: { track: VerifyTrack }) {
  return (
    <div className="vf-card">
      <div className="vf-success">
        <span className="vf-badge mx-auto" data-tone="accent" style={{ width: 56, height: 56 }}><Check aria-hidden="true" /></span>
        <h2 className="mt-3 text-[22px]">Lĩnh vực {track.domain} đã được xác thực</h2>
        <p className="mt-1.5 text-small text-ink-muted">Hồ sơ của bạn đã vào danh sách gợi ý cho mentee. Bạn có nhãn &quot;Mentor mới&quot; trong 30 ngày đầu.</p>
      </div>
      {track.lastScore != null && <div className="vf-note"><b>Điểm tổng:</b> {fmtScore(track.lastScore)} / 5</div>}
      {track.adminNote && <div className="vf-note"><b>Nhận xét:</b> {track.adminNote}</div>}
      <div className="mt-4 grid gap-2.5">
        {track.resultId && <ButtonLink href={`/interview/result?id=${encodeURIComponent(track.resultId)}`} size="lg" block>Xem kết quả</ButtonLink>}
        <ButtonLink href="/profile" variant="primary" size="lg" block>Thiết lập lịch rảnh và mức phí</ButtonLink>
      </div>
    </div>
  );
}

function FailedCard({ track, rules }: { track: VerifyTrack; rules: VerifyRules }) {
  const days = daysUntil(track.retryAt);
  const open = !track.retryAt || new Date(track.retryAt).getTime() <= Date.now();
  return (
    <>
      <div className="vf-card" data-tone="danger">
        <Lead tone="danger" badge={track.lastScore != null ? fmtScore(track.lastScore) : <Ban aria-hidden="true" />} title="Lần phỏng vấn này chưa đạt" sub={`Điểm đạt là ${fmtScore(rules.passScore)} / 5`} />
        {track.adminNote && <div className="vf-note" data-tone="danger"><b>Nhận xét từ quản trị viên:</b> {track.adminNote}</div>}
        <div className="vf-note">
          {open
            ? <>Bạn có thể phỏng vấn lại ngay bây giờ.</>
            : <>Bạn được phỏng vấn lại sau <b>{days} ngày</b> (từ {shortDate(track.retryAt)}).</>}
        </div>
        {track.resultId && <ButtonLink href={`/interview/result?id=${encodeURIComponent(track.resultId)}`} variant="primary" size="lg" block className="mt-4">Xem điểm cần cải thiện</ButtonLink>}
        {!open && <Button size="lg" block disabled className="mt-3">Phỏng vấn lại · mở ngày {shortDate(track.retryAt)}</Button>}
      </div>
      {open && <div className="mt-4"><StartCard track={track} rules={rules} /></div>}
    </>
  );
}

function ExpiredCard({ track, rules }: { track: VerifyTrack; rules: VerifyRules }) {
  const open = !track.retryAt || new Date(track.retryAt).getTime() <= Date.now();
  return (
    <>
      <div className="vf-card" data-tone="danger">
        <Lead tone="danger" badge={<Clock aria-hidden="true" />} title="Buổi phỏng vấn đã quá hạn" sub="Lượt này tính là không hoàn thành" />
        <div className="vf-note" data-tone="danger">Buổi phỏng vấn bị gián đoạn và không được tiếp tục trong {rules.resumeHours} giờ.{open ? " Bạn có thể bắt đầu lại ngay." : ` Bạn được phỏng vấn lại từ ${shortDate(track.retryAt)}.`}</div>
      </div>
      {open && <div className="mt-4"><StartCard track={track} rules={rules} /></div>}
    </>
  );
}

function StageCard({ track, rules }: { track: VerifyTrack; rules: VerifyRules }) {
  switch (track.stage) {
    case "READY": return <StartCard track={track} rules={rules} />;
    case "IN_PROGRESS": return <InProgressCard track={track} />;
    case "PENDING_REVIEW": return <PendingCard track={track} />;
    case "PASSED": return <PassedCard track={track} />;
    case "FAILED": return <FailedCard track={track} rules={rules} />;
    case "EXPIRED": return <ExpiredCard track={track} rules={rules} />;
  }
}

export default function VerifyStatusView() {
  const [data, setData] = useState<VerifyOverview | null>(null);
  const [error, setError] = useState("");
  const [sel, setSel] = useState("");
  const [adding, setAdding] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [domainParam, setDomainParam] = useState<string | null>(null);
  const [domainNote, setDomainNote] = useState("");

  // ?domain=<id> (từ nút "Thi thêm lĩnh vực"): chọn đúng lượt của lĩnh vực đó, chưa có thì mở sẵn form thêm với lĩnh vực đã chọn.
  useEffect(() => { try { setDomainParam(new URLSearchParams(window.location.search).get("domain")); } catch { /* bỏ qua */ } }, []);

  const load = useCallback(async () => {
    try {
      const o = await verifyApi.overview();
      setData(o);
      setSel((cur) => (o.tracks.some((t) => t.id === cur) ? cur : o.tracks[0]?.id ?? ""));
      setError("");
    } catch (e) { setError(errorMessage(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!data || !domainParam) return;
    const t = findTrackByDomain(data.tracks, domainParam);
    if (t) { setSel(t.id); setDomainNote(""); return; }
    const avail = findAvailableDomain(data, domainParam);
    if (avail && data.tracks.length < data.maxDomains) { setAdding(true); setNewDomain(avail); setDomainNote(`Bạn chưa có lượt xác thực cho lĩnh vực ${avail}. Bấm Thêm để bắt đầu.`); }
    else setDomainNote("Không tìm thấy lĩnh vực này trong danh sách xác thực của bạn.");
    // chỉ chạy khi số lượt hoặc tham số đổi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.tracks.length, domainParam]);

  async function addTrack() {
    if (!newDomain) return;
    setBusy(true);
    try {
      const t = await verifyApi.addTrack(newDomain);
      setAdding(false); setNewDomain("");
      await load();
      setSel(t.id);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  if (!data) return error ? <Alert>{error}</Alert> : <Loading />;
  const track = data.tracks.find((t) => t.id === sel) ?? data.tracks[0];
  const canAdd = data.tracks.length < data.maxDomains && data.availableDomains.length > 0;
  const rules: VerifyRules = { ...DEFAULT_RULES, ...data.rules, topics: data.rules?.topics ?? [] };

  return (
    <div className="vf-wrap">
      <header className="page-header">
        <div className="min-w-0">
          <h1>Xác thực năng lực</h1>
          <p className="page-header-desc max-w-[740px]">Một buổi phỏng vấn AI trực tiếp theo lĩnh vực chuyên môn của bạn: AI hỏi, bạn trả lời bằng giọng nói và quay video. AI chấm điểm từng tiêu chí; đạt thì được xác thực ngay, chưa rõ ràng thì quản trị viên xem xét.</p>
        </div>
        <div className="page-header-actions"><ButtonLink href="/interview/result" size="sm">Lịch sử và kết quả</ButtonLink></div>
      </header>
      <Alert>{error}</Alert>
      {domainNote && <Alert tone="info" className="mb-4">{domainNote}</Alert>}

      {track && <Card className="mb-6"><CardBody><VerifySteps stage={track.stage} /></CardBody></Card>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {data.tracks.length > 1 && (
          <Tabs value={track?.id ?? ""} onChange={setSel} tabs={data.tracks.map((t) => ({ id: t.id, label: t.domain }))} />
        )}
        {canAdd && !adding && <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>Xác thực thêm lĩnh vực ({data.tracks.length}/{data.maxDomains})</Button>}
      </div>
      {adding && (
        <Card className="mb-4">
          <CardBody>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Lĩnh vực muốn xác thực thêm" id="vf-domain" hint="Mỗi lĩnh vực một buổi phỏng vấn riêng, tối đa 3 lĩnh vực." className="min-w-[220px] flex-1">
                <Select id="vf-domain" value={newDomain} onChange={(e) => setNewDomain(e.target.value)}>
                  <option value="">Chọn lĩnh vực</option>
                  {data.availableDomains.map((d) => <option key={d} value={d}>{d}</option>)}
                </Select>
              </Field>
              <Button variant="primary" loading={busy} disabled={!newDomain} onClick={addTrack}>Thêm</Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>Huỷ</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {track ? <div className="vf-narrow" style={{ margin: 0, maxWidth: 760 }}><StageCard track={track} rules={rules} /></div> : <Alert tone="info">Chưa có lĩnh vực nào để xác thực. Hãy khai báo lĩnh vực chuyên môn trong hồ sơ trước.</Alert>}
    </div>
  );
}
