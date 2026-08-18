import { basePath, getSortedPages } from "@/lib/source";
import { appName } from "@/lib/shared";

export const revalidate = false;

// The agent-facing index of the record: this instance's name, then every
// document in sidebar order, each link usable as-is on a sub-path host.
export function GET(): Response {
  const lines = getSortedPages().map((page) => {
    const link = `- [${page.data.title}](${basePath}${page.url})`;
    return page.data.description ? `${link}: ${page.data.description}` : link;
  });

  return new Response(`# ${appName}\n\n${lines.join("\n")}\n`);
}
