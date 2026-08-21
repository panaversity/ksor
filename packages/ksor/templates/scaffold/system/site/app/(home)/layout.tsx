import { RecordShell } from "@/components/record-shell";

// The front door wears the record's own chrome — see components/record-shell.
// It used to wear `HomeLayout`, a separate navbar-only shell, which meant the
// first page of a system of record showed none of the record.
export default function Layout({ children }: LayoutProps<"/">) {
  return <RecordShell>{children}</RecordShell>;
}
