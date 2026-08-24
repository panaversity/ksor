import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

import { SignIn } from "@/components/sign-in";
import { appTitle } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      // The record's display title (instance.md's H1), not the machine slug.
      // Truncated: a long title forced horizontal scroll on mobile without it
      // (found live, 2026-08-18).
      title: (
        <span className="max-w-[60vw] truncate font-display text-[0.9375rem] font-semibold tracking-[-0.005em] sm:max-w-none">
          {appTitle}
        </span>
      ),
    },
    // `secondary` puts it at the navbar's trailing edge, beside the theme
    // toggle. SignIn renders null when no issuer is configured, so a record
    // that does not offer sign-in shows nothing rather than an empty slot.
    links: [{ type: "custom", secondary: true, children: <SignIn /> }],
  };
}
