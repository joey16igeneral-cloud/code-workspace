export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_ENTRIES = 2000;

/** A clean relative path ("src/app.ts"), or an error message. */
export function normalizePath(
  input: string,
): { path: string } | { error: string } {
  const parts = input
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part !== "" && part !== ".");
  if (parts.length === 0) return { error: "Enter a name" };
  if (parts.some((part) => part === "..")) {
    return { error: "A path can't contain .." };
  }
  const path = parts.join("/");
  if (path.length > 512) return { error: "That path is too long" };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(path)) return { error: "That name has a control character" };
  return { path };
}

/** "a/b/c.ts" → ["a", "a/b"]. */
export function parentPaths(path: string): string[] {
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function dirName(path: string): string {
  const at = path.lastIndexOf("/");
  return at === -1 ? "" : path.slice(0, at);
}

export function isInside(path: string, folder: string): boolean {
  return path.startsWith(`${folder}/`);
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * A filter from comma-separated patterns: "src/**", "*.ts", "docs".
 * A pattern without wildcards matches a path containing it.
 */
export function pathFilter(include: string): (path: string) => boolean {
  const patterns = include
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (patterns.length === 0) return () => true;
  const tests = patterns.map((pattern) => {
    if (!/[*?]/.test(pattern)) return (path: string) => path.includes(pattern);
    const re = globToRegExp(pattern);
    const matchName = !pattern.includes("/");
    return (path: string) =>
      re.test(path) || (matchName && re.test(baseName(path)));
  });
  return (path) => tests.some((test) => test(path));
}

function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          out += "(?:.*/)?";
        } else {
          out += ".*";
        }
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}
