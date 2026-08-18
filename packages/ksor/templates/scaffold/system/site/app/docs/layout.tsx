import { getSortedPageTree } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions } from "@/lib/layout.shared";
import { FooterMark } from "@/components/footer-mark";

export default function Layout({ children }: LayoutProps<"/docs">) {
  return (
    <DocsLayout
      tree={getSortedPageTree()}
      {...baseOptions()}
      // After the spread: a future sidebar key in baseOptions must not
      // silently swallow the attribution (review finding, 2026-08-18).
      sidebar={{
        footer: (
          <p className="mt-3 text-xs">
            <FooterMark />
          </p>
        ),
      }}
    >
      {children}
    </DocsLayout>
  );
}
