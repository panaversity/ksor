import { getLLMText, getSortedPages } from "@/lib/source";

export const revalidate = false;

export async function GET(): Promise<Response> {
  // The whole set is threaded through so each document's successor pointer
  // resolves to a route rather than the `./x.md` a consumer cannot follow.
  const pages = getSortedPages();
  const scanned = await Promise.all(pages.map((page) => getLLMText(page, pages)));

  return new Response(scanned.join("\n\n"));
}
