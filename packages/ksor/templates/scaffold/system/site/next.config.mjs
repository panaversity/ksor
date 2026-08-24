import { createMDX } from "fumadocs-mdx/next";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const withMDX = createMDX();

// The scaffold repo root, two levels up from system/site. The record
// (<root>/knowledge) lives outside this app dir, so Turbopack's
// module-resolution root and Next's file tracing are both anchored there —
// resolved from this file's own location so it holds wherever the repo lands.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// The record keeps ONE .env, at the repo root, because that is where `ksor`
// reads it. This build runs in system/site, so Next would never see it — and an
// adopter following the scaffold's own instructions would set NEXT_PUBLIC_*
// variables that silently never reach the bundle (found live). Read the root
// file here, and let a real environment variable win, which is the same
// precedence the CLI states.
function loadRootEnv() {
  let contents;
  try {
    contents = readFileSync(path.join(repoRoot, ".env"), "utf8");
  } catch {
    return; // no .env is the normal case — only .env.example ships
  }
  for (const line of contents.split("\n")) {
    const match = /^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match?.[1] !== undefined && process.env[match[1]] === undefined) {
      process.env[match[1]] = (match[2] ?? "").trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadRootEnv();

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
