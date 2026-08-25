import { describe, expect, it } from "vitest";

import { checkRecord, type RecordFiles } from "./check.js";
import { ATTACHMENT_NEAR_MISSES } from "../lib/attachment-rule.js";
import { checkScaffoldStructure, firstBrokenPngChunk, PNG_SIGNATURE } from "./hygiene.js";

const POLICY = `version: "0.1"
approval_authorities:
  - actors: [human:cfo]
takedown_authorities:
  actors: [human:ciso]
`;
const INSTANCE = `---
format: 2
name: acme
title: Acme
description: The Acme record.
---
Instructions.
`;
const DOC = `---
type: Document
title: A
description: One.
status: draft
ksor:
  audience: [public]
---
Body.
`;

function record(
  files: Record<string, string>,
  extra: { dirs?: string[]; assets?: Record<string, Uint8Array>; symlinks?: string[] } = {},
): RecordFiles {
  return {
    files: new Map(
      Object.entries({ "instance.md": INSTANCE, ".ksor/governance.yaml": POLICY, ...files }),
    ),
    dirs: extra.dirs ?? [],
    assets: new Map(Object.entries(extra.assets ?? {})),
    symlinks: extra.symlinks ?? [],
  };
}

function slugs(
  files: Record<string, string>,
  extra: { dirs?: string[]; assets?: Record<string, Uint8Array>; symlinks?: string[] } = {},
): string[] {
  return checkRecord(record(files, extra), { mode: "build" }).refusals.map(
    (r) => `${r.slug} ${r.path}`,
  );
}

const A = { "knowledge/a.md": DOC };

describe("hygiene — names are portable identities", () => {
  it("ksor-record-empty when no concept exists at all", () => {
    expect(slugs({})).toEqual(["ksor-record-empty knowledge/"]);
    expect(slugs({ "knowledge/a.summary.md": "---\ntype: Summary\n---\n" })).toContain(
      "ksor-record-empty knowledge/",
    );
  });

  it.each([
    ["knowledge/Policy.md", "uppercase"],
    ["knowledge/my policy.md", "whitespace"],
    ["knowledge/política.md", "non-ASCII"],
    ["knowledge/con.md", "reserved"],
    ["knowledge/what?.md", "portable"],
    ["knowledge/_hidden.md", "underscore"],
    ["knowledge/a(1).md", "parenthes"],
    ["knowledge/50%-off.md", "percent"],
    ["knowledge/.secret.md", "hidden"],
    ["knowledge/..md", "hidden"],
    ["knowledge/a\\b.md", "backslash"],
  ])("%s is ksor-name-unportable (%s)", (path, word) => {
    const out = checkRecord(record({ ...A, [path]: DOC }), { mode: "build" });
    const hit = out.refusals.find((r) => r.slug === "ksor-name-unportable");
    expect(hit?.path).toBe(path);
    expect(`${hit?.why}`).toMatch(new RegExp(word, "i"));
  });

  /**
   * The two consequences the rule is FOR, asserted as consequences rather than
   * as names — the refusal above is what stops them, and a message match alone
   * would not say what it stopped.
   */
  it("a dot-prefixed document is not a concept the door can serve while the site hides it", () => {
    const out = checkRecord(record({ ...A, "knowledge/.secret.md": DOC }), { mode: "build" });
    // Refused, so it never reaches ingest as `knowledge/.secret`. The site's
    // docs collection globs `**/*.md`, and picomatch 4.0.5 does not match that
    // against `.secret.md` (verified directly; fumadocs' own walk was not run
    // here). A document one surface serves and the other has no route for is
    // decision 19 inverted, and the `_`-prefix rule beside this one in
    // hygiene.ts exists for exactly that — it just never covered `.`.
    expect(out.refusals.map((r) => `${r.slug} ${r.path}`)).toContain(
      "ksor-name-unportable knowledge/.secret.md",
    );
    // The refusal is what stops it, not the parse: `checkRecord` deliberately
    // keeps the concepts it managed to read beside the refusals (so a rule
    // asking "is this in the tree?" is not misled by a parse failure), and
    // `ingest/build.ts` throws `RecordRefused` on any refusal at all — before
    // `buildManifestFromRecord` can give `.secret` a node. Verified before the
    // rule landed: this record produced ZERO refusals and `out.concepts` was
    // `[".secret", "a"]`.
    expect(out.concepts.map((c) => c.id)).toContain(".secret");
  });

  it("a backslash is refused because the file cannot be checked out on Windows at all", () => {
    // Legal in one POSIX filename, a path SEPARATOR on Windows: `git checkout`
    // fails on the whole tree, which is the failure the portable-name rule
    // directly above it in hygiene.ts is written for.
    const out = checkRecord(record({ ...A, "knowledge/a\\b.md": DOC }), { mode: "build" });
    const hit = out.refusals.find((r) => r.slug === "ksor-name-unportable");
    expect(`${hit?.why}`).toMatch(/backslash/i);
  });

  it("a directory name is held to the same rule, trailing dots included", () => {
    expect(slugs({ ...A, "knowledge/Sub/b.md": DOC }, { dirs: ["knowledge/Sub"] })).toEqual([
      "ksor-name-unportable knowledge/Sub",
    ]);
    expect(slugs(A, { dirs: ["knowledge/notes."] })).toEqual([
      "ksor-name-unportable knowledge/notes.",
    ]);
  });

  it("ksor-name-collides: two paths one apart in case, and a concept beside a directory of its name", () => {
    const out = slugs({ ...A, "knowledge/A.md": DOC });
    expect(out).toContain("ksor-name-collides knowledge/a.md");
    expect(slugs({ ...A, "knowledge/a/b.md": DOC }, { dirs: ["knowledge/a"] })).toEqual([
      "ksor-name-collides knowledge/a.md",
    ]);
  });

  it("ksor-symlink for every link the loader reported", () => {
    expect(slugs(A, { symlinks: ["knowledge/link.md"] })).toEqual([
      "ksor-symlink knowledge/link.md",
    ]);
  });
});

