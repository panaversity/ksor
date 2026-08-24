/// <reference lib="dom" />
// The page.evaluate callback runs in the browser; only this file needs DOM types.
import { spawnSync } from "node:child_process";
import {
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

import { isAttachment } from "../templates/scaffold/system/site/lib/attachment-rule.js";
import { buildScaffold } from "./e2e-build.js";
import { cleanupLocalKsor, expectLocalKsorResolved, injectLocalKsor } from "./e2e-local-ksor.js";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The shell swap seam, proven the only way a seam can be: one suite, two
// implementations (specs/ksor/init/spec.md → surface contract). The Fumadocs
// reference runs as emitted; the Docusaurus shell runs via the swap recipe its
// README documents — same record, same root commands, nothing outside
// system/site/ but the two .gitignore lines and one allowBuilds denial.
// Heavy (two installs + builds + chromium), so gated like the scaffold e2e:
//   KSOR_E2E=1 pnpm exec vitest run --config vitest.integration.config.ts packages/ksor/src/shell-conformance.integration.test.ts
const enabled = process.env.KSOR_E2E === "1";

const distCli = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));

// A real 4x4 PNG (sips-exported from the KSoR mark) for the asset probe.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAARGVYSWZNTQAqAAAACAABh2kABAAAAAEAAAAaAAAAAAADoAEAAwAAAAEAAQAAoAIABAAAAAEAAAAEoAMABAAAAAEAAAAEAAAAAMVs/gIAAAHJaVRYdFhNTDpjb20uYWRvYmUueG1wAAAAAAA8eDp4bXBtZXRhIHhtbG5zOng9ImFkb2JlOm5zOm1ldGEvIiB4OnhtcHRrPSJYTVAgQ29yZSA2LjAuMCI+CiAgIDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+CiAgICAgIDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiCiAgICAgICAgICAgIHhtbG5zOmV4aWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20vZXhpZi8xLjAvIj4KICAgICAgICAgPGV4aWY6Q29sb3JTcGFjZT4xPC9leGlmOkNvbG9yU3BhY2U+CiAgICAgICAgIDxleGlmOlBpeGVsWERpbWVuc2lvbj4zMjwvZXhpZjpQaXhlbFhEaW1lbnNpb24+CiAgICAgICAgIDxleGlmOlBpeGVsWURpbWVuc2lvbj4zMjwvZXhpZjpQaXhlbFlEaW1lbnNpb24+CiAgICAgIDwvcmRmOkRlc2NyaXB0aW9uPgogICA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgqWsr5jAAAAP0lEQVQIHQE0AMv/Af////b7/f0B+wsDBgT2+PzL2urzAOk2Jh8CCQcE7ejq1sjrC/8MAP///+bs9dbg8Pz9/kfmIaM5XLTrAAAAAElFTkSuQmCC",
  "base64",
);

interface Shell {
  readonly shellName: string;
  readonly swap: ((project: string) => void) | null;
}

// ONE shell. The second (workbench/shells/docusaurus) was retired 2026-08-24
// — decision 9 revision. The `.each(SHELLS)` shape stays because the surface
// contract is what this suite asserts, and it is unchanged; only the number of
// implementations it runs against is. A shell added back here restores the
// swap proof without restructuring the suite.
const SHELLS: readonly Shell[] = [{ shellName: "fumadocs", swap: null }];

