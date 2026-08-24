"use client";

/**
 * The navbar's sign-in control.
 *
 * Renders NOTHING when this record does not configure an issuer, so a scaffold
 * that never sets one looks exactly as it does today — no placeholder, no
 * disabled button, no hint that a feature is missing.
 *
 * What it does NOT do, said here because a sign-in control implies it: gate
 * anything. The record's pages are static files the host serves to whoever
 * asks. This names a reader; it does not decide what they may read.
 */

import { LogIn, LogOut, User } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authConfig } from "@/lib/auth/config";
import { beginSignIn } from "@/lib/auth/flow";
import { clearSession, readSession, type Session } from "@/lib/auth/session";

export function SignIn(): React.ReactElement | null {
  // Read AFTER mount, never during render: the session lives in sessionStorage,
  // which the prerender has no access to. Reading it during render would make
  // the server-rendered HTML and the first client render disagree, and React
  // would blow the tree away with a hydration error.
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(readSession());
    setReady(true);
  }, []);

  if (authConfig === null) return null;

  // Hold the space until mounted, so the navbar does not jump when the session
  // resolves one frame later.
  if (!ready) return <div className="h-8 w-20" aria-hidden />;

  if (session === null) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void beginSignIn(window.location.pathname + window.location.search);
        }}
      >
        <LogIn className="size-4" aria-hidden />
        Sign in
      </Button>
    );
  }

  const label = session.name ?? session.email ?? "Signed in";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Signed in as ${label}`}>
          <User className="size-4" aria-hidden />
          <span className="max-w-32 truncate">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium">{label}</span>
          {session.email !== null && session.email !== label ? (
            <span className="text-muted-foreground block truncate text-xs">{session.email}</span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            clearSession();
            setSession(null);
          }}
        >
          <LogOut className="size-4" aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