describe("hygiene — what a file may be", () => {
  it("ksor-file-type: mdx, meta.json, a stray yaml, and an unknown extension; images pass", () => {
    const png = new Uint8Array(PNG_SIGNATURE);
    const out = slugs(
      { ...A, "knowledge/b.mdx": DOC, "knowledge/notes.yaml": "x: 1\n" },
      {
        assets: {
          "knowledge/meta.json": new Uint8Array(),
          "knowledge/doc.pdf": new Uint8Array(),
          "knowledge/pic.jpg": new Uint8Array(),
        },
      },
    );
    expect(out.filter((s) => s.startsWith("ksor-file-type"))).toEqual([
      "ksor-file-type knowledge/b.mdx",
      "ksor-file-type knowledge/doc.pdf",
      "ksor-file-type knowledge/meta.json",
      "ksor-file-type knowledge/notes.yaml",
    ]);
    expect(out).not.toContain("ksor-file-type knowledge/pic.jpg");
    expect(slugs(A, { assets: { "knowledge/pic.png": png } })).toContain(
      "ksor-asset-corrupt knowledge/pic.png",
    );
  });

  // A sim is an ASSET, not an attachment: named freely, many per document, and
  // linked from the prose the way a figure is. So the rule here is the SUFFIX
  // and nothing else — there is no parent name to check, because seven sims in
  // one folder cannot all be named after the one document that frames them.
  it("a `<name>.sim.html` is admitted; every other .html stays refused", () => {
    const out = slugs(A, {
      assets: {
        "knowledge/goal-loop.sim.html": new Uint8Array(),
        "knowledge/deep/nested-loop.sim.html": new Uint8Array(),
        "knowledge/page.html": new Uint8Array(),
        // A dotfile with no stem is not a sim, exactly as it is not an
        // attachment — so it falls through to the unexpected-file refusal
        // rather than being admitted as one.
        "knowledge/.sim.html": new Uint8Array(),
      },
    });
    expect(out.filter((s) => s.startsWith("ksor-file-type"))).toEqual([
      "ksor-file-type knowledge/.sim.html",
      "ksor-file-type knowledge/page.html",
    ]);
  });

  it("a bare .html is told the shape a carried page has to take", () => {
    const r = checkRecord(record(A, { assets: { "knowledge/page.html": new Uint8Array() } }), {
      mode: "build",
    });
    const hit = r.refusals.find((x) => x.path === "knowledge/page.html");
    expect(`${hit?.why} ${hit?.fix}`).toContain(".sim.html");
  });

  it("ksor-attachment-near-miss names the extension the author meant, and nothing else about the file", () => {
    const out = slugs({ ...A, "knowledge/a.quiz.yml": "q: 1\n" });
    expect(out).toEqual(["ksor-attachment-near-miss knowledge/a.quiz.yml"]);
    const r = checkRecord(record({ ...A, "knowledge/a.quiz.yml": "q: 1\n" }), { mode: "build" });
    expect(r.refusals[0]?.fix).toContain("a.quiz.yaml");
  });

  /**
   * "and nothing else about the file" is the load-bearing half, and it was
   * carried only by a `continue` nothing asserted. `load.ts` reads `.md` and
   * `.yaml` as text and everything else as an ASSET, so every near-miss
   * extension arrives with BYTES — and the file-type ladder below the near-miss
   * check classifies an unknown asset extension. Reached, it says "convert it
   * to markdown or move it out of knowledge/" about a file whose real remedy is
   * one letter, which is the reverse of a helpful second opinion.
   *
   * Asserted per near-miss, through the shape the loader actually delivers, so
   * a new near-miss entry (or a new asset extension) cannot quietly start
   * producing two refusals with contradictory fixes for one cause.
   */
  it.each(ATTACHMENT_NEAR_MISSES)(
    "a $suffix file gets ONE refusal, whose fix is the rename",
    ({ suffix, want }) => {
      const path = `knowledge/a${suffix}`;
      const out = checkRecord(record(A, { assets: { [path]: new Uint8Array([120]) } }), {
        mode: "build",
      });
      expect(out.refusals.map((r) => `${r.slug} ${r.path}`)).toEqual([
        `ksor-attachment-near-miss ${path}`,
      ]);
      expect(out.refusals[0]?.fix).toBe(`rename it to a${want}`);
    },
  );
});

