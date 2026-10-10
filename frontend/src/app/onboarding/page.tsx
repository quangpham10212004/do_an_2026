"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Info, Sparkles } from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import WelcomeAlerts from "@/components/WelcomeAlerts";
import { Alert, Button, Card, CardBody, Chip, Chips, Field, Input, Loading } from "@/components/ui";
import { DOMAINS, profileApi } from "@/features/profile/api";
import { errorMessage } from "@/lib/api";
import type { Level, MenteeProfile, SessionUser } from "@/types";

/** Ngưỡng của profile-service (CompletenessRules): mục tiêu ≥ 80 ký tự, ≥ 3 kỹ năng → đủ 50% để dùng AI Matching. */
const GOAL_MIN = 80;
const SKILLS_MIN = 3;

const LEVELS: [Level, string, string][] = [
  ["BEGINNER", "Mới bắt đầu", "Đang học nền tảng, chưa đi làm"],
  ["INTERMEDIATE", "Đã có kinh nghiệm", "Đã làm dự án hoặc đi làm dưới 2 năm"],
  ["ADVANCED", "Nâng cao", "Muốn lên senior, kiến trúc, dẫn dắt"],
];

const DOMAIN_HINTS: Record<string, string> = {
  backend: "API, cơ sở dữ liệu, hệ thống",
  frontend: "Giao diện web, React",
  fullstack: "Cả frontend và backend",
  devops: "Hạ tầng, CI/CD, cloud",
  data: "Dữ liệu, machine learning",
  mobile: "Ứng dụng iOS / Android",
};

const SKILL_SUGGESTIONS: Record<string, string[]> = {
  backend: ["Java", "Spring Boot", "Node.js", "Python", "SQL", "PostgreSQL", "REST API", "Docker", "Redis", "System Design", "Git"],
  frontend: ["HTML", "CSS", "JavaScript", "TypeScript", "React", "Next.js", "Tailwind CSS", "Testing", "Git"],
  fullstack: ["JavaScript", "TypeScript", "React", "Node.js", "SQL", "REST API", "Docker", "Git"],
  devops: ["Linux", "Docker", "Kubernetes", "AWS", "Terraform", "CI/CD", "Bash", "Monitoring"],
  data: ["Python", "SQL", "Pandas", "Machine Learning", "Deep Learning", "Statistics", "Spark"],
  mobile: ["Kotlin", "Swift", "Flutter", "React Native", "Firebase", "REST API", "Git"],
};

const TARGETS: Record<string, string[]> = {
  backend: ["Có việc làm backend developer đầu tiên", "Lên mid/senior backend", "Chuyển sang backend từ mảng khác"],
  frontend: ["Có việc làm frontend developer đầu tiên", "Lên mid/senior frontend", "Chuyển sang frontend từ mảng khác"],
  fullstack: ["Có việc làm fullstack developer đầu tiên", "Tự xây trọn một sản phẩm", "Lên mid/senior fullstack"],
  devops: ["Có việc làm DevOps / Cloud đầu tiên", "Lấy chứng chỉ cloud", "Chuyển sang DevOps từ mảng khác"],
  data: ["Có việc làm data / AI đầu tiên", "Chuyển sang data / AI từ mảng khác", "Làm dự án machine learning thực tế"],
  mobile: ["Có việc làm mobile developer đầu tiên", "Phát hành ứng dụng lên store", "Lên mid/senior mobile"],
};

const TIMEFRAMES = ["3 tháng", "6 tháng", "1 năm"];
const HELP = ["Định hướng lộ trình học", "Review code", "Luyện phỏng vấn", "Làm dự án thực tế", "Viết CV"];

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

/** Ghép câu trả lời thành mục tiêu đủ ý cho AI (và đủ 80 ký tự để mở AI Matching). */
function composeGoal(target: string, timeframe: string, help: string[], note: string): string {
  const parts = [
    target && `Mục tiêu: ${target.charAt(0).toLowerCase()}${target.slice(1)}${timeframe ? ` trong ${timeframe} tới` : ""}.`,
    help.length > 0 && `Mong mentor hỗ trợ: ${help.map((h) => h.toLowerCase()).join(", ")}.`,
    note.trim(),
  ];
  return parts.filter(Boolean).join(" ");
}

function Why({ children }: { children: string }) {
  return <p className="why"><Info aria-hidden="true" />{children}</p>;
}

