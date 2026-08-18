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
    expect(install.status, install.stderr.slice(-2000)).toBe(0);
  }, 300_000);

  afterAll(() => {
    if (work) rmSync(work, { recursive: true, force: true });
  });

  it("static build renders in chromium: content, both themes, no console errors, no external requests", async () => {
    const build = spawnSync("pnpm", ["build"], { cwd: project, encoding: "utf8" });
    expect(build.status, build.stderr.slice(-2000)).toBe(0);

    const outDir = path.join(project, "system", "site", "out");
    const server = createServer((req, res) => {
      const url = (req.url ?? "/").split("?")[0];
      const candidates = [url, `${url}/index.html`, `${url}index.html`, `${url}.html`];
      for (const candidate of candidates) {
        try {
          const body = readFileSync(path.join(outDir, candidate));
          res.writeHead(200);
          res.end(body);
          return;
        } catch {
          // try next candidate
        }
      }
      res.writeHead(404);
      res.end("not found");
    });
    await new Promise<void>((resolve) => server.listen(4173, resolve));

    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      for (const colorScheme of ["light", "dark"] as const) {
        const context = await browser.newContext({ colorScheme });
        const page = await context.newPage();
        const consoleErrors: string[] = [];
        const externalRequests: string[] = [];
        page.on("console", (msg) => {
          if (msg.type() === "error") consoleErrors.push(msg.text());
        });
        page.on("request", (req) => {
          if (!req.url().startsWith("http://localhost:4173")) externalRequests.push(req.url());
        });

        await page.goto("http://localhost:4173/docs/example/", { waitUntil: "networkidle" });
        await expect
          .poll(() => page.locator("h1").first().textContent(), { timeout: 10_000 })
          .toContain("Your first governed document");
        const background = await page.evaluate(
          () => getComputedStyle(document.body).backgroundColor,
        );
        // The four-defects rule: assert computed style, and print what we saw.
        expect(background, `computed body background in ${colorScheme}`).toMatch(/^rgb/);
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
    } finally {
      await browser.close();
      server.close();
    }
  }, 240_000);

  it("dev server hot-reloads a knowledge edit", async () => {
    const dev = spawn("pnpm", ["dev"], { cwd: project, stdio: "ignore" });
    try {
      // Wait for the dev server, then confirm the page, then edit and poll.
      const url = "http://localhost:3000/docs/example/";
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
      const marker = "hot-reload-proof-4173";
      appendFileSync(path.join(project, "knowledge", "example.md"), `\n${marker}\n`);
      await expect
        .poll(async () => (await fetch(url)).text(), { timeout: 60_000, interval: 2_000 })
        .toContain(marker);
    } finally {
      dev.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }, 240_000);
});

describe.runIf(!enabled)("scaffold e2e (gated)", () => {
  it("skipped — set KSOR_E2E=1 to run the full scaffold walkthrough", () => {
    expect(enabled).toBe(false);
  });
});
