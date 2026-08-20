# Fixture capture for the chunker conversion (Python oracle -> TypeScript port).
#
# Runs the ORACLE chunker (sor-agentfactory @ b554f91,
# packages/sor-content/src/sor_content/ingest/chunking.py + markdown.py) over a
# crafted corpus that exercises every fidelity trap of the port, and writes:
#   - chunking.json        the raw capture
#   - chunking.fixture.ts  the same capture as an importable TS module (the
#                          tsconfig has no resolveJsonModule, so JSON cannot be
#                          imported directly)
#
# Regenerate (never edit the outputs by hand):
#   cd /path/to/sor-agentfactory && uv run --no-sync python \
#     <this directory>/capture.py
#
# The pipeline mirrors build.py exactly: cleaned =
# strip_presentation_jsx(strip_style_blocks(raw)); chunks = chunk_text(cleaned);
# contentHash = content_hash(cleaned). The capture self-checks byte-exact
# reassembly for every case before writing anything.

import json
import pathlib
import subprocess
import sys

from sor_content.config import CHUNK_POLICY
from sor_content.ingest.chunking import (
    chunk_text,
    heading_path_text,
    strip_presentation_jsx,
    strip_style_blocks,
)
from sor_content.ingest.markdown import _FRONTMATTER, content_hash, parse_frontmatter

HERE = pathlib.Path(__file__).resolve().parent

# --- the crafted corpus -----------------------------------------------------

# The oracle test suite's DOC, verbatim (tests/test_chunking.py) — the known-good
# mixed shape: H1 dropped, {#id} anchor, assessment widget, fence with ``` inside.
ORACLE_DOC = (
    """# Course Title

Intro paragraph before any section.

## Part One {#p1}

Body of part one with enough prose to exceed the nav floor. """
    + ("Words. " * 60)
    + """

### Deep Dive

Nested content here. """
    + ("More. " * 60)
    + """

## Quiz Time

<Quiz id="q1" />

## Part Two

```python
code = "a ``` inside would not close this"
```

Closing prose after the fence. """
    + ("Tail. " * 60)
    + "\n"
)

