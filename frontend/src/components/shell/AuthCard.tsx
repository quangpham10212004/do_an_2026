import type { ReactNode } from "react";

/** Thẻ biểu mẫu căn giữa cho đăng nhập, đăng ký, khôi phục mật khẩu, xác thực email. */
export default function AuthCard({ title, description, children, footer }: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="auth">
      <div className="card auth-card">
        <div className="card-body">
          <div>
            <h1 className="auth-title">{title}</h1>
            {description && <p className="mt-1 text-ink-muted">{description}</p>}
          </div>
          {children}
        </div>
        {footer && <div className="card-foot justify-center text-small text-ink-muted">{footer}</div>}
      </div>
    </div>
  );
}
