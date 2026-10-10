// Không có "use client": layout (server component) nhúng chuỗi script này vào <head>.
export const THEME_KEY = "mmp-theme";

/**
 * Script chạy trước khi vẽ trang để không nháy sai theme. Mặc định theme sáng; "system" theo hệ điều hành,
 * "dark" là tối (người dùng chọn bằng nút sáng/tối hoặc trong menu tài khoản).
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="system")document.documentElement.dataset.theme=t==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}`;
