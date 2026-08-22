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
