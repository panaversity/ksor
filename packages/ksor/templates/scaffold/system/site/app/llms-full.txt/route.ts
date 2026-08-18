import { getLLMText, getSortedPages } from "@/lib/source";

export const revalidate = false;

export async function GET(): Promise<Response> {
  const scan = getSortedPages().map(getLLMText);
  const scanned = await Promise.all(scan);

  return new Response(scanned.join("\n\n"));
}
