import Link from "next/link";

/** Footer: dải Eager Green full-bleed (DESIGN.md — "Footer Background"). */
export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div>
          <div className="footer-brand">MentorHub</div>
          <p>Học lập trình có định hướng cùng mentor phù hợp — AI Matching, AI Interview, CV enrichment.</p>
        </div>
        <div>
          <h4>Nền tảng</h4>
          <ul>
            <li><Link href="/matching">Tìm mentor</Link></li>
            <li><Link href="/learning">Learning Hub</Link></li>
            <li><Link href="/referral">Giới thiệu bạn bè</Link></li>
          </ul>
        </div>
        <div>
          <h4>Tài khoản</h4>
          <ul>
            <li><Link href="/register">Đăng ký</Link></li>
            <li><Link href="/login">Đăng nhập</Link></li>
            <li><Link href="/notifications">Thông báo</Link></li>
          </ul>
        </div>
        <div>
          <h4>Đồ án tốt nghiệp</h4>
          <p>Phạm Ngọc Quang · Đinh Quyết Thắng · Phạm Ninh Phương Thảo</p>
          <p>Lớp E22CNPM03 — GVHD: Đào Ngọc Phong</p>
        </div>
      </div>
    </footer>
  );
}
