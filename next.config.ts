import type { NextConfig } from 'next';
const config: NextConfig = { serverExternalPackages: ['node:sqlite'], outputFileTracingRoot: process.cwd(), turbopack: { root: process.cwd() } };
export default config;
