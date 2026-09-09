import type { NextConfig } from "next";

/**
 * TechFlow is a fully static site: no backend, no database, no auth.
 * `output: "export"` writes plain HTML/CSS/JS to ./out so it can be hosted anywhere
 * (GitHub Pages, Cloudflare Pages, Netlify, S3, nginx …).
 *
 * NEXT_PUBLIC_BASE_PATH  → set when hosting under a sub-path (e.g. "/techflow" on GitHub Pages)
 * NEXT_PUBLIC_SITE_URL   → absolute origin (+ base path) used for canonical / sitemap URLs
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") || undefined;

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
