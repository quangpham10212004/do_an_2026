# EmptyState

Fills a list or card that has nothing to show yet, and says what will appear and how to start.

- `title` names what is missing; the text explains what will show up; `action` is the one next step (often primary).
- `Loading` (spinner + "Đang tải…") while fetching; `Skeleton` blocks when the layout is known.

Consumer provides: `icon`, `title`, children, `action`.
