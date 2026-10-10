# Tabs

Tabs switch between views of the same collection on one page.

- Use `Tabs` for status filters over a list (Sắp tới / Đã qua) and for splitting a long settings page; show a `count` when it helps triage.
- `Segmented` for 2–4 mutually exclusive display options (Tuần / Tháng, Mentee / Mentor).
- Don't use tabs for navigation between pages; that is the sidebar's job.

Consumer provides: `tabs` ([{ id, label, count? }]), `value`, `onChange`.
