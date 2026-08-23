import { defineCollections, defineConfig, defineDocs } from "fumadocs-mdx/config";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { z } from "zod";
import { DeckSchema } from "./lib/deck";
import { knowledgeSourceDir } from "./lib/stage-knowledge";

// The record lives at <repo>/knowledge — two levels up from this site.
// Governance frontmatter (status, owner, provenance, superseded_by) is
// tolerated on top of the default page schema so a governed document
// always renders; `pnpm check` at the repo root is what enforces it.
//
// When instance.md declares `audiences:`, the documents this build may
// publish (and the assets they reference) are staged into a filtered copy
// FIRST, and this is where that copy is chosen: one directory, one filter,
// every surface downstream. See lib/stage-knowledge.ts.
export const docs = defineDocs({
  dir: knowledgeSourceDir(),
  docs: {
    // ONE exclusion, and it is the whole of "an attachment is not a document".
    // The route table, the sidebar, llms.txt, llms-full.txt, /md/, the search
    // index and the caveat map ALL read `source`, and `source` reads exactly
    // this collection — so subtracting attachments here subtracts them from
    // every surface at once. Doing it per-surface instead is the failure mode
    // research/visibility.md §4-§5 is cited for; pruning the page tree is not
    // even sufficient, because getSortedPages() deliberately re-adds what the
    // tree dropped and the search index never consults the tree.
    files: ["**/*.md", "**/*.mdx", "!**/*.summary.md", "!**/*.summary.mdx"],
    schema: pageSchema
      .extend({
        status: z.string().optional(),
        owner: z.string().optional(),
        provenance: z.array(z.string()).optional(),
        superseded_by: z.string().optional(),
      })
      .catchall(z.any()),
    postprocess: {
      // Exposes each page's processed markdown — llms.txt/llms-full.txt
      // depend on it.
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

export default defineConfig({
  mdxOptions: {
    // MDX options
  },
});
