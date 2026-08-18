import { getSortedPageTree } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions } from "@/lib/layout.shared";

export default function Layout({ children }: LayoutProps<"/docs">) {
  return (
    <DocsLayout tree={getSortedPageTree()} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}
