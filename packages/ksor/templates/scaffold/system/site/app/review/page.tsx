import Link from "next/link";
import type { ReactElement } from "react";

import { draftVisibility, reviewSections } from "@/lib/review";
import { reviewItems } from "@/lib/source";
import { readStageManifest } from "@/lib/stage-manifest";

export const metadata = {
  title: "Review",
  description: "What in this record still wants a human's eyes.",
  // Never an entry point for a reader or a crawler: this is a working page for
  // whoever maintains the record, and it lists documents the machine surfaces
  // have deliberately declined.
  robots: { index: false, follow: false },
};

/**
 * The review surface — the record-level half of "preview and review"
 * (decision 7, whose 2026-08-25 revision made that clause load-bearing rather
 * than descriptive).
 *
 * It offers no APPROVE control and never will. Approval is `status: stable`
 * with an actor, in a pull request; a button here would be the site performing
 * a governance act on somebody's behalf, which is decision 21's rule applied
 * to the site. This page's whole job is to say what to go and look at.
 *
 * Server-rendered, no client JS, no dependency: it is a list.
 *
 * Deliberately NOT in the navbar. It is a working page for whoever maintains
 * the record, it is `noindex`, and on a published build it is usually empty
 * because drafts are excluded — so a permanent link would advertise an internal
 * surface to every reader of a public record to no purpose. `/review` is named
 * in AGENTS.md and the README instead. Add the link if your record's reviewers
 * outnumber its readers; the file is yours.
 */
export default function ReviewPage(): ReactElement {
  const manifest = readStageManifest();
  const sections = reviewSections(reviewItems());
  const draftNote = draftVisibility(manifest.drafts);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <h1 className="font-display text-2xl font-semibold tracking-[-0.01em]">Review</h1>
      <p className="mt-2 text-fd-muted-foreground">
        What in this record still wants a human&rsquo;s eyes, as of{" "}
        <time dateTime={manifest.asOf}>{manifest.asOf}</time>.
      </p>

      {sections.length === 0 ? (
        // Honest, in words. A blank page reads the same whether nothing needs
        // review or the list failed to build.
        <p className="mt-10 rounded-lg border border-fd-border bg-fd-card p-4">
          Nothing in this build is awaiting review — every document it can see is stable, effective
          and current.
        </p>
      ) : (
        sections.map((section) => (
          <section key={section.badge} className="mt-10">
            <h2 className="font-display text-lg font-semibold">
              {section.heading}{" "}
              <span className="text-fd-muted-foreground font-normal">({section.items.length})</span>
            </h2>
            <p className="mt-1 text-sm text-fd-muted-foreground">{section.note}</p>
            <ul className="mt-4 divide-y divide-fd-border border-y border-fd-border">
              {section.items.map((item) => (
                <li key={item.url} className="py-3">
                  <Link href={item.url} className="font-medium hover:underline">
                    {item.title}
                  </Link>
                  {item.description !== null && (
                    <p className="mt-0.5 text-sm text-fd-muted-foreground">{item.description}</p>
                  )}
                  <p className="mt-1 font-mono text-xs text-fd-muted-foreground">
                    {item.owner ?? "no owner declared"}
                    {item.at !== null && <> · {item.at}</>}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {draftNote !== null && <p className="mt-10 text-sm text-fd-muted-foreground">{draftNote}</p>}
    </main>
  );
}
