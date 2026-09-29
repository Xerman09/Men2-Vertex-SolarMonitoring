import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["192.168.1.*", "192.168.1.202", "100.74.111.35", "*.local", "*.lan"],
};

export default nextConfig;