describe("hygiene — links resolve inside the record", () => {
  const link = (target: string): string => DOC.replace("Body.", `See [x](${target}).`);

  it("ksor-link-dead for a target that is no concept, companion, asset, directory or index", () => {
    expect(slugs({ ...A, "knowledge/b.md": link("gone.md") })).toEqual([
      "ksor-link-dead knowledge/b.md",
    ]);
  });

  it("a concept, a companion, an asset, a directory, an index and the bundle root all resolve", () => {
    const files = {
      ...A,
      "knowledge/a.summary.md": "---\ntype: Summary\n---\n",
      "knowledge/sub/c.md": DOC,
      "knowledge/b.md": link("a.md")
        .replace("Body.", "")
        .concat(
          "[s](a.summary.md) [p](pic.png) [d](sub/) [i](sub/index.md) [r](/) [c](/sub/c) [f](#frag)\n",
        ),
    };
    expect(
      slugs(files, { dirs: ["knowledge/sub"], assets: { "knowledge/pic.png": new Uint8Array() } }),
    ).not.toContain("ksor-link-dead knowledge/b.md");
  });

  it("ksor-link-escapes for a target that climbs out of knowledge/", () => {
    expect(slugs({ ...A, "knowledge/b.md": link("../instance.md") })).toEqual([
      "ksor-link-escapes knowledge/b.md",
    ]);
  });

  it("a companion body is held to the same link rules", () => {
    expect(
      slugs({ ...A, "knowledge/a.summary.md": "---\ntype: Summary\n---\n[x](nope.md)\n" }),
    ).toEqual(["ksor-link-dead knowledge/a.summary.md"]);
  });
});

