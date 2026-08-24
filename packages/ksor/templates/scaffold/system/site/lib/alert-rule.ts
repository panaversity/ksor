/**
 * What makes a blockquote a CALLOUT: GitHub's alert syntax, unchanged.
 *
 *     > [!WARNING]
 *     > A withdrawn document is still cited by answers that were given while
 *     > it was published.
 *
 * The reason this syntax and not `:::warning`: a blockquote is CommonMark. The
 * record is CommonMark by rule (critical rule 3 keeps `knowledge/` free of any
 * grammar a plain markdown reader has to learn), and this one is already read
 * by the two places a record is looked at OUTSIDE this site — GitHub renders it
 * as a styled alert, and every other viewer renders an ordinary blockquote
 * carrying a visible `[!WARNING]` label. Nobody is misled and nothing is lost.
 * A `:::` directive is a grammar: it renders as the literal characters, and it
 * would reach `/md/`, `llms.txt` and `llms-full.txt`, where an agent would have
 * to know our dialect to read the record.
 *
 * The set is GitHub's five, exactly. Adding a sixth would mean a record that
 * renders here and not there, which is the whole thing this choice buys.
 *
 * A LEAF: no imports, so the remark plugin and the tests share one rule.
 */

/**
 * GitHub's marker -> the fumadocs Callout it becomes.
 *
 * `type` is one of fumadocs' `CalloutType` (`info` | `warn` | `error` |
 * `success` | `warning` | `idea`); anything else renders as plain `info` with
 * nothing going red, so these are checked against the shipped page.
 *
 * NOTE and IMPORTANT share `info` because fumadocs has no fifth colour, and
 * inventing one would drift from GitHub. The `title` is what tells them apart,
 * which is also how GitHub distinguishes them.
 */
export const ALERT_KINDS = [
  { marker: "NOTE", type: "info", title: "Note" },
  { marker: "TIP", type: "idea", title: "Tip" },
  { marker: "IMPORTANT", type: "info", title: "Important" },
  { marker: "WARNING", type: "warn", title: "Warning" },
  { marker: "CAUTION", type: "error", title: "Caution" },
] as const;

export type AlertKind = (typeof ALERT_KINDS)[number];

export interface AlertMatch {
  readonly kind: AlertKind;
  /** What is left of the leading text once the marker's own line is removed. */
  readonly rest: string;
}

/**
 * The alert this blockquote opens with, or null when it is an ordinary quote.
 *
 * `leadingText` is the value of the first text node of the blockquote's first
 * paragraph — the marker has to be the very start of the quote, and has to be
 * the WHOLE of its first line. Both are GitHub's rules, and following them is
 * the point: a quote that renders as a callout here and as a quote there would
 * make the site and the record disagree about the same bytes.
 *
 * Case-insensitive, because GitHub accepts `[!note]` and rendering it plain
 * here would be exactly that disagreement.
 */
export function matchAlert(leadingText: string): AlertMatch | null {
  if (!leadingText.startsWith("[!")) return null;

  const close = leadingText.indexOf("]");
  if (close === -1) return null;

  const marker = leadingText.slice(2, close).toUpperCase();
  const kind = ALERT_KINDS.find((entry) => entry.marker === marker);
  if (!kind) return null;

  const after = leadingText.slice(close + 1);
  const newline = after.indexOf("\n");
  const restOfLine = newline === -1 ? after : after.slice(0, newline);
  // Anything else on the marker's line means the author wrote a quote that
  // happens to start with a bracket, not an alert.
  if (restOfLine.trim() !== "") return null;

  return { kind, rest: newline === -1 ? "" : after.slice(newline + 1) };
}

/**
 * The cases the rule is held to.
 *
 * A table rather than prose assertions, because the interesting half is what
 * this must REFUSE: every refusal here is a blockquote an author wrote meaning
 * a blockquote, and turning one into a coloured panel is a change to the
 * record's meaning that nothing else would catch.
 */
