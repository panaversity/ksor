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
import { starterApprover } from "./e2e-starter.js";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Spec acceptance (4)+(5): the scaffolded site serves the example document in
// a REAL browser — both themes, zero console errors, zero external requests —
// and hot-reloads a knowledge edit. Heavy (pnpm install + chromium), so gated:
//   KSOR_E2E=1 pnpm exec vitest run --config vitest.integration.config.ts packages/ksor/src/scaffold-e2e.integration.test.ts
//
// Every document this suite writes is a concept in the KSoR Profile of OKF
// (record spec §2) — `type`, `title`, `description`, `status`, `ksor.audience`,
// plus `generated` and `ksor.approval` when stable — because a site that
// renders something no adopter could author proves nothing, and because the
// record checker inside `ksor build` refuses anything else. `pnpm build` is
// `ksor build` followed by the site build (build spec §1), so a fixture the
// checker refuses never reaches the browser at all.
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
    // The emitted policy names `human:you` — the placeholder the intake
    // interview replaces with real handles. This walkthrough's documents are
    // approved by `human:kim` and taken down by `human:ciso`, so the policy has
    // to name them, which is exactly what an adopter does and what
    // `ksor-approver-unauthorised` tells them to do. Writing the documents
    // without it made every case here fail on the authority check rather than
    // on what it meant to test (found running this suite, 2026-08-25).
    //
    // The STARTER PRODUCER is kept beside them: the five sample documents ship
    // approved by it, so dropping it here would make the emitted record itself
    // unauthorised — the same failure, one line earlier.
    writeFileSync(
      path.join(project, ".ksor", "governance.yaml"),
      [
        'version: "0.1"',
        "approval_authorities:",
        `  - actors: [human:kim, ${starterApprover(project)}]`,
        "takedown_authorities:",
        "  actors: [human:ciso]",
        "",
      ].join("\n"),
    );
    // The starter itself is used AS EMITTED. It ships stable and approved by
    // the producer that generated it, so a fresh record publishes on its first
    // build — which is the state a walkthrough of the PUBLISHED site needs, and
    // the state an adopter actually gets. A record whose documents are all
    // drafts still admits none of them to any surface, and that guarantee has
    // its own coverage against an authored draft (build spec §4 acceptance 4,
    // the last clause of this file).
    //
    // COMMIT it, which is the state build spec §4 acceptance 1 describes
    // ("the emitted starter after its first commit"). `ksor init` leaves a
    // repository with no commit, and a record with no commit honestly
    // publishes no `source_commit` stamp at all (`stampLines` omits a null
    // one) — so an uncommitted walkthrough would have the acceptance clause
    // below asserting a stamp the record is right to withhold. Identity is
    // passed per command and signing is off, because a CI runner has neither.
    const git = (...args: readonly string[]): void => {
      const result = spawnSync("git", [...args], { cwd: project, encoding: "utf8" });
      expect(result.status, `git ${args.join(" ")}: ${result.stderr}`).toBe(0);
    };
    git("add", "-A");
    git(
      "-c",
      "user.email=walkthrough@example.invalid",
      "-c",
      "user.name=Walkthrough",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      "The starter, as emitted",
    );
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

  /**
   * A stable, approved concept in the profile's shape (record spec §2), with
   * whatever extra governance the case needs. Every document these clauses
   * write is legal profile content: a site that renders something no adopter
   * could author proves nothing.
   */
  const concept = (options: {
    title: string;
    description: string;
    body: string;
    order?: number;
    extra?: string;
    ksor?: string;
    status?: string;
  }): string => {
    const { title, description, body, order, extra = "", ksor = "", status = "stable" } = options;
    return `---
type: Document
title: ${title}
description: ${description}
status: ${status}
${order === undefined ? "" : `order: ${order}\n`}generated: { by: "ksor-test/1.0", at: 2026-08-01T00:00:00Z }
${extra}ksor:
  audience: [public]
${status === "stable" ? '  approval: { by: "human:kim", at: 2026-08-02T00:00:00Z }\n' : ""}${ksor}---

${body}
`;
  };

  const write = (name: string, text: string): void =>
    writeFileSync(path.join(project, "knowledge", `${name}.md`), text);

  /** The visible text of a built page's article, tags and scripts stripped. */
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

  const built = (rel: string): string =>
    readFileSync(path.join(project, "system", "site", "out", rel), "utf8");

  /**
   * A published artefact with its publication id masked out. `build_id` hashes
   * every input a projection reads, COMPANIONS INCLUDED (build spec §2), so
   * attaching a summary or a deck to a document legitimately moves the stamp
   * on every artefact that carries it. Everything else about the parent must
   * not move, and that is what the comparisons using this assert.
   */
  const withoutBuildId = (text: string): string => text.replace(/sha256:[0-9a-f]+/g, "sha256:…");

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
    // DECODE and CONTAIN — the PAIR the shipped `preview.mjs` uses (`:54-59`),
    // because this stand-in must not be a weaker server than the one adopters
    // actually run.
    //
    // Decode, because Next's webpack output puts a route group's chunk under
    // its literal directory (`_next/static/chunks/app/docs/[[...slug]]/page-*.js`
    // and the `md` route's twin), which a browser requests percent-encoded.
    // Without it the read looked for a file named `%5B%5B...slug%5D%5D`, 404'd,
    // and the page rendered "This page couldn't load". Turbopack emitted no
    // bracketed path at all, so the gap was invisible until the compiler
    // changed (issue #196).
    //
    // Contain, because decoding WITHOUT containment is strictly worse than not
    // decoding: `%2e%2e%2f` reaches the filesystem as `../` and escapes the
    // export, which the raw-URL version could not do. The two belong together
    // and `preview.mjs` keeps them together.
    const root = path.resolve(outDir);
    const server = createServer((req, res) => {
      let decoded: string;
      try {
        decoded = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
      } catch {
        // `decodeURIComponent` throws on a malformed escape, and a throw from a
        // request listener is an uncaught exception that takes the process with
        // it — here that is the vitest worker, reporting an unhandled error
        // instead of whatever the suite was actually asserting.
        res.writeHead(400);
        res.end("bad request");
        return;
      }
      const target = path.resolve(root, `.${decoded}`);
      for (const candidate of [target, path.join(target, "index.html"), `${target}.html`]) {
        // Per CANDIDATE, not once per request: `${target}.html` for `/` is the
        // sibling `out.html`, outside the export, and a single check on
        // `target` would have waved it through.
        if (candidate !== root && !candidate.startsWith(root + path.sep)) continue;
        try {
          const body = readFileSync(candidate);
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
      // The agent-facing index: headed by THIS record's display title (not a
      // generic "# Docs") and carrying the machine identity a citation pins,
      // and every link it advertises must actually resolve. The two are
      // separate keys since the profile — `title` is what a reader sees,
      // `name` is what the record is called by machines (record spec §3) — so
      // the heading alone no longer identifies the project.
      const llms = await (await fetch(`${base}/llms.txt`)).text();
      expect(
        llms.split("\n")[0],
        `llms.txt first line: ${JSON.stringify(llms.slice(0, 120))}`,
      ).toBe("# KSoR");
      expect(llms, `llms.txt head: ${JSON.stringify(llms.slice(0, 300))}`).toContain(
        "- name: walkthrough",
      );
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
    // WITHOUT `NODE_ENV`. vitest sets it to `test` and a spawned child
    // inherits it, so this dev server came up as a BUILD: staging read
    // `build.lock.json` instead of the record, hid drafts, and `watchRecord`
    // returned early — which is why an edit here never reached the staged copy
    // and the poll below saw 500 for its full two minutes (diagnosed live
    // 2026-08-25, by running `NODE_ENV=test pnpm dev` on a real scaffold and
    // watching it refuse `ksor-lock-stale`). An adopter's shell carries no
    // NODE_ENV and `next dev` sets `development` itself, so the faithful thing
    // is to hand the child an environment without it.
    const { NODE_ENV: _runnerEnv, ...devEnv } = process.env;
    const dev = spawn("pnpm", ["dev", "--port", "3217"], {
      cwd: project,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: devEnv,
    });
    // Captured, not discarded: when this poll times out the only evidence of
    // WHY is the server's own output, and `stdio: "ignore"` threw it away —
    // a 500 for the full two minutes said nothing at all about its cause
    // (found running this suite, 2026-08-25).
    let devLog = "";
    dev.stdout?.on("data", (chunk: Buffer) => (devLog += chunk.toString()));
    dev.stderr?.on("data", (chunk: Buffer) => (devLog += chunk.toString()));
    try {
      // Wait for the dev server, then confirm the page, then edit and poll.
      const url = "http://localhost:3217/docs/what-is-a-ksor/";
      let lastStatus = 0;
      try {
        await expect
          .poll(
            async () => {
              try {
                const res = await fetch(url);
                lastStatus = res.status;
                return res.status;
              } catch {
                lastStatus = 0;
                return 0;
              }
            },
            { timeout: 120_000, interval: 1_000 },
          )
          .toBe(200);
      } catch (error) {
        // `expect.poll`'s message option is a plain string, evaluated before
        // the log exists — so the evidence is attached here instead.
        throw new Error(
          `${(error as Error).message}\nlast status ${lastStatus}; dev server said:\n${devLog.slice(-4000)}`,
        );
      }
      // Proof we reached OUR server: the record's MACHINE identity, which is
      // `name:` in the instance and not the display title every KSoR starter
      // shares (record spec §3).
      expect(
        await (await fetch("http://localhost:3217/llms.txt")).text(),
        "the dev server must be this project's",
      ).toContain("- name: walkthrough");
      const marker = "hot-reload-proof-4173";
      appendFileSync(path.join(project, "knowledge", "what-is-a-ksor.md"), `\n${marker}\n`);
      try {
        await expect
          .poll(async () => (await fetch(url)).text(), { timeout: 60_000, interval: 2_000 })
          .toContain(marker);
      } catch (error) {
        // Which HALF broke. The path is two steps — the record watcher carries
        // the edit into the staged copy (`lib/stage-knowledge.ts`, whose
        // refresh swallows every error by design so a half-saved file cannot
        // take the dev server down), and the shell rebuilds the page from that
        // copy. A bare "the page never showed it" names neither, and the two
        // have different fixes.
        const staged = path.join(
          project,
          "system",
          "site",
          ".staged-knowledge",
          "what-is-a-ksor.md",
        );
        const carried = existsSync(staged) && readFileSync(staged, "utf8").includes(marker);
        throw new Error(
          `${(error as Error).message}\nthe staged copy ${carried ? "DID" : "did NOT"} receive the edit` +
            `\ndev server said:\n${devLog.slice(-4000)}`,
        );
      }
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
      writeFileSync(
        parent,
        concept({
          title: "Attach host",
          description: "The document its attachments hang on.",
          order: 30,
          body: "Host body text.",
        }),
      );
      expect(buildScaffold(project).status, "baseline build").toBe(0);
      const before = {
        md: withoutBuildId(readFileSync(path.join(outDir, "md", "attach-host.md"), "utf8")),
        llms: withoutBuildId(readFileSync(path.join(outDir, "llms.txt"), "utf8")),
        llmsFull: withoutBuildId(readFileSync(path.join(outDir, "llms-full.txt"), "utf8")),
      };

      const SUMMARY_MARK = "zzsummarymarkerzz";
      const CARD_MARK = "zzcardmarkerzz";
      // A summary's frontmatter is exactly `type: Summary` — the profile
      // refuses any other key as a class, because an attachment inherits its
      // parent's governance and may claim none of its own (record spec §1).
      writeFileSync(
        path.join(knowledge, "attach-host.summary.md"),
        `---\ntype: Summary\n---\n\nA precis ${SUMMARY_MARK}.\n`,
      );
      writeFileSync(
        path.join(knowledge, "attach-host.flashcards.yaml"),
        `deck:\n  title: Host deck\ncards:\n  - front: Q ${CARD_MARK}?\n    back: A ${CARD_MARK}.\n`,
      );
      expect(buildScaffold(project).status, "build with attachments").toBe(0);

      // The parent's own bytes did not move.
      expect(withoutBuildId(readFileSync(path.join(outDir, "md", "attach-host.md"), "utf8"))).toBe(
        before.md,
      );
      expect(withoutBuildId(readFileSync(path.join(outDir, "llms.txt"), "utf8"))).toBe(before.llms);
      expect(withoutBuildId(readFileSync(path.join(outDir, "llms-full.txt"), "utf8"))).toBe(
        before.llmsFull,
      );

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
      writeFileSync(
        parent,
        concept({
          title: "Quiz host",
          description: "The document its quiz hangs on.",
          order: 31,
          body: "Host body.",
        }),
      );
      expect(buildScaffold(project).status, "baseline build").toBe(0);
      const before = {
        md: withoutBuildId(readFileSync(path.join(outDir, "md", "quiz-host.md"), "utf8")),
        llms: withoutBuildId(readFileSync(path.join(outDir, "llms.txt"), "utf8")),
        llmsFull: withoutBuildId(readFileSync(path.join(outDir, "llms-full.txt"), "utf8")),
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
      expect(withoutBuildId(readFileSync(path.join(outDir, "md", "quiz-host.md"), "utf8"))).toBe(
        before.md,
      );
      expect(withoutBuildId(readFileSync(path.join(outDir, "llms.txt"), "utf8"))).toBe(before.llms);
      expect(withoutBuildId(readFileSync(path.join(outDir, "llms-full.txt"), "utf8"))).toBe(
        before.llmsFull,
      );

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
      writeFileSync(
        parent,
        concept({
          title: "Deck host",
          description: "The document its deck hangs on.",
          order: 32,
          body: "Host body.",
        }),
      );
      expect(buildScaffold(project).status, "baseline build").toBe(0);
      const before = {
        md: withoutBuildId(readFileSync(path.join(outDir, "md", "deck-host.md"), "utf8")),
        llms: withoutBuildId(readFileSync(path.join(outDir, "llms.txt"), "utf8")),
        llmsFull: withoutBuildId(readFileSync(path.join(outDir, "llms-full.txt"), "utf8")),
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
      expect(withoutBuildId(readFileSync(path.join(outDir, "md", "deck-host.md"), "utf8"))).toBe(
        before.md,
      );
      expect(withoutBuildId(readFileSync(path.join(outDir, "llms.txt"), "utf8"))).toBe(before.llms);
      expect(withoutBuildId(readFileSync(path.join(outDir, "llms-full.txt"), "utf8"))).toBe(
        before.llmsFull,
      );

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
        concept({
          title: "Surface host",
          description: "Every affordance a record gets with nothing configured.",
          order: 33,
          body:
            "> [!WARNING]\n> zzalertbodyzz\n\n" +
            "| Head | Other |\n| --- | --- |\n| zzcellzz | second |\n\n" +
            "```text\nzzverbatimzz\n```",
        }),
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
    // A full scaffold build, so it needs a build-sized timeout rather than the
    // tier's 30s default — like every other clause here that builds.
  }, 300_000);

  it("frames a link titled `embed`, requests nothing until asked, and leaves /md/ alone", () => {
    const outDir = path.join(project, "system", "site", "out");
    const doc = path.join(project, "knowledge", "embed-host.md");
    const URL = "https://sims.example.org/zzsimzz";
    try {
      writeFileSync(
        doc,
        concept({
          title: "Embed host",
          description: "A document that frames a page it does not carry.",
          body:
            // The marked link, alone in its paragraph.
            `[Play the zzsimzz](${URL} "embed")\n\n` +
            // An ordinary link to the SAME url, which must stay a link — the
            // opt-in is the title, so this pair is the whole rule in one file.
            `See [the zzsimzz](${URL}) for more.`,
        }),
      );
      expect(buildScaffold(project).status, "build with an embed").toBe(0);

      const page = readFileSync(path.join(outDir, "docs", "embed-host", "index.html"), "utf8");

      // Nothing is requested until a reader asks: the built page ships the
      // placeholder, and the frame is created on click. This is the clause
      // that keeps the zero-external-request guarantee true.
      expect(page, "an embed must not ship a frame").not.toContain("<iframe");
      expect(page, "the host must be named, so the click is informed").toContain(
        "sims.example.org",
      );

      // The ordinary link survives as a link.
      expect(page, "the plain link was reframed").toContain("See ");

      // REHYPE, not remark: the agent surface keeps the author's link rather
      // than this site's component. The whole reason for the phase choice.
      const twin = readFileSync(path.join(outDir, "md", "embed-host.md"), "utf8");
      expect(twin, "the markdown twin lost the author's link").toContain(URL);
      expect(twin, "the markdown twin served a React component").not.toContain("<Embed");
    } finally {
      rmSync(doc, { force: true });
    }
    // A full scaffold build, so it needs a build-sized timeout rather than the
    // tier's 30s default — like every other clause here that builds. Ran 41.8s
    // under webpack and timed out at 30s; it had been passing on the margin.
  }, 300_000);

  it("serves a sim the record carries, from this site, under the record's own path", () => {
    const outDir = path.join(project, "system", "site", "out");
    const dir = path.join(project, "knowledge", "sims-host");
    // A NAMED concept, not the folder's `index.md`: an index is generated by
    // `ksor build` (record spec §8), so a folder's own prose is a document
    // inside it — which is also what puts the sim beside its document.
    const doc = path.join(dir, "loop.md");
    const sim = path.join(dir, "zzloopzz.sim.html");
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(sim, "<!doctype html><title>zzsimtitlezz</title><p>zzsimbodyzz</p>\n");
      writeFileSync(
        doc,
        concept({
          title: "Sims host",
          description: "A document that carries the page it frames.",
          // Written as a link to the file BESIDE the document, exactly the way
          // a figure is. The served url is derived, never authored.
          body: '[Play it](zzloopzz.sim.html "embed")',
        }),
      );
      expect(buildScaffold(project).status, "build with a carried sim").toBe(0);

      // Published where it can be SERVED, under the record path — so two
      // documents may each own a `zzloopzz.sim.html` without colliding.
      const served = path.join(outDir, "sims", "sims-host", "zzloopzz.html");
      expect(existsSync(served), "the sim was not published where it can be served").toBe(true);
      expect(readFileSync(served, "utf8")).toContain("zzsimbodyzz");

      const page = readFileSync(
        path.join(outDir, "docs", "sims-host", "loop", "index.html"),
        "utf8",
      );
      // The derived url, not the record path.
      expect(page).toContain("/sims/sims-host/zzloopzz.html");
      expect(page, "the record's own path must not reach the page").not.toContain(
        "zzloopzz.sim.html",
      );
      // Still click-to-load, and now honestly described: it IS part of the
      // record, so the panel may not say a third party runs it.
      expect(page, "a sim must not ship a frame").not.toContain("<iframe");
      expect(page).toContain("Part of this record");

      // No route and no markdown twin: a sim is an asset, not a document.
      expect(existsSync(path.join(outDir, "docs", "sims-host", "zzloopzz.sim"))).toBe(false);
      expect(existsSync(path.join(outDir, "md", "sims-host", "zzloopzz.sim.html"))).toBe(false);

      // And it never becomes a document: nothing in the record index names it.
      expect(readFileSync(path.join(outDir, "llms.txt"), "utf8")).not.toContain("zzloopzz");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    // A full scaffold build, so it needs a build-sized timeout rather than the
    // tier's 30s default — like every other clause here that builds. Ran 41.8s
    // under webpack and timed out at 30s; it had been passing on the margin.
  }, 300_000);

  it("renders code tabs from a fence's info string, and carries the group", () => {
    const knowledge = path.join(project, "knowledge");
    const doc = path.join(knowledge, "tabbed.md");
    try {
      writeFileSync(
        doc,
        concept({
          title: "Tabbed",
          description: "Two ways to run the same command, authored in CommonMark.",
          order: 34,
          body: [
            "Pick one.",
            "",
            '```bash tab="Alpha Tool" tab-group="picker"',
            "zzalphacmdzz --version",
            "```",
            "",
            '```bash tab="Beta Tool" tab-group="picker"',
            "zzbetacmdzz --version",
            "```",
          ].join("\n"),
        }),
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
    const nested = path.join(knowledge, "handbook", "purchase-policies", "returns");
    const doc = (file: string, title: string, order: number): void =>
      writeFileSync(
        path.join(knowledge, file),
        concept({ title, description: `${title}, one line.`, order, body: "One line." }),
      );

    try {
      mkdirSync(nested, { recursive: true });
      // NO authored `index.md`: an index is generated by `ksor build` and an
      // authored one is refused (record spec §1), so a folder has no title of
      // its own any more — its step is the humanised directory name the
      // generated index carries. `purchase-policies` is the discriminating
      // one: printing the raw segment gives "purchase-policies", not
      // "Purchase policies".
      doc(path.join("handbook", "welcome.md"), "Handbook welcome", 20);
      doc(path.join("handbook", "purchase-policies", "scope.md"), "What it covers", 1);
      doc(
        path.join("handbook", "purchase-policies", "returns", "window.md"),
        "The thirty-day window",
        1,
      );

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

      // Every folder between the record's front door and the document.
      const deep = trailOn(path.join("docs", "handbook", "purchase-policies", "returns", "window"));
      expect(deep.steps).toEqual([
        "Handbook",
        "Purchase policies",
        "Returns",
        "The thirty-day window",
      ]);
      // …and each ancestor is a working link, the document itself is not.
      expect(deep.hrefs).toEqual([
        "/",
        "/docs/handbook/",
        "/docs/handbook/purchase-policies/",
        "/docs/handbook/purchase-policies/returns/",
      ]);
      for (const href of deep.hrefs.slice(1)) {
        expect(
          existsSync(path.join(outDir, href.replace(/^\/|\/$/g, ""), "index.html")),
          `breadcrumb links to ${href}, which the export does not contain`,
        ).toBe(true);
      }

      // The trail shortens as it climbs — a fixed-depth implementation passes
      // the case above and fails these.
      expect(trailOn(path.join("docs", "handbook", "purchase-policies", "returns")).steps).toEqual([
        "Handbook",
        "Purchase policies",
        "Returns",
      ]);
      expect(trailOn(path.join("docs", "handbook")).steps).toEqual(["Handbook"]);
    } finally {
      rmSync(path.join(knowledge, "handbook"), { recursive: true, force: true });
    }
  }, 300_000);

  it("renders each document's declared governance, and infers nothing", () => {
    write(
      "refund-policy",
      concept({
        title: "Refund policy",
        description: "The refund rules that ran until 2026.",
        status: "deprecated",
        order: 2,
        ksor: `  owner: team:finance
  superseded_by: refund-policy-v5
  deprecated: { by: "human:ciso", at: 2026-08-10T00:00:00Z }
`,
        extra: `sources:
  - { id: board-2026, resource: "scope: board minutes 2026-01-11", title: Board minutes }
  - { id: refunds-v4, resource: https://intranet.example.com/legal/refunds-v4, title: Terms of service v4 }
`,
        body: "Refunds are issued within 30 days of purchase. [^board-2026]\n\n[^board-2026]: Board minutes, §2.",
      }),
    );
    write(
      "refund-policy-v5",
      concept({
        title: "Refund policy v5",
        description: "How long a buyer has to send something back.",
        order: 3,
        ksor: "  owner: team:finance\n",
        extra: 'verified:\n  - { by: "human:kim", at: 2026-08-19T14:00:00Z }\n',
        body: "Refunds are issued within 60 days of purchase.",
      }),
    );
    // A concept declaring the FLOOR and nothing else. For a document that gets
    // a PAGE the floor is `type`, `title`, `description`, `status`,
    // `ksor.audience` plus — because it is stable — `generated` and
    // `ksor.approval` (record spec §2.2); a draft has no page in a build at
    // all, so it cannot carry these assertions. Written here rather than
    // borrowed from the starter, which declares more.
    write(
      "bare-note",
      concept({
        title: "A bare note",
        description: "Declares the floor and nothing else.",
        order: 12,
        body: "Declares only the keys the profile requires.",
      }),
    );

    const build = buildScaffold(project);
    expect(build.status, `${build.stdout}${build.stderr}`.slice(-2000)).toBe(0);

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
      expect(found, `no deprecation notice in ${route}`).not.toBeNull();
      return found?.[0] ?? "";
    };

    const notice = noticeIn("docs/refund-policy");
    expect(notice, "the notice is labelled for landmark navigation").toContain(
      'aria-labelledby="ksor-deprecated"',
    );
    expect(notice).toContain("Deprecated");
    expect(notice).toContain("replaced by");
    // Named by its TITLE, not by the concept id — the notice is for a reader.
    expect(notice).toContain("Refund policy v5");
    // The link must be IN the notice, not merely somewhere on the page.
    expect(notice).toMatch(/href="\/docs\/refund-policy-v5\/?"/);

    // The strip: the record's own word for where the document stands, the
    // trust tier OKF names, and every attribution the record declares.
    const withdrawn = visible("docs/refund-policy");
    expect(withdrawn).toMatch(/Status deprecated/);
    expect(withdrawn).toMatch(/Trust unverified/);
    expect(withdrawn).toMatch(/Owner team:finance/);
    // Who withdrew it, and when: `ksor.deprecated` is required on every
    // deprecated concept, and a withdrawal nobody signed is a withdrawal by
    // nobody.
    expect(withdrawn).toMatch(/Withdrawn human:ciso · 2026-08-10/);
    // sources is a LIST so a footnote can point at exactly one entry: both
    // survive to the page, separately.
    expect(withdrawn).toContain("Board minutes");
    expect(withdrawn).toContain("Terms of service v4");

    // A source that IS a URL is followable; a scope descriptor stays text.
    // Provenance is load-bearing, and a source nobody can open is weaker than
    // the record makes it (research/site-design.md F5).
    const sourcesHtml = (route: string): string => {
      const html = built(path.join(route, "index.html"));
      const at = html.indexOf("Sources");
      expect(at, `no Sources section in ${route}`).toBeGreaterThan(-1);
      return html.slice(at);
    };
    const refundSources = sourcesHtml("docs/refund-policy");
    expect(refundSources).toMatch(
      /<a[^>]+href="https:\/\/intranet\.example\.com\/legal\/refunds-v4"[^>]*>/,
    );
    // …and the scope descriptor beside it is NOT wrapped in an anchor.
    expect(refundSources).toMatch(/<li[^>]*>(?:(?!<a ).)*?Board minutes<\/li>/s);

    // SEARCH results carry the badge too. The dialog runs in the browser over
    // a static index with no field for it, so the map travels in the document;
    // asserting it here proves the bytes a reader's browser receives, which is
    // the closest a static check gets to the dialog itself.
    const anyPageHtml = built(path.join("docs", "refund-policy", "index.html"));
    const statusMap = /id="ksor-statuses">([^<]*)</.exec(anyPageHtml)?.[1];
    expect(statusMap, `no status map in the page: ${anyPageHtml.slice(0, 200)}`).toBeDefined();
    const parsed = JSON.parse(statusMap ?? "{}") as Record<string, string>;
    expect(parsed["/docs/refund-policy"], "the withdrawn document is marked").toBe("deprecated");
    // A stable, effective document contributes nothing: a record with no
    // caveats ships an empty map, and every row renders as the shipped dialog
    // renders it.
    expect(parsed["/docs/refund-policy-v5"]).toBeUndefined();
    // …and the CSS that tints the withdrawn row keys on the same word the map
    // carries. It read `superseded` — the pre-profile status — until
    // 2026-08-25, so the chip rendered in the ordinary grey on the one surface
    // whose snippet quotes the withdrawn figure.
    // found live 2026-08-25: the stylesheet is emitted under
    // `_next/static/chunks/`, not `_next/static/css/` — a hard-coded directory
    // made this assertion throw ENOENT rather than fail. Walk for it.
    const css = walkOut(path.join(project, "system", "site", "out"))
      .filter((file) => file.endsWith(".css"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(css, "the withdrawn search chip has no tone rule").toContain(
      "[data-ksor-status=deprecated]",
    );

    // The markdown twin carries the record's OWN frontmatter, intact — the
    // concept as the profile describes it, nested `ksor:` and all. A projection
    // that flattened `ksor.owner` to a top-level `owner:` published a
    // frontmatter record spec §2.7 refuses by name.
    const markdown = built(path.join("md", "refund-policy-v5.md"));
    expect(markdown, "the markdown twin carries the body").toContain(
      "Refunds are issued within 60 days",
    );
    expect(markdown).toContain("status: stable");
    expect(markdown).toContain("ksor:\n  audience: [public]");
    expect(markdown).toContain("  owner: team:finance");
    expect(markdown, "a top-level owner: is a pre-profile key").not.toMatch(/^owner:/m);
    // …plus the two keys the BUILD adds: the derived tier and the R14 stamps.
    expect(markdown).toContain("trust_tier: human-reviewed");
    expect(markdown).toMatch(/^build_id: sha256:/m);
    expect(
      built(path.join("docs", "refund-policy-v5", "index.html")),
      "the page advertises its markdown twin",
    ).toContain('rel="alternate" type="text/markdown" href="/md/refund-policy-v5.md"');
    // A deprecated concept is on no machine surface, so it has NO twin — and
    // the page must not advertise one (build spec §3).
    expect(existsSync(path.join(project, "system", "site", "out", "md", "refund-policy.md"))).toBe(
      false,
    );
    expect(built(path.join("docs", "refund-policy", "index.html"))).not.toContain(
      'rel="alternate"',
    );
    // Every page describes the record, twin or no twin.
    expect(built(path.join("docs", "refund-policy", "index.html"))).toContain(
      'rel="describedby" href="/llms.txt"',
    );

    // The SIDEBAR carries the badge too — it is where a reader chooses, and two
    // documents that differ only in whether one was withdrawn were identical
    // rows there (research/site-design.md F3).
    const sidebar = anyPageHtml.slice(0, anyPageHtml.indexOf("<article"));
    expect(sidebar, "the sidebar marks a withdrawn document").toContain("deprecated");

    // llms-full.txt serves one block per MACHINE-admitted document, and the
    // withdrawn one is not among them.
    const full = built("llms-full.txt");
    expect(full).toContain("# Refund policy v5 (");
    expect(full, "a deprecated concept must not reach llms-full.txt").not.toContain(
      "# Refund policy (",
    );

    // The successor names what it replaced, derived from the record with no new
    // frontmatter key (research/site-design.md F4).
    const successor = visible("docs/refund-policy-v5");
    expect(successor).toMatch(/Status stable/);
    expect(successor).toMatch(/Trust human-reviewed human:kim · 2026-08-19/);
    expect(successor).toMatch(/Approved human:kim · 2026-08-02/);
    expect(successor, "the successor names what it replaced").toMatch(/Replaces Refund policy/);
    expect(built(path.join("docs", "refund-policy-v5", "index.html")), "…and links to it").toMatch(
      /href="\/docs\/refund-policy\/?"/,
    );
    // The withdrawn document must NOT claim to replace anything here.
    expect(withdrawn).not.toContain("Replaces");

    // Nothing inferred: a document declaring the floor renders its status, its
    // tier and the approval that makes it stable, and NO other governance
    // furniture — never an "unknown" owner, which would read as governed.
    const bare = visible("docs/bare-note");
    expect(bare).toMatch(/Status stable/);
    expect(bare).toMatch(/Trust unverified/);
    expect(bare).toMatch(/Approved human:kim/);
    expect(bare).not.toContain("Owner");
    expect(bare).not.toContain("Sources");
    expect(bare).not.toContain("Withdrawn");
    expect(bare).not.toContain("Replaces");
    expect(bare).not.toContain("Effective from");
    expect(bare).not.toContain("Review by");
  }, 420_000);

  it("resolves a successor pointer to the concept it names, not to a same-named one deeper in", () => {
    // Regression (found live, 2026-08-20): the successor pointer was resolved
    // against ROUTES, and a route cannot tell a file from a folder index — so
    // the resolver guessed, and refused to link a record `pnpm check` called
    // well-formed. The original fixture for that (`knowledge/legal.md` beside
    // `knowledge/legal/`) can no longer be written: the profile refuses it as
    // `ksor-name-collides`, which is the stronger form of the same guarantee.
    // What still has to be got right, and is what this pins, is that
    // `ksor.superseded_by` is a bundle-relative CONCEPT ID — so `terms` is
    // `knowledge/terms.md` and never the `terms.md` a folder below also has.
    write(
      "terms",
      concept({ title: "Terms", description: "The successor.", order: 8, body: "The successor." }),
    );
    mkdirSync(path.join(project, "knowledge", "legal"), { recursive: true });
    writeFileSync(
      path.join(project, "knowledge", "legal", "terms.md"),
      concept({
        title: "Legal terms",
        description: "A same-named concept one level down.",
        order: 9,
        body: "A same-named concept one level down.",
      }),
    );
    write(
      "retired-terms",
      concept({
        title: "Retired terms",
        description: "Points at the root concept, not the nested namesake.",
        status: "deprecated",
        order: 7,
        ksor: `  superseded_by: terms
  deprecated: { by: "human:ciso", at: 2026-08-10T00:00:00Z }
`,
        body: "Points at the root concept.",
      }),
    );

    const result = buildScaffold(project);
    expect(result.status, `${result.stdout}${result.stderr}`.slice(-2000)).toBe(0);
    const html = built(path.join("docs", "retired-terms", "index.html"));
    const notice = /<aside[^>]*role="region"[\s\S]*?<\/aside>/.exec(html)?.[0] ?? "";
    expect(notice).toMatch(/href="\/docs\/terms\/?"/);
    expect(notice).toContain("Terms");
    // …and never the namesake a level down, which is what resolving by name
    // rather than by id would reach.
    expect(notice, "the notice reached the nested namesake").not.toMatch(/\/docs\/legal\/terms/);
    // …and never the raw pointer, which is what the route-based resolver showed.
    expect(notice).not.toContain("superseded_by");
  }, 420_000);

  it("site.governance: false keeps the pages plain and the agent surface governed", () => {
    // The record still declares owner, approval and sources — the agent surface
    // and the audit trail want them; the published page just stays plain. The
    // DEPRECATION NOTICE survives it: that is a correctness warning, not
    // decoration, and a reader handed a replaced document with no word of its
    // successor has been misled.
    //
    // …and so do the two DATE states, for the same reason and by the same
    // rule. They are the ones record spec §2.5 says a reader cannot infer from
    // the status alone, the sidebar row / folder card / search result for these
    // same documents carry them whatever this key says, and the MCP door
    // refuses both outright — so the page swallowing them made one record speak
    // with two voices about one document (2026-08-25 review).
    const instanceMd = path.join(project, "instance.md");
    const original = readFileSync(instanceMd, "utf8");
    const scratch = ["plain-future", "plain-stale"];
    // The generated index lists every concept, so adding one makes the
    // COMMITTED index stale until a build regenerates it. Kept, and put back.
    const indexMd = path.join(project, "knowledge", "index.md");
    const indexBefore = readFileSync(indexMd, "utf8");
    try {
      writeFileSync(instanceMd, original.replace(/^---\n/, "---\nsite:\n  governance: false\n"));
      // The key is in the instance's closed set, so the emitted checker takes
      // it — a record cannot be made unbuildable by turning the badges off.
      const checkOff = spawnSync(
        process.execPath,
        [path.join(project, ".agents", "skills", "format-checker", "check.mjs")],
        { cwd: project, encoding: "utf8" },
      );
      expect(checkOff.status, `${checkOff.stdout}${checkOff.stderr}`).toBe(0);

      // Two documents the calendar keeps off the machine surfaces, added after
      // the checker ran because a new concept makes the committed index stale
      // until `ksor build` regenerates it — which the rebuild below does.
      write(
        "plain-future",
        concept({
          title: "Plain not yet effective",
          description: "The record has not brought this into force yet.",
          order: 30,
          ksor: "  effective_from: 2030-01-01T00:00:00Z\n",
          body: "PLAINFUTUREBODY.",
        }),
      );
      write(
        "plain-stale",
        concept({
          title: "Plain past review",
          description: "Nobody has reviewed this since 2019.",
          order: 31,
          extra: "stale_after: 2020-01-01T00:00:00Z\n",
          body: "PLAINSTALEBODY.",
        }),
      );
      const rebuilt = buildScaffold(project);
      expect(rebuilt.status, `${rebuilt.stdout}${rebuilt.stderr}`.slice(-2000)).toBe(0);

      const plain = visible("docs/refund-policy");
      expect(plain).not.toContain("Owner team:finance");
      expect(plain).not.toContain("Trust");
      expect(plain).not.toContain("Sources");
      // A source's title FROM THE SOURCES LIST. Not "Board minutes", which is
      // also the text of the author's own footnote definition — so that canary
      // matched body prose and read as a leak of governance the page had in
      // fact suppressed (found live 2026-08-25).
      expect(plain).not.toContain("Terms of service v4");
      // …and the other half of the same claim: this key decides what the page
      // publishes ABOUT a document, and may never edit what the author wrote.
      expect(plain, "the author's own footnote is prose, not furniture").toContain(
        "Board minutes, §2.",
      );
      expect(plain).toContain("Deprecated");
      expect(plain).toContain("Refund policy v5");

      // …and `site.governance` never reaches the AGENT surface. That key
      // decides what the PAGES publish; the record keeps every key for the
      // agent surface and the audit trail, so suppressing it here would rebuild
      // the very defect this test exists to catch, on purpose.
      expect(built(path.join("md", "refund-policy-v5.md"))).toContain("owner: team:finance");
      expect(built("llms-full.txt")).toContain("trust_tier: human-reviewed");

      // The caveat, in the ARTICLE — `visible` starts at <article>, so the
      // sidebar's copy of the same badge cannot satisfy this. §2.5's own words,
      // with the ellipsis filled in, exactly as the governed build prints them.
      const future = visible("docs/plain-future");
      expect(future, "a document not yet in force opened as a current one").toContain(
        "effective from 2030-01-01",
      );
      const stale = visible("docs/plain-stale");
      expect(stale, "a document past its review date said nothing about it").toContain(
        "past its review date",
      );
      // …and the strip itself is still off on both: this restores a caveat, not
      // the attribution the key exists to hide.
      for (const [route, text] of [
        ["plain-future", future],
        ["plain-stale", stale],
      ] as const) {
        expect(text, `${route} published a trust tier`).not.toContain("unverified");
        expect(text, `${route} published its approver`).not.toContain("human:kim");
      }
    } finally {
      writeFileSync(instanceMd, original);
      for (const name of scratch)
        rmSync(path.join(project, "knowledge", `${name}.md`), { force: true });
      writeFileSync(indexMd, indexBefore);
    }
  }, 420_000);

  /**
   * Build spec §4 acceptance 4, item by item: what a `[public]` site build
   * must and must not contain. Written as ONE clause because the acceptance is
   * one build — splitting it would pay for four static exports to assert what
   * one export says.
   */
  it("acceptance 4: stamps present, no draft anywhere, every declined state on its page and off llms.txt", () => {
    const knowledge = path.join(project, "knowledge");
    const scratch = ["acc-current", "acc-draft", "acc-deprecated", "acc-future", "acc-stale"];
    try {
      write(
        "acc-current",
        concept({
          title: "Acceptance current",
          description: "The one document every surface admits.",
          order: 20,
          body: "CURRENTBODY, admitted everywhere.",
        }),
      );
      write(
        "acc-draft",
        concept({
          title: "Acceptance draft ACCDRAFTTITLE",
          description: "ACCDRAFTDESC still being written.",
          status: "draft",
          order: 21,
          body: "ACCDRAFTBODY.",
        }),
      );
      write(
        "acc-deprecated",
        concept({
          title: "Acceptance deprecated",
          description: "Replaced by the current one.",
          status: "deprecated",
          order: 22,
          ksor: `  superseded_by: acc-current
  deprecated: { by: "human:ciso", at: 2026-08-10T00:00:00Z }
`,
          body: "DEPRECATEDBODY.",
        }),
      );
      write(
        "acc-future",
        concept({
          title: "Acceptance not yet effective",
          description: "Takes effect in 2030.",
          order: 23,
          ksor: "  effective_from: 2030-01-01T00:00:00Z\n",
          body: "FUTUREBODY.",
        }),
      );
      write(
        "acc-stale",
        concept({
          title: "Acceptance past review",
          description: "Nobody has reviewed it since 2019.",
          order: 24,
          extra: "stale_after: 2020-01-01T00:00:00Z\n",
          body: "STALEBODY.",
        }),
      );

      const result = buildScaffold(project);
      expect(result.status, `${result.stdout}${result.stderr}`.slice(-2000)).toBe(0);

      // (a) llms.txt, llms-full.txt, /md/index.md and server.json carry the
      // lock's stamps (R14).
      const llms = built("llms.txt");
      for (const [name, text] of [
        ["llms.txt", llms],
        ["llms-full.txt", built("llms-full.txt")],
        ["md/index.md", built(path.join("md", "index.md"))],
        [".well-known/mcp/server.json", built(path.join(".well-known", "mcp", "server.json"))],
      ] as const) {
        expect(text, `${name} carries no build_id`).toMatch(/build_id["\s:-]+"?sha256:[0-9a-f]/);
        expect(text, `${name} carries no ksor_version`).toMatch(/ksor_version/);
        expect(text, `${name} carries no source_commit`).toMatch(/source_commit/);
      }
      // llms.txt opens on the record's OWN name and sentence, not the shell's.
      expect(llms.split("\n")[0]).toMatch(/^# .+/);
      // server.json keeps its own `version`, which is the record's — the stamps
      // live under `_meta` so a validating client still accepts the document.
      const server = JSON.parse(built(path.join(".well-known", "mcp", "server.json"))) as {
        version: string;
      };
      expect(server.version).toMatch(/^\d+\.\d+\.\d+/);
      // …and the record root is the ONE index with a twin, carrying okf_version.
      expect(built(path.join(".well-known", "mcp", "server.json"))).not.toContain("okf_version");
      expect(built(path.join("md", "index.md"))).toMatch(/^okf_version: "0.2"$/m);

      // (b) no draft appears in any page, sidebar entry, search entry or
      // machine artefact — asserted on the BYTES of the whole export, which is
      // the only form of "anywhere" that cannot be gamed by checking three
      // files.
      const out = path.join(project, "system", "site", "out");
      for (const canary of ["ACCDRAFTTITLE", "ACCDRAFTDESC", "ACCDRAFTBODY"]) {
        const hits = walkOut(out).filter((f) => readFileSync(f).includes(Buffer.from(canary)));
        expect(hits, `the draft canary "${canary}" reached: ${hits.join(", ")}`).toEqual([]);
      }
      expect(existsSync(path.join(out, "docs", "acc-draft"))).toBe(false);
      // The control: the current document IS there, so the sweep above is not
      // passing over a build that rendered nothing.
      expect(
        walkOut(out).filter((f) => readFileSync(f).includes(Buffer.from("CURRENTBODY"))).length,
      ).toBeGreaterThan(0);

      // (c) a deprecated concept's page names its successor and is absent from
      // llms.txt.
      const deprecated = built(path.join("docs", "acc-deprecated", "index.html"));
      expect(deprecated).toContain("Acceptance current");
      expect(deprecated).toMatch(/href="\/docs\/acc-current\/?"/);
      expect(llms).not.toContain("/docs/acc-deprecated");

      // (d) a not-yet-effective and a stale stable concept render with their
      // badges and are absent from llms.txt. The badge is §2.5's own words,
      // and the effectivity one carries the date the ellipsis stands for.
      expect(visible("docs/acc-future")).toMatch(/Status stable effective from 2030-01-01/);
      expect(visible("docs/acc-stale")).toMatch(/Status stable past its review date/);
      expect(llms).not.toContain("/docs/acc-future");
      expect(llms).not.toContain("/docs/acc-stale");
      // …and neither has a twin, because a twin is a machine surface.
      expect(existsSync(path.join(out, "md", "acc-future.md"))).toBe(false);
      expect(existsSync(path.join(out, "md", "acc-stale.md"))).toBe(false);

      // (e) KSOR_DRAFTS=show is a PREVIEW, and a static site's pages are
      // open-web artefacts: it says so to every crawler rather than letting a
      // draft be indexed under the record's name (build spec §3). The draft
      // reaches the human surfaces and NOTHING else — no twin, no llms.txt
      // line — which is the half a `robots` tag cannot enforce.
      const preview = buildScaffold(project, { KSOR_DRAFTS: "show" });
      expect(preview.status, `${preview.stdout}${preview.stderr}`.slice(-2000)).toBe(0);
      const draftPage = built(path.join("docs", "acc-draft", "index.html"));
      expect(draftPage).toMatch(/<meta name="robots" content="noindex/);
      expect(visible("docs/acc-draft")).toMatch(/Status draft/);
      expect(built("llms.txt")).not.toContain("ACCDRAFTTITLE");
      expect(existsSync(path.join(out, "md", "acc-draft.md"))).toBe(false);
      // …and the ordinary build carries no such tag, or every record would be
      // published unindexable.
      const republished = buildScaffold(project);
      expect(republished.status, `${republished.stdout}${republished.stderr}`.slice(-2000)).toBe(0);
      expect(built(path.join("docs", "acc-current", "index.html"))).not.toContain('name="robots"');
    } finally {
      for (const name of scratch) rmSync(path.join(knowledge, `${name}.md`), { force: true });
    }
  }, 420_000);
});

/** Every file under a built export, as absolute paths. */
function walkOut(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? walkOut(p) : [p];
  });
}

describe.runIf(!enabled)("scaffold e2e (gated)", () => {
  it("skipped — set KSOR_E2E=1 to run the full scaffold walkthrough", () => {
    expect(enabled).toBe(false);
  });
});
