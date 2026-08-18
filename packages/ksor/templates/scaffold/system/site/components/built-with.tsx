import type { ReactElement } from "react";

/**
 * The maker's mark. Attribution, not a dependency: the record and this site
 * are yours (MIT-0) — delete this component and both keep working.
 */
export function BuiltWith(): ReactElement {
  return (
    <a
      href="https://github.com/panaversity/ksor"
      target="_blank"
      rel="noreferrer"
      className="text-fd-muted-foreground underline-offset-4 transition-colors hover:text-fd-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
    >
      Built with KSoR
    </a>
  );
}
