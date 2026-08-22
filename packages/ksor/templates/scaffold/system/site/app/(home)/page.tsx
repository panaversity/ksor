import type { ReactElement } from "react";

import mark from "@/app/icon.png";
import { FooterMark } from "@/components/footer-mark";
import { HomeCover, type RecordArtifact } from "@/components/home-cover";
import { appName, appPurpose, appTitle } from "@/lib/shared";
import { basePath, getLLMText, getSortedPages, markdownPath, recordIndexText } from "@/lib/source";

/**
 * The front door of a system of record.
 *
 * It has four jobs and no fifth (research/site-design.md §4): say what the
 * record is authoritative for, name the identity citations carry, open the
 * record, and point at the doors agents read. Every string on it comes from
 * `instance.md` or from a document's own frontmatter — the site never contains
 * authored content (scaffolded AGENTS.md, critical rule 1).
 *
 * A landing page standing on its own: no sidebar, no document chrome. The
 * design lives in components/home-cover — this file's job is to hand it the
 * record, including the bytes the build publishes, so the page can show the
 * record rather than describe it.
 */
export default async function HomePage(): Promise<ReactElement> {
  // The first document in sidebar order — never a hardcoded path, so deleting
  // the example the scaffold ships cannot leave a link pointing at nothing, and
  // a record that grows a root `index.md` opens on that instead with no change
  // here.
  const pages = getSortedPages();
  const [first] = pages;

  if (first === undefined) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-20">
        <p className="text-fd-muted-foreground">
          the record is empty — add a document to <code>knowledge/</code>
        </p>
      </main>
    );
  }

  // The panel shows the record's published bytes, capped: a long first document
  // would otherwise ship its whole body into every visit to the front page.
  const head = (text: string, href: string, label: string): RecordArtifact => {
    const limit = 1600;
    const truncated = text.length > limit;
    return {
      label,
      href,
      text: truncated ? `${text.slice(0, limit).trimEnd()}\n…` : text,
      truncated,
    };
  };
  const markdownHref = markdownPath(first.url);

  return (
    <main className="flex flex-1 flex-col">
      <HomeCover
        mark={mark}
        name={appName}
        // instance.md's own H1 — a human name, not the machine slug — so a
        // fresh scaffold reads "Knowledge System of Record" until the intake
        // interview writes the real one.
        title={appTitle}
        // The record's own words: instance.md's first paragraph, which is also
        // what `ksor serve` gives the MCP server as its instructions. The
        // framework's marketing line used to sit here, which put ksor's voice
        // above somebody else's knowledge (research/site-design.md F7).
        purpose={appPurpose}
        documents={pages.length}
        firstUrl={first.url}
        firstTitle={first.data.title}
        artifacts={[
          head(recordIndexText(), `${basePath}/llms.txt`, "llms.txt"),
          head(
            await getLLMText(first, pages),
            markdownHref,
            markdownHref.split("/").pop() ?? "index.md",
          ),
        ]}
      />

      {/* The paper below the cover is a foot, not a section: the contents sit on
          the cover, so nothing down here has to carry weight it cannot. */}
      <footer className="mx-auto w-full max-w-6xl flex-1 px-6 pt-32 pb-8">
        <p className="font-mono text-xs tracking-wider text-fd-muted-foreground uppercase">
          <FooterMark />
        </p>
      </footer>
    </main>
  );
}
