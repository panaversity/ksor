/**
 * DocItem/Content — wrap-only.
 *
 * The predecessor's wrapper mounted five things around the stock content: a
 * reading-progress bar, a reading-time estimate, an effective-dating notice, a
 * doc-page action toolbar, and a Full Text / Summary tab panel fed by its
 * summaries plugin. Four of the five read frontmatter keys or plugin data the
 * record does not have, so only the first crossed — README.md records the rest.
 *
 * Wrap-only, never a re-implementation: the original content renders untouched
 * through @theme-original, so a document's markup is Docusaurus's and this file
 * adds a sibling above it.
 */

import Content from "@theme-original/DocItem/Content";
import type { ComponentProps, ReactElement } from "react";

import ReadingProgress from "../../../components/ReadingProgress";

export default function ContentWrapper(props: ComponentProps<typeof Content>): ReactElement {
  return (
    <>
      <ReadingProgress />
      <Content {...props} />
    </>
  );
}
