/**
 * The denial rule, alone, with no imports and no side effects.
 *
 * CANONICAL COPY: `packages/content/src/lib/denial-rule.ts`. The scaffold's
 * site carries a byte-identical copy at `system/site/lib/denial-rule.ts`, and
 * `denial-rule-drift.test.ts` fails if the two ever differ — the same
 * arrangement decision 18 made for the audience rule, and for the same reason:
 * the site cannot import the kernel, whose package carries pg and the embedding
 * providers.
 *
 * Why it is a leaf: these functions decide whether a withdrawn document gets
 * published, and they lived inside a module that reads `instance.md` at import
 * time — so none of them could be tested as rules. A round-8 mutation made
 * `isDenied` return false unconditionally, which publishes every withdrawn
 * document to `/docs` and `llms.txt`, and the entire suite stayed green.
 */

/** The shape `ksor takedown --export` writes. */
export interface DenylistManifest {
  format?: number;
  corpus_id?: string;
  source?: string;
  denied?: { stable_id?: string; scope?: string }[];
  denied_subtrees?: string[];
}

/**
 * Is this document denied? Exact ids, plus the directories a `--subtree`
 * takedown governs.
 *
 * `ksor takedown --export` expands a `--subtree` denial to its actual
 * descendants by walking parent_id, where the tree lives. Interpreting SCOPE
 * here meant prefix-matching stable_ids, and a section's stable_id ends in
 * `/index` (or `#section`), so the prefix never matched its children and every
 * descendant kept publishing — the failure decision 14 records as the reason
 * its own walk uses parent_id rather than a prefix.
 *
 * But an expanded list can only name what the ACTIVE GENERATION contains, and
 * the site reads DISK. A document added under a withdrawn section after the
 * last ingest is on disk and not in the database, so subtree denials also
 * arrive as DIRECTORIES. That is not the rejected prefix match: those paths
 * come from `sources.origin_path`, so they are real locations on disk, and a
 * document's location cannot be decoupled from itself by a frontmatter
 * `sor_id:` the way its id can.
 *
 * `recordPath` is in the record's own frame (it starts with the record
 * directory's name), because that is the frame `origin_path` uses.
 */
export function isDenied(
  manifest: DenylistManifest,
  stableId: string,
  recordPath: string,
): boolean {
  if ((manifest.denied ?? []).some((d) => String(d.stable_id) === stableId)) return true;
  return (manifest.denied_subtrees ?? []).some((dir) => {
    const prefix = String(dir).replace(/\\/g, "/");
    if (prefix === "/") return true;
    return recordPath.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
  });
}

/**
 * A plain scalar, read the way the kernel's frontmatter reader reads one.
 *
 * The two diverged on a TRAILING COMMENT: the kernel strips `# …` from an
 * unquoted scalar and the site kept it, so `sor_id: hr/policy # renamed 2026`
 * gave the kernel `hr/policy` and the site `hr/policy # renamed 2026`. A
 * takedown on the id the MCP door reports as `provenance.stable_id` was then
 * denied by the door and silently ignored by the site build, which kept
 * publishing the document.
 *
 * A comment cannot appear inside a QUOTED scalar's value, so quoting is
 * resolved first — exactly the kernel's order.
 *
 * `ok: false` marks a value the kernel's reader REFUSES rather than reads: a
 * flow collection, an anchor, a block scalar, or anything with a `: ` in it.
 * That matters because refusing one line poisons the whole map — see
 * `frontmatterMap`.
 */
export function scalarLike(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const parsed = readScalar(raw.trim());
  return parsed.kind === "string" ? parsed.value : undefined;
}

/**
 * Plain scalars the kernel's reader converts to a bool, null, int or float —
 * never a string, so they can never be an id.
 */
const YAML_TYPED =
  /^(?:true|True|TRUE|false|False|FALSE|yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF|~|null|Null|NULL|[-+]?[0-9][0-9_]*|[-+]?(?:\.[0-9]+|[0-9][0-9_]*\.[0-9_]*)(?:[eE][-+]?[0-9]+)?)$/;

/**
 * Three outcomes, because the kernel's reader has three:
 *
 *   string    a plain or quoted string — usable as an id.
 *   typed     a bool, null, int or float. The kernel KEEPS the key with a
 *             non-string value, and `stableIdOf` requires a string, so the
 *             override is dropped. The key exists; it just is not an id.
 *   refused   a shape the reader will not read at all. The kernel POISONS the
 *             whole map on one of these.
 *
 * Collapsing `typed` into `refused` would empty the map for a document whose
 * `order: 3` is perfectly ordinary — which the kernel does not do.
 */
interface ScalarRead {
  readonly kind: "string" | "typed" | "refused";
  readonly value: string;
}

