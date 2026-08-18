import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { z } from "zod";

// The record lives at <repo>/knowledge — two levels up from this site.
// Governance frontmatter (status, owner, provenance, superseded_by) is
// tolerated on top of the default page schema so a governed document
// always renders; `pnpm check` at the repo root is what enforces it.
export const docs = defineDocs({
  dir: "../../knowledge",
  docs: {
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
    schema: metaSchema,
  },
});

export default defineConfig({
  mdxOptions: {
    // MDX options
  },
});
