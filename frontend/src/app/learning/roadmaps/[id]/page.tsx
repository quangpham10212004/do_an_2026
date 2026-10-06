"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead, ProgressBar } from "@/components/ui";
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
  if (!roadmap) return <Alert>{error || "Không tìm thấy roadmap."} <Link href="/learning">← Learning Hub</Link></Alert>;
  return (
    <>
      <PageHead title={roadmap.title} subtitle={roadmap.description} />
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="row between small"><span>Hoàn thành</span><strong>{roadmap.percentComplete}%</strong></div>
        <ProgressBar value={roadmap.percentComplete} />
      </div>
      <div className="card">
        {roadmap.items.length === 0 && <p className="muted">Roadmap chưa có bước nào.</p>}
        {roadmap.items.map((item, idx) => (
          <div key={item.id} className="list-item">
            <input
              type="checkbox"
              checked={item.completed}
              style={{ marginTop: 4 }}
              onChange={(e) => learningApi.completeRoadmapItem(item.id, e.target.checked).then(setRoadmap).catch((err) => setError(errorMessage(err)))}
            />
            <div style={{ flex: 1 }}>
              <strong>Bước {idx + 1}: {item.title}</strong>
              <div className="muted small">{item.description}</div>
            </div>
            {item.courseId && <Link className="btn secondary sm" href={`/learning/courses/${item.courseId}`}>{item.courseTitle}</Link>}
          </div>
        ))}
      </div>
      <Alert>{error}</Alert>
      <p className="small" style={{ marginTop: "1rem" }}><Link href="/learning">← Learning Hub</Link></p>
    </>
  );
}

export default function RoadmapPage({ params }: { params: { id: string } }) {
  return (
    <RequireAuth>
      <Roadmap id={params.id} />
    </RequireAuth>
  );
}
