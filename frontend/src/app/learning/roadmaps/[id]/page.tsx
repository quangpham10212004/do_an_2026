"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, ButtonLink, Card, CardBody, EmptyState, Loading, PageHeader, Progress } from "@/components/ui";
import { learningApi } from "@/features/learning/api";
import { errorMessage } from "@/lib/api";
import type { RoadmapDetail } from "@/types";

function Roadmap({ id }: { id: string }) {
  const [roadmap, setRoadmap] = useState<RoadmapDetail | null | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    learningApi.roadmap(id).then(setRoadmap).catch((e) => { setError(errorMessage(e)); setRoadmap(null); });
  }, [id]);

  if (roadmap === undefined) return <Loading />;
  if (!roadmap) return <Alert action={<ButtonLink href="/learning" size="sm">Learning Hub</ButtonLink>}>{error || "Không tìm thấy roadmap."}</Alert>;
  return (
    <div className="max-w-[860px]">
      <PageHeader back={{ href: "/learning", label: "Learning Hub" }} title={roadmap.title} description={roadmap.description} />
      <div className="flex flex-col gap-6">
        <Alert>{error}</Alert>
        <Card>
          <CardBody className="flex flex-col gap-2">
            <div className="flex justify-between text-small"><span className="text-ink-muted">Hoàn thành</span><strong className="tabular">{roadmap.percentComplete}%</strong></div>
            <Progress value={roadmap.percentComplete} label="Tiến độ roadmap" />
          </CardBody>
        </Card>
        <Card>
          {roadmap.items.length === 0 ? <EmptyState title="Roadmap chưa có bước nào" /> : (
            <ol className="relative flex flex-col">
              {roadmap.items.map((item, idx) => (
                <li key={item.id} className="relative flex gap-4 px-5 py-4">
                  {idx < roadmap.items.length - 1 && <span aria-hidden="true" className="absolute top-12 bottom-0 left-[35px] w-px bg-border" />}
                  <label className={`relative z-[1] grid size-8 flex-none cursor-pointer place-items-center rounded-full border font-mono text-small ${item.completed ? "border-accent bg-accent text-on-accent" : "border-border-strong bg-surface text-ink-muted"}`}>
                    <input type="checkbox" className="sr-only" checked={item.completed} aria-label={`Hoàn thành bước ${idx + 1}: ${item.title}`}
                      onChange={(e) => learningApi.completeRoadmapItem(item.id, e.target.checked).then(setRoadmap).catch((err) => setError(errorMessage(err)))} />
                    {item.completed ? "✓" : idx + 1}
                  </label>
                  <div className="min-w-0 flex-1 pt-1">
                    <div className={`font-semibold ${item.completed ? "text-ink-muted" : ""}`}>{item.title}</div>
                    <p className="text-small text-ink-muted">{item.description}</p>
                    {item.courseId && (
                      <Link className="mt-2 inline-block text-small" href={`/learning/courses/${item.courseId}`}>Khoá học: {item.courseTitle}</Link>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function RoadmapPage({ params }: { params: { id: string } }) {
  return (
    <RequireAuth>
      <Roadmap id={params.id} />
    </RequireAuth>
  );
}
