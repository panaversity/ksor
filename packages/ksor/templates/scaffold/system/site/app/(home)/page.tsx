import Link from "next/link";
import { appName } from "@/lib/shared";
import { getSortedPages } from "@/lib/source";

export default function HomePage() {
  // The first document in sidebar order — never a hardcoded path, so deleting
  // the example the scaffold ships cannot leave a link pointing at nothing.
  const [first] = getSortedPages();

  return (
    <main className="flex flex-col justify-center text-center flex-1">
      <h1 className="text-2xl font-bold mb-4">{appName}</h1>
      {first ? (
        <p>
          <Link href={first.url} className="font-medium underline">
            Browse the knowledge
          </Link>
        </p>
      ) : (
        <p className="text-fd-muted-foreground">
          the record is empty — add a document to <code>knowledge/</code>
        </p>
      )}
    </main>
  );
}