function readScalar(raw: string): ScalarRead {
  // An EMPTY value is `null` to the kernel — the key exists and is not a
  // string, exactly like a bool or a number.
  if (raw === "") return { kind: "typed", value: "" };
  const dq = /^"(.*)"$/.exec(raw);
  if (dq !== null)
    return { kind: "string", value: (dq[1] ?? "").replace(/\\"/g, '"').replace(/\\\\/g, "\\") };
  const sq = /^'(.*)'$/.exec(raw);
  if (sq !== null) return { kind: "string", value: (sq[1] ?? "").replace(/''/g, "'") };
  const plain = raw.replace(/[ \t]+#.*$/, "").trim();
  // The shapes the kernel's reader does not hand back as a STRING. Two groups,
  // and both matter for the same reason:
  //
  //   refused    a flow collection, an anchor, a block scalar, a plain value
  //              containing ": " — the kernel returns ok:false and poisons the
  //              whole map.
  //   typed      a YAML bool, null, int or float — the kernel returns them as
  //              non-strings, and `stableIdOf` requires a string, so it DROPS
  //              the override. `sor_id: 4711` therefore resolved to the path on
  //              the kernel and to "4711" here: a takedown honoured by the door
  //              and ignored by the site build, the same divergence round 9
  //              closed for comments and flow lists, in the same function
  //              (round-10 review of PR 43).
  //
  // Both are `ok: false` here because both end with the site NOT taking an
  // override — which is what the kernel does. Kept in step with `scalarValue`
  // in ingest/adapters/plain-tree.ts and bound to it by
  // `stable-id-conformance.test.ts`.
  // VALID YAML this reader does not model: a flow sequence or mapping, a block
  // scalar, an anchor/alias/tag. PyYAML parses every one — the DOCUMENT is fine
  // and only this KEY is beyond the reader, so it must not empty the map.
  // Checked BEFORE the ": " test, because a flow mapping legitimately contains
  // one (`meta: {a: 1}`).
  // `typed` rather than `refused`: the key exists but is not a string, so this
  // map (which holds strings) omits it and no override is taken — exactly what
  // the kernel now does with `value: null` (issue #78).
  if (/^[|>&*!{[]/.test(plain)) return { kind: "typed", value: "" };
  if (/:[ \t]/.test(plain) || plain.endsWith(":")) return { kind: "refused", value: "" };
  if (YAML_TYPED.test(plain)) return { kind: "typed", value: "" };
  return { kind: "string", value: plain };
}

/**
 * The frontmatter block as a map, read the way the KERNEL reads it — including
 * the part that looks like a bug and is load-bearing: if ANY top-level line is
 * a shape the reader refuses, the WHOLE map comes back empty.
 *
 * That behaviour is inherited from the oracle's PyYAML path, and mirroring it
 * is not optional. The site read `sor_id:` with a bare regex, so a document
 * carrying an ordinary flow list —
 *
 *     title: Policy
 *     tags: [hr, payroll]
 *     sor_id: hr/policy
 *
 * — got `hr/policy` here and `knowledge/policies/policy` from the kernel, which
 * drops the override with the poisoned map. A takedown then matched on exactly
 * one surface: denied by the MCP door, ignored by the site build, published to
 * /docs and llms.txt. That is the failure decisions 14 and 18 exist to stop,
 * re-entered through the denial rule (round-9 review of PR 43).
 */
export function frontmatterMap(block: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (/^[ \t]/.test(line)) continue; // nested structure — no top-level scalar
    const kv = /^([^\s:]+):(?:[ \t]+(.*))?$/.exec(line);
    const key = kv?.[1];
    if (key === undefined) return {};
    const parsed = readScalar((kv?.[2] ?? "").trim());
    if (parsed.kind === "refused") return {};
    // A typed value is present in the kernel's map and is not a string; this
    // map holds strings, so the key is simply absent — which is what every
    // consumer here needs to know about it.
    if (parsed.kind === "string") map[key] = parsed.value;
  }
  return map;
}

/**
 * The file's path in the frame the RECORD uses — `sources.origin_path`, which
 * is project-root relative and therefore starts with the record directory's
 * own name. `relPath` is the file's path relative to the record directory,
 * with forward slashes.
 */
export function recordPathFrom(recordName: string, relPath: string): string {
  return `${recordName}/${relPath}`;
}

/**
 * The record's stable_id for a file, mirroring the kernel's adapter —
 * INCLUDING the `sor_id:` frontmatter override.
 *
 * Deriving it from the path alone meant a takedown of any document carrying an
 * `sor_id:` never matched here and it stayed published, while the MCP door
 * denied it: the same decoupling decision 14 records as the reason the subtree
 * walk uses parent_id rather than a prefix.
 */
export function stableIdFrom(
  recordName: string,
  relPath: string,
  frontmatterBlock: string,
): string {
  // Through the MAP, not a bare regex on the block: the kernel drops the whole
  // map when any line is a shape it refuses, and an id the two surfaces read
  // differently is a takedown that lands on one of them.
  const override = frontmatterMap(frontmatterBlock)["sor_id"];
  if (override !== undefined && override !== "") return override;
  return `${recordName}/${relPath.replace(/\.md$/i, "")}`;
}
