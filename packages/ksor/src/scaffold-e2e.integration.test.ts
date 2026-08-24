/// <reference lib="dom" />
// The page.evaluate callback runs in the browser; only this file needs DOM types.
import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
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

      // WHERE AM I, on every document. The shell's own breadcrumb renders the
      // folders above a page and nothing else, so a top-level document got no
      // trail at all and the block above the title appeared and disappeared as
      // a reader moved through the record. Asserted on BOTH shapes, because
      // the nested one was never broken and would have stayed green alone.
      const crumbOn = (route: string): string => {
        const html = readFileSync(path.join(outDir, route, "index.html"), "utf8");
        const found = /<nav[^>]*class="ksor-breadcrumb[^"]*"[^>]*>(?<trail>.*?)<\/nav>/s.exec(html);
        expect(found, `no breadcrumb on /${route}`).not.toBeNull();
        const trail = found?.groups?.trail ?? "";
        // The home link is the first item and it must resolve: the record's
        // front door is `/`, and there is no `/docs` route at all — an earlier
        // cut linked there and served a 404 from every page's first crumb.
        expect(trail, `no home link on /${route}`).toContain('href="/"');
        // The document itself is the last item and is never a link to the page
        // the reader is already on.
        expect(trail, `no you-are-here on /${route}`).toContain('aria-current="page"');
        // The named steps, in order. Icons carry no text and drop out.
        return [...trail.matchAll(/<(?:a|span)\b[^>]*>([^<]+)<\/(?:a|span)>/g)]
          .map((match) => (match[1] ?? "").trim())
          .filter(Boolean)
          .join(" > ");
      };
      // The trail ENDS IN THE DOCUMENT, so every page carries a full address
      // and not just the folders above it.
      expect(crumbOn(path.join("docs", "surfaces", "for-agents"))).toBe(
        "Surfaces > The agent surface",
      );
      expect(crumbOn(path.join("docs", "what-is-a-ksor"))).toBe(
        "What a Knowledge System of Record is",
      );

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

        await page.goto(`${base}/docs/what-is-a-ksor/`, { waitUntil: "networkidle" });
        await expect
          .poll(() => page.locator("h1").first().textContent(), { timeout: 10_000 })
          .toContain("What a Knowledge System of Record is");
        const background = await page.evaluate(
          () => getComputedStyle(document.body).backgroundColor,
        );
        // The four-defects rule: assert computed style, and print what we saw.
        // The FUNCTION, not the notation: this pinned /^rgb/ while the theme
        // was hsl(), and the shadcn palette (oklch tokens) made Chromium report
        // `lab(100 0 0)` for a body that paints perfectly — the assertion
        // failed on a working page (found live 2026-08-22). What must hold is
        // that a colour resolved at all: no empty string, and never the
        // transparent body that means the theme never landed.
        expect(background, `computed body background in ${colorScheme}`).toMatch(
          /^(rgb|rgba|color|lab|oklab|oklch|hsl)\(/,
        );
        expect(background, `body is painted in ${colorScheme}`).not.toMatch(
          /^rgba\(0, 0, 0, 0\)$|^transparent$/,
        );
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
      const url = "http://localhost:3217/docs/what-is-a-ksor/";
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
      appendFileSync(path.join(project, "knowledge", "what-is-a-ksor.md"), `\n${marker}\n`);
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
  /**
   * The negative half of study attachments, on shipped bytes.
   *
   * Everything here was verified by hand while building the feature; it lives
   * in the suite because "an attachment is not a document" is one glob away
   * from silently becoming false, and every surface it protects derives from
   * that one collection.
   */
  // Two full scaffold builds, so it needs a build-sized timeout like its
  // neighbours rather than the 30s default — found on CI, where the pair took
  // 35.9s and timed out mid-sweep while passing locally in under it. And the
  // canary files are removed in a `finally`: a test that writes into
  // `knowledge/` and cleans up on its last line hands its mess to the next
  // test on any failure, which is how one red test becomes three.
  it("publishes a summary and a deck on their document's page, and NOWHERE else", () => {
    const outDir = path.join(project, "system", "site", "out");
    const knowledge = path.join(project, "knowledge");
    const parent = path.join(knowledge, "attach-host.md");
    try {
      // Byte-identity is the sharpest form of "the parent is untouched": capture
      // the markdown twin and both agent surfaces BEFORE the attachments exist.
      writeFileSync(parent, "---\ntitle: Attach host\nstatus: approved\n---\n\nHost body text.\n");
      expect(buildScaffold(project).status, "baseline build").toBe(0);
      const before = {
        md: readFileSync(path.join(outDir, "md", "attach-host.md"), "utf8"),
        llms: readFileSync(path.join(outDir, "llms.txt"), "utf8"),
        llmsFull: readFileSync(path.join(outDir, "llms-full.txt"), "utf8"),
      };

      const SUMMARY_MARK = "zzsummarymarkerzz";
      const CARD_MARK = "zzcardmarkerzz";
      writeFileSync(path.join(knowledge, "attach-host.summary.md"), `A precis ${SUMMARY_MARK}.\n`);
      writeFileSync(
        path.join(knowledge, "attach-host.flashcards.yaml"),
        `deck:\n  title: Host deck\ncards:\n  - front: Q ${CARD_MARK}?\n    back: A ${CARD_MARK}.\n`,
      );
      expect(buildScaffold(project).status, "build with attachments").toBe(0);

      // The parent's own bytes did not move.
      expect(readFileSync(path.join(outDir, "md", "attach-host.md"), "utf8")).toBe(before.md);
      expect(readFileSync(path.join(outDir, "llms.txt"), "utf8")).toBe(before.llms);
      expect(readFileSync(path.join(outDir, "llms-full.txt"), "utf8")).toBe(before.llmsFull);

      // No route, no markdown twin.
      expect(existsSync(path.join(outDir, "docs", "attach-host.summary"))).toBe(false);
      expect(existsSync(path.join(outDir, "md", "attach-host.summary.md"))).toBe(false);

      // Present on the parent's page — and in the SERVER HTML, not behind a click.
      const page = readFileSync(path.join(outDir, "docs", "attach-host", "index.html"), "utf8");
      expect(page, "the summary is not in the parent's server-rendered HTML").toContain(
        SUMMARY_MARK,
      );
      expect(page, "the deck is not in the parent's server-rendered HTML").toContain(CARD_MARK);

      // And nowhere else in the whole export. A file-by-file sweep, so a new
      // surface added later cannot quietly start carrying them.
      const carriers: string[] = [];
      const sweep = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            sweep(full);
            continue;
          }
          const text = readFileSync(full, "utf8");
          if (text.includes(SUMMARY_MARK) || text.includes(CARD_MARK)) {
            carriers.push(path.relative(outDir, full));
          }
        }
      };
      sweep(outDir);
      expect(
        carriers.length,
        `attachment text must appear only on its document's own page — found in: ${carriers.join(", ")}`,
      ).toBeGreaterThan(0);
      for (const file of carriers) {
        expect(file.startsWith(path.join("docs", "attach-host")), `leaked into ${file}`).toBe(true);
      }
    } finally {
      for (const leftover of [
        parent,
        path.join(knowledge, "attach-host.summary.md"),
        path.join(knowledge, "attach-host.flashcards.yaml"),
      ]) {
        rmSync(leftover, { force: true });
      }
    }
  }, 300_000);

  /**
   * A quiz is an attachment on the same rule, so the exclusion is inherited
   * rather than re-implemented. What is NEW and needs its own proof is the
   * audit: it runs inside the schema, so a quiz a reader could pass by
   * guessing must stop the BUILD rather than being published.
   */
  it("publishes a quiz on its document's page only, and refuses a guessable one", () => {
    const outDir = path.join(project, "system", "site", "out");
    const knowledge = path.join(project, "knowledge");
    const parent = path.join(knowledge, "quiz-host.md");
    const quizFile = path.join(knowledge, "quiz-host.quiz.yaml");
    try {
      writeFileSync(parent, "---\ntitle: Quiz host\nstatus: approved\n---\n\nHost body.\n");
      expect(buildScaffold(project).status, "baseline build").toBe(0);
      const before = {
        md: readFileSync(path.join(outDir, "md", "quiz-host.md"), "utf8"),
        llms: readFileSync(path.join(outDir, "llms.txt"), "utf8"),
        llmsFull: readFileSync(path.join(outDir, "llms-full.txt"), "utf8"),
      };

      const MARK = "zzquizmarkerzz";
      /** Answers cycle and options match in length, so the audit is silent. */
      const clean = [0, 1, 2, 3, 0, 1]
        .map(
          (answer, i) =>
            `  - question: Question ${i} ${MARK} on a wholly separate matter here\n` +
            `    options: ["option alpha", "option gamma", "option delta", "option omega"]\n` +
            `    answer: ${answer}\n` +
            `    explanation: It follows from the document.\n`,
        )
        .join("");
      writeFileSync(quizFile, `quiz:\n  title: Host quiz\nquestions:\n${clean}`);
      expect(buildScaffold(project).status, "build with a well-formed quiz").toBe(0);

      // The parent's own bytes did not move.
      expect(readFileSync(path.join(outDir, "md", "quiz-host.md"), "utf8")).toBe(before.md);
      expect(readFileSync(path.join(outDir, "llms.txt"), "utf8")).toBe(before.llms);
      expect(readFileSync(path.join(outDir, "llms-full.txt"), "utf8")).toBe(before.llmsFull);

      // No route, no markdown twin.
      expect(existsSync(path.join(outDir, "docs", "quiz-host.quiz"))).toBe(false);
      expect(existsSync(path.join(outDir, "md", "quiz-host.quiz.yaml"))).toBe(false);

      // Present on the parent's page, in the SERVER HTML rather than behind a click.
      const page = readFileSync(path.join(outDir, "docs", "quiz-host", "index.html"), "utf8");
      expect(page, "the quiz is not in the parent's server-rendered HTML").toContain(MARK);

      // And nowhere else in the whole export.
      const carriers: string[] = [];
      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (readFileSync(full, "utf8").includes(MARK)) {
            carriers.push(path.relative(outDir, full));
          }
        }
      };
      walk(outDir);
      expect(carriers.length, "control: the quiz IS published somewhere").toBeGreaterThan(0);
      for (const file of carriers) {
        expect(file.startsWith(path.join("docs", "quiz-host")), `leaked into ${file}`).toBe(true);
      }

      // Now the audit. Every answer at the same index is the predecessor's
      // shipped bug — 451 questions of it — and it must stop the build.
      const biased = [0, 0, 0, 0, 0, 0]
        .map(
          (answer, i) =>
            `  - question: Question ${i} ${MARK} on a wholly separate matter here\n` +
            `    options: ["option alpha", "option gamma", "option delta", "option omega"]\n` +
            `    answer: ${answer}\n` +
            `    explanation: It follows from the document.\n`,
        )
        .join("");
      writeFileSync(quizFile, `quiz:\n  title: Host quiz\nquestions:\n${biased}`);
      const refused = buildScaffold(project);
      expect(refused.status, "a guessable quiz must refuse the build").not.toBe(0);
      const output = `${refused.stdout ?? ""}${refused.stderr ?? ""}`;
      expect(output, "the refusal must name the rule").toContain("ksor-quiz-answer-bias");
      expect(output, "and name the questions to fix").toMatch(/questions .*1/);
    } finally {
      for (const leftover of [parent, quizFile]) rmSync(leftover, { force: true });
    }
  }, 300_000);

  /**
   * A presentation the record OWNS. The attachment guarantees are inherited
   * from the one rule and proved for the quiz already; what is new here is
   * that a deck must ship WHOLE in the html — a reader without JavaScript, a
   * crawler and an agent parsing the page all get every slide — and that it
   * must reach no third party at all.
   */
  it("publishes an owned deck whole in the html, reaching nobody", () => {
    const outDir = path.join(project, "system", "site", "out");
    const knowledge = path.join(project, "knowledge");
    const parent = path.join(knowledge, "deck-host.md");
    const deckFile = path.join(knowledge, "deck-host.slides.yaml");
    try {
      writeFileSync(parent, "---\ntitle: Deck host\nstatus: approved\n---\n\nHost body.\n");
      expect(buildScaffold(project).status, "baseline build").toBe(0);
      const before = {
        md: readFileSync(path.join(outDir, "md", "deck-host.md"), "utf8"),
        llms: readFileSync(path.join(outDir, "llms.txt"), "utf8"),
        llmsFull: readFileSync(path.join(outDir, "llms-full.txt"), "utf8"),
      };

      const MARKS = ["zzslideonezz", "zzslidetwozz", "zzslidethreezz"];
      const NOTE = "zznotemarkerzz";
      writeFileSync(
        deckFile,
        `slides:\n  title: Host deck\ndeck:\n` +
          MARKS.map(
            (m, i) =>
              `  - heading: Slide ${i} ${m}\n` +
              `    bullets: ["a point about ${m}"]\n` +
              (i === 0 ? `    note: ${NOTE}\n` : ""),
          ).join(""),
      );
      expect(buildScaffold(project).status, "build with an owned deck").toBe(0);

      const page = readFileSync(path.join(outDir, "docs", "deck-host", "index.html"), "utf8");

      // EVERY slide, not just the visible one. This is the clause that fails
      // the moment somebody builds the deck on mount instead of on the server.
      for (const mark of MARKS) {
        expect(page, `slide "${mark}" is not in the server-rendered html`).toContain(mark);
      }
      expect(page, "the presenter note is not in the html").toContain(NOTE);

      // Reaches nobody: an owned deck has no frame and no third-party url.
      expect(page, "an owned deck must not ship an iframe").not.toContain("<iframe");

      // The parent's own bytes did not move.
      expect(readFileSync(path.join(outDir, "md", "deck-host.md"), "utf8")).toBe(before.md);
      expect(readFileSync(path.join(outDir, "llms.txt"), "utf8")).toBe(before.llms);
      expect(readFileSync(path.join(outDir, "llms-full.txt"), "utf8")).toBe(before.llmsFull);

      // No route, no markdown twin.
      expect(existsSync(path.join(outDir, "docs", "deck-host.slides"))).toBe(false);
      expect(existsSync(path.join(outDir, "md", "deck-host.slides.yaml"))).toBe(false);

      // And nowhere else in the export.
      const carriers: string[] = [];
      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (readFileSync(full, "utf8").includes(MARKS[0] ?? "")) {
            carriers.push(path.relative(outDir, full));
          }
        }
      };
      walk(outDir);
      expect(carriers.length, "control: the deck IS published somewhere").toBeGreaterThan(0);
      for (const file of carriers) {
        expect(file.startsWith(path.join("docs", "deck-host")), `leaked into ${file}`).toBe(true);
      }

      // Two sources have no answer to which one governs, so the build refuses.
      writeFileSync(
        deckFile,
        `slides:\n  title: Host deck\n` +
          `  url: https://docs.google.com/presentation/d/abc123/edit\n` +
          `deck:\n  - heading: Slide zero ${MARKS[0]}\n`,
      );
      const refused = buildScaffold(project);
      expect(refused.status, "a deck declaring both sources must refuse").not.toBe(0);
      const output = `${refused.stdout ?? ""}${refused.stderr ?? ""}`;
      expect(output).toContain("ksor-slides-two-sources");
    } finally {
      for (const leftover of [parent, deckFile]) rmSync(leftover, { force: true });
    }
  }, 300_000);

  /**
   * Tabs, authored in CommonMark.
   *
   * The failure this pins is SILENT. `remarkCodeTab` takes a `Tabs` option,
   * and only its `CodeBlockTabs` branch honours `tab-group` — the other drops
   * it and renders tabs that look correct and do not sync, so a reader on a
   * ten-section document picks their tool ten times. Nothing errors, so only
   * an assertion on the shipped bytes catches it.
   */
  it("gives a new record its reading surface, with nothing configured", () => {
    const outDir = path.join(project, "system", "site", "out");
    const doc = path.join(project, "knowledge", "surface-host.md");
    try {
      writeFileSync(
        doc,
        "---\ntitle: Surface host\nstatus: approved\n---\n\n" +
          "> [!WARNING]\n> zzalertbodyzz\n\n" +
          "| Head | Other |\n| --- | --- |\n| zzcellzz | second |\n\n" +
          "```text\nzzverbatimzz\n```\n",
      );
      expect(buildScaffold(project).status, "build with the affordances").toBe(0);

      const page = readFileSync(path.join(outDir, "docs", "surface-host", "index.html"), "utf8");

      // The alert became a callout. Its marker must NOT survive as text: a
      // record that writes `[!WARNING]` and reads `[!WARNING]` got nothing.
      expect(page, "the alert did not become a callout").toContain("--callout-color");
      expect(page, "the marker was served as literal text").not.toContain("[!WARNING]");
      expect(page).toContain("zzalertbodyzz");

      // And the agent surface keeps what the author wrote, because the
      // conversion is a rehype step. This is the clause that fails if anyone
      // moves it to remark.
      const twin = readFileSync(path.join(outDir, "md", "surface-host.md"), "utf8");
      expect(twin, "the markdown twin lost the author's alert").toContain("[!WARNING]");
      expect(twin, "the markdown twin served a React component").not.toContain("Callout");

      // The stylesheet SHIPS the rules — asserted on the built bytes rather
      // than on the source, because a rule that never reaches the export is a
      // default the adopter does not have.
      const stylesheets: string[] = [];
      const collect = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) collect(full);
          else if (entry.name.endsWith(".css")) stylesheets.push(readFileSync(full, "utf8"));
        }
      };
      collect(path.join(outDir, "_next"));
      const css = stylesheets.join("");
      expect(stylesheets.length, "the export shipped no stylesheet at all").toBeGreaterThan(0);
      for (const rule of [
        "--callout-color", // callouts are tinted and ruled
        "thead", // the table head is a band
        "nth-child(odd)", // and its rows alternate
        "data-wrapped", // a long line can be unwrapped
        "--shiki-light", // a language-less block is set as a passage
      ]) {
        expect(css, `the export does not carry the rule for ${rule}`).toContain(rule);
      }
    } finally {
      rmSync(doc, { force: true });
    }
  });

  it("renders code tabs from a fence's info string, and carries the group", () => {
    const knowledge = path.join(project, "knowledge");
    const doc = path.join(knowledge, "tabbed.md");
    try {
      writeFileSync(
        doc,
        [
          "---",
          "title: Tabbed",
          "status: approved",
          "---",
          "",
          "Pick one.",
          "",
          '```bash tab="Alpha Tool" tab-group="picker"',
          "zzalphacmdzz --version",
          "```",
          "",
          '```bash tab="Beta Tool" tab-group="picker"',
          "zzbetacmdzz --version",
          "```",
          "",
        ].join("\n"),
      );
      expect(buildScaffold(project).status, "build with tabs").toBe(0);

      const page = readFileSync(
        path.join(project, "system", "site", "out", "docs", "tabbed", "index.html"),
        "utf8",
      );

      // Both variants ship, whichever is selected — a reader with no
      // JavaScript still gets every instruction.
      //
      // Asserted on a SINGLE token, not a phrase: the highlighter splits code
      // into per-token spans, so `zzalphacmdzz --version` never appears as
      // contiguous text in the html and a phrase assertion fails on a feature
      // that works (found on the first run of this test).
      expect(page, "the first tab's code is missing").toContain("zzalphacmdzz");
      expect(page, "the second tab's code is missing").toContain("zzbetacmdzz");

      // The per-tab hook the branding keys on. Ours, not Radix's generated id.
      expect(page).toContain('data-tab-value="Alpha Tool"');
      expect(page).toContain('data-tab-value="Beta Tool"');

      // The group. Without this the tabs render and do not sync, which is the
      // whole point of the CodeBlockTabs branch.
      expect(page, "tab-group did not reach the markup — sync is silently off").toContain("picker");

      // And the fence is not left as a plain code block: a tab strip exists.
      expect(page, "no tablist rendered — the remark plugin did not run").toContain('role="tab"');
    } finally {
      rmSync(doc, { force: true });
    }
  }, 300_000);

  /**
   * The trail is DERIVED, and this is what proves it.
   *
   * A breadcrumb that reads correctly on the record it was written against
   * tells you nothing — the seeded record is two levels deep, and a hard-coded
   * two-level trail would pass every assertion in this file. So this writes a
   * folder tree the site has never seen, four levels down, and asks for the
   * address of a document at the bottom of it.
   */
  it("derives the trail from the record's own folders, however deep", () => {
    const knowledge = path.join(project, "knowledge");
    const nested = path.join(knowledge, "handbook", "policies", "returns");
    const doc = (file: string, title: string, order: number): void =>
      writeFileSync(
        path.join(knowledge, file),
        `---\ntitle: ${title}\nstatus: approved\norder: ${order}\n---\n\nOne line.\n`,
      );

    try {
      mkdirSync(nested, { recursive: true });
      doc(path.join("handbook", "index.md"), "The handbook", 20);
      doc(path.join("handbook", "policies", "index.md"), "Policies", 1);
      doc(path.join("handbook", "policies", "returns", "index.md"), "Returns", 1);
      doc(path.join("handbook", "policies", "returns", "window.md"), "The thirty-day window", 1);

      const built = buildScaffold(project);
      expect(built.status, `${built.stdout}${built.stderr}`.slice(-2000)).toBe(0);

      const outDir = path.join(project, "system", "site", "out");
      const trailOn = (route: string): { steps: string[]; hrefs: string[] } => {
        const html = readFileSync(path.join(outDir, route, "index.html"), "utf8");
        const nav = /<nav[^>]*class="ksor-breadcrumb[^"]*"[^>]*>(?<trail>.*?)<\/nav>/s.exec(html);
        expect(nav, `no breadcrumb on /${route}`).not.toBeNull();
        const trail = nav?.groups?.trail ?? "";
        return {
          steps: [...trail.matchAll(/<(?:a|span)\b[^>]*>([^<]*?)(?:<|$)/g)]
            .map((match) => (match[1] ?? "").trim())
            .filter(Boolean),
          hrefs: [...trail.matchAll(/href="([^"]+)"/g)].map((match) => match[1] ?? ""),
        };
      };

      // Every folder between the record's front door and the document, named
      // by its own title rather than by its directory name.
      const deep = trailOn(path.join("docs", "handbook", "policies", "returns", "window"));
      expect(deep.steps).toEqual(["The handbook", "Policies", "Returns", "The thirty-day window"]);
      // …and each ancestor is a working link, the document itself is not.
      expect(deep.hrefs).toEqual([
        "/",
        "/docs/handbook/",
        "/docs/handbook/policies/",
        "/docs/handbook/policies/returns/",
      ]);
      for (const href of deep.hrefs.slice(1)) {
        expect(
          existsSync(path.join(outDir, href.replace(/^\/|\/$/g, ""), "index.html")),
          `breadcrumb links to ${href}, which the export does not contain`,
        ).toBe(true);
      }

      // The trail shortens as it climbs — a fixed-depth implementation passes
      // the case above and fails these.
      expect(trailOn(path.join("docs", "handbook", "policies", "returns")).steps).toEqual([
        "The handbook",
        "Policies",
        "Returns",
      ]);
      expect(trailOn(path.join("docs", "handbook")).steps).toEqual(["The handbook"]);
    } finally {
      rmSync(path.join(knowledge, "handbook"), { recursive: true, force: true });
    }
  }, 300_000);

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
        "  - https://intranet.example.com/legal/refunds-v4",
        "superseded_by: ./refund-policy-v5.md",
      ].join("\n"),
      "Refunds are issued within 30 days of purchase.",
    );
    doc(
      "refund-policy-v5",
      ["title: Refund policy v5", "status: approved", "order: 3", "owner: Finance"].join("\n"),
      "Refunds are issued within 60 days of purchase.",
    );
    // A document declaring the bare minimum. The scaffold used to ship one
    // (example.md, title+status+order only) and the "infers nothing"
    // assertions below leaned on it; the starter record now seeds five
    // documents that all declare an owner, so the fixture the assertion
    // needs is written here instead of borrowed from the shipped corpus.
    doc(
      "bare-note",
      ["title: A bare note", "status: draft", "order: 12"].join("\n"),
      "Declares only title, status and order.",
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
      // role="region" with aria-labelledby, not role="note": a screen-reader
      // user must be able to reach the most consequential thing on the page by
      // landmark, which a note is not (GOV.UK's own pattern).
      const found = /<aside[^>]*role="region"[\s\S]*?<\/aside>/.exec(html);
      expect(found, `no supersession notice in ${route}`).not.toBeNull();
      return found?.[0] ?? "";
    };

    const supersededNotice = noticeIn("docs/refund-policy");
    expect(supersededNotice, "the notice is labelled for landmark navigation").toContain(
      'aria-labelledby="ksor-superseded"',
    );
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

    // A source that IS a URL is followable; a citation stays text. Provenance
    // is load-bearing, and a source nobody can open is weaker than the record
    // makes it (research/site-design.md F5, measured at 0 of 3 links).
    const sourcesHtml = (route: string): string => {
      const html = readFileSync(
        path.join(project, "system", "site", "out", route, "index.html"),
        "utf8",
      );
      const at = html.indexOf("Sources");
      expect(at, `no Sources section in ${route}`).toBeGreaterThan(-1);
      return html.slice(at);
    };
    const refundSources = sourcesHtml("docs/refund-policy");
    expect(refundSources).toMatch(
      /<a[^>]+href="https:\/\/intranet\.example\.com\/legal\/refunds-v4"[^>]*>/,
    );
    // …and the citation beside it is NOT wrapped in an anchor.
    expect(refundSources).toMatch(/<li[^>]*>Board minutes 2026-01-11<\/li>/);

    // …and the route it points at was really built.
    expect(
      readFileSync(
        path.join(project, "system", "site", "out", "docs", "refund-policy-v5", "index.html"),
        "utf8",
      ),
    ).toContain("Refund policy v5");

    // A page lists what the record holds below it, with a caveat status on the
    // card — so a reader choosing between two documents sees that one was
    // withdrawn BEFORE opening it. Before this the folder page ended at its own
    // sentence and the home page linked to one of five documents
    // (research/site-design.md F2/F3/F5).
    const listingIn = (route: string): string => {
      const html = readFileSync(
        path.join(project, "system", "site", "out", route, "index.html"),
        "utf8",
      );
      const at = html.indexOf("In this section");
      return at === -1 ? "" : html.slice(at);
    };
    const anyPageHtml = readFileSync(
      path.join(project, "system", "site", "out", "docs", "refund-policy", "index.html"),
      "utf8",
    );
    // SEARCH results carry the status too. The dialog runs in the browser over
    // a static index with no field for it, so the map travels in the document;
    // asserting it here proves the bytes a reader's browser receives, which is
    // the closest a static check gets to the dialog itself.
    const statusMap = /id="ksor-statuses">([^<]*)</.exec(anyPageHtml)?.[1];
    expect(statusMap, `no status map in the page: ${anyPageHtml.slice(0, 200)}`).toBeDefined();
    const parsed = JSON.parse(statusMap ?? "{}") as Record<string, string>;
    expect(parsed["/docs/refund-policy"], "the withdrawn document is marked").toBe("superseded");
    // An approved document contributes nothing: a record with no caveats ships
    // an empty map, and every row renders as the shipped dialog renders it.
    expect(parsed["/docs/refund-policy-v5"]).toBeUndefined();

    // Every document is also emitted as MARKDOWN at a path-derived address, and
    // the page advertises it: an agent handed a document URL used to have to
    // scrape a React app to reach text the record holds verbatim
    // (research/site-design.md F2).
    const markdown = readFileSync(
      path.join(project, "system", "site", "out", "md", "refund-policy.md"),
      "utf8",
    );
    expect(markdown, "the markdown twin carries the body").toContain(
      "Refunds are issued within 30 days",
    );
    // …and its governance, exactly as llms-full.txt does — a consumer reading
    // ONE document still learns it was withdrawn.
    expect(markdown).toContain("status: superseded");
    expect(markdown).toContain("superseded_by: /docs/refund-policy-v5");
    expect(
      readFileSync(
        path.join(project, "system", "site", "out", "docs", "refund-policy", "index.html"),
        "utf8",
      ),
      "the page advertises its markdown twin",
    ).toContain('rel="alternate" type="text/markdown" href="/md/refund-policy.md"');

    // The SIDEBAR carries a caveat status too — it is where a reader chooses,
    // and two documents that differ only in whether one was withdrawn were
    // identical rows there (research/site-design.md F3).
    const anyDocHtml = readFileSync(
      path.join(project, "system", "site", "out", "docs", "refund-policy", "index.html"),
      "utf8",
    );
    const sidebar = anyDocHtml.slice(0, anyDocHtml.indexOf("<article"));
    expect(sidebar, "the sidebar marks a withdrawn document").toContain("superseded");
    expect(sidebar, "…and a draft one").toContain("draft");

    const sectionListing = listingIn("docs/refund-policy-v5");
    // refund-policy-v5 is a leaf, so it lists nothing at all.
    expect(sectionListing, "a leaf document must not grow an empty listing").toBe("");

    const homeHtml = readFileSync(
      path.join(project, "system", "site", "out", "index.html"),
      "utf8",
    );
    // The record is ON the front door, but as BYTES rather than as a list of
    // links: the hero panel renders the same index `/llms.txt` serves, so the
    // withdrawn policy and its replacement are both visible there. That is
    // asserted below against the built llms.txt, byte for byte, which is a
    // stronger check than the markup assertions this replaced — those matched a
    // heading that moved twice in one day (owner removed the contents list and
    // the addresses, 2026-08-22).
    // …and the framework's own marketing copy is gone from the adopter's page:
    // critical rule 1 says the site never contains authored content.
    expect(homeHtml).not.toContain("Knowledge you can govern");
    // …and the record's own authority sentence stands in its place: the first
    // paragraph of instance.md, which is also what `ksor serve` hands the MCP
    // server as its instructions, so both surfaces open on one sentence.
    expect(homeHtml, "the home page publishes the record's own purpose").toContain(
      "authoritative for",
    );
    // The machine identity, on the page that introduces the record: the slug
    // is what a citation carries, so it belongs where an agent's operator can
    // read it without opening a file.
    expect(homeHtml, "the home page names the instance slug").toContain("walkthrough");

    // The front door shows the RECORD, not a drawing of the idea of one
    // (owner, 2026-08-22: four abstract illustrations rejected — "none of them
    // is suitable for KSoR"). A stock diagram is the one thing on this page
    // that can never be true of the adopter's corpus; these three assertions
    // are what makes the picture the corpus:
    //   the document `Open the record` opens, set as the leading card…
    expect(homeHtml, "the front door names the document it opens on").toContain(
      "What a Knowledge System of Record is",
    );
    //   …the entries of the record standing behind it, which is the next
    //   THREE in governed order — this fixture's `refund-policy` (order 2)
    //   among them, carrying its withdrawal where a reader chooses. Asserting
    //   a deeper entry would be asserting the stack's depth, not that the
    //   record reaches the page.
    expect(homeHtml, "the front door shows the record's next entries").toContain("Refund policy");
    //   …under the label that ties the leading card to the button, which is
    //   the one string only this design emits (the two assertions above would
    //   also pass on the old cover, which named the first document in a meta
    //   line — they stay as regression guards, this one is the new contract).
    expect(homeHtml, "the record stands on the front door as the record").toContain("Opens here");
    // The count is COMPUTED from the record, so it is asserted as a value and
    // rendered as one text node — `{n} documents` renders as `3<!-- -->
    // documents` and would never match (the React-splits-interpolation trap).
    // Five seeded by `ksor init` plus the three this test writes.
    expect(homeHtml, "the front door counts the record it is showing").toContain("8 documents");
    // The agent addresses came OFF the front door (owner, 2026-08-22): no URLs
    // on the home page. Discoverability is unharmed and still asserted below —
    // `/llms.txt` sits where every agent looks for it, `/llms-full.txt` and the
    // per-document `.md` twins are published and advertised by each document's
    // `rel="alternate"`, and the record's index is visible on this page as the
    // BYTES in the hero panel rather than as a list of links.

    // The front door stands ALONE — no sidebar, no document chrome (owner,
    // 2026-08-22). It wore the full docs shell for part of that day, on the
    // reasoning that a system of record should show the record immediately;
    // the call is that a landing page should land, and `Open the record` is
    // the door. Asserted, because "the home page grew a sidebar again" is
    // exactly the kind of drift a shell refactor causes silently.
    expect(homeHtml, "the home page is a landing page, not a document page").not.toContain(
      'id="nd-sidebar"',
    );
    // The AGENT surface carries the same governance, or the record has two
    // truths (research/site-design.md F1): before this, llms.txt listed a
    // withdrawn policy and its replacement as adjacent entries told apart only
    // by their titles, and llms-full.txt served the withdrawn body as clean
    // prose. Asserted on the built files, not on the projection.
    const agentFile = (name: string): string =>
      readFileSync(path.join(project, "system", "site", "out", name), "utf8");

    // The front page is identity and one action now — the bytes panel that
    // used to carry the record's index came off with the addresses (owner,
    // 2026-08-22), because the illustration says the same thing the panel said.
    // What the home page must still carry is asserted above: the record's slug,
    // its authority sentence, and no framework marketing. The index itself is
    // asserted against the built llms.txt just below, where it always mattered
    // more.

    // ONE document's block, never "from this heading to the end of the file":
    // the loose form swallows every document after it, so an assertion that a
    // bare document emits no `owner:` passed on the NEXT document's owner
    // (caught by this suite on its first run, 2026-08-21 — the same class as
    // the page-wide notice assertion two screens up).
    const blockFor = (full: string, heading: string): string => {
      const from = full.indexOf(heading);
      expect(from, `no ${heading} in llms-full.txt`).toBeGreaterThanOrEqual(0);
      const next = full.indexOf("\n# ", from + heading.length);
      return next === -1 ? full.slice(from) : full.slice(from, next);
    };

    const index = agentFile("llms.txt");
    const supersededLine = index
      .split("\n")
      .find((line) => line.includes("(/docs/refund-policy)")) as string;
    expect(supersededLine, `llms.txt:\n${index}`).toBeDefined();
    expect(supersededLine).toContain("SUPERSEDED");
    // The RESOLVED route — a consumer never sees the record's file tree, so
    // `./refund-policy-v5.md` would be a reference it cannot follow.
    expect(supersededLine).toContain("replaced by /docs/refund-policy-v5");
    expect(supersededLine).not.toContain(".md");
    // Caveats only: the successor is approved, so its line stays clean.
    const successorLine = index
      .split("\n")
      .find((line) => line.includes("(/docs/refund-policy-v5)")) as string;
    expect(successorLine).not.toContain("SUPERSEDED");
    expect(successorLine).not.toContain("APPROVED");
    // …and the draft the scaffold ships is marked, because draft is a caveat.
    expect(index.split("\n").find((line) => line.includes("(/docs/bare-note)"))).toContain("DRAFT");

    const full = agentFile("llms-full.txt");
    const withdrawnBlock = blockFor(full, "# Refund policy (");
    expect(withdrawnBlock, `llms-full.txt:\n${full.slice(0, 400)}`).toContain("status: superseded");
    expect(withdrawnBlock).toContain("superseded_by: /docs/refund-policy-v5");
    expect(withdrawnBlock).toContain("owner: Finance");
    expect(withdrawnBlock).toContain("effective: 2026-01-15");
    expect(withdrawnBlock).toContain("  - Board minutes 2026-01-11");
    expect(withdrawnBlock).toContain("  - Terms of service v4");
    // The body still follows the block, byte-faithful.
    expect(withdrawnBlock).toContain("Refunds are issued within 30 days");
    // Nothing inferred here either: a document declaring only title+status
    // gets exactly one key.
    const bareBlock = blockFor(full, "# A bare note (");
    expect(bareBlock).toContain("status: draft");
    expect(bareBlock).not.toContain("owner:");
    expect(bareBlock).not.toContain("provenance:");

    // An approved document carries no status chip: that is what a reader
    // already assumes, and a label that never varies stops being read. What
    // the author DID declare still shows.
    const approved = visible("docs/refund-policy-v5");
    expect(approved).toMatch(/Owner Finance/);
    expect(approved).not.toContain("Status");
    // Supersession runs BOTH ways: the withdrawn document names its successor
    // above the title, and the successor names what it replaced — derived from
    // the record, with no new frontmatter key (research/site-design.md F4).
    expect(approved, "the successor names what it replaced").toMatch(/Replaces Refund policy/);
    expect(
      readFileSync(
        path.join(project, "system", "site", "out", "docs", "refund-policy-v5", "index.html"),
        "utf8",
      ),
      "…and links to it",
    ).toMatch(/href="\/docs\/refund-policy\/?"/);
    // The withdrawn document must NOT claim to replace anything here.
    expect(superseded).not.toContain("Replaces");

    // Nothing inferred: a document declaring only title/status/order renders
    // its status and NO other governance furniture — never an "unknown"
    // owner, which would read as governed.
    const bare = visible("docs/bare-note");
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

    // …and `site.governance` never reaches the AGENT surface. That key decides
    // what the PAGES publish; the record keeps every key for the agent surface
    // and the audit trail, so suppressing it here would rebuild the very defect
    // this test exists to catch, on purpose.
    const indexOff = agentFile("llms.txt");
    expect(indexOff.split("\n").find((line) => line.includes("(/docs/refund-policy)"))).toContain(
      "SUPERSEDED",
    );
    const fullOff = agentFile("llms-full.txt");
    expect(blockFor(fullOff, "# Refund policy (")).toContain("owner: Finance");

    writeFileSync(instanceMd, original);
  }, 420_000);
});

describe.runIf(!enabled)("scaffold e2e (gated)", () => {
  it("skipped — set KSOR_E2E=1 to run the full scaffold walkthrough", () => {
    expect(enabled).toBe(false);
  });
});
