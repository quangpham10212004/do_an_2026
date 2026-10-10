# ListRow

A row in a list of people, requests, sessions, notifications or conversations.

- `title` names the object; `meta` carries one line of context (role, skills, time). `leading` is usually an `Avatar`; `trailing` a status and/or one small action.
- `href` makes the whole row a link; then don't put buttons in `trailing`.
- `unread` tints the row `accent-soft` for unread notifications and messages.
- Use inside `Card` > `List`. Rows wrap on phones.

Consumer provides: `title`, `meta`, `leading`, `trailing`, `href`, `unread`, optional children below the meta.