function run(command: string, args: readonly string[], cwd: string): void {
  const result = spawnSync(command, [...args], { cwd, encoding: "utf8" });
  // Both streams: tsc reports on stdout; stderr is null when the spawn
  // itself failed (command missing).
  const detail =
    `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim() ||
    String(result.error ?? "spawn failed");
  expect(result.status, `${command} ${args.join(" ")}: ${detail.slice(-2000)}`).toBe(0);
}

/** knowledge-relative .md path → site slug under /docs (no trailing slash). */
function docSlug(file: string): string {
  const noExt = file.slice(0, -".md".length);
  if (noExt === "index") return "";
  return noExt.endsWith("/index") ? noExt.slice(0, -"/index".length) : noExt;
}

/**
 * Study attachments belong to a document and are not documents themselves, so
 * clause 2 must not demand a route for one. They get their own clause below.
 *
 * IMPORTED, not copied. This file kept its own suffix list until the quiz
 * landed and the list was not updated with it — which meant `attachmentFiles`
 * silently stopped collecting quizzes, so the clause asserting that an
 * attachment gets no route was not testing them at all. A stale copy in a TEST
 * is worse than one in shipped code: it fails open, green.
 */

function knowledgeFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? knowledgeFiles(path.join(dir, entry.name), `${prefix}${entry.name}/`)
      : entry.name.endsWith(".md") && !isAttachment(entry.name)
        ? [`${prefix}${entry.name}`]
        : [],
  );
}

/** Every attachment in the record, whatever its extension. */
function attachmentFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? attachmentFiles(path.join(dir, entry.name), `${prefix}${entry.name}/`)
      : isAttachment(entry.name)
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

// An ephemeral port per serve: fixed ports leaked EADDRINUSE flakes on a
// busy machine (review finding, 2026-08-18).
function serveStatic(outDir: string): Promise<{ server: Server; port: number }> {
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
  return new Promise((resolve) =>
    server.listen(0, () => {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("no port assigned");
      resolve({ server, port: address.port });
    }),
  );
}

describe.runIf(enabled).each(SHELLS)(
  "surface contract — $shellName shell",
  ({ shellName, swap }) => {
    let work: string;
    let project: string;
    let outDir: string;

    beforeAll(() => {
      work = mkdtempSync(path.join(tmpdir(), `ksor-conform-${shellName}-`));
      run(process.execPath, [distCli, "init", `conform-${shellName}`], work);
      project = path.join(work, `conform-${shellName}`);

      // A record with explicit order, folders, unordered documents whose
      // names interleave with a folder's, and a description — enough to tell
      // "renders the record" from "renders the example", and to pin the
      // canonical reading order both shells must share: ordered first
      // (ascending; the starter record ships orders 1-3), then plain name
      // order with folders interleaved.
      const knowledge = path.join(project, "knowledge");
      writeFileSync(
        path.join(knowledge, "beta.md"),
        "---\ntitle: Beta policy\nstatus: draft\ndescription: first by order\norder: 0\n---\n\nBeta body.\n",
      );
      mkdirSync(path.join(knowledge, "hr"));
      writeFileSync(
        path.join(knowledge, "hr", "index.md"),
        "---\ntitle: HR overview\nstatus: draft\norder: 2\n---\n\nHR body.\n\n![chart](./chart.png)\n",
      );
      // A real image beside a document — the SME walk's "add an image"
      // promise, pinned cross-shell (found live: neither suite exercised an
      // asset, and a damaged one behaved differently per shell).
      writeFileSync(path.join(knowledge, "hr", "chart.png"), TINY_PNG);
      writeFileSync(
        path.join(knowledge, "hr", "pay.md"),
        "---\ntitle: Pay\nstatus: draft\n---\n\nPay body.\n",
      );
      writeFileSync(
        path.join(knowledge, "hr", "leave.md"),
        "---\ntitle: Leave\nstatus: draft\norder: 1\n---\n\nLeave body.\n",
      );
      writeFileSync(
        path.join(knowledge, "hr-notes.md"),
        "---\ntitle: HR notes\nstatus: draft\n---\n\nNotes body.\n",
      );
      mkdirSync(path.join(knowledge, "aaa"));
      writeFileSync(
        path.join(knowledge, "aaa", "index.md"),
        "---\ntitle: AAA folder\nstatus: draft\n---\n\nAAA body.\n",
      );
      writeFileSync(
        path.join(knowledge, "mmm.md"),
        "---\ntitle: MMM loose\nstatus: draft\n---\n\nMMM body.\n",
      );
      // Divergence probes, each found live 2026-08-18: a digit prefix that
      // Docusaurus's default numberPrefixParser strips from the route, and a
      // bare `order:` one shell read as 0 and the other as unordered.
      writeFileSync(
        path.join(knowledge, "01-intro.md"),
        "---\ntitle: Numbered intro\nstatus: draft\n---\n\nNumbered intro body.\n",
      );
      writeFileSync(
        path.join(knowledge, "empty-order.md"),
        "---\ntitle: Empty order\nstatus: draft\norder:\n---\n\nEmpty order body.\n",
      );

      swap?.(project);
      // Resolve the scaffold's `@panaversity/ksor` self-pin to the LOCAL build
      // (the pinned exact version is unpublished in CI/dev).
      const localKsor = injectLocalKsor(project);
      // The scaffold's first install is non-frozen by design: the served tool
      // is pinned to the exact CLI version, which the committed site-only
      // lockfile cannot pre-resolve, so pnpm adds it and writes the lock
      // (decision 11 revision 2026-08-20). A shell swap changes the dependency
      // set the same way. CI defaults frozen-lockfile on (found live 2026-08-18:
      // ERR_PNPM_OUTDATED_LOCKFILE under CI=true), so it must be disabled here.
      // --config.minimumReleaseAge=0: the scaffold quarantines dependency versions
      // published in the last 48h, which is right for an adopter and NON-DETERMINISTIC
      // for CI — any transitive dep that happens to publish today fails this job
      // (found live 2026-08-20: @peculiar/asn1-x509 via the Docusaurus shell). The
      // policy itself is asserted from the emitted yaml in the init suite; this test
      // is about the shell swap.
      run("pnpm", ["install", "--no-frozen-lockfile", "--config.minimumReleaseAge=0"], project);
      expectLocalKsorResolved(project, localKsor);
      cleanupLocalKsor(localKsor);
      if (swap) {
        // The workbench shell is not a repo workspace member, so nothing else
        // ever typechecks its ~1,900 TS/TSX lines; here its dependencies
        // exist, so it typechecks here (review finding, 2026-08-18).
        run("pnpm", ["--dir", path.join("system", "site"), "exec", "tsc", "--noEmit"], project);
      }
      const built = buildScaffold(project);
      expect(built.status, `${built.stdout ?? ""}\n${built.stderr ?? ""}`.trim().slice(-2000)).toBe(
        0,
      );
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
        const html = readFileSync(page, "utf8");
        expect(html, `${file}: title not rendered`).toContain(title);
        // Titles alone are vacuous — every page's nav embeds every title, so
        // a shell that garbles bodies passed (review finding, 2026-08-18).
        // Assert the body's first plain-text run appears in the page.
        const body = text.replace(/^---[\s\S]*?\n---[ \t]*\n/, "");
        const firstLine = body.split("\n").find((line) => line.trim() !== "") ?? "";
        const plain = (firstLine.split("`")[0] ?? "").trim();
        if (plain.length >= 12 && !plain.startsWith("!") && !plain.startsWith("#")) {
          expect(html, `${file}: body not rendered`).toContain(plain);
        }
      }
    });

    /**
     * A CONTRACT CLAUSE, not shell chrome. Rendering a summary or a deck is a
     * feature the reference shell has and the workbench shell does not — but
     * PUBLISHING an attachment as a routed document is a cross-surface
     * divergence: it would carry its own URL, its own sidebar row and its own
     * llms.txt line on one shell and not the other, with governance that
     * inherits on neither. Decision 19: a surface that refuses must refuse on
     * both surfaces.
     */
    it("clause 2: no shell publishes a study attachment as a document", () => {
      const knowledge = path.join(project, "knowledge");
      const attachments = attachmentFiles(knowledge);
      expect(
        attachments.length,
        "the scaffold ships attachments; without one this clause proves nothing",
      ).toBeGreaterThan(0);

      for (const file of attachments) {
        // The route an attachment would take IF a shell treated it as a
        // document: only the final extension comes off, so
        // `x.summary.md` -> `/docs/x.summary`. Stripping the WHOLE attachment
        // suffix instead yields the PARENT's slug, which exists and must —
        // asserting on that is how this clause first went red against correct
        // code.
        const slug = file.replace(/\.(md|mdx|yaml)$/, "");
        expect(
          existsSync(path.join(outDir, "docs", slug, "index.html")),
          `${file} was published as a document at /docs/${slug}`,
        ).toBe(false);

        const llms = readFileSync(path.join(outDir, "llms.txt"), "utf8");
        expect(llms, `${file} reached llms.txt`).not.toContain(`/docs/${slug}`);
      }
    });

    it("clause 2: the record and kit never notice the shell — pnpm check passes", () => {
      run("node", [path.join(".agents", "skills", "format-checker", "check.mjs")], project);
    });

    it("clause 3: llms.txt names the instance and lists the record in the canonical order", () => {
      const llms = readFileSync(path.join(outDir, "llms.txt"), "utf8");
      const lines = llms.split("\n");
      expect(lines[0]).toBe(`# conform-${shellName}`);
      expect(llms, `llms.txt:\n${llms}`).toContain("[Beta policy](/docs/beta): first by order");
      // The reading order is one truth across shells: at every level declared
      // orders first (a folder takes its index page's order), ties broken on
      // the url — folders interleaved with files (aaa/ then hr-notes then
      // mmm), nested orders honored (hr/leave order 1 before orderless
      // hr/pay). Found live 2026-08-18 twice: the loader tie order and then a
      // flat sort approximation each silently diverged between shells on
      // exactly these probes.
      const sequence = lines
        .map((line) => /\]\((\/docs\/[^)]+)\)/.exec(line)?.[1])
        .filter((url): url is string => url !== undefined);
      expect(sequence, `llms.txt:\n${llms}`).toEqual([
        "/docs/beta",
        "/docs/what-is-a-ksor",
        "/docs/hr",
        "/docs/hr/leave",
        "/docs/hr/pay",
        "/docs/surfaces",
        "/docs/surfaces/for-people",
        "/docs/surfaces/for-agents",
        "/docs/governance-ladder",
        "/docs/01-intro",
        "/docs/aaa",
        "/docs/empty-order",
        "/docs/hr-notes",
        "/docs/mmm",
      ]);
      for (const target of sequence) {
        expect(
          existsSync(path.join(outDir, target, "index.html")),
          `llms.txt link ${target} does not resolve in the export`,
        ).toBe(true);
      }
      expect(existsSync(path.join(outDir, "llms-full.txt"))).toBe(true);
    });

    it("clause 4: browser smoke — both themes, no console errors, no external requests", async () => {
      const { server, port } = await serveStatic(outDir);
      let browser: Awaited<ReturnType<typeof chromiumLaunch>> | null = null;
      const chromiumLaunch = async () => (await import("playwright")).chromium.launch();
      const backgrounds: Record<string, string> = {};
      try {
        // Inside the try: a launch failure must still close the server
        // (review finding, 2026-08-18 — the fixed-port leak).
        browser = await chromiumLaunch();
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
            // data: URIs are inlined assets, not network egress.
            if (!req.url().startsWith(`http://localhost:${port}`) && !req.url().startsWith("data:"))
              external.push(req.url());
          });
          // The home page is part of the surface: the branding assets, the
          // derived CTA, and the llms.txt anchor all live there, and no other
          // suite opens it in a browser (review finding, 2026-08-18).
          await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
          await expect
            .poll(() => page.locator("body").textContent(), { timeout: 10_000 })
            .toContain("Built with KSoR");
          await page.goto(`http://localhost:${port}/docs/what-is-a-ksor/`, {
            waitUntil: "networkidle",
          });
          await expect
            .poll(() => page.locator("h1").first().textContent(), { timeout: 10_000 })
            .toContain("What a Knowledge System of Record is");
          // The SME walk's promise, pinned: an image beside a document
          // renders — actually decoded, not merely requested.
          await page.goto(`http://localhost:${port}/docs/hr/`, { waitUntil: "networkidle" });
          const imageWidth = await page.evaluate(() => {
            const img = document.querySelector<HTMLImageElement>("main img, article img");
            return img?.naturalWidth ?? 0;
          });
          expect(imageWidth, `chart.png decoded width in ${colorScheme}`).toBeGreaterThan(0);
          backgrounds[colorScheme] = await page.evaluate(() => {
            // Docusaurus paints the theme on <html>, Fumadocs on <body>
            // (found live 2026-08-18) — take whichever is painted.
            const html = getComputedStyle(document.documentElement).backgroundColor;
            return html !== "rgba(0, 0, 0, 0)"
              ? html
              : getComputedStyle(document.body).backgroundColor;
          });
          expect(consoleErrors, `console and page errors in ${colorScheme}`).toEqual([]);
          expect(external, `external requests in ${colorScheme}`).toEqual([]);
          await context.close();
        }
        expect(
          backgrounds.dark,
          `backgrounds light=${backgrounds.light} dark=${backgrounds.dark}`,
        ).not.toBe(backgrounds.light);
      } finally {
        await browser?.close();
        server.close();
      }
    }, 240_000);

    it("sub-path hosting: a KSOR_BASE_PATH build prefixes llms.txt and page links", () => {
      const result = buildScaffold(project, { KSOR_BASE_PATH: "/repo" });
      expect(
        result.status,
        (result.stderr ?? String(result.error ?? "spawn failed")).slice(-2000),
      ).toBe(0);
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
