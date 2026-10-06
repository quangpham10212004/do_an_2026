"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Empty, Loading, PageHead, ProgressBar, Alert } from "@/components/ui";
import { learningApi } from "@/features/learning/api";
import { errorMessage } from "@/lib/api";
import { DOMAINS } from "@/features/profile/api";
import type { CourseSummary, Level, RoadmapSummary } from "@/types";

const LEVELS: Record<Level, string> = { BEGINNER: "Cơ bản", INTERMEDIATE: "Trung cấp", ADVANCED: "Nâng cao" };

function LearningHub() {
  const [tab, setTab] = useState<"mine" | "all" | "roadmaps">("mine");
  // undefined = đang tải, null = lỗi (thông điệp nằm ở coursesError / roadmapsError)
  const [courses, setCourses] = useState<CourseSummary[] | null | undefined>(undefined);
  const [coursesError, setCoursesError] = useState("");
  const [roadmaps, setRoadmaps] = useState<RoadmapSummary[] | null | undefined>(undefined);
  const [roadmapsError, setRoadmapsError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [domain, setDomain] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    setRoadmaps(undefined);
    learningApi.roadmaps().then(setRoadmaps).catch((e: unknown) => { setRoadmapsError(errorMessage(e)); setRoadmaps(null); });
  }, [reloadKey]);
  useEffect(() => {
    if (tab === "roadmaps") return;
    let active = true;
    setCourses(undefined);
    const req = tab === "mine" ? learningApi.myCourses() : learningApi.courses(domain, q);
    req
      .then((list) => active && setCourses(list))
      .catch((e: unknown) => {
        if (!active) return;
        setCoursesError(errorMessage(e));
        setCourses(null);
      });
    return () => {
      active = false;
    };
  }, [tab, domain, q, reloadKey]);

  const retry = <button className="btn ghost sm" onClick={() => setReloadKey((k) => k + 1)}>Thử lại</button>;

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

      {tab !== "roadmaps" && (courses === undefined ? <Loading /> : courses === null ? (
        <Alert>{coursesError || "Không tải được danh sách khoá học."} {retry}</Alert>
      ) : courses.length === 0 ? (
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

      {tab === "roadmaps" && (roadmaps === undefined ? <Loading /> : roadmaps === null ? (
        <Alert>{roadmapsError || "Không tải được danh sách roadmap."} {retry}</Alert>
      ) : roadmaps.length === 0 ? (
        <Empty>Chưa có roadmap nào.</Empty>
      ) : (
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
      ))}
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
