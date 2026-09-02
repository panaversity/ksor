/**
 * What `sync-status-version` may write into `docs/status.md`, and what it
 * must refuse to.
 *
 * The script runs inside `pnpm run version`, so its input is whatever
 * `changeset version` just wrote to `packages/ksor/package.json` — a release
 * on the Version PR, and a `0.0.1-dev-20260818…` string on a snapshot
 * (`changeset version --snapshot dev`). The published-package sentence names
 * the version an adopter installs with a plain `npm install`, which a snapshot
 * never is: it publishes under its own tag and is invisible to a normal
 * install. Before this, a prerelease went straight into the sentence, and the
 * docs-truth assertion that reads the same sentence then found no release
 * there at all.
 */

import { describe, expect, it } from "vitest";

import { PUBLISHED_SENTENCE, RELEASE_VERSION, syncStatusVersion } from "./lib/status-version.js";

const STATUS =
  "# Status\n\n" +
  "The published package is `@panaversity/ksor` **0.0.57** on npm.\n\n" +
  "## Releases\n\n- 0.0.57 — this\n- 0.0.56 — that\n";

describe("syncStatusVersion on a release", () => {
  it("rewrites exactly the published-package sentence", () => {
    const result = syncStatusVersion(STATUS, "0.0.58");
    expect(result.kind).toBe("rewritten");
    if (result.kind !== "rewritten") return;
    expect(result.from).toBe("0.0.57");
    expect(result.to).toBe("0.0.58");
    expect(result.text).toContain("`@panaversity/ksor` **0.0.58** on npm");
    // The release summary below names every version ever shipped and is not
    // this script's to touch.
    expect(result.text).toContain("- 0.0.57 — this");
    expect(result.text).toContain("- 0.0.56 — that");
  });

  it("reports an already-current sentence as unchanged", () => {
    expect(syncStatusVersion(STATUS, "0.0.57")).toEqual({ kind: "unchanged", version: "0.0.57" });
  });

  it("writes a sentence the same grammar reads back", () => {
    const result = syncStatusVersion(STATUS, "1.2.3");
    if (result.kind !== "rewritten") throw new Error(JSON.stringify(result));
    expect(PUBLISHED_SENTENCE.exec(result.text)?.[2]).toBe("1.2.3");
  });
});

describe("syncStatusVersion refuses what the sentence must never name", () => {
  it.each([
    ["0.1.0-next.0", "a prerelease"],
    ["0.0.1-dev-20260818123456", "a changesets snapshot"],
    ["1.0.0-rc.1+build.5", "a prerelease with build metadata"],
    ["0.0.58-", "a dangling prerelease separator"],
  ])("%s — %s", (version) => {
    const result = syncStatusVersion(STATUS, version);
    expect(result, `${version} must not reach docs/status.md`).toMatchObject({
      kind: "refused",
      slug: "ksor-status-version-prerelease",
    });
    if (result.kind !== "refused") return;
    // Errors are documentation: the refusal names what it saw and how to
    // publish the snapshot without touching the sentence.
    expect(result.message).toContain(version);
    expect(result.message).toContain("changeset version --snapshot");
    expect(RELEASE_VERSION.test(version)).toBe(false);
  });

  it("refuses a status file with no published-package sentence", () => {
    const result = syncStatusVersion("# Status\n\nnothing here\n", "0.0.58");
    expect(result).toMatchObject({ kind: "refused", slug: "ksor-status-version-sentence-missing" });
  });
});
