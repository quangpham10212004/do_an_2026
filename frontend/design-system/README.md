MentorHub connects programming learners (mentees) with vetted mentors: AI Matching, AI Interview for mentor vetting, CV-driven goal setting, paid sessions and a Learning Hub. The interface is a calm, professional work tool. People come here to make decisions about their career and their money, so every screen should feel trustworthy, legible and quiet. The interface itself is in Vietnamese.

## Principles

- **Quiet surfaces, one accent.** Neutral canvas (`bg`), white work surfaces (`surface`), and a single pine accent (`accent`) that always means "act here" or "you are here". Never use `accent` as decoration.
- **State is shown in form, not only colour.** Every status pairs a word with a colour (`StatusBadge`). Success and danger also differ in lightness, so they never rely on a red/green hue difference alone.
- **Data reads like data.** Money, counts, IDs and match scores use `--font-mono` with tabular numerals (`stat-value`, `.mono`, `.tabular`).
- **Summary before detail.** Pages open with a `PageHeader`, then a `Stats` row or the one primary card, then lists.

## Content

- Vietnamese, sentence case, no trailing full stop on buttons or labels: "Gửi yêu cầu", "Đặt lịch", "Lưu thay đổi".
- Address the user as "bạn". Name things the way people recognise them: "Phiên học" (session), "Quan hệ mentoring", "Thu nhập".
- Buttons say exactly what happens. Confirmations repeat the verb: "Huỷ phiên học" opens a dialog whose confirm button says "Huỷ phiên".
- Errors say what went wrong and how to fix it: "Email này đã được đăng ký. Đăng nhập hoặc dùng email khác."
- Money: `300.000 đ`, `300.000 đ/giờ`, `Miễn phí`. Dates: `10/10/2026`, times `14:30`, shown in the viewer's time zone.
- No emoji in UI chrome. Product names keep their English form: AI Matching, AI Interview, Learning Hub.

## Colour

- Canvas `bg`; cards, tables, inputs and the top bar `surface`; wells, table headers and chat history `surface-sunken`; row and nav hover `surface-hover`.
- Text: `ink` for headings and body, `ink-muted` for secondary copy and labels, `ink-subtle` only for placeholders and timestamps on `surface`.
- Lines: `border` for card outlines and row dividers (decorative); `border-strong` for control borders (inputs, checkboxes), which must hold 3:1.
- Accent: `accent` fill with `on-accent` text for the one primary button per view; `accent-soft` + `accent-ink` for selected nav items, selected chips and accent badges; `accent` for links and the focus ring.
- Status pairs (text on soft ground): `info`/`info-soft`, `success`/`success-soft`, `warning`/`warning-soft`, `danger`/`danger-soft`. Destructive buttons: `danger` fill with `on-danger`.
- `amber` is only for rating stars and "featured" highlights. It is not a warning colour.
- Both themes are first-class. Light is the default. Dark follows the OS until the user picks one in the account menu (`data-theme` on `<html>`).

## Type

- One family for the interface: **Be Vietnam Pro** (`--font-sans`), designed for Vietnamese diacritics. **JetBrains Mono** (`--font-mono`) for numbers, codes and IDs.
- Page titles `title-1` (24/32, 600). Card and section titles `title-2`/15px 600 (`card-head h2`). Row titles `title-3`.
- Body `body` (14/22). Long reading (session notes, course text, landing) `body-lg` inside `.prose` (max 68ch).
- `label` (12px, 600, uppercase, +0.04em) for eyebrows, stat labels and table headers only.
- `display` (36/44, 700) appears only on the landing hero.

## Space, shape, depth

- 4px grid: `space-1` … `space-12`. Cards pad `space-5` (desktop) / `space-4` (phone). Sections are `space-6` apart. Page gutter `space-8` desktop, `space-4` phone.
- Radii: `radius-sm` badges and chips, `radius-md` buttons and inputs, `radius-lg` cards and dialogs, `radius-full` avatars and the score ring.
- Depth: cards sit on `bg` with a hairline `border` plus `shadow-sm`. Menus use `shadow-md`, dialogs and the mobile drawer `shadow-lg`. No gradients, no glass, no coloured left-border cards.
- Focus: a solid 2px `accent` outline with 2px offset on every interactive element; inputs show `accent` border plus a 3px `accent-soft` ring.
- Motion: 120–180ms ease for hover, drawer and dialog. Disabled for `prefers-reduced-motion`.

## Layout

- Signed-in pages use `AppShell`: a 248px sidebar grouped by role (Mentee, Mentor, Admin), a 56px top bar with the page title, notifications and the account menu, then content in `.page` (max 1160px). Below 960px the sidebar becomes a drawer.
- Public pages (landing, sign-in, registration, password reset) use `PublicShell`. Auth forms sit in a single centred `auth-card` (420px).
- Use CSS grid with `gap` for layout. Two-column pages put the main work on the left (about 2/3) and context on the right; they stack below 960px.

## Iconography

- [Lucide](https://lucide.dev) icons (`lucide-react`), 16px in buttons, 17px in the sidebar, 18px in alerts. Stroke 2, `currentColor`.
- Icons support a label. Icon-only buttons always carry an `aria-label` (`Button iconOnly label="…"`).
- No logo artwork exists. The brand is the wordmark "MentorHub" set in Be Vietnam Pro 700 next to a 28px `accent` square with an "M" (`brand-mark`).

## Components

`Button`, `Card`, `Field` (Input, Select, Textarea, Checkbox), `Badge` (StatusBadge, Count), `Chip`, `Alert`, `Tabs` (Segmented), `Table`, `ListRow`, `DescriptionList`, `Stat`, `Avatar`, `EmptyState` (Loading, Skeleton), `Score` (ScoreRing, Progress, Stars), `PageHeader`, `Dialog`, `Chat`, `SlotPicker`, `AppShell`. In the codebase they live in `frontend/src/components/ui` (React) on top of `components/bundle.css`; read each component's README before using it.