export const ALERT_CASES = [
  // The five, as GitHub documents them.
  { text: "[!NOTE]\nThe record is the source of truth.", type: "info", title: "Note" },
  { text: "[!TIP]\nStart at level 0.", type: "idea", title: "Tip" },
  { text: "[!IMPORTANT]\nCitations pin a generation.", type: "info", title: "Important" },
  { text: "[!WARNING]\nThis document is superseded.", type: "warn", title: "Warning" },
  { text: "[!CAUTION]\nA takedown does not unsay an answer.", type: "error", title: "Caution" },
  // Lowercase renders as an alert on GitHub, so it renders as one here.
  { text: "[!note]\nStill an alert.", type: "info", title: "Note" },
  { text: "[!Warning]\nStill an alert.", type: "warn", title: "Warning" },
  // The marker alone, with the body in later nodes or later blocks.
  { text: "[!NOTE]", type: "info", title: "Note" },
  { text: "[!NOTE]\n", type: "info", title: "Note" },
  // Trailing spaces on the marker's line are invisible; they may not decide.
  { text: "[!NOTE]   \nBody.", type: "info", title: "Note" },
  // Ordinary blockquotes, which must stay blockquotes.
  { text: "A quote about something.", type: null, title: null },
  { text: "[!NOTES]\nNot a marker.", type: null, title: null },
  { text: "[!]\nEmpty marker.", type: null, title: null },
  { text: "[NOTE]\nNo bang.", type: null, title: null },
  { text: " [!NOTE]\nLeading space.", type: null, title: null },
  { text: "[!NOTE\nUnclosed.", type: null, title: null },
  // The marker has to own its line. Text beside it means the author quoted it.
  { text: "[!NOTE] see below", type: null, title: null },
  { text: "[!NOTE] see below\nBody.", type: null, title: null },
] as const;

/**
 * The slice of hast this touches, written structurally rather than imported.
 *
 * `@types/hast` would be a dependency for five field names, and this only ever
 * reads `type`/`tagName`, walks `children`, and edits the `value` of a text
 * node. Typing what is used keeps this file a leaf.
 */
interface AlertNode {
  type: string;
  tagName?: string;
  children?: AlertNode[];
  value?: string;
  name?: string;
  attributes?: { type: "mdxJsxAttribute"; name: string; value: string }[];
}

/**
 * The `<Callout>` this blockquote becomes, or null when it stays a blockquote.
 *
 * Mutates the quote's own first paragraph to drop the marker line — the marker
 * is syntax, and leaving it in the rendered panel would show the reader the
 * plumbing.
 */
function calloutFor(node: AlertNode): AlertNode | null {
  if (node.type !== "element" || node.tagName !== "blockquote") return null;

  // hast keeps the source's whitespace between block children, so the first
  // paragraph is the first ELEMENT rather than the first child.
  const paragraph = node.children?.find((child) => child.type === "element");
  if (!paragraph || paragraph.tagName !== "p") return null;

  const lead = paragraph.children?.[0];
  if (!lead || lead.type !== "text" || typeof lead.value !== "string") return null;

  const match = matchAlert(lead.value);
  if (!match) return null;

  if (match.rest === "") {
    // The marker was the whole text node. Drop it, and drop the paragraph too
    // when the marker was all it held — `> [!NOTE]` on a line of its own.
    paragraph.children?.shift();
    if (paragraph.children?.length === 0) {
      node.children = node.children?.filter((child) => child !== paragraph);
    }
  } else {
    lead.value = match.rest;
  }

  return {
    type: "mdxJsxFlowElement",
    name: "Callout",
    attributes: [
      { type: "mdxJsxAttribute", name: "type", value: match.kind.type },
      { type: "mdxJsxAttribute", name: "title", value: match.kind.title },
    ],
    children: node.children ?? [],
  };
}

/** Depth-first, so an alert nested inside a list or another quote converts. */
function convertAlerts(node: AlertNode): void {
  const children = node.children;
  if (!children) return;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child) continue;
    convertAlerts(child);
    const callout = calloutFor(child);
    if (callout) children[i] = callout;
  }
}

/**
 * REHYPE, deliberately — and this is the load-bearing half of the design.
 *
 * As a remark plugin this works and is wrong: fumadocs serializes the record's
 * markdown from the mdast (`includeProcessedMarkdown` -> `remarkLLMs`), so a
 * blockquote rewritten there reaches `/md/` and `llms-full.txt` as
 * `<Callout type="warn" title="Warning">` — the agent surface served this
 * site's React component in place of the author's blockquote. Measured, not
 * assumed: that is exactly what the first build of this emitted.
 *
 * By the rehype phase the markdown is already captured, so the page gets the
 * callout and every agent-facing surface keeps the record's own shape. This is
 * product principle 2 — one source, two surfaces — and the reason the syntax
 * is GitHub's rather than a directive in the first place.
 *
 * The cost, recorded because it is real: `remarkStructure` also runs in the
 * remark phase, so the search index contains the literal `[!NOTE]` alongside
 * the passage. Noise in one index is the cheaper half of this trade.
 */
export function rehypeGithubAlerts(): (tree: AlertNode) => void {
  return (tree: AlertNode): void => {
    convertAlerts(tree);
  };
}
