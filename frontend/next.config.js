/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: "/api/auth/:path*", destination: `${process.env.AUTH_SERVICE_URL}/api/auth/:path*` },
      { source: "/api/profile/:path*", destination: `${process.env.PROFILE_SERVICE_URL}/api/profile/:path*` },
      { source: "/api/learning/:path*", destination: `${process.env.LEARNING_SERVICE_URL}/api/learning/:path*` },
      { source: "/api/matching/:path*", destination: `${process.env.MATCHING_SERVICE_URL}/api/matching/:path*` },
      { source: "/api/mentoring/:path*", destination: `${process.env.MENTORING_SERVICE_URL}/api/mentoring/:path*` },
      { source: "/api/payment/:path*", destination: `${process.env.PAYMENT_SERVICE_URL}/api/payment/:path*` },
    ];
  },
};

module.exports = nextConfig;
