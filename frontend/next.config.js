/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build dạng standalone để image Docker gọn nhẹ.
  // Việc chuyển tiếp /api/* tới các microservice nằm ở src/app/api/[service]/[...path]/route.ts
  // (đọc URL service lúc runtime, nên không phải build lại image khi đổi địa chỉ service).
  output: "standalone",
  reactStrictMode: true,
  // Ổ exFAT trả EISDIR khi readlink file thường làm webpack lỗi; dự án không dùng symlink nên tắt phân giải symlink.
  webpack: (config) => {
    config.resolve.symlinks = false;
    return config;
  },
};

module.exports = nextConfig;
