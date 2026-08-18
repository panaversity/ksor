import { createMDX } from "fumadocs-mdx/next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const withMDX = createMDX();

// The scaffold repo root, two levels up from system/site. The record
// (<root>/knowledge) lives outside this app dir, so Turbopack's
// module-resolution root and Next's file tracing are both anchored there —
// resolved from this file's own location so it holds wherever the repo lands.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Static export: `pnpm build` writes the whole site into out/, servable
  // from any static host. No redirects here — they don't work under export.
  output: "export",
  // Emit docs/example/index.html rather than docs/example.html — the layout
  // every static file host serves correctly, GitHub Pages included.
  trailingSlash: true,
  images: { unoptimized: true },
  // Hosting under a sub-path (e.g. a GitHub Pages project site):
  //   KSOR_BASE_PATH="/my-repo" pnpm build
  basePath: process.env.KSOR_BASE_PATH ?? "",
  turbopack: {
    root: repoRoot,
  },
  outputFileTracingRoot: repoRoot,
};

export default withMDX(config);
