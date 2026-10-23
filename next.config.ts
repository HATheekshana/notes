import type { NextConfig } from 'next';
const config: NextConfig = { serverExternalPackages: ['node:sqlite'], outputFileTracingRoot: process.cwd(), turbopack: { root: process.cwd() },
  // The service worker must never be cached by the browser, or app updates would not reach installed phones.
  async headers() { return [{ source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Content-Type', value: 'application/javascript; charset=utf-8' }, { key: 'Service-Worker-Allowed', value: '/' }] }]; },
};
export default config;
