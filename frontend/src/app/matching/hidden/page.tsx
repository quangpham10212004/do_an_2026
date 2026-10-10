"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { EyeOff } from "lucide-react";
import { Alert, Button, Card, EmptyState, Loading, PageHeader, Table } from "@/components/ui";
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
      <PageHeader
        title="Mentor đã ẩn"
        description="Mentor bạn đánh dấu “Không phù hợp” không xuất hiện trong gợi ý trong 30 ngày."
        back={{ href: "/matching", label: "AI Matching" }}
      />
      <Alert className="mb-6">{error}</Alert>
      {!items ? <Loading /> : (
        <Card>
          {items.length === 0 ? <EmptyState icon={EyeOff} title="Bạn chưa ẩn mentor nào">Mentor bạn ẩn từ trang AI Matching sẽ hiện ở đây.</EmptyState> : (
            <Table>
              <thead><tr><th>Mentor</th><th>Lý do</th><th>Ẩn đến</th><th></th></tr></thead>
              <tbody>
                {items.map((f) => (
                  <tr key={f.id}>
                    <td><Link href={`/mentors/${f.mentorId}`}>Xem hồ sơ</Link></td>
                    <td>{NOT_RELEVANT_LABELS[f.reason]}{f.note ? <span className="text-ink-muted"> · {f.note}</span> : ""}</td>
                    <td className="tabular">{formatDate(f.hiddenUntil)}</td>
                    <td className="actions">
                      <Button size="sm" onClick={() => matchingApi.unhide(user.userId, f.mentorId).then(load).catch((e) => setError(errorMessage(e)))}>Bỏ ẩn</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}

export default function HiddenMentorsPage() {
  return <RequireAuth roles={["MENTEE"]}>{(user) => <Hidden user={user} />}</RequireAuth>;
}