describe("hygiene — the instance's closed key set", () => {
  const instance = (fm: string): Record<string, string> => ({
    ...A,
    "instance.md": `---\n${fm}---\nBody.\n`,
  });
  const BASE = "format: 2\nname: acme\ntitle: Acme\ndescription: D.\n";

  it("accepts every key the profile names, nested groups included — a flow mapping is a mapping", () => {
    expect(slugs(instance(`${BASE}site: { governance: false }\n`))).toEqual([]);
    expect(
      slugs(
        instance(
          `${BASE}toolchain:\n  requires: ">=0.1.0"\n  scaffolded: "0.1.0"\nsite:\n  url: https://x\n  governance: false\ndatabase:\n  dsn_env: KSOR_DB_URL\nembedding:\n  provider: gemini\nretrieval:\n  vector_floor: 0.5\nbudgets:\n  maximum_response_characters: 100\nmcp_url: https://x/mcp\nversion: 0.1.0\n`,
        ),
      ),
    ).toEqual([]);
  });

  it("a missing instance.md is ksor-instance-format", () => {
    const files: RecordFiles = {
      files: new Map([[".ksor/governance.yaml", POLICY], ...Object.entries(A)]),
      dirs: [],
    };
    expect(checkRecord(files, { mode: "build" }).refusals.map((r) => r.slug)).toEqual([
      "ksor-instance-format",
    ]);
  });

  it.each([
    ["a missing name", "format: 2\ntitle: T\ndescription: D.\n", /name/],
    ["a name outside the grammar", `${BASE}`.replace("name: acme", "name: Acme_1"), /name/],
    ["a missing title", "format: 2\nname: acme\ndescription: D.\n", /title/],
    ["an unknown top-level key", `${BASE}colour: red\n`, /colour/],
    ["an unknown nested key", `${BASE}site:\n  theme: dark\n`, /site.*theme/],
    ["a group written as a scalar", `${BASE}site: yes\n`, /site/],
    ["site.governance that is not a boolean", `${BASE}site:\n  governance: nope\n`, /governance/],
  ])("refuses %s as ksor-instance-format", (_what, fm, why) => {
    const out = checkRecord(record(instance(fm)), { mode: "build" });
    const hit = out.refusals.find((r) => r.slug === "ksor-instance-format");
    expect(hit, out.refusals.map((r) => r.slug).join()).toBeDefined();
    expect(hit?.why).toMatch(why);
  });
});

describe("firstBrokenPngChunk", () => {
  it("names a bad signature, a bad CRC, and passes a minimal valid file", () => {
    expect(firstBrokenPngChunk(new Uint8Array([1, 2, 3]))).toBe("bad signature");
    // IEND chunk: length 0, type IEND, crc 0xAE426082.
    const iend = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
    expect(firstBrokenPngChunk(new Uint8Array([...PNG_SIGNATURE, ...iend]))).toBe(null);
    const broken = [...iend];
    broken[11] = 0;
    expect(firstBrokenPngChunk(new Uint8Array([...PNG_SIGNATURE, ...broken]))).toBe(
      "CRC error in IEND chunk",
    );
  });
});

describe("checkScaffoldStructure — the project around the record", () => {
  const ok = {
    claudeMd: "@AGENTS.md\n",
    agentsSkills: new Map([["format-checker/SKILL.md", "h1"]]),
    claudeSkills: new Map([["format-checker/SKILL.md", "h1"]]),
    siteContentFiles: [],
  };
  it("passes a well-formed project", () => {
    expect(checkScaffoldStructure(ok)).toEqual([]);
  });
  it("ksor-pointer-changed when CLAUDE.md is not the one-line pointer", () => {
    expect(checkScaffoldStructure({ ...ok, claudeMd: "hello" }).map((r) => r.slug)).toEqual([
      "ksor-pointer-changed",
    ]);
    expect(checkScaffoldStructure({ ...ok, claudeMd: null }).map((r) => r.slug)).toEqual([
      "ksor-pointer-changed",
    ]);
  });
  it("ksor-skill-copy-diverged in both directions, naming the file", () => {
    const missing = checkScaffoldStructure({ ...ok, claudeSkills: new Map() });
    expect(missing.map((r) => `${r.slug} ${r.path}`)).toEqual([
      "ksor-skill-copy-diverged .claude/skills/format-checker/SKILL.md",
    ]);
    const differs = checkScaffoldStructure({
      ...ok,
      claudeSkills: new Map([
        ["format-checker/SKILL.md", "h2"],
        ["extra/SKILL.md", "h3"],
      ]),
    });
    expect(differs.map((r) => `${r.slug} ${r.path}`)).toEqual([
      "ksor-skill-copy-diverged .claude/skills/extra/SKILL.md",
      "ksor-skill-copy-diverged .claude/skills/format-checker/SKILL.md",
    ]);
  });
  it("ksor-site-holds-content for a markdown file inside the site", () => {
    expect(
      checkScaffoldStructure({ ...ok, siteContentFiles: ["system/site/content/x.md"] }).map(
        (r) => `${r.slug} ${r.path}`,
      ),
    ).toEqual(["ksor-site-holds-content system/site/content/x.md"]);
  });
});
