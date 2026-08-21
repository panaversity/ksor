import { basePath, getSortedPageTree, getSortedPages } from "@/lib/source";
import { appName } from "@/lib/shared";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { ThemeSwitch } from "fumadocs-ui/layouts/shared/slots/theme-switch";
import { baseOptions } from "@/lib/layout.shared";
import { FooterMark } from "@/components/footer-mark";

export default function Layout({ children }: LayoutProps<"/docs">) {
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
        footer: (
          <div className="mt-3 flex flex-col gap-2">
            {/* The record's own identity, on every page rather than only the
                home page: the slug is what citations carry and llms.txt is the
                door an agent is told to read. The sidebar had three links and
                then several hundred pixels of nothing beneath them. */}
            <p className="text-xs text-fd-muted-foreground">
              <span className="font-mono">{appName}</span> · {getSortedPages().length} document
              {getSortedPages().length === 1 ? "" : "s"} ·{" "}
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
