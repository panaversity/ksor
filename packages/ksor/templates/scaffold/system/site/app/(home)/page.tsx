import type { ReactElement } from "react";

import mark from "@/app/icon.png";
import { FooterMark } from "@/components/footer-mark";
import { HomeCover } from "@/components/home-cover";
import { appName, appPurpose, appTitle } from "@/lib/shared";
import { entriesUnder, entryFor, getSortedPages } from "@/lib/source";

/**
 * The front door of a system of record.
 *
 * It has four jobs and no fifth (research/site-design.md §4): say what the
 * record is authoritative for, name the identity citations carry, open the
 * record, and point at the surfaces agents read — the last from `/llms.txt`
 * and each document's markdown twin, where agents already look, rather than
 * from a list of addresses printed at a reader. Every string comes from
 * `instance.md` or a document's own frontmatter; the site never contains
 * authored content (scaffolded AGENTS.md, critical rule 1).
 *
 * One full screen, standing alone: no sidebar, no document chrome. The design
 * lives in components/home-cover; this file's job is to hand it the record.
 */
export default function HomePage(): ReactElement {
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

  // The record as the cover shows it: the document the button opens, then the
  // entries standing behind it. The lead is looked up among the top-level
  // entries so a folder keeps the count of what it holds, and falls back to
  // building an entry directly — the first document in governed order can sit
  // BELOW the top level, where the root's own listing would never return it.
  const entries = entriesUnder("");
  const lead = entries.find((entry) => entry.url === first.url) ?? entryFor(first);
  const behind = entries.filter((entry) => entry.url !== lead.url).slice(0, 3);

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
        lead={lead}
        behind={behind}
        // Signed from inside the cover, so the front door is one screen rather
        // than a band with a strip of page beneath it.
        foot={
          <p className="mx-auto w-full max-w-6xl px-6 font-mono text-xs tracking-wider text-[var(--ksor-cover-muted)] uppercase">
            <FooterMark />
          </p>
        }
      />
    </main>
  );
}
