import Image from "next/image";
import Link from "next/link";
// The same file Next serves as the favicon (app/icon.png) — one mark, one
// asset. Replace it with your own and the tab icon changes with the page.
import mark from "@/app/icon.png";
import { FooterMark } from "@/components/footer-mark";
import { appName, appTitle } from "@/lib/shared";
import { basePath, entriesUnder, getSortedPages } from "@/lib/source";
import { RecordIndex } from "@/components/record-index";

export default function HomePage() {
  // The first document in sidebar order — never a hardcoded path, so deleting
  // the example the scaffold ships cannot leave a link pointing at nothing.
  const pages = getSortedPages();
  const [first] = pages;

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-24">
        <Image
          src={mark}
          alt=""
          width={56}
          height={56}
          priority
          className="mb-7 size-14 rounded-xl ring-1 ring-fd-border"
        />

        {/* The frame is KSoR's; the title is the record's. The headline is
            instance.md's own H1 — a human name, not the machine slug — so a
            fresh scaffold reads "Knowledge System of Record" until the
            intake interview writes the real one. */}
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-fd-muted-foreground">
          KSoR
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance break-words sm:text-5xl">
          {appTitle}
        </h1>

        {first ? (
          <div className="mt-8 flex flex-col gap-4">
            <Link
              href={first.url}
              className="group inline-flex w-fit items-center gap-2 rounded-lg bg-fd-primary px-4 py-2.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
            >
              Open the record
              <span
                aria-hidden
                className="transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
              >
                &rarr;
              </span>
            </Link>
            {/* The machine identity and the agent door — the slug is what
                citations will carry, so it stays visible where agents look. */}
            <p className="text-xs text-fd-muted-foreground">
              <span className="font-mono">{appName}</span> &middot; {pages.length} document
              {pages.length === 1 ? "" : "s"} &middot; agents read{" "}
              <a
                href={`${basePath}/llms.txt`}
                className="underline underline-offset-4 transition-colors hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
              >
                llms.txt
              </a>
            </p>
          </div>
        ) : (
          <p className="mt-8 text-fd-muted-foreground">
            the record is empty — add a document to <code>knowledge/</code>
          </p>
        )}
        {/* What the record actually holds. Before this the page announced a
            document count and linked to exactly one of them, so a system of
            record's front door listed nothing that was in it
            (research/site-design.md F2). */}
        <RecordIndex entries={entriesUnder(null)} heading="The record" />
      </div>

      <footer className="mx-auto w-full max-w-2xl px-6 pb-10">
        <p className="border-t border-fd-border pt-6 text-xs">
          <FooterMark />
        </p>
      </footer>
    </main>
  );
}
