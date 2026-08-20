import { basePath, getSortedPages } from "@/lib/source";
import { appName } from "@/lib/shared";
import { agentIndexSuffix, readGovernance, resolveSuccessorUrl } from "@/lib/governance";

export const revalidate = false;

// The agent-facing index of the record: this instance's name, then every
// document in sidebar order, each link usable as-is on a sub-path host — and
// each carrying its governance when the governance is a caveat.
//
// Without that last part a withdrawn document and the one that replaced it are
// two adjacent entries told apart only by whatever a human happened to type
// into a title, and an agent picks either (research/site-design.md F1).
export function GET(): Response {
  const pages = getSortedPages();
  const lines = pages.map((page) => {
    const governance = readGovernance(page.data, page.path);
    const successor =
      governance.supersededBy === null
        ? null
        : resolveSuccessorUrl(governance.supersededBy, page.path, pages);
    const link = `- [${page.data.title}](${basePath}${page.url})`;
    const described = page.data.description ? `${link}: ${page.data.description}` : link;
    // The successor's route is prefixed like every other URL here, so the line
    // is usable as-is on a sub-path host.
    return (
      described + agentIndexSuffix(governance, successor === null ? null : basePath + successor)
    );
  });

  return new Response(`# ${appName}\n\n${lines.join("\n")}\n`);
}
