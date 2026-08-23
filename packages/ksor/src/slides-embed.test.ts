/**
 * Share url -> embed url, per provider.
 *
 * A table, because getting this wrong is invisible until somebody opens the
 * page: a bad embed url renders an empty frame rather than an error.
 */
import { describe, expect, it } from "vitest";

import {
  KNOWN_PROVIDERS,
  embedUrlFor,
  isHttpsUrl,
  providerOf,
} from "../templates/scaffold/system/site/lib/slides-embed.js";

const GOOGLE_SHARE =
  "https://docs.google.com/presentation/d/1su8e_lthDL_8zZ_KG9pYmAoHMZnQjThvvAzouu59Otk/edit?usp=sharing";

describe("Google Slides", () => {
  it("turns a share link into the embed form the provider documents", () => {
    expect(embedUrlFor(GOOGLE_SHARE)).toBe(
      "https://docs.google.com/presentation/d/1su8e_lthDL_8zZ_KG9pYmAoHMZnQjThvvAzouu59Otk/embed?start=false&loop=false&delayms=3000",
    );
  });

  it("keeps the id exactly — a truncated id is a frame that loads nothing", () => {
    expect(embedUrlFor(GOOGLE_SHARE)).toContain("1su8e_lthDL_8zZ_KG9pYmAoHMZnQjThvvAzouu59Otk");
  });

  it("names the provider", () => {
    expect(providerOf(GOOGLE_SHARE)).toBe("Google Slides");
  });

  it("a google url that is not a presentation has no embed form", () => {
    expect(embedUrlFor("https://docs.google.com/document/d/abc/edit")).toBeNull();
  });
});

describe("Canva", () => {
  it("appends the embed flag to a view link", () => {
    expect(embedUrlFor("https://www.canva.com/design/DAF123/xyz-token/view")).toBe(
      "https://www.canva.com/design/DAF123/xyz-token/view?embed",
    );
  });
});

describe("an unknown host is not an error", () => {
  it("returns null rather than guessing a url that would frame nothing", () => {
    expect(embedUrlFor("https://slides.example.com/deck/1")).toBeNull();
    expect(providerOf("https://slides.example.com/deck/1")).toBeNull();
  });
});

describe("http is refused everywhere", () => {
  it("isHttpsUrl says so", () => {
    expect(isHttpsUrl("http://docs.google.com/presentation/d/a/edit")).toBe(false);
    expect(isHttpsUrl(GOOGLE_SHARE)).toBe(true);
  });

  it("and no embed is derived from one, so a mixed-content frame cannot ship", () => {
    // A browser blocks this silently on a secure page: the frame stays blank
    // and nothing errors, which is exactly the failure a test has to prevent.
    expect(embedUrlFor("http://docs.google.com/presentation/d/1su8e_lthDL/edit")).toBeNull();
  });

  it("garbage is not a url", () => {
    for (const junk of ["", "not a url", "javascript:alert(1)", "//docs.google.com/x"]) {
      expect(isHttpsUrl(junk), junk).toBe(false);
      expect(embedUrlFor(junk), junk).toBeNull();
    }
  });
});

describe("the provider list is usable in docs and errors", () => {
  it("names every provider exactly once", () => {
    expect(KNOWN_PROVIDERS.length).toBeGreaterThan(0);
    expect(new Set(KNOWN_PROVIDERS).size).toBe(KNOWN_PROVIDERS.length);
  });
});
