import type { ReactElement, ReactNode } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { ThemeSwitch } from "fumadocs-ui/layouts/shared/slots/theme-switch";

import { FooterMark } from "@/components/footer-mark";
import { baseOptions } from "@/lib/layout.shared";
import { appName } from "@/lib/shared";
import { basePath, getSortedPageTree, getSortedPages } from "@/lib/source";

/**
 * The chrome every page of the record wears: the governed tree as a sidebar,
 * search, and the record's own identity at its foot.
 *
 * The FRONT DOOR wears it too. A system of record whose first page hides the
 * record behind a marketing layout makes a reader click before they can see
 * what is in it; the docs homes of AI-first projects put their first page
 * inside this same shell (modelcontextprotocol.io redirects to a document,
 * Cursor's `/docs` renders one — both checked 2026-08-22). One shell, defined
 * once: two copies of it drift, and the drift shows up as a sidebar that
 * disagrees with itself between two routes.
 */
export function RecordShell({ children }: { children: ReactNode }): ReactElement {
  const documents = getSortedPages().length;

  return (
    <DocsLayout
      tree={getSortedPageTree()}
      {...baseOptions()}
      // The switch ships inside a bordered bar of its own in the sidebar
      // footer — a flex column whose children stretch, so one 61px control sat
      // in a 236px box that was 74% empty and read as a broken input field
      // (measured in Chromium, 2026-08-21). That bar carries `empty:hidden`,
      // so turning the built-in switch off removes it entirely; the control
      // moves into the footer below, on the same row as the mark.
      themeSwitch={{ enabled: false }}
      // After the spread: a future sidebar key in baseOptions must not
      // silently swallow the attribution (review finding, 2026-08-18).
      sidebar={{
        // `key`, because the shell renders this footer as one child of an
        // ARRAY (fumadocs-ui 16.14.5, layouts/docs/slots/sidebar.js — the
        // branch that also holds the language select, icon links and theme
        // switch). Without it React logs "Each child in a list should have a
        // unique key prop" naming RecordShell, on every page. Invisible in a
        // production build, which is why it survived: it only shows in `pnpm
        // dev`, where the adopter meets it first.
        footer: (
          <div key="record-footer" className="mt-3 flex flex-col gap-2">
            {/* The record's own identity, on every page rather than only the
                home page: the slug is what citations carry and llms.txt is the
                door an agent is told to read. The sidebar had three links and
                then several hundred pixels of nothing beneath them. */}
            <p className="text-xs text-fd-muted-foreground">
              <span className="font-mono">{appName}</span> · {documents} document
              {documents === 1 ? "" : "s"} ·{" "}
              <a
                href={`${basePath}/llms.txt`}
                className="underline underline-offset-4 transition-colors hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
              >
                llms.txt
              </a>
            </p>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs">
                <FooterMark />
              </p>
              <ThemeSwitch />
            </div>
          </div>
        ),
      }}
    >
      {children}
    </DocsLayout>
  );
}
