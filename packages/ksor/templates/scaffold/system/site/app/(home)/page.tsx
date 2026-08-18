import Link from "next/link";
import { appName } from "@/lib/shared";

export default function HomePage() {
  return (
    <main className="flex flex-col justify-center text-center flex-1">
      <h1 className="text-2xl font-bold mb-4">{appName}</h1>
      <p>
        <Link href="/docs/example" className="font-medium underline">
          Browse the knowledge
        </Link>
      </p>
    </main>
  );
}
