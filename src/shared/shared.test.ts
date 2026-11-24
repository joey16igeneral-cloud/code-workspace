import { describe, expect, it } from "vitest";
import { decodeTextFile } from "@/shared/importing";
import { normalizePath, parentPaths, pathFilter } from "@/shared/paths";
import { buildPattern, findMatches, replaceMatches } from "@/shared/search";

function pattern(query: string, extra: Partial<{ matchCase: boolean; wholeWord: boolean; regex: boolean }> = {}) {
  const built = buildPattern({ query, matchCase: false, wholeWord: false, regex: false, ...extra });
  if ("error" in built) throw new Error(built.error);
  return built.pattern;
}

describe("paths", () => {
  it("normalizes and refuses escapes", () => {
    expect(normalizePath(" /src//app.ts ")).toEqual({ path: "src/app.ts" });
    expect(normalizePath("a/../b")).toHaveProperty("error");
    expect(normalizePath("  ")).toHaveProperty("error");
  });
  it("lists parents", () => {
    expect(parentPaths("a/b/c.ts")).toEqual(["a", "a/b"]);
  });
  it("filters by include patterns", () => {
    const f = pathFilter("src/**, *.md");
    expect(f("src/a/b.ts")).toBe(true);
    expect(f("docs/x.md")).toBe(true);
    expect(f("docs/x.ts")).toBe(false);
    expect(pathFilter("")("anything")).toBe(true);
    expect(pathFilter("lib")("src/lib/a.ts")).toBe(true);
  });
});

describe("search", () => {
  it("honours case, whole word and regex", () => {
    expect(findMatches("Todo TODO todo", pattern("todo"), 10)).toHaveLength(3);
    expect(findMatches("Todo TODO todo", pattern("todo", { matchCase: true }), 10)).toHaveLength(1);
    expect(findMatches("line lines line.x", pattern("line", { wholeWord: true }), 10)).toHaveLength(2);
    expect(findMatches("a1 b2\nc3", pattern("[a-z]\\d", { regex: true }), 10).map((m) => m.line)).toEqual([1, 1, 2]);
  });
  it("reports an invalid expression", () => {
    expect(buildPattern({ query: "([", matchCase: false, wholeWord: false, regex: true })).toHaveProperty("error");
  });
  it("replaces with and without groups", () => {
    expect(replaceMatches("a TODO b TODO", pattern("TODO"), "$&!", false)).toEqual({ content: "a $&! b $&!", count: 2 });
    expect(replaceMatches("x=1", pattern("(\\w)=(\\d)", { regex: true }), "$2=$1", true).content).toBe("1=x");
  });
});

describe("import", () => {
  it("skips binary and large files", () => {
    expect(decodeTextFile(new TextEncoder().encode("hi"))).toEqual({ text: "hi" });
    expect(decodeTextFile(new Uint8Array([0x89, 0, 1]))).toEqual({ skipped: "binary" });
    expect(decodeTextFile(new Uint8Array(1024 * 1024 + 1).fill(97))).toEqual({ skipped: "too large" });
  });
});
