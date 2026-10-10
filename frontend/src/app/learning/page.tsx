"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { BookOpen, Map as MapIcon, Search } from "lucide-react";
import { Alert, Badge, Button, Card, Chip, Chips, EmptyState, Input, Loading, PageHeader, Progress, Select, Tabs } from "@/components/ui";
import { domainLabel } from "@/features/profile/api";
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

  const retry = <Button size="sm" variant="ghost" onClick={() => setReloadKey((k) => k + 1)}>Thử lại</Button>;

  return (
    <>
      <PageHeader title="Learning Hub" description="Khoá học, tài liệu và roadmap theo từng hướng đi, để học giữa các phiên mentoring." />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        { id: "mine", label: "Khoá học của tôi" },
        { id: "all", label: "Tất cả khoá học" },
        { id: "roadmaps", label: "Roadmap" },
      ]} />

      {tab === "all" && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Select aria-label="Lĩnh vực" value={domain} onChange={(e) => setDomain(e.target.value)} className="w-auto min-w-[200px]">
            <option value="">Mọi lĩnh vực</option>
            {DOMAINS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <div className="relative w-full max-w-[320px]">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
            <Input type="search" aria-label="Tìm khoá học" placeholder="Tìm khoá học" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
        </div>
      )}

      {tab !== "roadmaps" && (courses === undefined ? <Loading /> : courses === null ? (
        <Alert action={retry}>{coursesError || "Không tải được danh sách khoá học."}</Alert>
      ) : courses.length === 0 ? (
        <Card>
          <EmptyState icon={BookOpen} title={tab === "mine" ? "Bạn chưa đăng ký khoá học nào" : "Không có khoá học phù hợp"}
            action={tab === "mine" && <Button size="sm" onClick={() => setTab("all")}>Xem tất cả khoá học</Button>}>
            {tab === "mine" ? "Đăng ký khoá học để theo dõi tiến độ ở đây." : "Thử lĩnh vực hoặc từ khoá khác."}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((c) => (
            <Link key={c.id} href={`/learning/courses/${c.id}`} className="card flex flex-col gap-3 p-5">
              <div className="flex flex-wrap gap-2"><Badge tone="accent" plain>{domainLabel(c.domain)}</Badge><Badge plain>{LEVELS[c.level]}</Badge></div>
              <div className="text-title-3 font-semibold text-ink">{c.title}</div>
              <p className="line-clamp-3 text-small text-ink-muted">{c.description}</p>
              {c.skills.length > 0 && <Chips>{c.skills.map((s) => <Chip key={s}>{s}</Chip>)}</Chips>}
              <div className="mt-auto flex flex-col gap-2 pt-1">
                <div className="flex justify-between text-small text-ink-muted"><span>{c.materialCount} tài liệu</span>{c.enrolled && <span className="tabular">{c.percentComplete}%</span>}</div>
                {c.enrolled && <Progress value={c.percentComplete} label={`Tiến độ ${c.title}`} />}
              </div>
            </Link>
          ))}
        </div>
      ))}

      {tab === "roadmaps" && (roadmaps === undefined ? <Loading /> : roadmaps === null ? (
        <Alert action={retry}>{roadmapsError || "Không tải được danh sách roadmap."}</Alert>
      ) : roadmaps.length === 0 ? (
        <Card><EmptyState icon={MapIcon} title="Chưa có roadmap nào" /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {roadmaps.map((r) => (
            <Link key={r.id} href={`/learning/roadmaps/${r.id}`} className="card flex flex-col gap-3 p-5">
              <div><Badge tone="accent" plain>{r.track}</Badge></div>
              <div className="text-title-3 font-semibold text-ink">{r.title}</div>
              <p className="line-clamp-3 text-small text-ink-muted">{r.description}</p>
              <div className="mt-auto text-small text-ink-muted tabular">{r.itemCount} bước</div>
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
