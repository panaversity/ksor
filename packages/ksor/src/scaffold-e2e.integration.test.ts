/// <reference lib="dom" />
// The page.evaluate callback runs in the browser; only this file needs DOM types.
import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildScaffold } from "./e2e-build.js";
import { cleanupLocalKsor, expectLocalKsorResolved, injectLocalKsor } from "./e2e-local-ksor.js";

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
    // Resolve the scaffold's `@panaversity/ksor` self-pin to the LOCAL build,
    // not the registry: the pin is the exact (unpublished-in-CI) CLI version.
    const localKsor = injectLocalKsor(project);
    // A fresh scaffold's FIRST install is non-frozen by design: the served tool
    // is pinned to the exact CLI version, which the committed site-only lockfile
    // cannot pre-resolve — so pnpm adds it and writes the lock.
    // `--no-frozen-lockfile` is required because pnpm defaults to frozen under
    // CI=true; it models the adopter's real first `pnpm install`.
    // --config.minimumReleaseAge=0: the scaffold's 48h dependency quarantine is
    // correct for an adopter and non-deterministic for CI (a transitive dep
    // publishing today fails the job — found live 2026-08-20).
    const install = spawnSync(
      "pnpm",
      ["install", "--no-frozen-lockfile", "--config.minimumReleaseAge=0"],
      {
        cwd: project,
        encoding: "utf8",
      },
    );
    expect(
      install.status,
      (install.stderr ?? String(install.error ?? "spawn failed")).slice(-2000),
    ).toBe(0);
    // …and prove it was OUR build, not the published package of the same version.
    expectLocalKsorResolved(project, localKsor);
    cleanupLocalKsor(localKsor);
  }, 300_000);

  afterAll(() => {
    if (work) rmSync(work, { recursive: true, force: true });
  });

  it("static build serves the record: llms.txt index, distinct themes, no console errors, no external requests", async () => {
    const build = buildScaffold(project);
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
      // The slug lives in llms.txt (pages now show the display title), and
      // the slug is the identity this guard exists to check.
      expect(
        (await (await fetch("http://localhost:3217/llms.txt")).text()).split("\n")[0],
        "the dev server must be this project's",
      ).toBe("# walkthrough");
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

  // specs/ksor/site-governance/spec.md — the record enforces a governance
  // vocabulary on every document, and until this landed the site parsed four of
  // those keys and threw them away. Asserted on the SHIPPED BYTES of a static
  // export, not on a component in isolation: the failure this prevents is a
  // superseded document served looking exactly like an approved one.
  it("renders each document's declared governance, and infers nothing", () => {
    const doc = (name: string, frontmatter: string, body: string): void =>
      writeFileSync(
        path.join(project, "knowledge", `${name}.md`),
        `---\n${frontmatter}\n---\n\n${body}\n`,
      );

    doc(
      "refund-policy",
      [
        "title: Refund policy",
        "status: superseded",
        "order: 2",
        "owner: Finance",
        "effective: 2026-01-15",
        "provenance:",
        "  - Board minutes 2026-01-11",
        "  - Terms of service v4",
        "superseded_by: ./refund-policy-v5.md",
      ].join("\n"),
      "Refunds are issued within 30 days of purchase.",
    );
    doc(
      "refund-policy-v5",
      ["title: Refund policy v5", "status: approved", "order: 3", "owner: Finance"].join("\n"),
      "Refunds are issued within 60 days of purchase.",
    );

    // The fixtures must be legal record content, or this suite proves the site
    // renders something no adopter could write.
    const check = spawnSync(
      process.execPath,
      [path.join(project, ".agents", "skills", "format-checker", "check.mjs")],
      { cwd: project, encoding: "utf8" },
    );
    expect(check.status, `${check.stdout}${check.stderr}`).toBe(0);

    const built = buildScaffold(project);
    expect(built.status, `${built.stdout}${built.stderr}`.slice(-2000)).toBe(0);

    const visible = (route: string): string => {
      const html = readFileSync(
        path.join(project, "system", "site", "out", route, "index.html"),
        "utf8",
      );
      const article = html.slice(html.indexOf("<article"));
      return article
        .replace(/<script[\s\S]*?<\/script>/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ");
    };

    // Scoped to the notice ELEMENT, never to the whole page: the sidebar and
    // the prev/next pager both carry the successor's title and href, so a
    // page-wide assertion passes even when successor resolution is completely
    // broken — it certified the bug it was written to catch (round 3,
    // 2026-08-20, proved by mutating the resolver and watching this stay green).
    const noticeIn = (route: string): string => {
      const html = readFileSync(
        path.join(project, "system", "site", "out", route, "index.html"),
        "utf8",
      );
      const found = /<aside[^>]*role="note"[\s\S]*?<\/aside>/.exec(html);
      expect(found, `no supersession notice in ${route}`).not.toBeNull();
      return found?.[0] ?? "";
    };

    const supersededNotice = noticeIn("docs/refund-policy");
    expect(supersededNotice).toContain("Superseded");
    expect(supersededNotice).toContain("replaced by");
    expect(supersededNotice).toContain("Refund policy v5");
    // The link must be IN the notice, not merely somewhere on the page.
    expect(supersededNotice).toMatch(/href="\/docs\/refund-policy-v5\/?"/);

    const superseded = visible("docs/refund-policy");
    expect(superseded).toMatch(/Status superseded/);
    expect(superseded).toMatch(/Owner Finance/);
    expect(superseded).toMatch(/Effective 2026-01-15/);
    // provenance is a LIST so a citation can point at exactly one entry: both
    // survive to the page, separately.
    expect(superseded).toContain("Board minutes 2026-01-11");
    expect(superseded).toContain("Terms of service v4");

    // …and the route it points at was really built.
    expect(
      readFileSync(
        path.join(project, "system", "site", "out", "docs", "refund-policy-v5", "index.html"),
        "utf8",
      ),
    ).toContain("Refund policy v5");

    // An approved document carries no status chip: that is what a reader
    // already assumes, and a label that never varies stops being read. What
    // the author DID declare still shows.
    const approved = visible("docs/refund-policy-v5");
    expect(approved).toMatch(/Owner Finance/);
    expect(approved).not.toContain("Status");

    // Nothing inferred: the shipped example declares only title/status/order,
    // so it renders its status and NO other governance furniture — never an
    // "unknown" owner, which would read as governed.
    const bare = visible("docs/example");
    expect(bare).toMatch(/Status draft/);
    expect(bare).not.toContain("Owner");
    expect(bare).not.toContain("Sources");
    expect(bare).not.toContain("Superseded");

    // Regression (found live, 2026-08-20): a route cannot tell a FILE from a
    // FOLDER INDEX, so resolving the successor pointer on routes had to guess
    // and refused to link a record `pnpm check` calls well-formed. Here
    // `knowledge/legal.md` points at its sibling `./terms.md` while a
    // `knowledge/legal/terms.md` also exists — the link must go to the sibling.
    doc("terms", ["title: Terms", "status: approved", "order: 8"].join("\n"), "The sibling.");
    mkdirSync(path.join(project, "knowledge", "legal"), { recursive: true });
    writeFileSync(
      path.join(project, "knowledge", "legal", "terms.md"),
      "---\ntitle: Legal terms\nstatus: approved\norder: 9\n---\n\nA same-named folder child.\n",
    );
    doc(
      "legal",
      ["title: Legal", "status: superseded", "order: 7", "superseded_by: ./terms.md"].join("\n"),
      "Points at its sibling.",
    );

    const withFolder = buildScaffold(project);
    expect(withFolder.status, `${withFolder.stdout}${withFolder.stderr}`.slice(-2000)).toBe(0);
    const legalNotice = noticeIn("docs/legal");
    expect(legalNotice).toMatch(/href="\/docs\/terms\/?"/);
    expect(legalNotice).toContain("Terms");
    // …and never the raw pointer, which is what the route-based resolver showed.
    expect(legalNotice).not.toContain("./terms.md");

    // `site: governance: false` — the record still declares owner and sources
    // (the agent surface and the audit trail want them); the published page
    // just stays plain. The SUPERSESSION NOTICE survives it: that is a
    // correctness warning, not decoration.
    const instanceMd = path.join(project, "instance.md");
    const original = readFileSync(instanceMd, "utf8");
    writeFileSync(
      instanceMd,
      original.replace("\nksor:\n", "\nsite:\n  governance: false\nksor:\n"),
    );
    const checkOff = spawnSync(
      process.execPath,
      [path.join(project, ".agents", "skills", "format-checker", "check.mjs")],
      { cwd: project, encoding: "utf8" },
    );
    expect(checkOff.status, `${checkOff.stdout}${checkOff.stderr}`).toBe(0);

    const rebuilt = buildScaffold(project);
    expect(rebuilt.status, `${rebuilt.stdout}${rebuilt.stderr}`.slice(-2000)).toBe(0);

    const plain = visible("docs/refund-policy");
    expect(plain).not.toContain("Owner Finance");
    expect(plain).not.toContain("Sources");
    expect(plain).not.toContain("Board minutes 2026-01-11");
    expect(plain).toContain("Superseded");
    expect(plain).toContain("Refund policy v5");

    writeFileSync(instanceMd, original);
  }, 420_000);
});

describe.runIf(!enabled)("scaffold e2e (gated)", () => {
  it("skipped — set KSOR_E2E=1 to run the full scaffold walkthrough", () => {
    expect(enabled).toBe(false);
  });
});
