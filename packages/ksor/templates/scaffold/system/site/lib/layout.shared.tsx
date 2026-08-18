import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { appTitle } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      // The record's display title (instance.md's H1), not the machine slug.
      // Truncated: a long title forced horizontal scroll on mobile without it
      // (found live, 2026-08-18).
      title: (
        <span className="max-w-[60vw] truncate font-medium tracking-tight sm:max-w-none">
          {appTitle}
        </span>
      ),
    },
  };
}