function Onboarding({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [existing, setExisting] = useState<MenteeProfile | null | undefined>(undefined);
  const [step, setStep] = useState(0);
  const [domain, setDomain] = useState("");
  const [level, setLevel] = useState<Level | "">("");
  const [skills, setSkills] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [target, setTarget] = useState("");
  const [timeframe, setTimeframe] = useState("6 tháng");
  const [help, setHelp] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    profileApi.getMentee(user.userId)
      .then((p) => {
        setExisting(p);
        setDomain(p.domain?.toLowerCase() || "");
        setLevel(p.currentLevel || "");
        setSkills(p.skills || []);
      })
      .catch(() => setExisting(null));
  }, [user]);

  if (existing === undefined) return <Loading />;

  const goal = existing?.goal && !target && !help.length && !note ? existing.goal : composeGoal(target, timeframe, help, note);
  const canNext = [!!domain && !!level, skills.length >= SKILLS_MIN, goal.length >= GOAL_MIN][step];
  const suggestions = [...new Set([...(SKILL_SUGGESTIONS[domain] ?? []), ...skills])];

  async function finish() {
    setSaving(true);
    setError("");
    try {
      await profileApi.saveMentee(user.userId, {
        displayName: existing?.displayName || user.fullName || user.email.split("@")[0],
        domain,
        currentLevel: level || undefined,
        skills,
        goal,
        portfolioLinks: existing?.portfolioLinks ?? [],
        cvFileUrl: existing?.cvFileUrl ?? null,
      });
      router.push("/matching");
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  function addCustom() {
    const v = custom.trim();
    if (v && !skills.includes(v)) setSkills([...skills, v]);
    setCustom("");
  }

  return (
    <div className="wizard py-4">
      <WelcomeAlerts welcome="Chào mừng bạn! Trả lời 3 câu hỏi ngắn để AI tìm mentor cho bạn." />
      <div className="wizard-steps" aria-hidden="true">
        {[0, 1, 2].map((i) => <span key={i} data-done={i <= step} />)}
      </div>
      <p className="text-small text-ink-muted">Bước {step + 1} / 3</p>
      <Card className="mt-2">
        <CardBody className="flex flex-col gap-5">
          {step === 0 && (
            <>
              <div>
                <h1 className="text-title-1 font-semibold">Bạn muốn học lĩnh vực nào?</h1>
                <Why>AI chỉ gợi ý mentor cùng lĩnh vực và hợp với trình độ của bạn.</Why>
              </div>
              <div className="choice-grid" role="group" aria-label="Lĩnh vực">
                {DOMAINS.map(([v, label]) => (
                  <button key={v} type="button" className="choice" aria-pressed={domain === v} onClick={() => setDomain(v)}>
                    <span className="font-semibold">{label}</span>
                    <small>{DOMAIN_HINTS[v]}</small>
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-3">
                <div className="font-semibold">Trình độ hiện tại của bạn</div>
                <div className="choice-grid" role="group" aria-label="Trình độ">
                  {LEVELS.map(([v, label, hint]) => (
                    <button key={v} type="button" className="choice" aria-pressed={level === v} onClick={() => setLevel(v)}>
                      <span className="font-semibold">{label}</span>
                      <small>{hint}</small>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <h1 className="text-title-1 font-semibold">Bạn đã biết những gì?</h1>
                <Why>Chọn ít nhất 3 kỹ năng. AI ưu tiên mentor giỏi đúng những thứ bạn đang dùng và muốn học tiếp.</Why>
              </div>
              <Chips>
                {suggestions.map((s) => <Chip key={s} selected={skills.includes(s)} onClick={() => setSkills(toggle(skills, s))}>{s}</Chip>)}
              </Chips>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addCustom(); }}>
                <Input value={custom} maxLength={40} placeholder="Kỹ năng khác, ví dụ: GraphQL" aria-label="Thêm kỹ năng khác" onChange={(e) => setCustom(e.target.value)} />
                <Button type="submit" disabled={!custom.trim()}>Thêm</Button>
              </form>
              <p className="text-small text-ink-muted tabular">Đã chọn {skills.length}{skills.length < SKILLS_MIN && ` — cần thêm ${SKILLS_MIN - skills.length}`}</p>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <h1 className="text-title-1 font-semibold">Bạn muốn đạt được gì?</h1>
                <Why>Mục tiêu là tín hiệu quan trọng nhất để AI so khớp với kinh nghiệm của mentor.</Why>
              </div>
              <Field label="Mục tiêu chính">
                <Chips>
                  {(TARGETS[domain] ?? []).map((t) => <Chip key={t} selected={target === t} onClick={() => setTarget(target === t ? "" : t)}>{t}</Chip>)}
                </Chips>
              </Field>
              <Field label="Trong khoảng">
                <Chips>
                  {TIMEFRAMES.map((t) => <Chip key={t} selected={timeframe === t} onClick={() => setTimeframe(t)}>{t}</Chip>)}
                </Chips>
              </Field>
              <Field label="Bạn cần mentor giúp gì?">
                <Chips>
                  {HELP.map((h) => <Chip key={h} selected={help.includes(h)} onClick={() => setHelp(toggle(help, h))}>{h}</Chip>)}
                </Chips>
              </Field>
              <Field label="Thêm chi tiết (không bắt buộc)" id="ob-note">
                <Input id="ob-note" value={note} maxLength={500} placeholder="Ví dụ: đang làm đồ án tốt nghiệp về microservices" onChange={(e) => setNote(e.target.value)} />
              </Field>
              {goal && (
                <div className="well text-small">
                  <div className="font-medium">Mục tiêu sẽ lưu vào hồ sơ</div>
                  <p className="mt-1 text-ink-muted">{goal}</p>
                  {goal.length < GOAL_MIN && <p className="mt-1 text-ink-muted tabular">Cần thêm {GOAL_MIN - goal.length} ký tự — chọn thêm mục ở trên hoặc thêm chi tiết.</p>}
                </div>
              )}
            </>
          )}

          <Alert>{error}</Alert>
          <div className="flex items-center gap-2">
            {step > 0 && <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(step - 1)}>Quay lại</Button>}
            <span className="flex-1" />
            {step < 2
              ? <Button variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Tiếp tục<ArrowRight aria-hidden="true" /></Button>
              : <Button variant="primary" icon={Sparkles} disabled={!canNext} loading={saving} onClick={finish}>Xem mentor phù hợp</Button>}
          </div>
        </CardBody>
      </Card>
      <p className="mt-4 text-center text-small text-ink-muted">CV, lịch học và ngân sách có thể bổ sung sau trong Hồ sơ.</p>
    </div>
  );
}

export default function OnboardingPage() {
  return <RequireAuth roles={["MENTEE"]}>{(user) => <Onboarding user={user} />}</RequireAuth>;
}
