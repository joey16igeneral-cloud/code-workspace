import { baseName } from "@/shared/paths";

export interface Entry {
  id: string;
  path: string;
  kind: "file" | "folder";
  size: number;
}

export interface TreeNode extends Entry {
  name: string;
  children: TreeNode[];
}

/** Nests a project's flat entries: folders first, then names in order. */
export function buildTree(entries: Entry[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  for (const entry of entries) nodes.set(entry.path, { ...entry, name: baseName(entry.path), children: [] });
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const at = node.path.lastIndexOf("/");
    const parent = at === -1 ? null : nodes.get(node.path.slice(0, at));
    (parent ? parent.children : roots).push(node);
  }
  const sort = (list: TreeNode[]) => {
    list.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1,
    );
    for (const node of list) sort(node.children);
  };
  sort(roots);
  return roots;
}

/** Ranks paths for the file picker: every typed character in order, name matches first. */
export function filterPaths<T extends { path: string }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, 50);
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const path = item.path.toLowerCase();
    let at = 0;
    for (const char of q) {
      at = path.indexOf(char, at);
      if (at === -1) break;
      at++;
    }
    if (at === -1) continue;
    const name = baseName(path);
    const score = name.startsWith(q) ? 0 : name.includes(q) ? 1 : path.includes(q) ? 2 : 3;
    scored.push({ item, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.item.path.localeCompare(b.item.path))
    .slice(0, 50)
    .map((s) => s.item);
}
