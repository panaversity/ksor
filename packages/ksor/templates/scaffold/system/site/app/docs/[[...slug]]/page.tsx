import {
  basePath,
  entriesUnder,
  folderHeading,
  folderOfRoute,
  folderSlugs,
  getSortedPages,
  markdownPath,
  source,
} from "@/lib/source";
import { RecordIndex } from "@/components/record-index";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { TOCPopover, TOCProvider } from "fumadocs-ui/layouts/docs/page/slots/toc";
import { notFound } from "next/navigation";
import { getMDXComponents } from "@/components/mdx";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { recordLink } from "@/lib/record-link";
import {
  DeprecatedNotice,
  GovernanceMeta,
  LifecycleCaveat,
  Provenance,
  type Successor,
} from "@/components/governance";
import { predecessorsOf, readGovernance, resolveSuccessorUrl } from "@/lib/governance";
import { showGovernance } from "@/lib/shared";
import { stagePageOf } from "@/lib/stage-manifest";
import { RecordBreadcrumb } from "@/components/record-breadcrumb";
import { RecordToc, TocItems } from "@/components/record-toc";
import { RecordViews } from "@/components/record-views";
import { Flashcards } from "@/components/flashcards";
import { Quiz } from "@/components/quiz";
import { Slides } from "@/components/slides";
import { StudyAids } from "@/components/study-aids";
import { deckFor, quizFor, slidesFor, summaryFor } from "@/lib/attachments";
import { readingMinutes } from "@/lib/reading-time";

/** The route a slug names: `/docs`, or `/docs/a/b`. */
function routeOf(slug: readonly string[] | undefined): string {
  return slug === undefined || slug.length === 0 ? "/docs" : `/docs/${slug.join("/")}`;
}

/**
 * Every page reads `rel="describedby"`: the record describes itself in
 * `llms.txt`, and a consumer that follows the link learns what this record is
 * authoritative for before it reads a page of it (build spec §3).
 */
function DescribedBy(): ReactElement {
  return <link rel="describedby" href={`${basePath}/llms.txt`} type="text/markdown" />;
}

/**
 * A directory's page: the regenerated `index.md` of this viewer's stage,
 * rendered as a listing. A folder has no body and no governance of its own
 * (record spec §1) — it is admitted iff a descendant is, and its page is the
 * list of what it holds. Excluded from the docs collection, so it has no
 * twin, no `llms.txt` line and no search entry.
 */
function FolderPage({ dir }: { dir: string }): ReactElement {
  return (
    <TocItems items={[]}>
      <DocsPage
        toc={[]}
        slots={{
          breadcrumb: RecordBreadcrumb,
          toc: { provider: TOCProvider, main: RecordToc, popover: TOCPopover },
        }}
      >
        <DescribedBy />
        <DocsTitle>{folderHeading(dir)}</DocsTitle>
        <RecordIndex entries={entriesUnder(dir)} heading="In this section" />
      </DocsPage>
    </TocItems>
  );
}

