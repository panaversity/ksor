/**
 * An interactive page the document points at, as a CLICK-TO-LOAD frame.
 *
 * A record often wants to show something running — a simulation, a dashboard,
 * a player — at one exact point in the prose. A deck is one per document and
 * lives in an attachment (`<doc>.slides.yaml`); this is the other shape: many
 * per document, each where the sentence before it puts it.
 *
 * The form is an ordinary CommonMark link whose TITLE is the word `embed`:
 *
 *     [Play run-until-done](https://example.org/sims/goal-loop "embed")
 *
 * Chosen the way the alert syntax was chosen — for what it does everywhere the
 * record is read that is NOT this site. GitHub renders a link with a tooltip.
 * `/md/` and `llms-full.txt` carry the author's link. A plain editor shows a
 * link. No grammar is added to `knowledge/`, so critical rule 2 holds.
 *
 * The TITLE, rather than a lone link on its own line, because the opt-in has
 * to be something an author WROTE. A rule that reframes any link standing
 * alone would silently pull a third party's page into the record the first
 * time someone put a citation on its own line.
 *
 * REHYPE, not remark, for the reason `alert-rule.ts` records: this record's
 * markdown is serialized from the mdast, so rewriting there would publish this
 * site's React component to the agent surface in place of the author's link.
 *
 * A LEAF: no imports, so the rule can be tested on its own.
 */

/** The link title that opts a link in. Anything else is an ordinary link. */
export const EMBED_TITLE = "embed";

/** What the panel names when the page is the record's own. */
export const SELF_HOST = "this record";

export interface EmbedMatch {
  readonly url: string;
  readonly host: string;
}

/**
 * The host a frame would reach, or null when the value is not a url.
 *
 * Surfaced rather than hidden: the placeholder names it, so a reader who
 * clicks has already been told whose page is about to load. That naming is
 * half of why there is no host allowlist here — the other half is that an
 * allowlist written into a scaffold would be one adopter's hosts shipped to
 * every other adopter.
 */
export function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

/**
 * The frame this link asks for, or null when it is an ordinary link.
 *
 * https only. A browser blocks an http frame inside a secure page as mixed
 * content, so an http embed publishes a panel that silently never loads —
 * worse than refusing it, because nothing goes red.
 */
/**
 * The suffix that marks an asset as a page to be SERVED rather than bundled.
 *
 * A sim is an asset of its document, exactly like the figures beside it: many
 * per document, named freely, staged only when a published document links to
 * it. It is deliberately NOT an attachment — an attachment is named after its
 * parent (`<doc>.quiz.yaml`), and seven sims cannot all be `index.sim.html`.
 */
export const SIM_SUFFIX = ".sim.html";

/**
 * Where a sim is served, derived from where it sits in the record.
 *
 * The record path is the identity (product principle 3), so two documents
 * may each own a `goal-loop.sim.html` without colliding.
 */
export function publicSimPath(recordRelative: string): string {
  return recordRelative.slice(0, -SIM_SUFFIX.length).replaceAll("\\", "/") + ".html";
}

