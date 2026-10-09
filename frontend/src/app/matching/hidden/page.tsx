"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { Alert, Empty, Loading, PageHead } from "@/components/ui";
import { NOT_RELEVANT_LABELS, matchingApi } from "@/features/matching/api";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { MatchFeedback, SessionUser } from "@/types";

/** US-36 — mentor đang bị ẩn khỏi gợi ý ("Không phù hợp"), bỏ ẩn sớm được. */
function Hidden({ user }: { user: SessionUser }) {
  const [items, setItems] = useState<MatchFeedback[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => matchingApi.hiddenMentors(user.userId).then(setItems).catch((e) => setError(errorMessage(e))), [user]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <>
      <PageHead title="Mentor đã ẩn" subtitle="Mentor bạn đánh dấu “Không phù hợp” không xuất hiện trong gợi ý trong 30 ngày.">
        <Link className="btn secondary" href="/matching">← AI Matching</Link>
      </PageHead>
      <Alert>{error}</Alert>
      {!items ? <Loading /> : items.length === 0 ? <Empty>Bạn chưa ẩn mentor nào.</Empty> : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Mentor</th><th>Lý do</th><th>Ẩn đến</th><th></th></tr></thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.id}>
                  <td><Link href={`/mentors/${f.mentorId}`}>Xem hồ sơ</Link></td>
                  <td>{NOT_RELEVANT_LABELS[f.reason]}{f.note ? ` — ${f.note}` : ""}</td>
                  <td>{formatDate(f.hiddenUntil)}</td>
                  <td><button className="btn secondary sm" onClick={() => matchingApi.unhide(user.userId, f.mentorId).then(load).catch((e) => setError(errorMessage(e)))}>Bỏ ẩn</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function HiddenMentorsPage() {
  return <RequireAuth roles={["MENTEE"]}>{(user) => <Hidden user={user} />}</RequireAuth>;
}
