"use client";

import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Plus, Trash2 } from "lucide-react";
import { Button, Card, CardBody, CardFooter, CardHeader, EmptyState, Field, FlashAlerts, Input, PageHeader, Select, Tabs, Textarea, useDialog, type Flash } from "@/components/ui";
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
  const [tab, setTab] = useState<"courses" | "roadmaps">("courses");
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

  const row = (key: string, active: boolean, title: string, meta: string, onOpen: () => void, onDelete: () => void) => (
    <div key={key} className={`flex items-center gap-3 px-5 py-3 ${active ? "bg-accent-soft" : ""}`}>
      <button type="button" className="min-w-0 flex-1 cursor-pointer text-left" onClick={onOpen}>
        <div className="font-semibold">{title}</div>
        <div className="text-small text-ink-muted">{meta}</div>
      </button>
      <Button size="sm" variant="ghost" iconOnly icon={Trash2} label="Xoá" onClick={onDelete} />
    </div>
  );

  return (
    <>
      <PageHeader title="Nội dung học" description="Thêm, sửa và xoá khoá học, tài liệu và roadmap của Learning Hub." />
      {dialog}
      <FlashAlerts flash={msg} className="mb-6" />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        { id: "courses", label: "Khoá học", count: courses.length },
        { id: "roadmaps", label: "Roadmap", count: roadmaps.length },
      ]} />

      {tab === "courses" && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-6">
            <Card>
              <CardHeader title="Khoá học" description="Chọn một khoá để quản lý tài liệu." />
              {courses.length === 0 ? <EmptyState title="Chưa có khoá học nào" /> : (
                <div className="flex flex-col divide-y divide-border">
                  {courses.map((c) => row(c.id, selected?.id === c.id, c.title, `${c.domain} · ${c.materialCount} tài liệu`,
                    () => learningApi.course(c.id).then(setSelected).catch((e) => setMsg({ error: errorMessage(e) })),
                    async () => (await ask({ title: `Xoá khoá "${c.title}"?`, message: "Tài liệu và tiến độ học của khoá này cũng bị xoá. Không thể hoàn tác.", confirmText: "Xoá", danger: true })) && run(() => learningApi.admin.deleteCourse(c.id), "Đã xoá khoá học.")))}
                </div>
              )}
            </Card>
            <form onSubmit={(e) => { e.preventDefault(); run(() => learningApi.admin.createCourse({ ...courseForm, skills: splitSkills(courseForm.skills) }), "Đã tạo khoá học.").then((ok) => ok && setCourseForm(emptyCourse)); }}>
              <Card>
                <CardHeader title="Thêm khoá học" />
                <CardBody>
                  <div className="form-grid">
                    <Field label="Tiêu đề" id="c-title" required className="span-2"><Input id="c-title" required value={courseForm.title} onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })} /></Field>
                    <Field label="Mô tả" id="c-desc" className="span-2"><Textarea id="c-desc" value={courseForm.description} onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })} /></Field>
                    <Field label="Lĩnh vực" id="c-domain"><Select id="c-domain" value={courseForm.domain} onChange={(e) => setCourseForm({ ...courseForm, domain: e.target.value })}>{DOMAINS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
                    <Field label="Cấp độ" id="c-level"><Select id="c-level" value={courseForm.level} onChange={(e) => setCourseForm({ ...courseForm, level: e.target.value as Level })}><option value="BEGINNER">Cơ bản</option><option value="INTERMEDIATE">Trung cấp</option><option value="ADVANCED">Nâng cao</option></Select></Field>
                    <Field label="Kỹ năng" id="c-skills" className="span-2" hint="Phân tách bằng dấu phẩy."><Input id="c-skills" value={courseForm.skills} onChange={(e) => setCourseForm({ ...courseForm, skills: e.target.value })} placeholder="Java, Spring Boot" /></Field>
                  </div>
                </CardBody>
                <CardFooter><Button type="submit" variant="primary" icon={Plus}>Tạo khoá học</Button></CardFooter>
              </Card>
            </form>
          </div>
          {selected ? (
            <Card>
              <CardHeader title={`Tài liệu: ${selected.title}`} description={`${selected.materials.length} tài liệu`} />
              <div className="flex flex-col divide-y divide-border">
                {selected.materials.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{m.orderIndex}. {m.title}</div>
                      <div className="truncate text-small text-ink-muted">{m.type}{m.url && ` · ${m.url}`}</div>
                    </div>
                    <Button size="sm" variant="ghost" iconOnly icon={Trash2} label="Xoá tài liệu" onClick={() => run(() => learningApi.admin.deleteMaterial(m.id), "Đã xoá tài liệu.")} />
                  </div>
                ))}
              </div>
              <form className="flex flex-col gap-4 border-t border-border p-5" onSubmit={(e) => { e.preventDefault(); run(() => learningApi.admin.createMaterial(selected.id, material), "Đã thêm tài liệu.").then((ok) => ok && setMaterial({ title: "", type: "ARTICLE", url: "", content: "" })); }}>
                <div className="font-semibold">Thêm tài liệu</div>
                <Field label="Tiêu đề tài liệu" id="m-title" required><Input id="m-title" required value={material.title} onChange={(e) => setMaterial({ ...material, title: e.target.value })} /></Field>
                <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
                  <Field label="Loại" id="m-type"><Select id="m-type" value={material.type} onChange={(e) => setMaterial({ ...material, type: e.target.value as MaterialType })}>{MATERIAL_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
                  <Field label="URL" id="m-url"><Input id="m-url" value={material.url} onChange={(e) => setMaterial({ ...material, url: e.target.value })} /></Field>
                </div>
                <Field label="Nội dung tóm tắt" id="m-content"><Textarea id="m-content" className="min-h-[64px]" value={material.content} onChange={(e) => setMaterial({ ...material, content: e.target.value })} /></Field>
                <div><Button type="submit" icon={Plus}>Thêm tài liệu</Button></div>
              </form>
            </Card>
          ) : (
            <Card><EmptyState title="Chọn một khoá học">Tài liệu của khoá được chọn sẽ hiện ở đây.</EmptyState></Card>
          )}
        </div>
      )}

      {tab === "roadmaps" && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-6">
            <Card>
              <CardHeader title="Roadmap" description="Chọn một roadmap để quản lý các bước." />
              {roadmaps.length === 0 ? <EmptyState title="Chưa có roadmap nào" /> : (
                <div className="flex flex-col divide-y divide-border">
                  {roadmaps.map((r) => row(r.id, selectedRoadmap?.id === r.id, r.title, `${r.track} · ${r.itemCount} bước`,
                    () => learningApi.roadmap(r.id).then(setSelectedRoadmap).catch((e) => setMsg({ error: errorMessage(e) })),
                    async () => (await ask({ title: `Xoá roadmap "${r.title}"?`, message: "Các bước và tiến độ của roadmap này cũng bị xoá. Không thể hoàn tác.", confirmText: "Xoá", danger: true })) && run(() => learningApi.admin.deleteRoadmap(r.id), "Đã xoá roadmap.")))}
                </div>
              )}
            </Card>
            <form onSubmit={(e) => { e.preventDefault(); run(() => learningApi.admin.createRoadmap(roadmapForm), "Đã tạo roadmap.").then((ok) => ok && setRoadmapForm({ title: "", track: "", description: "" })); }}>
              <Card>
                <CardHeader title="Thêm roadmap" />
                <CardBody>
                  <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                    <Field label="Tên roadmap" id="r-title" required><Input id="r-title" required value={roadmapForm.title} onChange={(e) => setRoadmapForm({ ...roadmapForm, title: e.target.value })} /></Field>
                    <Field label="Hướng" id="r-track" required><Input id="r-track" required value={roadmapForm.track} onChange={(e) => setRoadmapForm({ ...roadmapForm, track: e.target.value })} placeholder="Backend" /></Field>
                    <Field label="Mô tả" id="r-desc" className="sm:col-span-2"><Input id="r-desc" value={roadmapForm.description} onChange={(e) => setRoadmapForm({ ...roadmapForm, description: e.target.value })} /></Field>
                  </div>
                </CardBody>
                <CardFooter><Button type="submit" variant="primary" icon={Plus}>Tạo roadmap</Button></CardFooter>
              </Card>
            </form>
          </div>
          {selectedRoadmap ? (
            <Card>
              <CardHeader title={`Các bước: ${selectedRoadmap.title}`} description={`${selectedRoadmap.items.length} bước`} />
              <div className="flex flex-col divide-y divide-border">
                {selectedRoadmap.items.map((i) => (
                  <div key={i.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{i.orderIndex}. {i.title}</div>
                      <div className="text-small text-ink-muted">{i.courseTitle || i.description}</div>
                    </div>
                    <Button size="sm" variant="ghost" iconOnly icon={Trash2} label="Xoá bước" onClick={() => run(() => learningApi.admin.deleteRoadmapItem(i.id), "Đã xoá bước.")} />
                  </div>
                ))}
              </div>
              <form className="flex flex-col gap-4 border-t border-border p-5" onSubmit={(e) => { e.preventDefault(); run(() => learningApi.admin.createRoadmapItem(selectedRoadmap.id, { ...item, courseId: item.courseId || null }), "Đã thêm bước.").then((ok) => ok && setItem({ title: "", description: "", courseId: "" })); }}>
                <div className="font-semibold">Thêm bước</div>
                <Field label="Tiêu đề bước" id="i-title" required><Input id="i-title" required value={item.title} onChange={(e) => setItem({ ...item, title: e.target.value })} /></Field>
                <Field label="Mô tả" id="i-desc"><Input id="i-desc" value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} /></Field>
                <Field label="Liên kết khoá học" id="i-course"><Select id="i-course" value={item.courseId} onChange={(e) => setItem({ ...item, courseId: e.target.value })}><option value="">Không liên kết</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
                <div><Button type="submit" icon={Plus}>Thêm bước</Button></div>
              </form>
            </Card>
          ) : (
            <Card><EmptyState title="Chọn một roadmap">Các bước của roadmap được chọn sẽ hiện ở đây.</EmptyState></Card>
          )}
        </div>
      )}
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
