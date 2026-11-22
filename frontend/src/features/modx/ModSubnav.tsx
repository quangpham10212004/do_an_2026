import Link from "next/link";

/** Tab điều hướng giữa hai màn kiểm duyệt tin nhắn; số trong ngoặc là số mục cần xem. */
export default function ModSubnav({ active, reports, violations }: { active: "reports" | "violations"; reports?: number; violations?: number }) {
  return (
    <nav className="adm-subnav" aria-label="Loại kiểm duyệt">
      <Link href="/admin/message-reports" aria-current={active === "reports" ? "page" : undefined}>Báo cáo tin nhắn{reports != null && ` (${reports})`}</Link>
      <Link href="/admin/contact-violations" aria-current={active === "violations" ? "page" : undefined}>Vi phạm liên hệ{violations != null && ` (${violations})`}</Link>
    </nav>
  );
}
