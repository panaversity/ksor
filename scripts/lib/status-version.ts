/**
 * The one sentence in `docs/status.md` that names the published package, and
 * the one grammar of version it may name.
 *
 * `scripts/sync-status-version.mjs` writes it inside `pnpm run version`; the
 * docs-truth suite (`packages/ksor/src/docs-truth.integration.test.ts`) reads
 * it back with the same three-field digit grammar and holds it equal to
 * `packages/ksor/package.json`. A package cannot import `scripts/`, so the two
 * regexes are kept in step by that suite refusing anything this module would
 * not write, rather than by a shared import.
 */

/** A release: three dotted numbers and nothing after them. */
export const RELEASE_VERSION: RegExp = /^[0-9]+\.[0-9]+\.[0-9]+$/;

/** The published-package sentence, with the version as its second group. */
export const PUBLISHED_SENTENCE: RegExp =
  /(`@panaversity\/ksor`\s+\*\*)([0-9]+\.[0-9]+\.[0-9]+)(\*\*\s+on npm)/;

export type StatusVersionSync =
  | { readonly kind: "refused"; readonly slug: string; readonly message: string }
  | { readonly kind: "unchanged"; readonly version: string }
  | {
      readonly kind: "rewritten";
      readonly from: string;
      readonly to: string;
      readonly text: string;
    };

/**
 * Point the sentence at `version`, or say why it must not be.
 *
 * A prerelease is refused BY NAME rather than written: the sentence names what
 * a plain `npm install` resolves, and a changesets snapshot
 * (`0.0.1-dev-20260818…`) publishes under its own dist-tag and never is.
 * Writing one there would also break the docs-truth assertion, which reads
 * the sentence with the release grammar and would find no version at all.
 */
export function syncStatusVersion(status: string, version: string): StatusVersionSync {
  if (!RELEASE_VERSION.test(version)) {
    return {
      kind: "refused",
      slug: "ksor-status-version-prerelease",
      message:
        `ksor-status-version-prerelease: packages/ksor/package.json is at ${version}, which is not a release.\n` +
        "  why: docs/status.md names the version a plain `npm install` resolves. A snapshot or\n" +
        "       prerelease publishes under its own tag and never is that version, so the sentence\n" +
        "       must keep naming the last release\n" +
        "  fix: publish a snapshot without `pnpm run version` —\n" +
        "         changeset version --snapshot <tag> && changeset publish --tag <tag>\n" +
        "       — or version a release, which is what `pnpm run version` is for",
    };
  }
  const found = PUBLISHED_SENTENCE.exec(status);
  if (found === null) {
    return {
      kind: "refused",
      slug: "ksor-status-version-sentence-missing",
      message:
        "ksor-status-version-sentence-missing: docs/status.md has no `@panaversity/ksor` **x.y.z** on npm sentence.\n" +
        "  why: docs/status.md is the authority on what is built, and the release gate reads that\n" +
        "       exact sentence to check it against packages/ksor/package.json\n" +
        "  fix: restore the sentence, or update scripts/lib/status-version.ts and the docs-truth\n" +
        "       assertion together",
    };
  }
  const from = found[2] ?? "";
  if (from === version) return { kind: "unchanged", version };
  return {
    kind: "rewritten",
    from,
    to: version,
    text: status.replace(PUBLISHED_SENTENCE, `$1${version}$3`),
  };
}
