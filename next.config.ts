import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Restrict allowed development origins to localhost and explicitly configured host
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(',').map((s) => s.trim())
    : ['localhost:3005', '127.0.0.1:3005'],
  async redirects() {
    return [
      {
        source: '/energy-flow',
        destination: '/',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
