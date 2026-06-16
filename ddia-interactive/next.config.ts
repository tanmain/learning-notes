import type { NextConfig } from "next";

// ESLint deps are intentionally omitted (a transitive package, is-document.all,
// is blocked by the corporate npm proxy). Next 16 no longer runs ESLint during
// `next build`, so there's nothing to disable — tsc type-checking still runs.
const nextConfig: NextConfig = {};

export default nextConfig;