export function matchEmbed(url: string, title: string | undefined): EmbedMatch | null {
  if (title !== EMBED_TITLE) return null;

  // A sim carried IN the record. Same origin, so no third party learns
  // anything, it works offline, and no host can refuse to be framed — which
  // is not hypothetical: every sim this was first built for answers
  // `x-frame-options: SAMEORIGIN`, so a cross-origin frame to them can never
  // render (measured 2026-08-24, all seven).
  if (url.endsWith(SIM_SUFFIX) && !url.includes(":")) {
    return { url, host: SELF_HOST };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;

  return { url, host: parsed.hostname };
}

export interface EmbedCase {
  readonly url: string;
  /** `undefined` is the ordinary link — no title at all. */
  readonly title: string | undefined;
  readonly embeds: boolean;
}

/** The rule, as a table — what embeds, and what deliberately does not. */
export const EMBED_CASES: readonly EmbedCase[] = [
  { url: "https://example.org/sims/goal-loop", title: EMBED_TITLE, embeds: true },
  // Carried in the record, beside its document.
  { url: "goal-loop.sim.html", title: EMBED_TITLE, embeds: true },
  { url: "sims/goal-loop.sim.html", title: EMBED_TITLE, embeds: true },
  // Still opt-in: an ordinary link to a sim is an ordinary link.
  { url: "goal-loop.sim.html", title: undefined, embeds: false },
  { url: "https://example.org/sims/goal-loop?v=3", title: EMBED_TITLE, embeds: true },
  // No title is the ordinary case, and by far the commonest link in a record.
  { url: "https://example.org/sims/goal-loop", title: undefined, embeds: false },
  // A title an author wrote for a reader is a tooltip, not an instruction.
  { url: "https://example.org/sims/goal-loop", title: "The run-until-done sim", embeds: false },
  // Near misses on the marker, which must stay links.
  { url: "https://example.org/sim", title: "Embed", embeds: false },
  { url: "https://example.org/sim", title: "embedded", embeds: false },
  { url: "https://example.org/sim", title: " embed", embeds: false },
  // http would be blocked as mixed content, so it stays a link that works.
  { url: "http://example.org/sim", title: EMBED_TITLE, embeds: false },
  // Neither of these is a url a frame could reach.
  { url: "/sims/goal-loop", title: EMBED_TITLE, embeds: false },
  { url: "mailto:records@example.org", title: EMBED_TITLE, embeds: false },
];

interface EmbedNode {
  type?: string;
  tagName?: string;
  name?: string;
  value?: string;
  properties?: { href?: unknown; title?: unknown };
  attributes?: readonly { type: string; name: string; value: string }[];
  children?: EmbedNode[];
}

/** The link's own text, which becomes the frame's title and the link out. */
function labelOf(node: EmbedNode): string {
  return (node.children ?? [])
    .map((child) => (child.type === "text" ? (child.value ?? "") : labelOf(child)))
    .join("")
    .trim();
}

/** The record-relative directory a staged document sits in, or "". */
/**
 * BOTH roots, because there are two. A record that declares `audiences:` or
 * carries a takedown is read from `.staged-knowledge/`; every other record is
 * read from `knowledge/` directly, which is the level-0 fast path and the
 * common case. Keying on the staged one alone dropped the directory from
 * every url on exactly the records most people have (found live 2026-08-24:
 * `/sims/goal-loop.html` for a sim that lives in `loop-engineering/`).
 */
const RECORD_ROOTS = [".staged-knowledge/", "knowledge/"] as const;

export function recordDirOf(filePath: string | undefined): string {
  if (!filePath) return "";
  const normalized = filePath.replaceAll("\\", "/");
  for (const marker of RECORD_ROOTS) {
    const at = normalized.lastIndexOf(marker);
    if (at === -1) continue;
    const rel = normalized.slice(at + marker.length);
    const cut = rel.lastIndexOf("/");
    return cut === -1 ? "" : rel.slice(0, cut);
  }
  return "";
}

/** The served url for a sim linked from a document in `dir`. */
export function servedSimUrl(dir: string, target: string): string {
  const joined = dir === "" ? target : `${dir}/${target}`;
  return "/sims/" + publicSimPath(joined);
}

function embedFor(node: EmbedNode, dir: string): EmbedNode | null {
  if (node.type !== "element" || node.tagName !== "p") return null;

  // ALONE in its paragraph. hast keeps the source's whitespace between inline
  // children, so a link that shares a sentence still has text nodes beside it
  // — and reframing that would swallow the sentence around the link.
  const meaningful = (node.children ?? []).filter(
    (child) => child.type !== "text" || (child.value ?? "").trim() !== "",
  );
  const [link] = meaningful;
  if (meaningful.length !== 1 || !link || link.type !== "element" || link.tagName !== "a") {
    return null;
  }

  const { href, title } = link.properties ?? {};
  if (typeof href !== "string") return null;
  const match = matchEmbed(href, typeof title === "string" ? title : undefined);
  if (match === null) return null;

  // A sim is written as a link to the file BESIDE the document, exactly like
  // a figure. The url it is served at is derived here rather than authored,
  // so the record never contains a path into the site's own build output.
  const url = href.endsWith(SIM_SUFFIX) ? servedSimUrl(dir, href) : match.url;

  return {
    type: "mdxJsxFlowElement",
    name: "Embed",
    attributes: [
      { type: "mdxJsxAttribute", name: "url", value: url },
      { type: "mdxJsxAttribute", name: "host", value: match.host },
      // Carried in the record, or someone else's page. The two say very
      // different things to a reader, so the panel is told which.
      { type: "mdxJsxAttribute", name: "owned", value: String(match.host === SELF_HOST) },
      { type: "mdxJsxAttribute", name: "label", value: labelOf(link) },
    ],
    children: [],
  };
}

function convertEmbeds(node: EmbedNode, dir: string): void {
  const children = node.children;
  if (!children) return;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child) continue;
    convertEmbeds(child, dir);
    const embed = embedFor(child, dir);
    if (embed) children[i] = embed;
  }
}

export function rehypeEmbeds(): (tree: EmbedNode, file?: { path?: string }) => void {
  return (tree: EmbedNode, file?: { path?: string }): void => {
    convertEmbeds(tree, recordDirOf(file?.path));
  };
}