CASES: list[tuple[str, str, int | None, str]] = [
    (
        "mixed-course-doc",
        "the oracle test suite's DOC: H1 title dropped, {#p1} anchor, assessment widget, fence containing ```",
        None,
        ORACLE_DOC,
    ),
    ("empty", "a truly empty document yields ZERO chunks", None, ""),
    (
        "whitespace-only",
        "whitespace-only doc (incl \\x1f, whitespace to Python but not to JS trim) -> ONE nav chunk, verbatim content",
        None,
        " \n\t\n\x1f \n",
    ),
    (
        "leading-blanks-prefix",
        "blank lines before the first heading attach FORWARD onto the first real chunk (the prefix rule)",
        None,
        "\n\n\n# Title\n\nIntro body prose sentence.\n",
    ),
    (
        "crlf-document",
        "CRLF endings survive byte-exact; \\n\\r\\n blank runs are subsplit separators; contentHash is CRLF-normalized",
        60,
        "# Doc\r\n\r\n## Sec {#s1}\r\n\r\nFirst line.\r\nSecond line.\r\n\r\n"
        "```\r\ncode line\r\n\r\nstill code\r\n```\r\n\r\nTail prose after fence.\r\n",
    ),
    (
        "astral-boundary-1500",
        "MAX_CHARS counts CODE POINTS: 1473 cp of emoji (2933 UTF-16 units) stays ONE chunk; a UTF-16 port would split",
        None,
        "## Emoji\n\n" + "\U0001f600" * 760 + "\n\n" + "\U0001f600" * 700 + "\n"
        "## Snakes\n\n" + "\U0001f40d" * 900 + "\n\n" + "\U0001f40d" * 900 + "\n"
        "## Han\n\n" + "知" * 300 + "\n",
    ),
    (
        "astral-hard-slice",
        "HARD_MAX_CHARS slices by CODE POINTS: 4201-cp astral paragraph slices at 4000 cp (8000 UTF-16 units)",
        None,
        "## Giant\n\n" + "\U0001d11e" * 4200 + "\n",
    ),
    (
        "giant-ascii-paragraph",
        "a 5000-char paragraph with no blank lines: only HARD_MAX_CHARS may character-slice (4000+1000)",
        None,
        "## G\n\n" + "z" * 5000 + "\n",
    ),
    (
        "fence-blank-lines-no-split",
        "blank-line runs INSIDE an open fence are never flush points; the piece may exceed maxChars",
        80,
        "## S\n\nIntro sentence that runs a bit long for packing here.\n\n"
        "```python\nfirst = 1\n\nsecond = 2\n\nthird = 3\n```\n\n"
        "Tail prose that follows the fence and adds more text.\n",
    ),
    (
        "fence-zoo",
        "nested fences (``` inside ````), backtick-in-info non-fence, tilde fence with backtick info, close-run >= open, non-empty-info close ignored, 3-space indent opens",
        60,
        "## N\n\n````md\nOuter fence text.\n\n```\ninner fence\n```\n\n# not a heading\n````\n\nAfter the fence.\n\n"
        "## Weird\n\n```a`b\nStill prose because the info string has a backtick.\n\n### Inner\n\nBody after inner heading so it lands as its own segment.\n\n"
        "## Tilde\n\n~~~a`b\n# literal inside tilde fence\n~~~\n\nAfter tilde.\n\n"
        "## Close Longer\n\n```\ncode\n`````\n\nAfter close.\n\n"
        "## Indent\n\n   ```\nindented fence code\n\n   ```\n\nAfter indented fence.\n",
    ),
    (
        "heading-anchors-and-levels",
        "H1 {#id} still gets anchor None; explicit ids (incl _) beat slugs; slug cap at 60; H5 is body; deeper levels pop on reset",
        None,
        "# Top {#top}\n\nIntro under H1 only.\n\n"
        "## Alpha Section {#alpha-id}\n\nAlpha body text.\n\n"
        "### Sub Alpha {#sub_alpha1}\n\nSub alpha body.\n\n"
        "#### Deepest {#d-4}\n\nDeep body.\n\n##### H5 not a heading\n\nStill in Deepest.\n\n"
        "## A Very Long Section Title That Exceeds The Sixty Character Slug Cap For Sure\n\nBody under long title.\n\n"
        "### Reset Then Back\n\nBody.\n\n"
        "## Back To Two\n\nFinal body.\n",
    ),
    (
        "heading-empty-title",
        "'##' followed by only whitespace IS a heading with an empty title: path [''], anchor ''",
        None,
        "##\nBody under empty title.\n\n## \nBody under space title.\n",
    ),
    (
        "emoji-heading-anchor",
        "a title that slugs to nothing gets anchor '' (empty string), not null",
        None,
        "## \U0001f3af\n\nBody under the emoji heading.\n",
    ),
    (
        "nav-prose-floor",
        "NAV_MAX_CHARS floor in CODE POINTS: 249 -> nav, 250 -> prose, 249 emoji (498 UTF-16) -> nav",
        None,
        "## Exactly 249\n\n" + "x" * 249 + "\n\n"
        "## Exactly 250\n\n" + "y" * 250 + "\n\n"
        "## Emoji Floor\n\n" + "\U0001f600" * 249 + "\n",
    ),
    (
        "split-never-orphans-nav",
        "a split prose section never demotes a small piece to nav (oracle test parity)",
        600,
        "## Long\n\n" + ("Sentence with substance here. " * 120) + "\n",
    ),
    (
        "widget-kinds",
        "assessment/embed classification: <Quiz>, <iframe>, docs.google.com/presentation, 'Teaching Aid' leaf",
        None,
        '## Quiz Time\n\n<Quiz id="q1" />\n\n'
        '## Video\n\n<iframe src="https://example.com/embed"></iframe>\n\n'
        "## Slides\n\nDeck: https://docs.google.com/presentation/d/abc123 (view only).\n\n"
        "## Aids\n\nIntro for aids.\n\n### Teaching Aid: Session Slides\n\n"
        + ("Aid prose sentence. " * 15)
        + "\n",
    ),
    (
        "widget-dominated-split",
        "a widget-dominated segment labels EVERY fragment assessment, even after splitting",
        80,
        '## W\n\n<Quiz id="q1" />\n\n' + ("Filler prose sentence here. " * 15) + "\n",
    ),
    (
        "widget-not-dominated",
        ">=250 cp of prose before the marker: NOT dominated, pieces classify individually (prose then assessment)",
        200,
        "## Mostly Prose\n\n" + ("Real teaching sentence. " * 12).strip() + "\n\n<Quiz />\n",
    ),
    (
        "exotic-linebreaks",
        "Python splitlines boundaries (\\u2028 \\x85 \\f \\v \\x1c-\\x1e) and Python-only whitespace (\\x1f, \\xa0; \\ufeff is NOT whitespace)",
        None,
        "## Alpha\u2028Line after LS.\x85Line after NEL.\fFF line.\vVT line.\x1cFS.\x1dGS.\x1eRS.\n\n"
        "##\x1fSpacer\n\nBody of spacer section.\n\n"
        "##\xa0Nbsp\n\nBody of nbsp section.\n\n"
        "## \ufeffBom\n\nBody of bom section.\n",
    ),
    (
        "exotic-blank-sep-pack",
        "the subsplit separator is \\n\\s*\\n with PYTHON \\s: '\\n\\x1c\\n' is a separator (JS \\s lacks \\x1c)",
        40,
        "## S\n\n" + "a" * 35 + "\n\x1c\n" + "b" * 35 + "\n",
    ),
    # --- presentation strippers (run before hashing + chunking, so 'cleaned' is
    # --- what reassembly and contentHash are measured against) ----------------
    (
        "strip-style-at-start",
        "a doc-leading <style> wall is dropped; the blank line after it survives and rides the prefix rule",
        None,
        "<style>\n.hero { color: red; }\n.x { margin: 0; }\n</style>\n\n# About\n\nReal curriculum prose for the about page.\n",
    ),
    (
        "strip-style-mid-doc-fastpath",
        "LOCKED ORACLE QUIRK: _STYLE_OPEN is ^-anchored with NO multiline, so a mid-document <style> block is NOT stripped",
        None,
        "Intro prose stays.\n\n<style>\n.x { color: red; }\n</style>\n\nTail prose.\n",
    ),
    (
        "strip-style-fence-safe",
        "a <style> shown as example code inside a fence survives; the prose-level block is dropped",
        None,
        "<style>\n.a { color: red; }\n</style>\n\n```html\n<style>\n.demo { color: blue; }\n</style>\n```\n\nExplanation of the css example.\n",
    ),
    (
        "strip-style-single-line",
        "a single-line <style>...</style> drops just that line",
        None,
        "<style>.one { color: red; }</style>\nKept line after the one-line block.\n",
    ),
    (
        "strip-wrappers-mixed",
        "bare layout wrappers drop, text stays; <div id=...> keeps its tag; a kept <span> keeps both tags",
        None,
        '<div className="af-hero-eyebrow">The Third Era of AI Tools</div>\n\n'
        '<div id="install" className="card">Install uv first.</div>\n\n'
        '<div className="card">Read <span title="uv">uv</span> docs.</div>\n',
    ),
    (
        "strip-mode-card",
        "the live production mode-card: nested bare divs drop, <h3> and text (incl emoji) survive",
        None,
        '<div className="af-mode-card af-mode-card--green">\n'
        '<div className="af-mode-icon">\U0001f310</div>\n'
        '<div className="af-mode-eyebrow af-mode-eyebrow--green">Route 02 · Freelance</div>\n'
        "<h3>The Open Market</h3>\n"
        "</div>\n",
    ),
    (
        "strip-style-attr-multiline",
        "style={{...}} is brace-matched across lines (a JS object literal; regex cannot bound it)",
        None,
        "<div style={{\n  margin: 0,\n  boxShadow: `0 0 ${x}px`,\n}}>Learning never stops</div>",
    ),
    (
        "strip-fence-inline-safe",
        "a wrapper inside a fence or inside `inline code` is a lesson, not presentation: byte-identical",
        None,
        '# Lesson\n\n```jsx\n<div className="card" style={{margin: 0}}>hi</div>\n```\n\n'
        'That is JSX.\n\nUse `<div className="card">` to group related elements.\n',
    ),
    (
        "strip-across-fence-stack",
        "the layout-tag stack survives a fence split: opener before / closer after the fence still pair and drop",
        None,
        'Intro prose.\n\n<div className="code-demo">\n\n```python\nprint("hello")\n```\n\n</div>\n\nMore prose.\n',
    ),
    (
        "strip-meaningful-across-fence",
        "a kept wrapper (<div id=...>) also pairs across the fence: both tags stay",
        None,
        '<div id="install">\n\n```bash\nuv sync\n```\n\n</div>\n',
    ),
    (
        "strip-malformed-kept",
        "an unbalanced closer and an unbalanced style={{ opener are KEPT, never eaten (conservative direction)",
        None,
        "Prose that matters.</div>\n\n<div style={{margin: 0>Broken markup here.\n\n# Real heading\n\nReal prose.\n",
    ),
    (
        "strip-curriculum-untouched",
        "<Quiz>/<Flashcards>/<details>/<svg> are never stripped; the quiz still classifies as assessment",
        None,
        '<Quiz questions={[{q: "What is MCP?"}]} />\n<Flashcards />\n'
        "<details><summary>Hint</summary>Read the spec.</details>\n"
        '<svg><text x="10">Agent</text></svg>\n',
    ),
    (
        "strip-composed",
        "strip_presentation_jsx(strip_style_blocks(doc)) as build.py composes them: both CSS shapes cleared",
        None,
        "<style>\n.af-hero { color: red; }\n</style>\n\n"
        '<div className="af-hero" style={{padding: 8}}>\n\nWhat AI actually is.\n\n</div>\n',
    ),
]

