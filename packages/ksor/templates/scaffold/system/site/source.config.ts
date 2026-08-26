import path from "node:path";

import { defineCollections, defineConfig, defineDocs } from "fumadocs-mdx/config";
import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins";
import { remarkCodeTab } from "fumadocs-core/mdx-plugins/remark-code-tab";
import { rehypeGithubAlerts } from "./lib/alert-rule";
import { rehypeEmbeds } from "./lib/embed-rule";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { z } from "zod";
import { DeckSchema } from "./lib/deck";
import { QuizSchema } from "./lib/quiz";
import { SlidesSchema } from "./lib/slides";
import { isAttachment } from "./lib/attachment-rule";
import { rehypeTeachingAid } from "./lib/teaching-aid-rule";
import { STAGE_DIR } from "./lib/stage-manifest";
import { knowledgeSourceDir } from "./lib/stage-knowledge";

// The record lives at <repo>/knowledge — two levels up from this site. The
// profile's governance frontmatter (record spec §2) is tolerated on top of
// the default page schema so a governed document always renders; the record
// checker, which staging runs, is what enforces it.
//
// The documents this build's viewer may see (and the assets they reference)
// are staged into a filtered copy FIRST, for EVERY build, and this is where
// that copy is chosen: one directory, one filter, every surface downstream.
// See lib/stage-knowledge.ts.
export const docs = defineDocs({
  dir: knowledgeSourceDir(),
  docs: {
    // TWO exclusions, and they are the whole of "an attachment is not a
    // document" and "an index is not a document". The route table, the
    // sidebar, llms.txt, llms-full.txt, /md/, the search index and the badge
    // map ALL read `source`, and `source` reads exactly this collection — so
    // subtracting here subtracts from every surface at once. Doing it
    // per-surface is the failure mode research/visibility.md §4-§5 is cited
    // for; pruning the page tree is not even sufficient, because the search
    // index never consults the tree. The regenerated `index.md` is rendered by
    // the folder page component instead (record spec §1: no route, no twin,
    // no llms.txt line — it carries no governance to publish under).
    // `.md` only: the record is CommonMark (record spec §1), the checker
    // refuses an `.mdx` under knowledge/ by name (`ksor-file-type`), and
    // staging copies nothing else — so an `.mdx` pattern here advertised a
    // shape the stage can never contain.
    files: ["**/*.md", "!**/*.summary.md", "!**/index.md"],
    schema: pageSchema
      .extend({
        type: z.string().optional(),
        status: z.string().optional(),
        order: z.number().optional(),
        ksor: z.record(z.string(), z.any()).optional(),
      })
      .catchall(z.any()),
    postprocess: {
      // Exposes each page's processed markdown, for the page's reading time.
      // NOT for the machine surfaces: `/md/` and `llms-full.txt` republish the
      // STAGED bytes, because the processed markdown is the mdast serialized
      // after every remark plugin has run and carries this shell's rendering
      // rather than the record's grammar (lib/stage-manifest.ts, `stagedBody`).
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    // PINNED, and not optional. The default meta glob is `**/*.{yaml,json}`,
    // which swallows every `<doc>.flashcards.yaml` in the record and fails the
    // build with a zod error naming neither the file's purpose nor the rule
    // (verified against the real record: the default glob returned the deck).
    files: ["**/meta.{json,yaml}"],
    schema: metaSchema,
  },
});

/**
 * A document's summary, rendered on the document's own page.
 *
 * Its own collection rather than a page: it goes through the SAME MDX pipeline
 * as the record — the same prose voice, code handling and heading anchors — but
 * is never handed to `loader()`, so it has no route and appears on no agent
 * surface. The parent's own bytes are untouched by its presence.
 */
export const summaries = defineCollections({
  type: "doc",
  dir: knowledgeSourceDir(),
  files: ["**/*.summary.md"],
  postprocess: {
    // So the page can count the summary's words for its reading time without
    // reading the file again. `getText("raw")` would go back to disk, and it
    // resolves against the working directory rather than the collection's dir
    // — which fails the export outright (found live: ENOENT on
    // knowledge/<doc>.md during prerender).
    includeProcessedMarkdown: true,
  },
});

/**
 * A document's recall deck.
 *
 * `type: "meta"` because fumadocs parses YAML for meta collections itself
 * (dist/meta-BR_rkCyY.js: `.yaml` -> yaml.parse, `.json` -> JSON.parse, and
 * anything else throws). That is why this needs no YAML parser and no new
 * dependency — `yaml` is already fumadocs-mdx's own — and why the extension is
 * exactly `.yaml`: `.yml` reaches that `throw` and names only the path.
 */
export const decks = defineCollections({
  type: "meta",
  dir: knowledgeSourceDir(),
  files: ["**/*.flashcards.yaml"],
  schema: DeckSchema,
});

/**
 * Quizzes, on the deck's terms exactly — same loader, same reason for `.yaml`.
 *
 * `QuizSchema` runs the hygiene audit as part of parsing, so a quiz whose
 * answers are guessable fails HERE, during the build, naming the questions.
 * That is the point of putting it in the schema rather than in a script: the
 * predecessor had these checks and shipped the bugs anyway.
 */
export const quizzes = defineCollections({
  type: "meta",
  dir: knowledgeSourceDir(),
  files: ["**/*.quiz.yaml"],
  schema: QuizSchema,
});

/** The presentation that teaches a document — see components/slides.tsx. */
export const slides = defineCollections({
  type: "meta",
  dir: knowledgeSourceDir(),
  files: ["**/*.slides.yaml"],
  schema: SlidesSchema,
});

export default defineConfig({
  mdxOptions: {
    /**
     * A bundle-absolute image (`![chart](/chart.png)`) resolves against the
     * STAGE, which is where `/`-rooted links resolve everywhere else in the
     * record.
     *
     * OKF §6.1 allows both link forms and record spec §2.3 says the record
     * carries both, so the checker accepts `/chart.png` and staging copies the
     * file to `.staged-knowledge/chart.png`. fumadocs' `remarkImage` is applied
     * by default and resolves a `/`-rooted src against `<cwd>/public` — a
     * directory this scaffold does not have — so it emitted
     * `import __img0 from "../../public/chart.png"` and the export died with
     * "Module not found" naming a path that exists nowhere in the record. Two
     * halves of one pipeline resolving the same string against two roots; this
     * gives them one root. Absolute, because `remarkImage` joins it with the
     * src and then takes a path RELATIVE to the document's directory.
     */
    remarkImageOptions: { publicDir: path.resolve(process.cwd(), STAGE_DIR) },
    /**
     * A fence in a language the highlighter does not carry renders as PLAIN
     * TEXT rather than failing the build.
     *
     * A record is not a code project: an author writing ```promql, ```logql or
     * ```gotemplate is describing their own stack, and shiki throws on a
     * language it has no grammar for. Without this, one fence anywhere in the
     * record takes the whole site down with a stack trace naming a file in
     * node_modules — found live on a real 187-document handbook, where three
     * such languages appeared across 3,000 fences.
     *
     * `lazy` so only the grammars a record actually uses are loaded, which is
     * also what keeps that first unknown fence from being fatal.
     *
     * The defaults are SPREAD, not replaced: `RehypeCodeOptions` is a full
     * options object (it requires `themes`), so passing the two keys alone
     * type-errors on a manager that resolves fumadocs fresh rather than from
     * the pinned lockfile — found in CI on the npm and bun scaffolds, which
     * ship no lockfile by design (decision 25).
     */
    rehypeCodeOptions: {
      ...rehypeCodeDefaultOptions,
      lazy: true,
      fallbackLanguage: "text",
    },
    /**
     * WHERE the teaching aid sits: after the document's introduction, which
     * is everything before its first `##` section. The plugin only marks the
     * place; the page decides whether there is a deck to put there. See
     * lib/teaching-aid-rule.ts.
     */
    rehypePlugins: [
      [rehypeTeachingAid, { isAttachment }],
      /**
       * A passage the reader must not miss, as a CALLOUT.
       *
       * GitHub's alert syntax: a blockquote whose first line is `[!WARNING]`.
       * GitHub renders it as a styled alert, every other viewer renders an
       * ordinary blockquote carrying a visible label, and it reaches `/md/`
       * and `llms-full.txt` as the author's blockquote rather than as markup.
       *
       * Not `:::warning`. fumadocs ships `remarkAdmonition` for that form and
       * deprecates it in favour of a `remark-directive` setup — but the deeper
       * objection is that `:::` is a dialect, and a record written in one
       * renders as literal punctuation everywhere it is read outside this site.
       *
       * REHYPE rather than remark, and lib/alert-rule.ts records why: the
       * record's markdown is serialized from the mdast, so converting there
       * publishes this site's React component to the agent surface.
       */
      rehypeGithubAlerts,
      /**
       * An interactive page the document points at, as a click-to-load
       * frame. Authored as an ordinary link titled `embed`, so the record
       * stays CommonMark and every other reader of it sees a link.
       *
       * REHYPE, so `/md/` and `llms-full.txt` keep the author's link
       * rather than this site's component. See lib/embed-rule.ts.
       */
      rehypeEmbeds,
    ],
    /**
     * Alternative versions of the same instruction, as TABS.
     *
     * A record often has to say the same thing twice — one way for one tool,
     * one for another — and stacking both is how a reader follows the wrong
     * one. `remarkCodeTab` turns consecutive fenced blocks that declare a
     * `tab="…"` into a tab group.
     *
     * The reason this works HERE, where a JSX `<Tabs>` cannot: a fence's info
     * string is free text in CommonMark. `\`\`\`bash tab="Claude Code"` is a
     * perfectly ordinary bash block to every other markdown reader, which sees
     * both blocks one after another and is not misled — it just does not get
     * to pick. So the record stays framework-free (critical rule 2) and the
     * site still renders the affordance.
     *
     * `CodeBlockTabs` rather than `Tabs`, and the difference is not cosmetic:
     * only that branch honours `tab-group`, which is what makes ONE choice
     * apply to every group on the page and persist to the next visit. The
     * `Tabs` branch drops the attribute silently, so a reader with a
     * ten-section document would pick their tool ten times (verified against
     * fumadocs-core 16.14.5, remark-code-tab.js).
     */
    remarkPlugins: [[remarkCodeTab, { Tabs: "CodeBlockTabs" }]],
  },
});
