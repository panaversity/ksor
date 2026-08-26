/**
 * The site's route derivation from a regenerated index, tested where it is
 * SHIPPED: the module is pure, so the rule that turns OKF §8 bullets into the
 * folder listing and the one reading order runs here without a site install.
 */
import { describe, expect, it } from "vitest";

import { parseIndex } from "../../content/src/record/index-file.js";
import {
  conceptRoute,
  dirOfRoute,
  folderRoute,
  listingOf,
  readingOrder,
} from "../templates/scaffold/system/site/lib/index-routes.js";

const ROOT = parseIndex(
  '---\nokf_version: "0.2"\n---\n\n# Acme\n\n* [Purchase approval](purchase-approval.md) - Who may approve.\n* [Policies](policies/)\n* [Guides](guides/)\n',
);
const POLICIES = parseIndex(
  "# Policies\n\n* [Travel](travel.md) - On the road.\n* [Archive](archive/)\n",
);
const ARCHIVE = parseIndex("# Archive\n\n* [Old travel](old-travel.md) - Retired.\n");

describe("routes from an index", () => {
  it("maps a concept bullet to its page and a folder bullet to its folder page", () => {
    expect(listingOf("", ROOT)).toEqual([
      {
        kind: "concept",
        title: "Purchase approval",
        url: "/docs/purchase-approval",
        path: "purchase-approval.md",
        description: "Who may approve.",
      },
      {
        kind: "folder",
        title: "Policies",
        url: "/docs/policies",
        path: "policies",
        description: null,
      },
      { kind: "folder", title: "Guides", url: "/docs/guides", path: "guides", description: null },
    ]);
    expect(listingOf("policies", POLICIES)).toEqual([
      {
        kind: "concept",
        title: "Travel",
        url: "/docs/policies/travel",
        path: "policies/travel.md",
        description: "On the road.",
      },
      {
        kind: "folder",
        title: "Archive",
        url: "/docs/policies/archive",
        path: "policies/archive",
        description: null,
      },
    ]);
  });

  it("ignores a bullet that is neither a concept nor a folder", () => {
    expect(listingOf("", parseIndex("# X\n\n* [Elsewhere](https://example.com)\n"))).toEqual([]);
  });

  it("a href carrying a bare % is the file it names, not a build-killing URIError", () => {
    expect(listingOf("", parseIndex("# X\n\n* [Fifty off](50%-off.md) - Half price.\n"))).toEqual([
      {
        kind: "concept",
        title: "Fifty off",
        url: "/docs/50%-off",
        path: "50%-off.md",
        description: "Half price.",
      },
    ]);
  });

  it("walks the indexes depth-first for the one reading order", () => {
    const indexes = new Map([
      ["", ROOT],
      ["policies", POLICIES],
      ["policies/archive", ARCHIVE],
    ]);
    expect(readingOrder(indexes)).toEqual([
      "/docs/purchase-approval",
      "/docs/policies",
      "/docs/policies/travel",
      "/docs/policies/archive",
      "/docs/policies/archive/old-travel",
      "/docs/guides",
    ]);
  });

  it("names the root and nested folders, and reads a route back to its directory", () => {
    expect(folderRoute("")).toBe("/docs");
    expect(folderRoute("a/b")).toBe("/docs/a/b");
    expect(conceptRoute("a/b.md")).toBe("/docs/a/b");
    expect(dirOfRoute("/docs")).toBe("");
    expect(dirOfRoute("/docs/a/b/")).toBe("a/b");
    expect(dirOfRoute("/llms.txt")).toBeNull();
  });
});
