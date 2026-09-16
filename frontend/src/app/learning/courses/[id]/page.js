"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead, ProgressBar } from "@/components/ui";
import { learningApi } from "@/features/learning/api";

const TYPE_ICONS = { ARTICLE: "📄", VIDEO: "🎬", DOCUMENT: "📘", EXERCISE: "🧩" };

function Course({ id }) {
  const [course, setCourse] = useState(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    learningApi.course(id).then(setCourse).catch((e) => { setError(e.message); setCourse(null); });
  }, [id]);

  async function run(fn) {
    setError("");
    try {
      setCourse(await fn());
    } catch (e) {
      setError(e.message);
    }
  }

  if (course === undefined) return <Loading />;
  if (!course) return <Alert>{error}</Alert>;
  return (
    <>
      <PageHead title={course.title} subtitle={`${course.domain} · ${course.materials.length} tài liệu · ${course.enrollmentCount} người đang học`}>
        {course.enrolled ? (
          <button className="btn secondary" onClick={() => learningApi.unenroll(id).then(() => learningApi.course(id)).then(setCourse)}>Huỷ đăng ký</button>
        ) : (
          <button className="btn" onClick={() => run(() => learningApi.enroll(id))}>Đăng ký học</button>
        )}
      </PageHead>
      <Alert>{error}</Alert>
      <div className="card" style={{ marginBottom: "1rem" }}>
        <p>{course.description}</p>
        <div className="row between small"><span>Tiến độ của bạn</span><strong>{course.percentComplete}%</strong></div>
        <ProgressBar value={course.percentComplete} />
      </div>
      <div className="card">
        <h2>Nội dung khoá học</h2>
        {course.materials.map((m) => (
          <div key={m.id} className="list-item">
            <input type="checkbox" checked={m.completed} onChange={(e) => run(() => learningApi.completeMaterial(m.id, e.target.checked))} style={{ marginTop: 4 }} />
            <div style={{ flex: 1 }}>
              <div><span>{TYPE_ICONS[m.type]} </span><strong style={{ textDecoration: m.completed ? "line-through" : "none" }}>{m.title}</strong></div>
              {m.content && <div className="muted small">{m.content}</div>}
            </div>
            {m.url && <a className="btn secondary sm" href={m.url} target="_blank" rel="noreferrer">Mở tài liệu</a>}
          </div>
        ))}
      </div>
      <p className="small" style={{ marginTop: "1rem" }}><Link href="/learning">← Learning Hub</Link></p>
    </>
  );
}

export default function CoursePage({ params }) {
  return (
    <RequireAuth>
      <Course id={params.id} />
    </RequireAuth>
  );
}
