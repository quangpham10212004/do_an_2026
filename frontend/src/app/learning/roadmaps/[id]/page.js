"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Loading, PageHead, ProgressBar } from "@/components/ui";
import { learningApi } from "@/features/learning/api";

function Roadmap({ id }) {
  const [roadmap, setRoadmap] = useState(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    learningApi.roadmap(id).then(setRoadmap).catch((e) => { setError(e.message); setRoadmap(null); });
  }, [id]);

  if (roadmap === undefined) return <Loading />;
  if (!roadmap) return <Alert>{error}</Alert>;
  return (
    <>
      <PageHead title={roadmap.title} subtitle={roadmap.description} />
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="row between small"><span>Hoàn thành</span><strong>{roadmap.percentComplete}%</strong></div>
        <ProgressBar value={roadmap.percentComplete} />
      </div>
      <div className="card">
        {roadmap.items.map((item, idx) => (
          <div key={item.id} className="list-item">
            <input
              type="checkbox"
              checked={item.completed}
              style={{ marginTop: 4 }}
              onChange={(e) => learningApi.completeRoadmapItem(item.id, e.target.checked).then(setRoadmap).catch((err) => setError(err.message))}
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

export default function RoadmapPage({ params }) {
  return (
    <RequireAuth>
      <Roadmap id={params.id} />
    </RequireAuth>
  );
}
