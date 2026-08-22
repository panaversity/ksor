import { decideVisible, type AudienceModel } from "./audience-rule";
import { instanceFrontmatter } from "./shared";

/**
 * The audience model, declared in instance.md — the record says who its
 * readers are, and the build enforces it:
 *
 *     audiences:
 *       - public
 *       - internal
 *       - restricted
 *     default_visibility: public
 *
 * Ordered least- to most-restricted, so "build the internal site" means
 * "public and internal included" with no further configuration. A record
 * that declares no audiences has no model and publishes every document —
 * the behaviour of every instance written before this key existed.
 */
export type { AudienceModel };
export { decideVisible };

function unquote(raw: string): string {
  const trimmed = raw.trim();
  return /^(['"])(.*)\1$/.exec(trimmed)?.[2] ?? trimmed;
}

/** Every refusal this feature makes: a slug a pipeline can match, then the remedy. */
export function refuse(slug: string, what: string, why: string, fix: string): never {
  // The slug leads, so a pipeline can match on it, and the three lines below
  // it are the whole remedy — an operator never has to read this file.
  throw new Error(`${slug}: ${what}\n  why: ${why}\n  fix: ${fix}`);
}

function readAudienceModel(): AudienceModel | null {
  const block = instanceFrontmatter();
  // Top-level key only: `^` under /m cannot match an indented child.
  if (!/^audiences:/m.test(block)) return null;

  // The grammar mirrors the checker's exactly — CRLF-tolerant, list items at
  // ANY indent (YAML allows unindented block sequences), and a ` #` comment
  // ends an unquoted entry (all three found live 2026-08-18: records the
  // checker blessed either failed this build or silently lost a tier).
  const stripComment = (value: string): string =>
    /^["']/.test(value.trim()) ? value : value.replace(/\s+#.*$/, "");
  // A line scanner, not a block regex: a blank line among the items or a
  // comment on the key line broke the block capture and refused every build
  // of a checker-green record (review finding, 2026-08-19).
  const flow = /^audiences:[ \t]*\[(.*)\][ \t]*(?:#.*)?$/m.exec(block)?.[1];
  let items: string[] = [];
  if (flow !== undefined) {
    items = flow.split(",");
  } else {
    const lines = block.split("\n");
    const start = lines.findIndex((line) => /^audiences:[ \t]*(?:#.*)?$/.test(line));
    if (start !== -1) {
      for (const line of lines.slice(start + 1)) {
        if (line.trim() === "") continue;
        const item = /^[ \t]*-[ \t]+(.*)$/.exec(line);
        if (item === null) break;
        items.push(item[1] ?? "");
      }
    }
  }
  const audiences = items
    .map(stripComment)
    .map(unquote)
    .filter((value) => value !== "");

  // A declared-but-unreadable model must never read as "no model": that is
  // the one parse failure that publishes the whole record.
  if (audiences.length === 0) {
    refuse(
      "ksor-audiences-unreadable",
      "instance.md declares `audiences:` but no audience could be read from it",
      "an unreadable model reads as no model, and no model publishes every document — the one parse failure that leaks",
      "write the audiences as a list, least-restricted first:\n    audiences:\n      - public\n      - internal",
    );
  }

  // The staging never depends on the checker having run: a
  // most-restrictive-first model would make plain `pnpm build` publish
  // every restricted document with no label (review finding, 2026-08-18).
  if (audiences[0] !== "public") {
    refuse(
      "ksor-audiences-misordered",
      `audiences: must start with public (it starts with "${audiences[0]}")`,
      "the list is ordered least- to most-restricted, and an unset KSOR_AUDIENCE builds the FIRST entry — any other first entry makes the default build the leak",
      "reorder audiences: with public first",
    );
  }
  if (new Set(audiences).size !== audiences.length) {
    refuse(
      "ksor-audiences-duplicate",
      `audiences: declares a tier twice (${audiences.join(", ")})`,
      "a duplicated tier has two positions in the ordering, and which one a build honours is undefined",
      "remove the duplicate entry",
    );
  }
  const defaultVisibility = unquote(
    stripComment(/^default_visibility:[ \t]*(.*)$/m.exec(block)?.[1] ?? ""),
  );
  if (defaultVisibility === "") {
    refuse(
      "ksor-default-visibility-missing",
      "instance.md declares `audiences:` without `default_visibility:`",
      "there is no safe guess: assuming the widest tier leaks on the first document that forgets the key, assuming the narrowest hides the record",
      `add the tier a document without a visibility: key belongs to, e.g. default_visibility: ${audiences[0]}`,
    );
  }
  if (!audiences.includes(defaultVisibility)) {
    refuse(
      "ksor-default-visibility-undeclared",
      `default_visibility: ${defaultVisibility} is not one of the declared audiences (${audiences.join(", ")})`,
      "every document without a visibility: key belongs to this tier — a tier no build understands is a record no build can publish honestly",
      `set default_visibility: to one of ${audiences.join(", ")}, or declare ${defaultVisibility} in audiences:`,
    );
  }

  return { audiences, defaultVisibility };
}

/** The declared model, or null when this record declares none. */
export const audienceModel: AudienceModel | null = readAudienceModel();

function resolveBuildAudience(model: AudienceModel | null): string {
  const requested = process.env.KSOR_AUDIENCE?.trim() ?? "";
  if (model === null) {
    if (requested !== "") {
      refuse(
        "ksor-audiences-not-declared",
        `KSOR_AUDIENCE="${requested}" was requested, but instance.md declares no audiences`,
        "this build would publish every document — a build that cannot filter must never look like one that did",
        "declare the model in instance.md (audiences: + default_visibility:), or build without KSOR_AUDIENCE",
      );
    }
    return "";
  }
  // Unset means the least-restricted tier: the only default that cannot leak,
  // so `pnpm build` keeps publishing the public site out of the box.
  if (requested === "") return model.audiences[0] as string;
  if (!model.audiences.includes(requested)) {
    refuse(
      "ksor-audience-undeclared",
      `KSOR_AUDIENCE="${requested}" is not an audience this record declares (${model.audiences.join(", ")})`,
      "an unrecognized audience could only be honoured by publishing more than the record names — so it refuses instead of widening",
      `build with one of ${model.audiences.join(", ")}, or add "${requested}" to instance.md's audiences: list`,
    );
  }
  return requested;
}

/** The audience this build publishes for; "" when the record has no model. */
export const buildAudience: string = resolveBuildAudience(audienceModel);

/** Whether a document of this visibility belongs in THIS build. */
export function visibleInBuild(visibility: string | null): boolean {
  return decideVisible(audienceModel, buildAudience, visibility);
}

/**
 * What a non-public build calls itself, in the site chrome — so a leaked
 * screenshot of an internal site says which audience it was built for. The
 * public build (the least-restricted tier) says nothing new.
 */
export const audienceNotice: string | null =
  audienceModel === null || buildAudience === audienceModel.audiences[0]
    ? null
    : `${buildAudience} build — not for publication`;
