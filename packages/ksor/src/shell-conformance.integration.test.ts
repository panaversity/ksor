/// <reference lib="dom" />
// The page.evaluate callback runs in the browser; only this file needs DOM types.
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The shell swap seam, proven the only way a seam can be: one suite, two
// implementations (specs/ksor/init/spec.md → surface contract). The Fumadocs
// reference runs as emitted; the Docusaurus shell runs via the swap recipe its
// README documents — same record, same root commands, nothing outside
// system/site/ but the two .gitignore lines and one allowBuilds denial.
// Heavy (two installs + builds + chromium), so gated like the scaffold e2e:
//   KSOR_E2E=1 pnpm exec vitest run --config vitest.integration.config.ts packages/ksor/src/shell-conformance.integration.test.ts
const enabled = process.env.KSOR_E2E === "1";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const distCli = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const docusaurusShell = path.join(repoRoot, "workbench", "shells", "docusaurus");

interface Shell {
  readonly shellName: string;
  readonly port: number;
  readonly swap: ((project: string) => void) | null;
}

const SHELLS: readonly Shell[] = [
  { shellName: "fumadocs", port: 4181, swap: null },
  {
    shellName: "docusaurus",
    port: 4182,
    swap: (project) => {
      // The swap recipe from workbench/shells/docusaurus/README.md, verbatim.
      rmSync(path.join(project, "system", "site"), { recursive: true });
      cpSync(docusaurusShell, path.join(project, "system", "site"), { recursive: true });
      rmSync(path.join(project, "system", "site", "README.md"));
      appendFileSync(
        path.join(project, ".gitignore"),
        "system/site/.docusaurus/\nsystem/site/.generated/\n",
      );
      const workspaceYaml = path.join(project, "pnpm-workspace.yaml");
      // Both denials found live: core-js's postinstall prints a funding
      // banner; @swc/core's (via @docusaurus/faster) only fetches a wasm
      // fallback when the native optionalDependency binding is absent.
      writeFileSync(
        workspaceYaml,
        readFileSync(workspaceYaml, "utf8").replace(
          "allowBuilds:\n",
          "allowBuilds:\n  '@swc/core': false\n  core-js: false\n",
        ),
      );
    },
  },
];

function run(command: string, args: readonly string[], cwd: string): void {
  const result = spawnSync(command, [...args], { cwd, encoding: "utf8" });
  expect(result.status, `${command} ${args.join(" ")}: ${result.stderr.slice(-2000)}`).toBe(0);
}

/** knowledge-relative .md path → site slug under /docs (no trailing slash). */
function docSlug(file: string): string {
  const noExt = file.slice(0, -".md".length);
  if (noExt === "index") return "";
  return noExt.endsWith("/index") ? noExt.slice(0, -"/index".length) : noExt;
}

function knowledgeFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? knowledgeFiles(path.join(dir, entry.name), `${prefix}${entry.name}/`)
      : entry.name.endsWith(".md")
        ? [`${prefix}${entry.name}`]
        : [],
  );
}

// Real content types matter: a classic worker's importScripts refuses
// non-JavaScript MIME, so a typeless server silently breaks search workers
// (found live 2026-08-18 — and it surfaces as a pageerror, not console).
const MIME: Readonly<Record<string, string>> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};

