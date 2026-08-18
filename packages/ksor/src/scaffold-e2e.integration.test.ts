/// <reference lib="dom" />
// The page.evaluate callback runs in the browser; only this file needs DOM types.
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Spec acceptance (4)+(5): the scaffolded site serves the example document in
// a REAL browser — both themes, zero console errors, zero external requests —
// and hot-reloads a knowledge edit. Heavy (pnpm install + chromium), so gated:
//   KSOR_E2E=1 pnpm exec vitest run --config vitest.integration.config.ts packages/ksor/src/scaffold-e2e.integration.test.ts
const enabled = process.env.KSOR_E2E === "1";
const distCli = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));

describe.runIf(enabled)("scaffold e2e — the site, in a real browser", () => {
  let work: string;
  let project: string;

  beforeAll(() => {
    work = mkdtempSync(path.join(tmpdir(), "ksor-e2e-"));
    const init = spawnSync(process.execPath, [distCli, "init", "walkthrough"], {
      cwd: work,
      encoding: "utf8",
    });
    expect(init.status, init.stderr).toBe(0);
    project = path.join(work, "walkthrough");
    const install = spawnSync("pnpm", ["install"], { cwd: project, encoding: "utf8" });
    expect(
      install.status,
      (install.stderr ?? String(install.error ?? "spawn failed")).slice(-2000),
    ).toBe(0);
  }, 300_000);

  afterAll(() => {
    if (work) rmSync(work, { recursive: true, force: true });
  });

  it("static build serves the record: llms.txt index, distinct themes, no console errors, no external requests", async () => {
    const build = spawnSync("pnpm", ["build"], { cwd: project, encoding: "utf8" });
    expect(build.status, (build.stderr ?? String(build.error ?? "spawn failed")).slice(-2000)).toBe(
      0,
    );

    const outDir = path.join(project, "system", "site", "out");
    // Real content types: a classic worker's importScripts refuses
    // non-JavaScript MIME, so a typeless server can hide a broken worker
    // (found live in the Docusaurus shell's search, 2026-08-18).
    const mime: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".txt": "text/plain",
    };
    const server = createServer((req, res) => {
      const url = (req.url ?? "/").split("?")[0] ?? "/";
      const candidates = [url, `${url}/index.html`, `${url}index.html`, `${url}.html`];
      for (const candidate of candidates) {
        try {
          const body = readFileSync(path.join(outDir, candidate));
          res.writeHead(200, {
            "content-type": mime[path.extname(candidate)] ?? "application/octet-stream",
          });
          res.end(body);
          return;
        } catch {
          // try next candidate
        }
      }
      res.writeHead(404);
      res.end("not found");
    });
    // Ephemeral port: a fixed one raced other local servers (same class the
    // conformance suite fixed; review finding, 2026-08-18).
    const port = await new Promise<number>((resolve) =>
      server.listen(0, () => {
        const address = server.address();
        if (address === null || typeof address === "string") throw new Error("no port assigned");
        resolve(address.port);
      }),
    );
    const base = `http://localhost:${port}`;

    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      // The agent-facing index: headed by THIS instance's name (not a generic
      // "# Docs"), and every link it advertises must actually resolve.
      const llms = await (await fetch(`${base}/llms.txt`)).text();
      expect(
        llms.split("\n")[0],
        `llms.txt first line: ${JSON.stringify(llms.slice(0, 120))}`,
      ).toBe("# walkthrough");
      const firstLink = /^- \[[^\]]*]\((?<url>[^)]+)\)/m.exec(llms)?.groups?.url;
      expect(firstLink, `llms.txt body: ${JSON.stringify(llms.slice(0, 300))}`).toBeDefined();
      const linked = await fetch(`${base}${firstLink}`);
      expect(linked.status, `GET ${firstLink} from the static export`).toBe(200);

      const backgrounds: Record<string, string> = {};
      for (const colorScheme of ["light", "dark"] as const) {
        const context = await browser.newContext({ colorScheme });
        const page = await context.newPage();
        const consoleErrors: string[] = [];
        const externalRequests: string[] = [];
        page.on("console", (msg) => {
          if (msg.type() === "error") consoleErrors.push(msg.text());
        });
        // Uncaught page errors never reach the console listener — a broken
        // worker or module fails silently without this (found live).
        page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
        page.on("request", (req) => {
          if (!req.url().startsWith(base)) externalRequests.push(req.url());
        });

        await page.goto(`${base}/docs/example/`, { waitUntil: "networkidle" });
        await expect
          .poll(() => page.locator("h1").first().textContent(), { timeout: 10_000 })
          .toContain("Your first governed document");
        const background = await page.evaluate(
          () => getComputedStyle(document.body).backgroundColor,
        );
        // The four-defects rule: assert computed style, and print what we saw.
        expect(background, `computed body background in ${colorScheme}`).toMatch(/^rgb/);
        backgrounds[colorScheme] = background;
        expect(
          consoleErrors,
          `console errors in ${colorScheme}: ${consoleErrors.join(" | ")}`,
        ).toEqual([]);
        expect(
          externalRequests,
          `external requests in ${colorScheme}: ${externalRequests.join(" | ")}`,
        ).toEqual([]);
        await context.close();
      }
      // A theme that "works" by painting the same colour twice is no theme.
      expect(
        backgrounds.dark,
        `body background light=${backgrounds.light} dark=${backgrounds.dark}`,
      ).not.toBe(backgrounds.light);
    } finally {
      await browser.close();
      server.close();
    }
  }, 240_000);

  it("dev server hot-reloads a knowledge edit", async () => {
    // A dedicated port, and proof we reached OUR server: on a machine where
    // :3000 is already serving some other project, Next silently binds the
    // next free port and the poll below would green-light a stranger's site
    // (found live 2026-08-18 — the poll hit a long-running demo server).
    // detached: SIGTERM to the pnpm wrapper alone orphans `next dev`, which
    // keeps the port and lets a re-run's poll green-light the stale server
    // (review finding, 2026-08-18) — kill the whole process group instead.
    const dev = spawn("pnpm", ["dev", "--port", "3217"], {
      cwd: project,
      stdio: "ignore",
      detached: true,
    });
    try {
      // Wait for the dev server, then confirm the page, then edit and poll.
      const url = "http://localhost:3217/docs/example/";
      await expect
        .poll(
          async () => {
            try {
              const res = await fetch(url);
              return res.status;
            } catch {
              return 0;
            }
          },
          { timeout: 120_000, interval: 1_000 },
        )
        .toBe(200);
      expect(await (await fetch(url)).text(), "the dev server must be this project's").toContain(
        "walkthrough",
      );
      const marker = "hot-reload-proof-4173";
      appendFileSync(path.join(project, "knowledge", "example.md"), `\n${marker}\n`);
      await expect
        .poll(async () => (await fetch(url)).text(), { timeout: 60_000, interval: 2_000 })
        .toContain(marker);
    } finally {
      try {
        if (dev.pid !== undefined) process.kill(-dev.pid, "SIGTERM");
        else dev.kill("SIGTERM");
      } catch {
        dev.kill("SIGTERM");
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }, 240_000);
});

describe.runIf(!enabled)("scaffold e2e (gated)", () => {
  it("skipped — set KSOR_E2E=1 to run the full scaffold walkthrough", () => {
    expect(enabled).toBe(false);
  });
});
