"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { ClipboardList, ExternalLink, FileText, PlayCircle, BookText, type LucideIcon } from "lucide-react";
import { Alert, Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, Loading, PageHeader, Progress } from "@/components/ui";
import { domainLabel } from "@/features/profile/api";
import { learningApi } from "@/features/learning/api";
import { errorMessage } from "@/lib/api";
import type { CourseDetail, MaterialType } from "@/types";

const TYPE_ICONS: Record<MaterialType, [LucideIcon, string]> = {
  ARTICLE: [FileText, "Bài viết"],
  VIDEO: [PlayCircle, "Video"],
  DOCUMENT: [BookText, "Tài liệu"],
  EXERCISE: [ClipboardList, "Bài tập"],
};

function Course({ id }: { id: string }) {
  const [course, setCourse] = useState<CourseDetail | null | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    learningApi.course(id).then(setCourse).catch((e) => { setError(errorMessage(e)); setCourse(null); });
  }, [id]);

  async function run(fn: () => Promise<CourseDetail>) {
    setError("");
    try {
      setCourse(await fn());
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (course === undefined) return <Loading />;
  if (!course) return <Alert action={<ButtonLink href="/learning" size="sm">Learning Hub</ButtonLink>}>{error || "Không tìm thấy khoá học."}</Alert>;
  const done = course.materials.filter((m) => m.completed).length;
  return (
    <>
      <PageHeader
        back={{ href: "/learning", label: "Learning Hub" }}
        title={course.title}
        description={`${domainLabel(course.domain)} · ${course.materials.length} tài liệu · ${course.enrollmentCount} người đang học`}
        actions={course.enrolled ? (
          <Button onClick={() => run(() => learningApi.unenroll(id).then(() => learningApi.course(id)))}>Huỷ đăng ký</Button>
        ) : (
          <Button variant="primary" onClick={() => run(() => learningApi.enroll(id))}>Đăng ký học</Button>
        )}
      />
      <div className="flex flex-col gap-6">
        <Alert>{error}</Alert>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader title="Nội dung khoá học" description={`${done}/${course.materials.length} đã hoàn thành`} />
            {course.materials.length === 0 ? <EmptyState title="Khoá học chưa có tài liệu" /> : (
              <ol className="flex flex-col divide-y divide-border">
                {course.materials.map((m, i) => {
                  const [Icon, typeLabel] = TYPE_ICONS[m.type];
                  return (
                    <li key={m.id} className="flex items-start gap-3 px-5 py-3">
                      <input type="checkbox" className="mt-1 size-4 flex-none accent-[var(--accent)]" aria-label={`Hoàn thành: ${m.title}`}
                        checked={m.completed} onChange={(e) => run(() => learningApi.completeMaterial(m.id, e.target.checked))} />
                      <div className="min-w-0 flex-1">
                        <div className={`font-medium ${m.completed ? "text-ink-muted line-through" : ""}`}>{i + 1}. {m.title}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-small text-ink-muted">
                          <Icon aria-hidden="true" className="size-4" />{typeLabel}
                        </div>
                        {m.content && <p className="mt-1 text-small text-ink-muted">{m.content}</p>}
                      </div>
                      {m.url && <a className="btn btn-sm" href={m.url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Mở</a>}
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
          <Card>
            <CardBody className="flex flex-col gap-3">
              <p>{course.description}</p>
              <div className="flex justify-between text-small"><span className="text-ink-muted">Tiến độ của bạn</span><strong className="tabular">{course.percentComplete}%</strong></div>
              <Progress value={course.percentComplete} label="Tiến độ khoá học" />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function CoursePage({ params }: { params: { id: string } }) {
  return (
    <RequireAuth>
      <Course id={params.id} />
    </RequireAuth>
  );
}