function serveStatic(outDir: string, port: number): Promise<Server> {
  const server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    for (const candidate of [url, `${url}/index.html`, `${url}index.html`, `${url}.html`]) {
      try {
        const body = readFileSync(path.join(outDir, candidate));
        res.writeHead(200, {
          "content-type": MIME[path.extname(candidate)] ?? "application/octet-stream",
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
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

describe.runIf(enabled).each(SHELLS)(
  "surface contract — $shellName shell",
  ({ shellName, port, swap }) => {
    let work: string;
    let project: string;
    let outDir: string;

    beforeAll(() => {
      work = mkdtempSync(path.join(tmpdir(), `ksor-conform-${shellName}-`));
      run(process.execPath, [distCli, "init", `conform-${shellName}`], work);
      project = path.join(work, `conform-${shellName}`);

      // A record with explicit order, a folder, and a description — enough to
      // tell "renders the record" from "renders the example".
      const knowledge = path.join(project, "knowledge");
      writeFileSync(
        path.join(knowledge, "beta.md"),
        "---\ntitle: Beta policy\nstatus: draft\ndescription: first by order\norder: 1\n---\n\nBeta body.\n",
      );
      mkdirSync(path.join(knowledge, "hr"));
      writeFileSync(
        path.join(knowledge, "hr", "index.md"),
        "---\ntitle: HR overview\nstatus: draft\norder: 2\n---\n\nHR body.\n",
      );
      writeFileSync(
        path.join(knowledge, "hr", "pay.md"),
        "---\ntitle: Pay\nstatus: draft\n---\n\nPay body.\n",
      );

      swap?.(project);
      run("pnpm", ["install"], project);
      run("pnpm", ["build"], project);
      outDir = path.join(project, "system", "site", "out");
    }, 600_000);

    afterAll(() => {
      if (work) rmSync(work, { recursive: true, force: true });
    });

    it("clause 1: builds a static export at system/site/out/", () => {
      expect(existsSync(path.join(outDir, "index.html"))).toBe(true);
    });

    it("clause 2: renders every record document at its path-derived route", () => {
      const knowledge = path.join(project, "knowledge");
      for (const file of knowledgeFiles(knowledge)) {
        const slug = docSlug(file);
        const page = path.join(outDir, "docs", slug, "index.html");
        expect(existsSync(page), `${file} → ${page}`).toBe(true);
        const text = readFileSync(path.join(knowledge, file), "utf8");
        const title = /^title:[ \t]*(.*)$/m.exec(text)?.[1]?.trim() ?? "";
        expect(readFileSync(page, "utf8"), `${file}: title not rendered`).toContain(title);
      }
    });

    it("clause 2: the record and kit never notice the shell — pnpm check passes", () => {
      run("node", [path.join(".agents", "skills", "format-checker", "check.mjs")], project);
    });

    it("clause 3: llms.txt names the instance and lists the record in reading order", () => {
      const llms = readFileSync(path.join(outDir, "llms.txt"), "utf8");
      const lines = llms.split("\n");
      expect(lines[0]).toBe(`# conform-${shellName}`);
      const betaAt = llms.indexOf("[Beta policy](/docs/beta): first by order");
      const exampleAt = llms.indexOf("(/docs/example)");
      expect(betaAt, `llms.txt:\n${llms}`).toBeGreaterThanOrEqual(0);
      expect(exampleAt).toBeGreaterThanOrEqual(0);
      // order: 1 beats the order-less example document.
      expect(betaAt).toBeLessThan(exampleAt);
      for (const match of llms.matchAll(/\]\((\/docs\/[^)]+)\)/g)) {
        const target = match[1] ?? "";
        expect(
          existsSync(path.join(outDir, target, "index.html")),
          `llms.txt link ${target} does not resolve in the export`,
        ).toBe(true);
      }
      expect(existsSync(path.join(outDir, "llms-full.txt"))).toBe(true);
    });

    it("clause 4: browser smoke — both themes, no console errors, no external requests", async () => {
      const server = await serveStatic(outDir, port);
      const { chromium } = await import("playwright");
      const browser = await chromium.launch();
      const backgrounds: Record<string, string> = {};
      try {
        for (const colorScheme of ["light", "dark"] as const) {
          const context = await browser.newContext({ colorScheme });
          const page = await context.newPage();
          const consoleErrors: string[] = [];
          const external: string[] = [];
          page.on("console", (msg) => {
            if (msg.type() === "error") consoleErrors.push(msg.text());
          });
          // Uncaught page errors never reach the console listener — a broken
          // worker or module fails silently without this (found live).
          page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
          page.on("request", (req) => {
            if (!req.url().startsWith(`http://localhost:${port}`)) external.push(req.url());
          });
          await page.goto(`http://localhost:${port}/docs/example/`, { waitUntil: "networkidle" });
          await expect
            .poll(() => page.locator("h1").first().textContent(), { timeout: 10_000 })
            .toContain("Your first governed document");
          backgrounds[colorScheme] = await page.evaluate(() => {
            // Docusaurus paints the theme on <html>, Fumadocs on <body>
            // (found live 2026-08-18) — take whichever is painted.
            const html = getComputedStyle(document.documentElement).backgroundColor;
            return html !== "rgba(0, 0, 0, 0)"
              ? html
              : getComputedStyle(document.body).backgroundColor;
          });
          expect(consoleErrors, `console errors in ${colorScheme}`).toEqual([]);
          expect(external, `external requests in ${colorScheme}`).toEqual([]);
          await context.close();
        }
        expect(
          backgrounds.dark,
          `backgrounds light=${backgrounds.light} dark=${backgrounds.dark}`,
        ).not.toBe(backgrounds.light);
      } finally {
        await browser.close();
        server.close();
      }
    }, 240_000);

    it("sub-path hosting: a KSOR_BASE_PATH build prefixes llms.txt and page links", () => {
      const result = spawnSync("pnpm", ["build"], {
        cwd: project,
        encoding: "utf8",
        env: { ...process.env, KSOR_BASE_PATH: "/repo" },
      });
      expect(result.status, result.stderr.slice(-2000)).toBe(0);
      const llms = readFileSync(path.join(outDir, "llms.txt"), "utf8");
      expect(llms, "llms.txt links must carry the base path").toContain("(/repo/docs/");
      expect(llms).not.toContain("](/docs/");
      const home = readFileSync(path.join(outDir, "index.html"), "utf8");
      // Quote-agnostic: the faster pipeline's html minifier strips attribute
      // quotes (found live 2026-08-18), and the prefix is the claim.
      expect(home, "rendered links must carry the base path").toContain("/repo/docs/");
    }, 300_000);
  },
);

describe.runIf(!enabled)("shell conformance (gated)", () => {
  it("skipped — set KSOR_E2E=1 to run both shells through the surface contract", () => {
    expect(enabled).toBe(false);
  });
});
