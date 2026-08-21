import { RecordShell } from "@/components/record-shell";

export default function Layout({ children }: LayoutProps<"/docs">) {
  return <RecordShell>{children}</RecordShell>;
}
