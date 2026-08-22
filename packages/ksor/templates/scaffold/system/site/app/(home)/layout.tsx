import { HomeLayout } from "fumadocs-ui/layouts/home";

import { baseOptions } from "@/lib/layout.shared";

// The front door stands ALONE: a navbar with the record's name, search and the
// theme switch, and nothing else. It wore the full docs chrome briefly
// (2026-08-22) so the sidebar was present from the first second; the owner's
// call is that a landing page should land — the sidebar belongs to the record's
// pages, and `Open the record` is the door to them.
export default function Layout({ children }: LayoutProps<"/">) {
  return <HomeLayout {...baseOptions()}>{children}</HomeLayout>;
}
