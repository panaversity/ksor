/**
 * Turning a presentation's share link into the url that can be framed.
 *
 * Every deck host publishes two different urls — the one you get from "Share"
 * and the one that works in an `<iframe>` — and an author will paste the first.
 * Deriving the second is a small rule per provider, and getting it wrong is
 * invisible until someone opens the page, so it is a table with tests rather
 * than a regex written once.
 *
 * A LEAF: no imports. `slides.ts` carries zod and cannot enter the unit tier.
 */

/**
 * Only https. A browser blocks an http frame inside a secure page as mixed
 * content, so an http embed publishes a panel that silently never loads —
 * which is worse than refusing it, because nothing goes red.
 */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * One provider's rule: which hosts it owns, and how a share url becomes an
 * embed url. Extend this rather than special-casing at a call site.
 */
interface Provider {
  readonly label: string;
  readonly hosts: readonly string[];
  readonly embed: (url: URL) => string | null;
}

const PROVIDERS: readonly Provider[] = [
  {
    label: "Google Slides",
    hosts: ["docs.google.com"],
    // /presentation/d/<id>/edit  ->  /presentation/d/<id>/embed
    embed: (url) => {
      const match = /^\/presentation\/d\/([^/]+)/.exec(url.pathname);
      if (match === null) return null;
      return `https://docs.google.com/presentation/d/${match[1]}/embed?start=false&loop=false&delayms=3000`;
    },
  },
  {
    label: "Canva",
    hosts: ["www.canva.com", "canva.com"],
    // /design/<id>/<token>/view  ->  same, with ?embed
    embed: (url) => {
      const match = /^\/design\/([^/]+)\/([^/]+)/.exec(url.pathname);
      if (match === null) return null;
      return `https://www.canva.com/design/${match[1]}/${match[2]}/view?embed`;
    },
  },
  {
    label: "SlideShare",
    hosts: ["www.slideshare.net", "slideshare.net"],
    // Only an explicit /slideshow/embed_code/ url is framable.
    embed: (url) => (url.pathname.startsWith("/slideshow/embed_code/") ? url.toString() : null),
  },
];

/** The provider's own name for a url, or null when it is not one we know. */
export function providerOf(value: string): string | null {
  try {
    const url = new URL(value);
    return PROVIDERS.find((p) => p.hosts.includes(url.hostname))?.label ?? null;
  } catch {
    return null;
  }
}

/**
 * The url to put in the frame, or null when this one cannot be derived.
 *
 * Null is an ordinary answer, not an error: the deck still renders as a link,
 * and an author who wants a frame supplies `embed:` explicitly.
 */
export function embedUrlFor(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const provider = PROVIDERS.find((p) => p.hosts.includes(url.hostname));
    return provider?.embed(url) ?? null;
  } catch {
    return null;
  }
}

/** Every provider whose share url this understands, for docs and errors. */
export const KNOWN_PROVIDERS: readonly string[] = PROVIDERS.map((p) => p.label);
