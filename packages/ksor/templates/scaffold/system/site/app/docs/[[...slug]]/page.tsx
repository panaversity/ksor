import { basePath, entriesUnder, getSortedPages, source } from "@/lib/source";
import { RecordIndex } from "@/components/record-index";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
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

export default async function Page(props: PageProps<"/docs/[[...slug]]">) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
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
  const markdownUrl = `${basePath}/md/${(params.slug ?? []).join("/") || "index"}.md`;
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
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      // A document with no headings has no table of contents, but the shell
      // still RESERVED its column: the page grid measured
      // `88px 268px 1016px 268px 88px` with the TOC element itself
      // `display: none`, so 268px of the viewport was held for something that
      // never rendered and the prose sat off-centre (measured, 2026-08-21).
      // Governed records are full of short documents with no headings at all.
      tableOfContent={{ enabled: page.data.toc.length > 0 }}
    >
      {successor === null ? null : <SupersededNotice successor={successor} />}
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      {showGovernance ? (
        <GovernanceMeta governance={governance} replaces={replaces} markdownUrl={markdownUrl} />
      ) : null}
      {/* grow-0, against the shell's own `flex-1`: the article is a flex column
          stretched to the viewport, so the body inflated from ~150px of text to
          402px and pushed Sources and everything after it to the bottom of the
          screen — a governance block floating 400px below the document it
          describes (measured, 2026-08-21). Short documents now end where their
          text ends. */}
      <DocsBody style={{ flexGrow: 0 }}>
        <MDX
          components={getMDXComponents({
            // relative links between documents in knowledge/ resolve to
            // their rendered pages
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
      {/* A folder's index page lists what the folder holds. Without it the
          page ended at its own sentence and the documents below it were
          reachable only from the sidebar (research/site-design.md F5). Empty
          for a leaf document, which renders nothing. */}
      <RecordIndex entries={entriesUnder(page.url)} heading="In this section" />
      {showGovernance ? <Provenance entries={governance.provenance} /> : null}
    </DocsPage>
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
  const markdownUrl = `${basePath}/md/${(params.slug ?? []).join("/") || "index"}.md`;

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: { types: { "text/markdown": markdownUrl } },
  };
}
