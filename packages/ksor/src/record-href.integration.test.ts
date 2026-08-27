/**
 * A link between concepts, in every form OKF §6.1 allows — run against the
 * SHIPPED `system/site/lib/record-href.ts`, under Node's type stripping, with
 * no site install.
 *
 * Integration rather than unit for one reason: the site's modules carry
 * extensionless relative specifiers, because Turbopack resolves neither `./x`
 * nor `./x.js` onto `x.ts`, and this package's own program is Node ESM, which
 * refuses them. So the rule is exercised the way `site-staging` exercises
 * staging — copied out with its extensions made explicit, then imported.
 *
 * What it protects: the shell resolves only `./` and `../` (fumadocs-core
 * 16.14.5 `resolveHref`), so before this rule existed a bundle-absolute link
 * and a bare `x.md` both 404'd from every page (found live 2026-08-25).
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SITE = fileURLToPath(new URL("../templates/scaffold/system/site/", import.meta.url));

/** Node strips types but resolves neither `./x` nor `./x.js` to `x.ts`. */
const RELATIVE_IMPORT = /(from ")(\.{1,2}\/[A-Za-z0-9._/-]+?)(\.js)?(")/g;

/** The routes of one build: three concepts, one of them nested. */
const ROUTES: readonly (readonly [string, string])[] = [
  ["purchase-approval", "/docs/purchase-approval"],
  ["policies/travel", "/docs/policies/travel"],
  ["policies/archive/old", "/docs/policies/archive/old"],
];

const HARNESS = `
import { recordHref } from "./lib/record-href.ts";
const routes = new Map(${JSON.stringify(ROUTES)});
// JSON has no undefined: a null href on the way in IS the undefined case, and
// a null on the way out is an href the rule handed back untouched.
const cases = JSON.parse(process.argv[2]);
console.log(
  JSON.stringify(
    cases.map(([sourceId, href]) => recordHref(href ?? undefined, sourceId, routes) ?? null),
  ),
);
`;

let dir = "";

function copy(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copy(source, target);
    else writeFileSync(target, readFileSync(source, "utf8").replace(RELATIVE_IMPORT, "$1$2.ts$4"));
  }
}

/** Every case in one child process — the rule is pure, so one run answers all of them. */
function hrefs(cases: readonly (readonly [string, string | undefined])[]): (string | null)[] {
  const result = spawnSync(process.execPath, ["link.mjs", JSON.stringify(cases)], {
    cwd: dir,
    encoding: "utf8",
  });
  expect(result.status, `${result.stdout ?? ""}\n${result.stderr ?? ""}`).toBe(0);
  return JSON.parse(result.stdout) as (string | null)[];
}

describe("a link between concepts resolves to a route", () => {
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "ksor-record-href-"));
    copy(path.join(SITE, "lib"), path.join(dir, "lib"));
    copy(path.join(SITE, "record"), path.join(dir, "record"));
    writeFileSync(path.join(dir, "link.mjs"), HARNESS);
  });

  afterAll(() => {
    if (dir !== "") rmSync(dir, { recursive: true, force: true });
  });

  it("resolves both OKF §6.1 forms, with .md optional, from a nested document", () => {
    const from = "policies/travel";
    expect(
      hrefs([
        // bundle-absolute, against knowledge/ — the form the shell never read
        [from, "/purchase-approval.md"],
        [from, "/purchase-approval"],
        // relative, against the document's own directory
        [from, "archive/old.md"],
        [from, "./archive/old.md"],
        [from, "../purchase-approval.md"],
        [from, "../purchase-approval"],
      ]),
    ).toEqual([
      "/docs/purchase-approval",
      "/docs/purchase-approval",
      "/docs/policies/archive/old",
      "/docs/policies/archive/old",
      "/docs/purchase-approval",
      "/docs/purchase-approval",
    ]);
  });

  it("carries a fragment through to the route", () => {
    expect(hrefs([["policies/travel", "/purchase-approval.md#who-approves"]])).toEqual([
      "/docs/purchase-approval#who-approves",
    ]);
  });

  it("leaves alone everything that is not a link into the record", () => {
    const from = "purchase-approval";
    expect(
      hrefs([
        [from, undefined],
        [from, ""],
        [from, "#section"],
        [from, "https://example.com/x.md"],
        [from, "mailto:kim@example.com"],
        [from, "//example.com/x.md"],
        [from, "./diagram.png"],
        // Escaping the bundle root is not a record link — `resolveLink` refuses it.
        [from, "../../outside.md"],
      ]),
    ).toEqual([
      null,
      "",
      "#section",
      "https://example.com/x.md",
      "mailto:kim@example.com",
      "//example.com/x.md",
      "./diagram.png",
      "../../outside.md",
    ]);
  });

  /**
   * A browser strips leading C0 controls and spaces before it parses a URL
   * (WHATWG URL §4.4), so the scheme test has to run on the value the browser
   * will see. It ran on the raw one, which read `\tjavascript:…` as a record
   * link — and the third case below shows what that misreading is worth: a
   * mangled path that happens to resolve was REWRITTEN into a route of this
   * build.
   *
   * Defence in depth, not a live hole: `record/citations.ts` classifies the
   * raw markdown with the same regex, so a link written this way is a record
   * link there too, resolves to nothing, and `ksor-link-dead` refuses the build
   * before the page exists (reviewer's own trace, 2026-08-25).
   */
  it("sees a scheme hidden behind leading whitespace or control characters", () => {
    const from = "purchase-approval";
    expect(
      hrefs([
        [from, "\tjavascript:alert(1)"],
        [from, "\u0000javascript:alert(1)"],
        // The same miss, made visible: `..` pops the mangled first segment and
        // what is left resolves to a real concept of this build.
        [from, "\tjavascript:alert(1)/../policies/travel"],
        [from, " https://example.com/x.md"],
      ]),
    ).toEqual([
      "\tjavascript:alert(1)",
      "\u0000javascript:alert(1)",
      "\tjavascript:alert(1)/../policies/travel",
      " https://example.com/x.md",
    ]);
  });

  it("leaves a concept this build did not stage as the author wrote it", () => {
    // The per-viewer build is a SUBSET: a link to a concept this viewer may not
    // see must not become a link to a page that does not exist.
    expect(hrefs([["purchase-approval", "/secret/plan.md"]])).toEqual(["/secret/plan.md"]);
  });
});
