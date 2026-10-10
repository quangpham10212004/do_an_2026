# AppShell

The signed-in frame: a role-specific sidebar, a top bar and the page content.

- Sidebar groups (Mentee): Tổng quan · Tìm mentor · Mentoring · Phát triển · Tài khoản. Mentor: Tổng quan · Mentoring · Thu nhập · Hồ sơ mentor. Admin: Tổng quan · Người dùng · Tài chính · Kiểm duyệt.
- The active item uses `accent-soft` / `accent-ink` and `aria-current="page"`. Unread messages show a `Count`.
- Top bar: page title, notification bell with count, account menu (account settings, theme: Sáng / Tối / Theo hệ thống, sign out).
- Below 960px the sidebar is a drawer opened from the menu button.
- The email-verification `banner` sits under the top bar when needed.

Consumer provides: the page content; navigation comes from the user's role.
