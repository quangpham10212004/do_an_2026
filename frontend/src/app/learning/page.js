"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Empty, Loading, PageHead, ProgressBar } from "@/components/ui";
import { learningApi } from "@/features/learning/api";
import { DOMAINS } from "@/features/profile/api";

const LEVELS = { BEGINNER: "Cơ bản", INTERMEDIATE: "Trung cấp", ADVANCED: "Nâng cao" };

function LearningHub() {
  const [tab, setTab] = useState("mine");
  const [courses, setCourses] = useState(undefined);
  const [roadmaps, setRoadmaps] = useState([]);
  const [domain, setDomain] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    learningApi.roadmaps().then(setRoadmaps).catch(() => {});
  }, []);
  useEffect(() => {
    setCourses(undefined);
    const req = tab === "mine" ? learningApi.myCourses() : learningApi.courses(domain, q);
    req.then(setCourses).catch(() => setCourses([]));
  }, [tab, domain, q]);

  return (
    <>
      <PageHead title="Learning Hub" subtitle="Khoá học, tài liệu và lộ trình học theo từng hướng đi." />
      <div className="tabs">
        <button className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>Khoá học của tôi</button>
        <button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>Tất cả khoá học</button>
        <button className={tab === "roadmaps" ? "active" : ""} onClick={() => setTab("roadmaps")}>Roadmap</button>
      </div>

      {tab === "all" && (
        <div className="row" style={{ marginBottom: "1rem" }}>
          <select value={domain} onChange={(e) => setDomain(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="">Mọi lĩnh vực</option>
            {DOMAINS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input placeholder="Tìm khoá học..." value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
        </div>
      )}

      {tab !== "roadmaps" && (courses === undefined ? <Loading /> : courses.length === 0 ? (
        <Empty>{tab === "mine" ? "Bạn chưa đăng ký khoá học nào — xem tab Tất cả khoá học." : "Không có khoá học phù hợp."}</Empty>
      ) : (
        <div className="grid grid-3">
          {courses.map((c) => (
            <Link key={c.id} href={`/learning/courses/${c.id}`} className="card" style={{ color: "inherit", textDecoration: "none" }}>
              <div className="row between"><span className="badge primary">{c.domain}</span><span className="badge">{LEVELS[c.level]}</span></div>
              <h3 style={{ marginTop: 8 }}>{c.title}</h3>
              <p className="muted small">{c.description}</p>
              <div className="chips" style={{ marginBottom: 8 }}>{c.skills.map((s) => <span className="chip" key={s}>{s}</span>)}</div>
              <div className="row between small muted"><span>{c.materialCount} tài liệu</span>{c.enrolled && <span>{c.percentComplete}%</span>}</div>
              {c.enrolled && <ProgressBar value={c.percentComplete} />}
            </Link>
          ))}
        </div>
      ))}

      {tab === "roadmaps" && (
        <div className="grid grid-3">
          {roadmaps.map((r) => (
            <Link key={r.id} href={`/learning/roadmaps/${r.id}`} className="card" style={{ color: "inherit", textDecoration: "none" }}>
              <span className="badge primary">{r.track}</span>
              <h3 style={{ marginTop: 8 }}>{r.title}</h3>
              <p className="muted small">{r.description}</p>
              <p className="small">{r.itemCount} bước</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function LearningPage() {
  return (
    <RequireAuth>
      <LearningHub />
    </RequireAuth>
  );
}