MARKDOWN_CASES: list[tuple[str, str]] = [
    ("basic", "---\ntitle: X\nkeywords: a, b\n---\n# H\n\nFirst para.\n"),
    ("crlf-frontmatter", "---\r\ntitle: Y\r\n---\r\nBody line.\r\n"),
    ("no-frontmatter", "# Just a doc\n\nBody.\n"),
    ("leading-blank-line", "\n---\nnope: true\n---\nBody.\n"),
    ("close-fence-trailing-tabs-spaces", "---\na: 1\n--- \t\nBody after spaced close.\n"),
    ("unterminated", "---\na: 1\nBody with no closing fence.\n"),
    ("empty-frontmatter", "---\n\n---\nBody after empty frontmatter.\n"),
    ("close-fence-with-suffix-is-not-a-close", "---\na: 1\n--- extra\nBody.\n"),
    ("no-trailing-newline-after-close", "---\na: 1\n---"),
]


def to_case(name: str, note: str, max_chars: int | None, raw: str) -> dict:
    cleaned = strip_presentation_jsx(strip_style_blocks(raw))
    chunks = chunk_text(cleaned) if max_chars is None else chunk_text(cleaned, max_chars=max_chars)
    reassembled = "".join(c.content for c in sorted(chunks, key=lambda c: c.ordinal))
    assert reassembled == cleaned, f"oracle reassembly failed for {name!r}"
    assert [c.ordinal for c in chunks] == list(range(len(chunks))), name
    return {
        "name": name,
        "note": note,
        "maxChars": max_chars,
        "raw": raw,
        "cleaned": cleaned,
        "contentHash": content_hash(cleaned),
        "chunks": [
            {
                "ordinal": c.ordinal,
                "content": c.content,
                "chunkHash": c.chunk_hash,
                "headingPath": c.heading_path,
                "anchor": c.anchor,
                "sourceType": c.source_type,
                "headingPathText": heading_path_text(c.heading_path),
            }
            for c in chunks
        ],
    }


