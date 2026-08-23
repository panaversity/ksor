import { entriesUnder, getSortedPages, markdownPath, source } from "@/lib/source";
import { RecordIndex } from "@/components/record-index";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { TOCPopover, TOCProvider } from "fumadocs-ui/layouts/docs/page/slots/toc";
import { notFound } from "next/navigation";
import { getMDXComponents } from "@/components/mdx";
import type { Metadata } from "next";
import { createRelativeLink } from "fumadocs-ui/mdx";
import {
  GovernanceMeta,
  Provenance,
  SupersededNotice,
  type Successor,
} from "@/components/governance";
import { predecessorsOf, readGovernance, resolveSuccessorUrl } from "@/lib/governance";
import { showGovernance } from "@/lib/shared";
import { RecordToc, TocItems } from "@/components/record-toc";
import { RecordViews } from "@/components/record-views";
import { Flashcards } from "@/components/flashcards";
import { StudyAids } from "@/components/study-aids";
import { deckFor, summaryFor } from "@/lib/attachments";
import { readingMinutes } from "@/lib/reading-time";

export default async function Page(props: PageProps<"/docs/[[...slug]]">) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  // Attachments of THIS document, found by suffix on its own path. Null is the
  // ordinary case, not an error.
  const summary = summaryFor(page.path);
  const Summary = summary?.body ?? null;
  const deck = deckFor(page.path);
  // Counted at BUILD time from the document's own markdown, so the figure is in
  // the shipped HTML for a reader with a failed bundle, a crawler and an agent
  // alike. The predecessor measured the rendered DOM after paint, which put it
  // out of reach of all three.
  const minutes = readingMinutes(await page.data.getText("processed"));
  const summaryMinutes =
    summary === null ? null : readingMinutes(await summary.getText("processed"));
  // What the record says about this document. The page renders it; it never
  // supplies it — an undeclared key shows nothing (specs/ksor/site-governance).
  const governance = readGovernance(page.data, page.path);

  let successor: Successor | null = null;
  // Gated on the STATUS, not on the pointer: a document the record calls
  // current must never be published under a "Superseded" banner, whatever
  // stale successor pointer it still carries (`pnpm check` refuses that
  // combination too — this is the second lock on the same door).
  if (governance.status === "superseded" && governance.supersededBy !== null) {
    const pages = getSortedPages();
    // Against page.path, not page.url: a route cannot tell a file from a
    // folder index, and `./terms.md` means a different document in each.
    const href = resolveSuccessorUrl(governance.supersededBy, page.path, pages);
    // Name the successor by its title, not by its path: the notice is for a
    // reader, and the pointer is only the fallback when the route did not
    // resolve — never a dead link.
    const target = href === null ? undefined : pages.find((c) => c.url === href.split("#")[0]);
    successor = { href, label: target?.data.title ?? governance.supersededBy };
  }

  // What this document replaced, derived by asking every document in the record
  // where its successor pointer lands (research/site-design.md F4). No new
  // frontmatter key: the record already says it, in the other direction.
  // The same address `generateMetadata` advertises, shown to a person as well:
  // the human surface handing an agent the record's own bytes is a better
  // demonstration of the product than any copy on the home page.
  const markdownUrl = markdownPath(page.url);
  const allPages = getSortedPages();
  const replaces = predecessorsOf(
    page.url,
    allPages,
    allPages.map((candidate) => ({
      path: candidate.path,
      supersededBy: readGovernance(candidate.data, candidate.path).supersededBy,
    })),
  ).map((url) => ({
    href: url,
    label: allPages.find((candidate) => candidate.url === url)?.data.title ?? url,
  }));

  return (
    <TocItems items={page.data.toc}>
      <DocsPage
        toc={page.data.toc}
        full={page.data.full}
        // The rail is ours; the provider and the small-screen popover stay the
        // shell's. Its own rail marks a heading active when 90% of it is visible
        // anywhere in the viewport and then highlights whichever became active
        // last, which on this record's short-sectioned documents ran two to four
        // headings AHEAD of the reader. The observer's options are not
        // configurable and the observer is not exported, so the selection could
        // only be replaced — `slots.toc.main` is the seam for that.
        slots={{
          toc: {
            provider: TOCProvider,
            main: RecordToc,
            popover: TOCPopover,
          },
        }}
        // The table-of-contents column is HELD on every page, including the many
        // in a governed record that have no headings at all and render nothing
        // into it. Collapsing it for those documents (which this file did, from
        // 2026-08-21) bought a wider column at the price of a moving one: the
        // article is centred in whatever the column leaves, so the prose jumped
        // 134px sideways between a document with headings and one without
        // (measured at 1728px: text at x=446 against x=580). A reader clicking
        // through a record saw the page slide under them.
        //
        // Held, the grid is `0 | 268 | main | 268 | 0` — sidebar and rail the
        // same width, so the main column is centred in the viewport and the
        // reading measure capped in global.css sits centred inside it, in the
        // same place on every document. The rail is the natural home for the
        // governance facts this record already carries; until it holds them it
        // is quiet space on the side, which is what the earlier collapse was
        // really objecting to — the 900px measure beside it, since fixed.
      >
        {successor === null ? null : <SupersededNotice successor={successor} />}
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
        {showGovernance ? (
          <GovernanceMeta
            governance={governance}
            replaces={replaces}
            markdownUrl={markdownUrl}
            readingMinutes={minutes}
          />
        ) : null}
        {/* grow-0, against the shell's own `flex-1`: the article is a flex column
          stretched to the viewport, so the body inflated from ~150px of text to
          402px and pushed Sources and everything after it to the bottom of the
          screen — a governance block floating 400px below the document it
          describes (measured, 2026-08-21). Short documents now end where their
          text ends. */}
        <DocsBody style={{ flexGrow: 0 }}>
          {/* The summary panel is built HERE, on the server, and handed to the
            client tab strip as a prop — so it is in the shipped HTML whether or
            not the bundle runs, which is what an agent parsing the page and a
            reader with a failed bundle both depend on. Presence-driven: with no
            summary, RecordViews renders the body alone and no tab strip exists
            (specs/ksor/study-attachments C3, C20). */}
          <RecordViews
            documentMinutes={minutes}
            summaryMinutes={summaryMinutes ?? undefined}
            summary={
              Summary === null ? null : (
                <Summary components={getMDXComponents({ a: createRelativeLink(source, page) })} />
              )
            }
          >
            <MDX
              components={getMDXComponents({
                // relative links between documents in knowledge/ resolve to
                // their rendered pages
                a: createRelativeLink(source, page),
              })}
            />
          </RecordViews>
        </DocsBody>
        {/* What a reader DOES with this document once they have read it. One
          region, so the quiz that will sit beside the deck is a child here and
          not a new argument about where it goes. Renders nothing at all when
          the document has no study aids. */}
        <StudyAids>{deck === null ? null : <Flashcards deck={deck} />}</StudyAids>
        {/* A folder's index page lists what the folder holds. Without it the
          page ended at its own sentence and the documents below it were
          reachable only from the sidebar (research/site-design.md F5). Empty
          for a leaf document, which renders nothing. */}
        <RecordIndex entries={entriesUnder(page.url)} heading="In this section" />
        {showGovernance ? <Provenance entries={governance.provenance} /> : null}
      </DocsPage>
    </TocItems>
  );
}

export async function generateStaticParams() {
  const params = source.generateParams();
  if (params.length === 0) {
    // Without this, Next fails the empty-record build with an error that
    // names neither the record nor the rule (found live, 2026-08-18).
    throw new Error(
      "the record has no documents — a KSoR is never empty; add one to knowledge/ or restore one from git history (pnpm check says the same).",
    );
  }
  return params;
}

export async function generateMetadata(props: PageProps<"/docs/[[...slug]]">): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  // The markdown twin, advertised rather than left to be guessed: a consumer
  // that follows `rel="alternate"` reaches the record's own bytes instead of
  // scraping this page (research/site-design.md F2).
  const markdownUrl = markdownPath(page.url);

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: { types: { "text/markdown": markdownUrl } },
  };
}
