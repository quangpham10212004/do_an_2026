// Không có "use client": layout (server component) nhúng chuỗi script này vào <head>.
export const THEME_KEY = "mmp-theme";

/** Script chạy trước khi vẽ trang để không nháy sai theme (người dùng đã chọn sáng/tối trong menu tài khoản). */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
