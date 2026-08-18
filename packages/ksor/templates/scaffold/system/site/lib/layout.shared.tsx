import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { appName } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      // The record's name, set as the identifier it is — the same treatment
      // the home page gives it, so one thing looks like one thing. Truncated:
      // a 63-char name (the grammar's maximum) forced horizontal scroll on
      // mobile without it (found live, 2026-08-18).
      title: (
        <span className="max-w-[60vw] truncate font-mono tracking-tight sm:max-w-none">
          {appName}
        </span>
      ),
    },
  };
}
