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
 */
export function scalarLike(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  const dq = /^"(.*)"$/.exec(trimmed);
  if (dq !== null) return (dq[1] ?? "").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  const sq = /^'(.*)'$/.exec(trimmed);
  if (sq !== null) return (sq[1] ?? "").replace(/''/g, "'");
  return trimmed.replace(/[ \t]+#.*$/, "").trim();
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
  const override = scalarLike(/^sor_id:[ \t]*(.*)$/m.exec(frontmatterBlock)?.[1]);
  if (override !== undefined && override !== "") return override;
  return `${recordName}/${relPath.replace(/\.md$/i, "")}`;
}
