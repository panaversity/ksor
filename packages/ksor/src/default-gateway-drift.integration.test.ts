import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The scaffold's registration file and the package's compiled default are the
 * SAME code. This asserts it, because nothing else would.
 *
 * Decision 18's mechanism ("one rule, two surfaces, one table"), applied to the
 * agent surface. Two copies is forced rather than chosen: Node refuses to
 * type-strip any `.ts` under `node_modules`
 * (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, verified — no flag lifts it),
 * so the published package CANNOT import its own emitted template as the
 * fallback for a deleted file. It needs a compiled twin, and a compiled twin
 * that nobody diffs is exactly the drift that made the visibility rule leak
 * four times while both sides' tests stayed green.
 *
 * The only legal difference is the import specifier: the canonical file resolves
 * its surface relatively inside the workspace, the emitted one resolves it as a
 * published subpath.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CANONICAL = path.join(repoRoot, "packages/content-gateway/src/default-gateway.ts");
const EMITTED = path.join(repoRoot, "packages/ksor/templates/scaffold/system/gateways/content.ts");

const CANONICAL_IMPORT = '} from "./gateway-api.js";';
const EMITTED_IMPORT = '} from "@panaversity/ksor/gateway";';

describe("the emitted registration file is the canonical one", () => {
  // Line endings are the CHECKOUT's, not the rule's: `.gitattributes` pins
  // `*.md` to LF and these are `.ts`, so a Windows checkout hands one of them
  // back with CRLF and a byte comparison fails on a difference no author made
  // (Windows CI, 2026-08-25 — the sibling record-module drift test already
  // normalizes for the same reason).
  const text = (file: string): string => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const canonical = text(CANONICAL);
  const emitted = text(EMITTED);

  it("differs ONLY in the import specifier", () => {
    expect(canonical).toContain(CANONICAL_IMPORT);
    expect(emitted).toContain(EMITTED_IMPORT);
    // Normalise the one legal difference, then demand byte equality.
    expect(emitted.replace(EMITTED_IMPORT, CANONICAL_IMPORT)).toBe(canonical);
  });

  it("the emitted copy does not leak a workspace-relative import", () => {
    // An adopter's node_modules has no ./gateway-api.js; this would fail at
    // their runtime, long after CI went green.
    expect(emitted).not.toContain("./gateway-api.js");
    expect(emitted).not.toContain("@panaversity/ksor-");
  });

  // Comments STRIPPED first. The instructional comments in this file mention
  // FLOOR.search by name, so a check against the raw text is satisfied by prose
  // explaining the guarantee while the code beneath it no longer applies one —
  // caught by deleting the real call and watching this pass.
  const code = (source: string): string =>
    source
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
      .join("\n");

  it("both APPLY every guarantee the boot check will look for", () => {
    // If a future edit renames FLOOR or drops a handler, this fails HERE — at
    // the copy — rather than as a mysterious boot refusal in someone's deploy.
    for (const source of [code(canonical), code(emitted)]) {
      for (const symbol of [
        "FLOOR.search",
        "FLOOR.outline",
        "FLOOR.read",
        "searchHandler(ctx)",
        "outlineHandler(ctx)",
        "readHandler(ctx)",
        "SEARCH_OUTPUT",
        "OUTLINE_OUTPUT",
        "READ_OUTPUT",
        // Annotations are how an MCP client decides a tool is safe to auto-call;
        // content-gateway.db.test.ts asserts readOnlyHint on the served tool and
        // this is the only other place it is pinned.
        "READ_ONLY",
      ]) {
        expect(source, `missing ${symbol}`).toContain(symbol);
      }
    }
  });

  it("the emitted copy needs no dependency the scaffold does not have", () => {
    // Exactly one import statement, and it names the one package the scaffold
    // already pins. zod and the MCP SDK arrive re-exported through it — see
    // gateway-api.ts for why that is deliberate rather than lazy.
    // Every module specifier in the file. The import is multi-line, so this
    // matches the `from "..."` clause rather than trying to span the braces.
    const imports = [...emitted.matchAll(/\bfrom\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports).toEqual(["@panaversity/ksor/gateway"]);
  });
});
