"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { Alert, Button, Card, CardBody, CardFooter, CardHeader, Chips, Field, Input, Textarea } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import type { ConfirmedCvFields, Cv, CvProject } from "@/types";

/** Giá trị khởi tạo: bản đã duyệt nếu có, ngược lại kết quả parse (đổi currentRole → role). */
export function initialFields(cv: Cv): ConfirmedCvFields {
  if (cv.confirmedFields) return cv.confirmedFields;
  const p = cv.parsed;
  return {
    role: p.currentRole,
    skills: p.skills,
    yearsExperience: p.yearsExperience,
    projects: p.projects.map((pr) => ({ name: pr.name, description: pr.description, technologies: pr.technologies ?? [] })),
    education: p.education,
  };
}

interface CvReviewProps {
  cv: Cv;
  busy: boolean;
  /** Lưu trường đã duyệt rồi bắt đầu chatbot — trang cha gọi API. */
  onConfirm: (fields: ConfirmedCvFields) => Promise<void>;
}

const removeAt = <T,>(list: T[], i: number) => list.filter((_, j) => j !== i);

/**
 * US-20 (PRD-CV-2) — bước xem lại thông tin trích xuất: sửa/bỏ từng trường (vai trò, kỹ năng, số năm kinh
 * nghiệm, dự án, học vấn) TRƯỚC khi chatbot bắt đầu. Chưa có gì được ghi vào hồ sơ ở bước này.
 */
export default function CvReview({ cv, busy, onConfirm }: CvReviewProps) {
  const start = initialFields(cv);
  const [role, setRole] = useState(start.role ?? "");
  const [years, setYears] = useState(start.yearsExperience == null ? "" : String(start.yearsExperience));
  const [skills, setSkills] = useState<string[]>(start.skills);
  const [newSkill, setNewSkill] = useState("");
  const [projects, setProjects] = useState<CvProject[]>(start.projects);
  const [education, setEducation] = useState<string[]>(start.education);
  const [error, setError] = useState("");

  function addSkill() {
    const s = newSkill.trim();
    if (s && !skills.some((x) => x.toLowerCase() === s.toLowerCase())) setSkills([...skills, s]);
    setNewSkill("");
  }

  function onSkillKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkill();
    }
  }

  const setProject = (i: number, patch: Partial<CvProject>) => setProjects(projects.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const y = years.trim() === "" ? null : Number(years);
    if (y !== null && (!Number.isInteger(y) || y < 0 || y > 45)) {
      setError("Số năm kinh nghiệm phải là số nguyên từ 0 đến 45.");
      return;
    }
    if (projects.some((p) => !p.name.trim())) {
      setError("Mỗi dự án cần có tên (hoặc bỏ dự án đó).");
      return;
    }
    try {
      await onConfirm({
        role: role.trim() || null,
        skills,
        yearsExperience: y,
        projects: projects.map((p) => ({ name: p.name.trim(), description: p.description.trim(), technologies: p.technologies })),
        education: education.map((x) => x.trim()).filter(Boolean),
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader
          title="Xem lại thông tin trích xuất từ CV"
          description={<>{cv.fileName} · engine {cv.engine}. Sửa hoặc bỏ những gì chưa đúng. Chưa có gì được lưu vào hồ sơ: chatbot chỉ dùng
            thông tin bạn xác nhận ở đây, và kỹ năng chỉ được thêm vào hồ sơ khi bạn chọn dùng mục tiêu cuối cùng.</>}
        />
        <CardBody className="flex flex-col gap-5">
          <Alert>{error}</Alert>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field label="Vai trò hiện tại" id="cvr-role">
              <Input id="cvr-role" value={role} maxLength={120} onChange={(e) => setRole(e.target.value)} placeholder="Ví dụ: Junior Backend Developer" />
            </Field>
            <Field label="Số năm kinh nghiệm" id="cvr-years">
              <Input id="cvr-years" type="number" min={0} max={45} value={years} onChange={(e) => setYears(e.target.value)} placeholder="Chưa xác định" />
            </Field>
          </div>

          <Field label={`Kỹ năng (${skills.length}/30)`} id="cvr-skill">
            <Chips className="mb-1">
              {skills.length === 0 && <span className="text-small text-ink-muted">Chưa có kỹ năng nào</span>}
              {skills.map((s, i) => (
                <span className="chip" key={s}>
                  {s}
                  <button type="button" aria-label={`Bỏ ${s}`} title="Bỏ kỹ năng này" onClick={() => setSkills(removeAt(skills, i))}
                    className="-mr-1 grid size-4 cursor-pointer place-items-center rounded-sm text-ink-muted hover:text-danger">
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                </span>
              ))}
            </Chips>
            {skills.length < 30 && (
              <div className="input-group">
                <Input id="cvr-skill" value={newSkill} maxLength={60} onChange={(e) => setNewSkill(e.target.value)} onKeyDown={onSkillKey} placeholder="Thêm kỹ năng rồi nhấn Enter" />
                <Button onClick={addSkill} disabled={!newSkill.trim()}>Thêm</Button>
              </div>
            )}
          </Field>

          <Field label={`Dự án (${projects.length}/8)`}>
            {projects.length === 0 && <p className="text-small text-ink-muted">Chưa có dự án nào. Chatbot sẽ hỏi thêm về kinh nghiệm thực hành.</p>}
            <div className="flex flex-col gap-3">
              {projects.map((p, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md border border-border p-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Input value={p.name} maxLength={120} onChange={(e) => setProject(i, { name: e.target.value })} placeholder="Tên dự án" aria-label={`Tên dự án ${i + 1}`} />
                    <Textarea value={p.description} maxLength={400} onChange={(e) => setProject(i, { description: e.target.value })} placeholder="Mô tả ngắn" aria-label={`Mô tả dự án ${i + 1}`} className="min-h-[64px]" />
                    {p.technologies.length > 0 && <div className="text-small text-ink-muted">Công nghệ: {p.technologies.join(", ")}</div>}
                  </div>
                  <Button size="sm" variant="ghost" iconOnly icon={X} label="Bỏ dự án" onClick={() => setProjects(removeAt(projects, i))} />
                </div>
              ))}
            </div>
            {projects.length < 8 && (
              <div><Button size="sm" variant="ghost" icon={Plus} onClick={() => setProjects([...projects, { name: "", description: "", technologies: [] }])}>Thêm dự án</Button></div>
            )}
          </Field>

          <Field label={`Học vấn (${education.length}/6)`}>
            <div className="flex flex-col gap-2">
              {education.map((ed, i) => (
                <div key={i} className="input-group">
                  <Input value={ed} maxLength={200} aria-label={`Học vấn ${i + 1}`} onChange={(e) => setEducation(education.map((x, j) => (j === i ? e.target.value : x)))} />
                  <Button variant="ghost" iconOnly icon={X} label="Bỏ" onClick={() => setEducation(removeAt(education, i))} />
                </div>
              ))}
            </div>
            {education.length < 6 && <div><Button size="sm" variant="ghost" icon={Plus} onClick={() => setEducation([...education, ""])}>Thêm học vấn</Button></div>}
          </Field>
        </CardBody>
        <CardFooter>
          <Button type="submit" variant="primary" loading={busy}>{busy ? "Đang lưu…" : "Xác nhận và bắt đầu trò chuyện"}</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
