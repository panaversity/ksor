"use client";

/**
 * Where the issuer sends the reader back.
 *
 * A PAGE, not a route handler. Under `output: "export"` a route handler cannot
 * share a segment with a page, and more to the point there is no server to run
 * one — the whole exchange happens in the browser, which is what lets a static
 * site be an OAuth client at all.
 */

import { useEffect, useState } from "react";

import { completeSignIn } from "@/lib/auth/flow";

export default function CallbackPage(): React.ReactElement {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await completeSignIn(new URLSearchParams(window.location.search));
      if (cancelled) return;
      if (result.ok) {
        // replace(), not assign(): the callback URL carries a spent
        // authorization code, and leaving it in history means Back re-runs a
        // flow that can only fail the second time.
        window.location.replace(result.returnTo || "/");
        return;
      }
      setError(result.reason);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-3 px-6 text-center">
      {error === null ? (
        <p className="text-muted-foreground text-sm">Signing you in…</p>
      ) : (
        <>
          <h1 className="text-lg font-semibold">Sign-in did not complete</h1>
          <p className="text-muted-foreground text-sm">{error}</p>
          <a className="text-sm underline underline-offset-4" href="/">
            Back to the record
          </a>
        </>
      )}
    </main>
  );
}
