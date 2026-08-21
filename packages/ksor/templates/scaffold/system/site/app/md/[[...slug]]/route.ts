import { notFound } from "next/navigation";

import { getLLMText, getSortedPages, source } from "@/lib/source";

export const revalidate = false;

/**
 * Every document as markdown, at a stable address derived from its path:
 * `/docs/policies/purchase-approval` is also served at
 * `/md/policies/purchase-approval.md`.
 *
 * The record already IS markdown; without this an agent handed a document URL
 * had to scrape a React app to reach text the record holds verbatim
 * (research/site-design.md F2). The body carries the document's governance as
 * frontmatter, exactly as `llms-full.txt` does, so a consumer reading one
 * document knows its status, owner, sources and successor.
 *
 * Why a `/md/` prefix rather than appending `.md` to the document's own URL,
 * which is the convention the field has settled on: under `output: "export"` a
 * Route Handler cannot share a route segment with a Page, and there is no
 * middleware to rewrite one onto the other. The prefix is the shape that
 * survives a static host, and the page advertises it in a `rel="alternate"`
 * link so a consumer discovers it rather than guessing. Appending `.md` to the
 * canonical URL becomes possible the day a build emits these artifacts itself.
 */
export function generateStaticParams(): { slug: string[] }[] {
  return source.generateParams().map(({ slug }) => {
    const segments = slug ?? [];
    const last = segments.at(-1);
    return {
      slug: last === undefined ? ["index.md"] : [...segments.slice(0, -1), `${last}.md`],
    };
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
): Promise<Response> {
  const { slug = [] } = await params;
  const last = slug.at(-1);
  if (last === undefined || !last.endsWith(".md")) notFound();
  const docSlug = last === "index.md" ? [] : [...slug.slice(0, -1), last.slice(0, -".md".length)];

  const page = source.getPage(docSlug);
  if (!page) notFound();

  return new Response(await getLLMText(page, getSortedPages()), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
