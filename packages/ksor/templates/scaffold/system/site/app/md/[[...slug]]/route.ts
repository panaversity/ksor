import { notFound } from "next/navigation";

import { getLLMText, getMachinePages, rootIndexTwin, source } from "@/lib/source";
import { machineAdmits } from "@/lib/stage-manifest";

export const revalidate = false;

/**
 * Every MACHINE-admitted document as markdown, at a stable address derived
 * from its path: `/docs/policies/purchase-approval` is also served at
 * `/md/policies/purchase-approval.md`, and the record's own index at
 * `/md/index.md` — the one index with a twin (build spec §3).
 *
 * The record already IS markdown; without this an agent handed a document URL
 * had to scrape a React app to reach text the record holds verbatim
 * (research/site-design.md F2). The body carries the document's governance and
 * the build's stamps as frontmatter, exactly as `llms-full.txt` does.
 *
 * A page the machine surfaces decline — a draft, a deprecated, a not-yet-
 * effective or a stale concept (record spec §2.5) — has no twin at all: the
 * decision is staging's, read back here, never re-derived.
 *
 * Why a `/md/` prefix rather than appending `.md` to the document's own URL:
 * under `output: "export"` a Route Handler cannot share a route segment with a
 * Page, and there is no middleware to rewrite one onto the other. The prefix
 * survives a static host, and the page advertises it in a `rel="alternate"`
 * link so a consumer discovers it rather than guessing.
 */
export function generateStaticParams(): { slug: string[] }[] {
  const twins = getMachinePages().map((page) => {
    const segments = page.url.replace(/^\/docs\/?/, "").split("/");
    const last = segments.at(-1) ?? "";
    return { slug: [...segments.slice(0, -1), `${last}.md`] };
  });
  return [{ slug: ["index.md"] }, ...twins];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
): Promise<Response> {
  const { slug = [] } = await params;
  const last = slug.at(-1);
  if (last === undefined || !last.endsWith(".md")) notFound();
  const headers = { "content-type": "text/markdown; charset=utf-8" };
  if (slug.length === 1 && last === "index.md") return new Response(rootIndexTwin(), { headers });

  const page = source.getPage([...slug.slice(0, -1), last.slice(0, -".md".length)]);
  if (!page || !machineAdmits(page.path)) notFound();

  return new Response(getLLMText(page), { headers });
}
