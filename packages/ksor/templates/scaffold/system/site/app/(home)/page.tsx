import Image from "next/image";
import Link from "next/link";
// The same file Next serves as the favicon (app/icon.png) — one mark, one
// asset. Replace it with your own and the tab icon changes with the page.
import mark from "@/app/icon.png";
import { BuiltWith } from "@/components/built-with";
import { appName } from "@/lib/shared";
import { basePath, getSortedPages } from "@/lib/source";

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

        {/* The frame is KSoR's; the name is the record's. The eyebrow brands
            the framework so the headline can stay the adopter's. */}
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-fd-muted-foreground">
          KSoR — Knowledge System of Record
        </p>
        <h1 className="font-mono text-4xl font-medium tracking-tight break-words sm:text-5xl">
          {appName}
        </h1>
        <p className="mt-3 text-lg text-fd-muted-foreground">
          Knowledge you can govern. Answers you can trace. Boundaries agents can respect.
        </p>

        {first ? (
          <div className="mt-9 flex flex-col gap-4">
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
            {/* The same record, the way an agent reads it. */}
            <p className="text-xs text-fd-muted-foreground">
              {pages.length} document{pages.length === 1 ? "" : "s"} &middot; agents read{" "}
              <a
                href={`${basePath}/llms.txt`}
                className="underline underline-offset-4 transition-colors hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
              >
                llms.txt
              </a>
            </p>
          </div>
        ) : (
          <p className="mt-9 text-fd-muted-foreground">
            the record is empty — add a document to <code>knowledge/</code>
          </p>
        )}
      </div>

      <footer className="mx-auto w-full max-w-2xl px-6 pb-10">
        <p className="border-t border-fd-border pt-6 text-xs">
          <BuiltWith />
        </p>
      </footer>
    </main>
  );
}
