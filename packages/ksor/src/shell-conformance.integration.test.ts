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

// The shell swap seam, proven the only way a seam can be: one suite, per
// implementation (specs/ksor/init/spec.md → surface contract). The Fumadocs
// reference runs as emitted. Heavy (install + builds + chromium), so gated
// like the scaffold e2e:
//   KSOR_E2E=1 pnpm exec vitest run --config vitest.integration.config.ts packages/ksor/src/shell-conformance.integration.test.ts
//
// The record is the profile's (record spec §2): every document this suite
// writes is a stable, approved concept, because a BUILD admits nothing else
// to `llms.txt` — the starter's own documents are drafts and are therefore
// absent from every artefact asserted here, which is why nothing below
// depends on what the starter says. `pnpm build` is `ksor build` followed by
// the site build (build spec §1), so the lock the site refuses without is
// written by the same command.
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
// implementations it runs against is.
const SHELLS: readonly Shell[] = [{ shellName: "fumadocs", swap: null }];

function run(command: string, args: readonly string[], cwd: string): void {
  const result = spawnSync(command, [...args], { cwd, encoding: "utf8" });
  const detail =
    `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim() ||
    String(result.error ?? "spawn failed");
  expect(result.status, `${command} ${args.join(" ")}: ${detail.slice(-2000)}`).toBe(0);
}

/** A stable, approved, public concept in the profile's shape. */
function concept(title: string, description: string, body: string, order?: number): string {
  return `---
type: Document
title: ${title}
description: ${description}
status: stable
${order === undefined ? "" : `order: ${order}\n`}generated: { by: "ksor-test/1.0", at: 2026-08-01T00:00:00Z }
ksor:
  audience: [public]
  approval: { by: "human:kim", at: 2026-08-02T00:00:00Z }
---

${body}
`;
}

/** knowledge-relative .md path → site slug under /docs (no trailing slash). */
function docSlug(file: string): string {
  return file.slice(0, -".md".length);
}

/** The stable concepts of the record — the only documents a build renders. */
function stableFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? stableFiles(path.join(dir, entry.name), `${prefix}${entry.name}/`)
      : entry.name.endsWith(".md") &&
          entry.name !== "index.md" &&
          !isAttachment(entry.name) &&
          /^status:[ \t]*stable/m.test(readFileSync(path.join(dir, entry.name), "utf8"))
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
  ".md": "text/markdown",
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
      // canonical reading order: the index generator's (build spec §1) —
      // concepts by `order:` then title, then folders by their first concept.
      const knowledge = path.join(project, "knowledge");
      writeFileSync(
        path.join(knowledge, "beta.md"),
        concept("Beta policy", "first by order", "Beta body.", 0),
      );
      mkdirSync(path.join(knowledge, "hr"));
      // A folder's prose is a concept INSIDE it (record spec §1: `index.md` is
      // generated, never authored), with a real image beside it — the SME
      // walk's "add an image" promise, pinned.
      writeFileSync(
        path.join(knowledge, "hr", "overview.md"),
        concept("HR overview", "the folder's prose", "HR body.\n\n![chart](./chart.png)", 2),
      );
      writeFileSync(path.join(knowledge, "hr", "chart.png"), TINY_PNG);
      // Both link forms OKF §6.1 allows, from a NESTED document: bundle-absolute
      // against `knowledge/`, and relative against this document's directory
      // with the `.md` left off. The shell resolves neither, so before the
      // record's own resolver ran in front of it both 404'd from every page.
      writeFileSync(
        path.join(knowledge, "hr", "pay.md"),
        concept(
          "Pay",
          "pay body",
          "Pay body.\n\nSee [the beta policy](/beta.md) and [leave](leave).",
        ),
      );
      // A companion of a stable parent: rendered on the parent's page and
      // published nowhere else.
      writeFileSync(
        path.join(knowledge, "hr", "pay.summary.md"),
        "---\ntype: Summary\n---\n\nPAYSUMMARY the short version.\n",
      );
      writeFileSync(
        path.join(knowledge, "hr", "leave.md"),
        concept("Leave", "leave body", "Leave body.", 1),
      );
      writeFileSync(
        path.join(knowledge, "hr-notes.md"),
        concept("HR notes", "notes body", "Notes body."),
      );
      mkdirSync(path.join(knowledge, "aaa"));
      writeFileSync(
        path.join(knowledge, "aaa", "overview.md"),
        concept("AAA folder", "aaa body", "AAA body."),
      );
      writeFileSync(path.join(knowledge, "mmm.md"), concept("MMM loose", "mmm body", "MMM body."));
      // A digit prefix that a shell's number-prefix parser might strip from
      // the route (found live 2026-08-18).
      writeFileSync(
        path.join(knowledge, "01-intro.md"),
        concept("Numbered intro", "intro body", "Numbered intro body."),
      );

      swap?.(project);
      // Resolve the scaffold's `@panaversity/ksor` self-pin to the LOCAL build
      // (the pinned exact version is unpublished in CI/dev).
      const localKsor = injectLocalKsor(project);
      // The scaffold's first install is non-frozen by design (decision 11
      // revision 2026-08-20). --config.minimumReleaseAge=0: the 48h quarantine
      // is right for an adopter and non-deterministic for CI.
      run("pnpm", ["install", "--no-frozen-lockfile", "--config.minimumReleaseAge=0"], project);
      expectLocalKsorResolved(project, localKsor);
      cleanupLocalKsor(localKsor);
      if (swap) {
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
      expect(existsSync(path.join(project, "build.lock.json")), "ksor build wrote the lock").toBe(
        true,
      );
    });

    it("clause 2: renders every stable document at its path-derived route, and every folder at its own", () => {
      const knowledge = path.join(project, "knowledge");
      const files = stableFiles(knowledge);
      expect(files.length, "the suite's own concepts must be there").toBeGreaterThanOrEqual(8);
      for (const file of files) {
        const slug = docSlug(file);
        const page = path.join(outDir, "docs", slug, "index.html");
        expect(existsSync(page), `${file} → ${page}`).toBe(true);
        const text = readFileSync(path.join(knowledge, file), "utf8");
        const title = /^title:[ \t]*(.*)$/m.exec(text)?.[1]?.trim() ?? "";
        const html = readFileSync(page, "utf8");
        expect(html, `${file}: title not rendered`).toContain(title);
        // Titles alone are vacuous — every page's nav embeds every title, so
        // a shell that garbles bodies passed (review finding, 2026-08-18).
        const body = text.replace(/^---[\s\S]*?\n---[ \t]*\n/, "");
        const firstLine = body.split("\n").find((line) => line.trim() !== "") ?? "";
        const plain = (firstLine.split("`")[0] ?? "").trim();
        if (plain.length >= 12 && !plain.startsWith("!") && !plain.startsWith("#")) {
          expect(html, `${file}: body not rendered`).toContain(plain);
        }
      }
      // A link between concepts reaches the page it names, in BOTH OKF §6.1
      // forms — asserted on the rendered bytes, because this is exactly what
      // passed every type and unit check while 404ing in a browser.
      // Slash-tolerant: `trailingSlash: true` renders the route as
      // `/docs/beta/`, and the claim is the route, not the shell's slash.
      const pay = readFileSync(path.join(outDir, "docs", "hr", "pay", "index.html"), "utf8");
      expect(pay, "a bundle-absolute link did not resolve").toMatch(/href="\/docs\/beta\/?"/);
      expect(pay, "a bare relative link did not resolve").toMatch(/href="\/docs\/hr\/leave\/?"/);

      // A directory is a page too: the regenerated index, rendered as a
      // listing (build spec §3). The root is the record's own map.
      for (const dir of ["", "hr", "aaa"]) {
        const page = path.join(outDir, "docs", dir, "index.html");
        expect(existsSync(page), `folder ${dir || "/"} → ${page}`).toBe(true);
      }
      const hr = readFileSync(path.join(outDir, "docs", "hr", "index.html"), "utf8");
      for (const title of ["Leave", "HR overview", "Pay"]) expect(hr).toContain(title);
      // Nothing in the export was authored as an index: the generated ones
      // carry no frontmatter, no body, and no route of their own beyond the
      // folder page.
      expect(existsSync(path.join(outDir, "docs", "hr", "index", "index.html"))).toBe(false);
    });

    it("clause 2: a draft is on no surface of a build", () => {
      // The starter's own documents are drafts (research/okf-native.md §1.1),
      // and so is nothing this suite wrote — so their titles are the probe.
      const knowledge = path.join(project, "knowledge");
      const drafts = readdirSync(knowledge, { recursive: true, encoding: "utf8" })
        .filter(
          (f) =>
            f.endsWith(".md") && !isAttachment(path.basename(f)) && path.basename(f) !== "index.md",
        )
        .filter((f) => /^status:[ \t]*draft/m.test(readFileSync(path.join(knowledge, f), "utf8")));
      expect(
        drafts.length,
        "the starter ships drafts; without one this clause proves nothing",
      ).toBeGreaterThan(0);
      for (const file of drafts) {
        const slug = docSlug(file);
        expect(existsSync(path.join(outDir, "docs", slug, "index.html")), `${file} built`).toBe(
          false,
        );
        const title =
          /^title:[ \t]*(.*)$/m
            .exec(readFileSync(path.join(knowledge, file), "utf8"))?.[1]
            ?.trim() ?? "";
        expect(readFileSync(path.join(outDir, "llms.txt"), "utf8")).not.toContain(title);
      }
    });

    /**
     * A CONTRACT CLAUSE, not shell chrome: PUBLISHING an attachment as a routed
     * document is a cross-surface divergence — its own URL, sidebar row and
     * llms.txt line, with governance that inherits on neither surface.
     * Decision 19: a surface that refuses must refuse on both surfaces.
     */
    it("clause 2: no shell publishes a study attachment as a document, and a stable parent renders its summary", () => {
      const knowledge = path.join(project, "knowledge");
      const attachments = attachmentFiles(knowledge);
      expect(attachments.length).toBeGreaterThan(0);

      for (const file of attachments) {
        // Only the final extension comes off, so `x.summary.md` -> `/docs/x.summary`.
        const slug = file.replace(/\.(md|mdx|yaml)$/, "");
        expect(
          existsSync(path.join(outDir, "docs", slug, "index.html")),
          `${file} was published as a document at /docs/${slug}`,
        ).toBe(false);
        const llms = readFileSync(path.join(outDir, "llms.txt"), "utf8");
        expect(llms, `${file} reached llms.txt`).not.toContain(`/docs/${slug}`);
      }
      expect(readFileSync(path.join(outDir, "docs", "hr", "pay", "index.html"), "utf8")).toContain(
        "PAYSUMMARY",
      );
    });

    it("clause 2: the record and kit never notice the shell — pnpm check passes", () => {
      run("node", [path.join(".agents", "skills", "format-checker", "check.mjs")], project);
    });

    it("clause 3: llms.txt names the record, carries the stamps, and lists the machine set in the canonical order", () => {
      const llms = readFileSync(path.join(outDir, "llms.txt"), "utf8");
      const lines = llms.split("\n");
      // The display title leads; the machine identity and the build's stamps
      // follow (build spec §3, R14).
      expect(lines[0]).toMatch(/^# .+/);
      expect(llms).toContain(`- name: conform-${shellName}`);
      expect(llms).toMatch(/^- build_id: sha256:[0-9a-f]+$/m);
      expect(llms).toMatch(/^- ksor_version: \d+\.\d+\.\d+/m);
      expect(llms, `llms.txt:\n${llms}`).toContain("[Beta policy](/docs/beta): first by order");
      // The reading order is one truth across every surface: the index
      // generator's. At the root, concepts by declared order then title
      // (beta 0; then HR notes, MMM loose, Numbered intro by title), then the
      // folders by their first concept (hr has order 1, aaa none). Inside hr:
      // leave 1, overview 2, pay unordered.
      const sequence = lines
        .map((line) => /\]\((\/docs\/[^)]+)\)/.exec(line)?.[1])
        .filter((url): url is string => url !== undefined);
      expect(sequence, `llms.txt:\n${llms}`).toEqual([
        "/docs/beta",
        "/docs/hr-notes",
        "/docs/mmm",
        "/docs/01-intro",
        "/docs/hr/leave",
        "/docs/hr/overview",
        "/docs/hr/pay",
        "/docs/aaa/overview",
      ]);
      for (const target of sequence) {
        expect(
          existsSync(path.join(outDir, target, "index.html")),
          `llms.txt link ${target} does not resolve in the export`,
        ).toBe(true);
        // Every listed document has a twin, and the twin carries the stamps.
        const twin = path.join(outDir, "md", `${target.slice("/docs/".length)}.md`);
        expect(existsSync(twin), `${target} has no twin`).toBe(true);
        expect(readFileSync(twin, "utf8")).toMatch(/^build_id: sha256:/m);
      }
      expect(existsSync(path.join(outDir, "llms-full.txt"))).toBe(true);
      expect(readFileSync(path.join(outDir, "md", "index.md"), "utf8")).toMatch(
        /^okf_version: "0.2"$/m,
      );
    });

    it("clause 4: browser smoke — both themes, no console errors, no external requests", async () => {
      const { server, port } = await serveStatic(outDir);
      let browser: Awaited<ReturnType<typeof chromiumLaunch>> | null = null;
      const chromiumLaunch = async () => (await import("playwright")).chromium.launch();
      const backgrounds: Record<string, string> = {};
      try {
        browser = await chromiumLaunch();
        for (const colorScheme of ["light", "dark"] as const) {
          const context = await browser.newContext({ colorScheme });
          const page = await context.newPage();
          const consoleErrors: string[] = [];
          const external: string[] = [];
          page.on("console", (msg) => {
            if (msg.type() === "error") consoleErrors.push(msg.text());
          });
          page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
          page.on("request", (req) => {
            if (!req.url().startsWith(`http://localhost:${port}`) && !req.url().startsWith("data:"))
              external.push(req.url());
          });
          await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
          await expect
            .poll(() => page.locator("body").textContent(), { timeout: 10_000 })
            .toContain("Built with KSoR");
          await page.goto(`http://localhost:${port}/docs/beta/`, { waitUntil: "networkidle" });
          await expect
            .poll(() => page.locator("h1").first().textContent(), { timeout: 10_000 })
            .toContain("Beta policy");
          // The folder page, and the image beside a concept — decoded, not
          // merely requested.
          await page.goto(`http://localhost:${port}/docs/hr/`, { waitUntil: "networkidle" });
          await expect
            .poll(() => page.locator("h1").first().textContent(), { timeout: 10_000 })
            .toContain("Hr");
          await page.goto(`http://localhost:${port}/docs/hr/overview/`, {
            waitUntil: "networkidle",
          });
          const imageWidth = await page.evaluate(() => {
            const img = document.querySelector<HTMLImageElement>("main img, article img");
            return img?.naturalWidth ?? 0;
          });
          expect(imageWidth, `chart.png decoded width in ${colorScheme}`).toBeGreaterThan(0);
          backgrounds[colorScheme] = await page.evaluate(() => {
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
      expect(home, "rendered links must carry the base path").toContain("/repo/docs/");
    }, 300_000);
  },
);

describe.runIf(!enabled)("shell conformance (gated)", () => {
  it("skipped — set KSOR_E2E=1 to run the shell through the surface contract", () => {
    expect(enabled).toBe(false);
  });
});
