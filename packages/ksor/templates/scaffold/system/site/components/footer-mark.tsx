import type { ReactElement } from "react";
import { BuiltWith } from "@/components/built-with";
import { audienceNotice } from "@/lib/audience";

/**
 * The foot of the site chrome: who built it, and — on any build below the
 * public tier — which audience that build was for, so a screenshot of an
 * internal site names itself and a page that escapes carries its own
 * warning.
 *
 * The public build renders the attribution ALONE, exactly as a site with no
 * audience model does: the one build with nothing to disclose must not even
 * carry the shape of a disclosure.
 */
export function FooterMark(): ReactElement {
  const notice = audienceNotice();
  if (notice === null) return <BuiltWith />;
  return (
    <>
      <BuiltWith /> &middot; <span className="text-fd-muted-foreground">{notice}</span>
    </>
  );
}
