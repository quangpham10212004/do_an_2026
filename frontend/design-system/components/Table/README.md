# Table

Tables list records people compare across columns (transactions, users, audit log).

- Put the table directly in a `Card` with no body padding. `Table` wraps itself in `.table-wrap` so it scrolls sideways on phones instead of widening the page.
- Right-align money and counts with `.num`; IDs and codes use `.mono`. Numerals are tabular.
- Status column uses `StatusBadge`. Row actions are `ghost` `sm` buttons in an `.actions` cell.
- For fewer than ~4 attributes per item, or on mobile-first pages, prefer `ListRow`.

Consumer provides: `<thead>` / `<tbody>` markup.
