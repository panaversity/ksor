import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { appName } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      // The record's name, set as the identifier it is — the same treatment
      // the home page gives it, so one thing looks like one thing.
      title: <span className="font-mono tracking-tight">{appName}</span>,
    },
  };
}
