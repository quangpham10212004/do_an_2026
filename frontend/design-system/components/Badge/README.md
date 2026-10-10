# Badge

Badges label the state of an object; `Count` shows an unread number.

- Use `StatusBadge status={…}`: it looks up the Vietnamese label and the tone from `statusTone` / `mentoringTone`, so the same state always looks the same everywhere.
- Tones: `success` done/paid/approved, `warning` waiting on someone, `danger` failed/cancelled/rejected, `info` scheduled or informational, `accent` a product highlight (AI đề xuất), `neutral` everything else.
- Badges are read-only. For selectable tags use `Chip`.
- `Count` (danger fill) only for unread items in navigation and the bell; hide it at 0.

Consumer provides: `tone`, children; or `status` (+ optional `labels`, `tone` function) for `StatusBadge`.