export default async function Page(props: PageProps<"/docs/[[...slug]]">) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) {
    const dir = folderOfRoute(routeOf(params.slug));
    if (dir === null) notFound();
    return <FolderPage dir={dir} />;
  }

  const MDX = page.data.body;
  // Attachments of THIS document, found by suffix on its own path. Null is the
  // ordinary case, not an error.
  const summary = summaryFor(page.path);
  const Summary = summary?.body ?? null;
  const deck = deckFor(page.path);
  const quiz = quizFor(page.path);
  const presentation = slidesFor(page.path);
  // Counted at BUILD time from the document's own markdown, so the figure is in
  // the shipped HTML for a reader with a failed bundle, a crawler and an agent
  // alike.
  const minutes = readingMinutes(await page.data.getText("processed"));
  const summaryMinutes =
    summary === null ? null : readingMinutes(await summary.getText("processed"));
  // What the record says about this document. The page renders it; it never
  // supplies it — an undeclared key shows nothing.
  const governance = readGovernance(page.data, page.path);
  // What staging decided about it: the badge, and whether a twin exists.
  const staged = stagePageOf(page.path);
  const badge = staged?.badge ?? null;
  const twin = staged?.machine === true ? markdownPath(page.url) : undefined;

  const allPages = getSortedPages();
  let successor: Successor | null = null;
  // Gated on the STATUS, not on the pointer: a document the record calls
  // current must never be published under a "Deprecated" banner, whatever
  // stale successor pointer it still carries.
  if (governance.status === "deprecated" && governance.supersededBy !== null) {
    const href = resolveSuccessorUrl(governance.supersededBy, allPages);
    // Name the successor by its title, not by its id: the notice is for a
    // reader, and the pointer is only the fallback when the route did not
    // resolve — never a dead link.
    const target = href === null ? undefined : allPages.find((c) => c.url === href.split("#")[0]);
    successor = { href, label: target?.data.title ?? governance.supersededBy };
  }

  // What this document replaced, derived by asking every document in the record
  // where its successor pointer lands (research/site-design.md F4). No new
  // frontmatter key: the record already says it, in the other direction.
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
        // shell's (its own rail ran two to four headings ahead of the reader on
        // this record's short-sectioned documents). The breadcrumb is ours
        // because the shell's renders nothing on a top-level document.
        slots={{
          breadcrumb: RecordBreadcrumb,
          toc: {
            provider: TOCProvider,
            main: RecordToc,
            popover: TOCPopover,
          },
        }}
        // The table-of-contents column is HELD on every page, including the many
        // in a governed record that have no headings, so the prose sits in the
        // same place on every document (measured 134px of drift without it).
      >
        <DescribedBy />
        {governance.status === "deprecated" ? <DeprecatedNotice successor={successor} /> : null}
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
        {showGovernance ? (
          <GovernanceMeta
            governance={governance}
            badge={badge}
            replaces={replaces}
            markdownUrl={twin}
            // Only when there is no view strip to carry it — with a summary,
            // the number belongs to the view the reader picked, not to the
            // document as a whole.
            minutes={summary === null ? minutes : undefined}
          />
        ) : (
          // …and with the strip off, the CAVEAT still shows. `site.governance`
          // hides attribution, not the record's word on whether this document
          // is in force — which the sidebar, the folder listing and the search
          // result all keep saying about this same page (`plainBadge`).
          <LifecycleCaveat badge={badge} effectiveFrom={governance.effectiveFrom} />
        )}
        {/* grow-0, against the shell's own `flex-1`: short documents end where
          their text ends rather than pushing Sources to the bottom of the
          screen (measured, 2026-08-21). */}
        <DocsBody style={{ flexGrow: 0 }}>
          {/* The summary panel is built HERE, on the server, and handed to the
            client tab strip as a prop — so it is in the shipped HTML whether or
            not the bundle runs. Presence-driven: with no summary, RecordViews
            renders the body alone and no tab strip exists. */}
          <RecordViews
            documentMinutes={minutes}
            summaryMinutes={summaryMinutes ?? undefined}
            summary={
              Summary === null ? null : (
                <Summary components={getMDXComponents({ a: recordLink(source, page) })} />
              )
            }
          >
            <MDX
              components={getMDXComponents({
                // links between documents in knowledge/, in both OKF forms,
                // resolve to their rendered pages
                a: recordLink(source, page),
                // The deck, rendered where the record's own shape puts it:
                // after the introduction, before the first section.
                TeachingAid: () =>
                  presentation === null ? null : <Slides slides={presentation} />,
              })}
            />
          </RecordViews>
        </DocsBody>
        {/* What a reader DOES with this document once they have read it.
          Renders nothing at all when the document has no study aids. */}
        <StudyAids>
          {deck === null ? null : <Flashcards deck={deck} />}
          {quiz === null ? null : <Quiz quiz={quiz} />}
        </StudyAids>
        {showGovernance ? <Provenance entries={governance.sources} /> : null}
      </DocsPage>
    </TocItems>
  );
}

export async function generateStaticParams() {
  const params = source.generateParams();
  // Every directory this viewer's stage holds an index for is a page too —
  // the root included, which is the record's own map.
  const folders = folderSlugs().map((slug) => ({ slug }));
  if (params.length === 0 && folders.length === 0) {
    // Without this, Next fails the empty-record build with an error that
    // names neither the record nor the rule (found live, 2026-08-18).
    //
    // NOT the same state as "this build publishes no document". The emitted
    // starter is all drafts by design (R25), and build spec §4 acceptance 4
    // requires it to BUILD and publish none of them — so a stage with the root
    // index and no page is a record waiting for its first approval, and
    // throwing here failed `pnpm build` on every freshly scaffolded project
    // (found live 2026-08-25 through the scaffold e2e). What is left is the
    // genuinely impossible state: no page AND no index, which means the stage
    // itself is missing.
    throw new Error(
      "the staged record holds neither a document nor a folder index — the stage is missing or empty; run `ksor build` and check knowledge/ (`pnpm check` says the same).",
    );
  }
  return [...params, ...folders];
}

export async function generateMetadata(props: PageProps<"/docs/[[...slug]]">): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) {
    const dir = folderOfRoute(routeOf(params.slug));
    if (dir === null) notFound();
    return { title: folderHeading(dir) };
  }

  // The markdown twin, advertised rather than left to be guessed — and only
  // where one exists: a page the machine surfaces decline has no twin, and
  // advertising one would be a dead link (build spec §3).
  const twin = stagePageOf(page.path)?.machine === true;
  return {
    title: page.data.title,
    description: page.data.description,
    ...(twin ? { alternates: { types: { "text/markdown": markdownPath(page.url) } } } : {}),
  };
}
