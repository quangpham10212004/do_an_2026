# Button

Buttons trigger an action on the current page; `ButtonLink` navigates.

- One `primary` per view: the action the page exists for (Đặt lịch, Gửi yêu cầu, Lưu thay đổi).
- `secondary` (default) for everything else; `ghost` for low-emphasis actions in toolbars, dialogs (Huỷ) and table rows.
- `danger` only inside a confirmation step or for an irreversible action; `danger-quiet` (red text, neutral fill) for a destructive action sitting among other actions.
- Sizes: `sm` (30px) in table rows, card headers and dense lists; `md` (36px) default; `lg` (44px) on the landing page and auth forms.
- Label = verb + object, sentence case, no full stop. Add a Lucide `icon` when it speeds scanning; icon-only buttons need `iconOnly` + `label`.
- `loading` shows a spinner and disables the button; keep the label (Đang gửi…).

Consumer provides: `variant`, `size`, `icon`, `loading`, `onClick` / `type="submit"`, children (label).
