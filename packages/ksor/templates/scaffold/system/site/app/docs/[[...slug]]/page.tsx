import { getSortedPages, source } from "@/lib/source";
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
import { readGovernance, resolveSuccessorUrl } from "@/lib/governance";

export default async function Page(props: PageProps<"/docs/[[...slug]]">) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  // What the record says about this document. The page renders it; it never
  // supplies it — an undeclared key shows nothing (specs/ksor/site-governance).
  const governance = readGovernance(page.data, page.url);

  let successor: Successor | null = null;
  if (governance.supersededBy !== null) {
    const pages = getSortedPages();
    const href = resolveSuccessorUrl(
      governance.supersededBy,
      page.url,
      pages.map((candidate) => candidate.url),
    );
    // Name the successor by its title, not by its path: the notice is for a
    // reader, and the pointer is only the fallback when the route did not
    // resolve — never a dead link.
    const target = href === null ? undefined : pages.find((c) => c.url === href.split("#")[0]);
    successor = { href, label: target?.data.title ?? governance.supersededBy };
  }

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      {successor === null ? null : <SupersededNotice successor={successor} />}
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <GovernanceMeta governance={governance} />
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // relative links between documents in knowledge/ resolve to
            // their rendered pages
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
      <Provenance entries={governance.provenance} />
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

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
