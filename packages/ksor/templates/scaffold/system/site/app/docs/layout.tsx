import { getSortedPageTree } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions } from "@/lib/layout.shared";
import { BuiltWith } from "@/components/built-with";

export default function Layout({ children }: LayoutProps<"/docs">) {
  return (
    <DocsLayout
      tree={getSortedPageTree()}
      sidebar={{
        footer: (
          <p className="mt-3 text-xs">
            <BuiltWith />
          </p>
        ),
      }}
      {...baseOptions()}
    >
      {children}
    </DocsLayout>
  );
}
