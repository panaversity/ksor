import type { ReactElement } from "react";

import { FooterMark } from "@/components/footer-mark";
import { HomeHero, type RecordArtifact } from "@/components/home-hero";
import { RecordIndex } from "@/components/record-index";
import { Separator } from "@/components/ui/separator";
import { appName, appPurpose, appTitle } from "@/lib/shared";
import {
  basePath,
  entriesUnder,
  getLLMText,
  getSortedPages,
  markdownPath,
  recordIndexText,
} from "@/lib/source";

/**
 * The front door of a system of record.
 *
 * It has four jobs and no fifth (research/site-design.md §4): say what the
 * record is authoritative for, name the identity citations carry, open the
 * record, and point at the doors agents read. Every string on it comes from
 * `instance.md` or from a document's own frontmatter — the site never contains
 * authored content (scaffolded AGENTS.md, critical rule 1).
 *
 * A landing page, standing on its own: no sidebar, no table of contents, no
 * document chrome. `Open the record` is the way in, and the record's own
 * navigation starts on the other side of it.
 */
export default async function HomePage(): Promise<ReactElement> {
  // The first document in sidebar order — never a hardcoded path, so deleting
  // the example the scaffold ships cannot leave a link pointing at nothing, and
  // a record that grows a root `index.md` opens on that instead with no change
  // here.
  const pages = getSortedPages();
  const [first] = pages;
  const documents = `${pages.length} document${pages.length === 1 ? "" : "s"}`;

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
    const limit = 1800;
    const truncated = text.length > limit;
    return {
      label,
      href,
      text: truncated ? `${text.slice(0, limit).trimEnd()}\n…` : text,
      truncated,
    };
  };
  const markdownHref = markdownPath(first.url);
  const artifacts: readonly RecordArtifact[] = [
    head(recordIndexText(), `${basePath}/llms.txt`, "llms.txt"),
    head(await getLLMText(first, pages), markdownHref, markdownHref.split("/").pop() ?? "index.md"),
  ];

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-16 sm:py-24">
        <HomeHero
          eyebrow="KSoR"
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
          documents={documents}
          firstUrl={first.url}
          // Every agent door, not just the first: the build publishes all three
          // and an agent cannot use what nothing announces (product principle 8).
          doors={[
            { href: `${basePath}/llms.txt`, label: "llms.txt", note: "the record’s index" },
            {
              href: `${basePath}/llms-full.txt`,
              label: "llms-full.txt",
              note: "every document, one file",
            },
            { href: markdownHref, label: "/md/….md", note: "any document as markdown" },
          ]}
          artifacts={artifacts}
        />

        {/* What the record actually holds. Before this the page announced a
            document count and linked to exactly one of them, so a system of
            record's front door listed nothing that was in it
            (research/site-design.md F2). */}
        <div className="mt-16">
          <RecordIndex entries={entriesUnder(null)} heading="The record" />
        </div>
      </div>

      {/* The sidebar carried the attribution and the audience notice while the
          front door wore the docs chrome; standing alone, it carries its own. */}
      <footer className="mx-auto w-full max-w-6xl px-6 pb-10">
        <Separator className="mb-6" />
        <p className="text-xs">
          <FooterMark />
        </p>
      </footer>
    </main>
  );
}
