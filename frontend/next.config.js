/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build dạng standalone để image Docker gọn nhẹ.
  // Việc chuyển tiếp /api/* tới các microservice nằm ở src/app/api/[service]/[...path]/route.js
  // (đọc URL service lúc runtime, nên không phải build lại image khi đổi địa chỉ service).
  output: "standalone",
  reactStrictMode: true,
};

module.exports = nextConfig;
