"use client";

import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, PageHead, useDialog, Flash } from "@/components/ui";
import { learningApi } from "@/features/learning/api";
import { DOMAINS } from "@/features/profile/api";
import { errorMessage } from "@/lib/api";
import type { CourseDetail, CourseInput, CourseSummary, Level, MaterialInput, MaterialType, RoadmapDetail, RoadmapInput, RoadmapSummary } from "@/types";

type CourseForm = Omit<CourseInput, "skills"> & { skills: string };
type MaterialForm = Required<MaterialInput>;
type ItemForm = { title: string; description: string; courseId: string };

const MATERIAL_TYPES: MaterialType[] = ["ARTICLE", "VIDEO", "DOCUMENT", "EXERCISE"];

const emptyCourse: CourseForm = { title: "", description: "", domain: "backend", level: "BEGINNER", skills: "" };

function ContentAdmin() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [roadmaps, setRoadmaps] = useState<RoadmapSummary[]>([]);
  const [selected, setSelected] = useState<CourseDetail | null>(null);
  const [selectedRoadmap, setSelectedRoadmap] = useState<RoadmapDetail | null>(null);
  const [courseForm, setCourseForm] = useState<CourseForm>(emptyCourse);
  const [material, setMaterial] = useState<MaterialForm>({ title: "", type: "ARTICLE", url: "", content: "" });
  const [roadmapForm, setRoadmapForm] = useState<RoadmapInput>({ title: "", track: "", description: "" });
  const [item, setItem] = useState<ItemForm>({ title: "", description: "", courseId: "" });
  const [msg, setMsg] = useState<Flash>({});
  const [dialog, ask] = useDialog();

  const load = useCallback(async () => {
    setCourses(await learningApi.courses());
    setRoadmaps(await learningApi.roadmaps());
  }, []);
  useEffect(() => {
    load().catch((e) => setMsg({ error: errorMessage(e) }));
  }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string): Promise<boolean> {
    setMsg({});
    try {
      await fn();
      setMsg({ ok });
      await load();
      if (selected) setSelected(await learningApi.course(selected.id).catch(() => null));
      if (selectedRoadmap) setSelectedRoadmap(await learningApi.roadmap(selectedRoadmap.id).catch(() => null));
      return true;
    } catch (e) {
      setMsg({ error: errorMessage(e) });
      return false;
    }
  }

  const splitSkills = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  return (
    <>
      <PageHead title="Quản lý nội dung Learning Hub" subtitle="Thêm/sửa/xoá khoá học, tài liệu và roadmap." />
      {dialog}
      <Alert type="success">{msg.ok}</Alert>
      <Alert>{msg.error}</Alert>
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="stack">
          <div className="card">
            <h2>Khoá học</h2>
            {courses.map((c) => (
              <div className="list-item" key={c.id}>
                <div style={{ flex: 1 }}><strong>{c.title}</strong><div className="muted small">{c.domain} · {c.materialCount} tài liệu</div></div>
                <button className="btn secondary sm" onClick={() => learningApi.course(c.id).then(setSelected).catch((e) => setMsg({ error: errorMessage(e) }))}>Tài liệu</button>
                <button className="btn danger sm" onClick={async () => (await ask({ title: `Xoá khoá "${c.title}"?`, message: "Tài liệu và tiến độ học của khoá này cũng bị xoá. Không thể hoàn tác.", confirmText: "Xoá", danger: true })) && run(() => learningApi.admin.deleteCourse(c.id), "Đã xoá khoá học")}>Xoá</button>
              </div>
            ))}
          </div>
          <form className="card" onSubmit={(e) => { e.preventDefault(); run(() => learningApi.admin.createCourse({ ...courseForm, skills: splitSkills(courseForm.skills) }), "Đã tạo khoá học").then((ok) => ok && setCourseForm(emptyCourse)); }}>
            <h2>Thêm khoá học</h2>
            <div className="field"><label>Tiêu đề</label><input required value={courseForm.title} onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })} /></div>
            <div className="field"><label>Mô tả</label><textarea value={courseForm.description} onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })} /></div>
            <div className="grid grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="field"><label>Lĩnh vực</label><select value={courseForm.domain} onChange={(e) => setCourseForm({ ...courseForm, domain: e.target.value })}>{DOMAINS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div className="field"><label>Cấp độ</label><select value={courseForm.level} onChange={(e) => setCourseForm({ ...courseForm, level: e.target.value as Level })}><option value="BEGINNER">Cơ bản</option><option value="INTERMEDIATE">Trung cấp</option><option value="ADVANCED">Nâng cao</option></select></div>
            </div>
            <div className="field"><label>Kỹ năng</label><input value={courseForm.skills} onChange={(e) => setCourseForm({ ...courseForm, skills: e.target.value })} placeholder="Java, Spring Boot" /></div>
            <button className="btn">Tạo khoá học</button>
          </form>
        </div>

        <div className="stack">
          {selected && (
            <div className="card">
              <h2>Tài liệu: {selected.title}</h2>
              {selected.materials.map((m) => (
                <div className="list-item" key={m.id}>
                  <div style={{ flex: 1 }}><strong>{m.orderIndex}. {m.title}</strong><div className="muted small">{m.type} {m.url && `· ${m.url}`}</div></div>
                  <button className="btn danger sm" onClick={() => run(() => learningApi.admin.deleteMaterial(m.id), "Đã xoá tài liệu")}>Xoá</button>
                </div>
              ))}
              <form onSubmit={(e) => { e.preventDefault(); run(() => learningApi.admin.createMaterial(selected.id, material), "Đã thêm tài liệu").then((ok) => ok && setMaterial({ title: "", type: "ARTICLE", url: "", content: "" })); }} style={{ marginTop: "1rem" }}>
                <div className="field"><label>Tiêu đề tài liệu</label><input required value={material.title} onChange={(e) => setMaterial({ ...material, title: e.target.value })} /></div>
                <div className="grid grid-2" style={{ gridTemplateColumns: "1fr 2fr" }}>
                  <div className="field"><label>Loại</label><select value={material.type} onChange={(e) => setMaterial({ ...material, type: e.target.value as MaterialType })}>{MATERIAL_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
                  <div className="field"><label>URL</label><input value={material.url} onChange={(e) => setMaterial({ ...material, url: e.target.value })} /></div>
                </div>
                <div className="field"><label>Nội dung tóm tắt</label><textarea style={{ minHeight: 60 }} value={material.content} onChange={(e) => setMaterial({ ...material, content: e.target.value })} /></div>
                <button className="btn">Thêm tài liệu</button>
              </form>
            </div>
          )}
          <div className="card">
            <h2>Roadmap</h2>
            {roadmaps.map((r) => (
              <div className="list-item" key={r.id}>
                <div style={{ flex: 1 }}><strong>{r.title}</strong><div className="muted small">{r.track} · {r.itemCount} bước</div></div>
                <button className="btn secondary sm" onClick={() => learningApi.roadmap(r.id).then(setSelectedRoadmap).catch((e) => setMsg({ error: errorMessage(e) }))}>Các bước</button>
                <button className="btn danger sm" onClick={async () => (await ask({ title: `Xoá roadmap "${r.title}"?`, message: "Các bước và tiến độ của roadmap này cũng bị xoá. Không thể hoàn tác.", confirmText: "Xoá", danger: true })) && run(() => learningApi.admin.deleteRoadmap(r.id), "Đã xoá roadmap")}>Xoá</button>
              </div>
            ))}
            <form onSubmit={(e) => { e.preventDefault(); run(() => learningApi.admin.createRoadmap(roadmapForm), "Đã tạo roadmap").then((ok) => ok && setRoadmapForm({ title: "", track: "", description: "" })); }} style={{ marginTop: "1rem" }}>
              <div className="grid grid-2" style={{ gridTemplateColumns: "2fr 1fr" }}>
                <div className="field"><label>Tên roadmap</label><input required value={roadmapForm.title} onChange={(e) => setRoadmapForm({ ...roadmapForm, title: e.target.value })} /></div>
                <div className="field"><label>Hướng</label><input required value={roadmapForm.track} onChange={(e) => setRoadmapForm({ ...roadmapForm, track: e.target.value })} placeholder="Backend" /></div>
              </div>
              <div className="field"><label>Mô tả</label><input value={roadmapForm.description} onChange={(e) => setRoadmapForm({ ...roadmapForm, description: e.target.value })} /></div>
              <button className="btn">Tạo roadmap</button>
            </form>
          </div>
          {selectedRoadmap && (
            <div className="card">
              <h2>Các bước: {selectedRoadmap.title}</h2>
              {selectedRoadmap.items.map((i) => (
                <div className="list-item" key={i.id}>
                  <div style={{ flex: 1 }}><strong>{i.orderIndex}. {i.title}</strong><div className="muted small">{i.courseTitle || i.description}</div></div>
                  <button className="btn danger sm" onClick={() => run(() => learningApi.admin.deleteRoadmapItem(i.id), "Đã xoá bước")}>Xoá</button>
                </div>
              ))}
              <form onSubmit={(e) => { e.preventDefault(); run(() => learningApi.admin.createRoadmapItem(selectedRoadmap.id, { ...item, courseId: item.courseId || null }), "Đã thêm bước").then((ok) => ok && setItem({ title: "", description: "", courseId: "" })); }} style={{ marginTop: "1rem" }}>
                <div className="field"><label>Tiêu đề bước</label><input required value={item.title} onChange={(e) => setItem({ ...item, title: e.target.value })} /></div>
                <div className="field"><label>Mô tả</label><input value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} /></div>
                <div className="field"><label>Liên kết khoá học</label><select value={item.courseId} onChange={(e) => setItem({ ...item, courseId: e.target.value })}><option value="">— Không —</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
                <button className="btn">Thêm bước</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function AdminLearningPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <ContentAdmin />
    </RequireAuth>
  );
}
