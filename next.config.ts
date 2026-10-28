import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // TEMPORARY: Allow all development origins / local and LAN hosts
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(',').map((s) => s.trim())
    : [
        '*.*.*.*',
        'localhost',
        '*.localhost',
        '127.0.0.1',
        '0.0.0.0',
        '192.168.1.164',
        '192.168.1.202',
        '100.74.111.35',
        'DESKTOP-AJO3B8I',
        '*.local',
        'localhost:3000',
        'localhost:3001',
        'localhost:3002',
        'localhost:3005',
        '127.0.0.1:3000',
        '127.0.0.1:3001',
        '127.0.0.1:3002',
        '127.0.0.1:3005',
        '192.168.1.164:3000',
        '192.168.1.164:3005',
        '192.168.1.202:3000',
        '192.168.1.202:3005',
      ],
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Requested-With, Accept, Origin' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/analytics',
        permanent: false,
      },
      {
        source: '/trigonometric-analytics',
        destination: '/analytics',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
