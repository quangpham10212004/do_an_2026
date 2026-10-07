"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Alert } from "@/components/ui";
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
    <form className="card" onSubmit={submit}>
      <h2>Xem lại thông tin trích xuất từ CV</h2>
      <p className="muted small">
        {cv.fileName} · engine {cv.engine}. Sửa hoặc bỏ những gì chưa đúng. Chưa có gì được lưu vào hồ sơ của bạn — chatbot chỉ dùng
        thông tin bạn xác nhận ở đây, và kỹ năng chỉ được thêm vào hồ sơ khi bạn chọn dùng mục tiêu cuối cùng.
      </p>
      <Alert>{error}</Alert>
      <div className="grid grid-2" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div className="field">
          <label>Vai trò hiện tại</label>
          <input value={role} maxLength={120} onChange={(e) => setRole(e.target.value)} placeholder="Ví dụ: Junior Backend Developer" />
        </div>
        <div className="field">
          <label>Số năm kinh nghiệm</label>
          <input type="number" min={0} max={45} value={years} onChange={(e) => setYears(e.target.value)} placeholder="Chưa xác định" />
        </div>
      </div>

      <div className="field">
        <label>Kỹ năng ({skills.length}/30)</label>
        <div className="chips" style={{ marginBottom: 6 }}>
          {skills.length === 0 && <span className="muted small">Không có kỹ năng nào</span>}
          {skills.map((s, i) => (
            <span className="chip" key={s}>
              {s}{" "}
              <button type="button" aria-label={`Bỏ ${s}`} title="Bỏ kỹ năng này" onClick={() => setSkills(removeAt(skills, i))}
                style={{ border: "none", background: "none", cursor: "pointer", padding: 0, fontWeight: 700 }}>×</button>
            </span>
          ))}
        </div>
        {skills.length < 30 && (
          <div className="row" style={{ gap: 8 }}>
            <input value={newSkill} maxLength={60} onChange={(e) => setNewSkill(e.target.value)} onKeyDown={onSkillKey} placeholder="Thêm kỹ năng rồi nhấn Enter" />
            <button type="button" className="btn secondary sm" onClick={addSkill} disabled={!newSkill.trim()}>Thêm</button>
          </div>
        )}
      </div>

      <div className="field">
        <label>Dự án ({projects.length}/8)</label>
        {projects.length === 0 && <p className="muted small">Không có dự án nào — chatbot sẽ hỏi thêm về kinh nghiệm thực hành.</p>}
        {projects.map((p, i) => (
          <div key={i} className="list-item" style={{ alignItems: "start", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input value={p.name} maxLength={120} onChange={(e) => setProject(i, { name: e.target.value })} placeholder="Tên dự án" />
              <textarea value={p.description} maxLength={400} onChange={(e) => setProject(i, { description: e.target.value })} placeholder="Mô tả ngắn" style={{ minHeight: 50, marginTop: 4 }} />
              {p.technologies.length > 0 && <div className="muted small">Công nghệ: {p.technologies.join(", ")}</div>}
            </div>
            <button type="button" className="btn ghost sm" onClick={() => setProjects(removeAt(projects, i))}>Bỏ</button>
          </div>
        ))}
        {projects.length < 8 && (
          <button type="button" className="btn ghost sm" onClick={() => setProjects([...projects, { name: "", description: "", technologies: [] }])}>+ Thêm dự án</button>
        )}
      </div>

      <div className="field">
        <label>Học vấn ({education.length}/6)</label>
        {education.map((ed, i) => (
          <div key={i} className="row" style={{ gap: 8, marginBottom: 4 }}>
            <input value={ed} maxLength={200} onChange={(e) => setEducation(education.map((x, j) => (j === i ? e.target.value : x)))} />
            <button type="button" className="btn ghost sm" onClick={() => setEducation(removeAt(education, i))}>Bỏ</button>
          </div>
        ))}
        {education.length < 6 && <button type="button" className="btn ghost sm" onClick={() => setEducation([...education, ""])}>+ Thêm học vấn</button>}
      </div>

      <button className="btn" disabled={busy}>{busy ? "Đang lưu..." : "Xác nhận thông tin & bắt đầu trò chuyện"}</button>
    </form>
  );
}
