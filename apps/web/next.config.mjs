/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship compiled JS, but transpiling keeps source maps and
  // lets Next tree-shake them properly.
  transpilePackages: ['@gymos/core', '@gymos/contracts'],
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000',
  },
};
export default nextConfig;