def to_markdown_case(name: str, text: str) -> dict:
    meta, body = parse_frontmatter(text)
    del meta  # the kernel discards meta (build.py does the same); the port returns raw text
    m = _FRONTMATTER.match(text)
    return {
        "name": name,
        "text": text,
        "frontmatter": m.group(1) if m else None,
        "body": body,
        "bodyHash": content_hash(body),
    }


def main() -> None:
    oracle_sha = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True
    ).stdout.strip()
    fixture = {
        "oracle": f"sor-agentfactory@{oracle_sha}",
        "policy": CHUNK_POLICY,
        "cases": [to_case(*c) for c in CASES],
        "markdownCases": [to_markdown_case(*c) for c in MARKDOWN_CASES],
    }
    raw_json = json.dumps(fixture, indent=2, ensure_ascii=True)
    (HERE / "chunking.json").write_text(raw_json + "\n", encoding="utf-8")

    header = (
        "// GENERATED FILE - do not edit. Captured from the oracle chunker\n"
        f"// (sor-agentfactory @ {oracle_sha}, packages/sor-content/src/sor_content/ingest/\n"
        "// chunking.py + markdown.py) by capture.py in this directory.\n"
        "// Regenerate: cd <sor-agentfactory checkout> && uv run --no-sync python \\\n"
        "//   <this directory>/capture.py\n"
        "// chunking.json is the same capture; this module exists because the tsconfig\n"
        "// (nodenext, no resolveJsonModule) cannot import JSON directly.\n\n"
        "export interface FixtureChunk {\n"
        "  readonly ordinal: number;\n"
        "  readonly content: string;\n"
        "  readonly chunkHash: string;\n"
        "  readonly headingPath: readonly string[];\n"
        "  readonly anchor: string | null;\n"
        '  readonly sourceType: "prose" | "nav" | "embed" | "assessment";\n'
        "  readonly headingPathText: string;\n"
        "}\n\n"
        "export interface ChunkingCase {\n"
        "  readonly name: string;\n"
        "  readonly note: string;\n"
        "  readonly maxChars: number | null;\n"
        "  readonly raw: string;\n"
        "  readonly cleaned: string;\n"
        "  readonly contentHash: string;\n"
        "  readonly chunks: readonly FixtureChunk[];\n"
        "}\n\n"
        "export interface MarkdownCase {\n"
        "  readonly name: string;\n"
        "  readonly text: string;\n"
        "  readonly frontmatter: string | null;\n"
        "  readonly body: string;\n"
        "  readonly bodyHash: string;\n"
        "}\n\n"
        "export interface ChunkingFixtureFile {\n"
        "  readonly oracle: string;\n"
        "  readonly policy: string;\n"
        "  readonly cases: readonly ChunkingCase[];\n"
        "  readonly markdownCases: readonly MarkdownCase[];\n"
        "}\n\n"
    )
    ts = header + "export const chunkingFixtures: ChunkingFixtureFile = " + raw_json + ";\n"
    (HERE / "chunking.fixture.ts").write_text(ts, encoding="utf-8")

    total_chunks = sum(len(c["chunks"]) for c in fixture["cases"])
    print(f"wrote {len(fixture['cases'])} chunking cases ({total_chunks} chunks), "
          f"{len(fixture['markdownCases'])} markdown cases; oracle {oracle_sha}, policy {CHUNK_POLICY}")


if __name__ == "__main__":
    sys.exit(main())
