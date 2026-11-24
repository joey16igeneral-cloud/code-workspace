export interface SearchOptions {
  query: string;
  matchCase: boolean;
  wholeWord: boolean;
  regex: boolean;
  include: string;
}

export interface LineMatch {
  line: number;
  column: number;
  length: number;
  preview: string;
}

/** The pattern for a search, or an error message when the expression is invalid. */
export function buildPattern(
  options: Omit<SearchOptions, "include">,
): { pattern: RegExp } | { error: string } {
  let source = options.regex
    ? options.query
    : options.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (options.wholeWord) source = `(?<![\\w$])(?:${source})(?![\\w$])`;
  try {
    return { pattern: new RegExp(source, options.matchCase ? "gu" : "giu") };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Invalid expression",
    };
  }
}

/** Every match in a text, with 1-based line and column. Empty matches are skipped. */
export function findMatches(
  content: string,
  pattern: RegExp,
  limit: number,
): LineMatch[] {
  const found: LineMatch[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length && found.length < limit; i++) {
    const line = lines[i]!;
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) && found.length < limit) {
      if (match[0].length === 0) {
        pattern.lastIndex++;
        continue;
      }
      found.push({
        line: i + 1,
        column: match.index + 1,
        length: match[0].length,
        preview: line.length > 240 ? line.slice(Math.max(0, match.index - 60), match.index + 180) : line,
      });
    }
  }
  return found;
}

/** The text with every match replaced, line by line so matches never span lines, and how many were replaced. */
export function replaceMatches(
  content: string,
  pattern: RegExp,
  replacement: string,
  useGroups: boolean,
): { content: string; count: number } {
  let count = 0;
  const next = content
    .split("\n")
    .map((line) =>
      line.replace(pattern, (...args) => {
        const matched = args[0] as string;
        if (matched.length === 0) return matched;
        count++;
        if (!useGroups) return replacement;
        return matched.replace(
          new RegExp(pattern.source, pattern.flags.replace("g", "")),
          replacement,
        );
      }),
    )
    .join("\n");
  return { content: next, count };
}
