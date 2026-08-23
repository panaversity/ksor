/**
 * Reading time is computed at build time from the document's markdown, so it
 * lands in the server-rendered HTML rather than being measured in the browser
 * after paint the way the predecessor did it.
 */

import { describe, expect, it } from "vitest";

import {
  WORDS_PER_MINUTE,
  readingMinutes,
} from "../templates/scaffold/system/site/lib/reading-time.js";

/** `n` plain words of prose. */
const words = (n: number): string => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("readingMinutes", () => {
  it("divides words by the reading rate", () => {
    expect(readingMinutes(words(WORDS_PER_MINUTE))).toBe(1);
    expect(readingMinutes(words(WORDS_PER_MINUTE * 6))).toBe(6);
  });

  it("rounds to the nearest minute", () => {
    expect(readingMinutes(words(260)), "1.3 minutes rounds down").toBe(1);
    expect(readingMinutes(words(340)), "1.7 minutes rounds up").toBe(2);
  });

  it("never reports zero — a document that exists takes some time to read", () => {
    expect(readingMinutes(words(3))).toBe(1);
    expect(readingMinutes("")).toBe(1);
    expect(readingMinutes("   \n\n  ")).toBe(1);
  });

  /**
   * The case that makes the number wrong on a technical record: a page with a
   * short paragraph and a long code block is not a twenty-minute read.
   */
  it("does not count fenced code as prose", () => {
    const prose = words(200);
    const code = ["```ts", words(2000), "```"].join("\n");
    expect(readingMinutes(`${prose}\n\n${code}`), "code inflated the estimate").toBe(1);
  });

  it("handles tilde fences and indented fences too", () => {
    const prose = words(200);
    expect(readingMinutes(`${prose}\n\n~~~\n${words(2000)}\n~~~\n`)).toBe(1);
    expect(readingMinutes(`${prose}\n\n   \`\`\`\n${words(2000)}\n   \`\`\`\n`)).toBe(1);
  });

  it("ignores frontmatter, which is metadata and never shown", () => {
    const front = `---\ntitle: ${words(400)}\nstatus: approved\n---\n\n`;
    expect(readingMinutes(front + words(200))).toBe(1);
  });

  it("does not count punctuation-only tokens as words", () => {
    expect(readingMinutes(["#", "-", "|", "---", "*", ">"].join("\n"))).toBe(1);
  });

  it("is unaffected by line endings", () => {
    const text = words(600);
    expect(readingMinutes(text.replaceAll(" ", "\r\n"))).toBe(readingMinutes(text));
  });
});
