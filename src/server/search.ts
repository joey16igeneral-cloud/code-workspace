import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { entries } from "@/db/schema";
import { UserError, projectFiles } from "@/server/entries";
import { projectId, requireProject } from "@/server/projects";
import { pathFilter } from "@/shared/paths";
import { buildPattern, findMatches, replaceMatches, type LineMatch } from "@/shared/search";

const MAX_RESULTS = 2000;

const options = {
  projectId,
  query: z.string().min(1).max(1000),
  matchCase: z.boolean(),
  wholeWord: z.boolean(),
  regex: z.boolean(),
  include: z.string().max(500),
};

export const searchInput = z.object(options).strict();
export const replaceInput = z
  .object({ ...options, replacement: z.string().max(10000), path: z.string().max(600).optional() })
  .strict();

export type SearchResponse =
  | { error: string }
  | { files: { id: string; path: string; matches: LineMatch[] }[]; total: number; truncated: boolean };

export async function searchProject(userId: string, input: z.infer<typeof searchInput>): Promise<SearchResponse> {
  await requireProject(userId, input.projectId);
  const built = buildPattern(input);
  if ("error" in built) return { error: built.error };
  const include = pathFilter(input.include);
  const files: { id: string; path: string; matches: LineMatch[] }[] = [];
  let total = 0;
  for (const file of await projectFiles(input.projectId)) {
    if (!include(file.path)) continue;
    const matches = findMatches(file.content, built.pattern, MAX_RESULTS - total);
    if (matches.length === 0) continue;
    files.push({ id: file.id, path: file.path, matches });
    total += matches.length;
    if (total >= MAX_RESULTS) return { files, total, truncated: true };
  }
  return { files, total, truncated: false };
}

/** Replaces every match, in one file or all of them, in one batch. */
export async function replaceInProject(userId: string, input: z.infer<typeof replaceInput>) {
  await requireProject(userId, input.projectId);
  const built = buildPattern(input);
  if ("error" in built) throw new UserError(built.error);
  const include = pathFilter(input.include);
  const now = Date.now();
  const changes: { id: string; path: string; version: number; content: string }[] = [];
  let replaced = 0;
  for (const file of await projectFiles(input.projectId)) {
    if (!include(file.path) || (input.path !== undefined && file.path !== input.path)) continue;
    const result = replaceMatches(file.content, built.pattern, input.replacement, input.regex);
    if (result.count === 0) continue;
    replaced += result.count;
    changes.push({ id: file.id, path: file.path, version: file.version + 1, content: result.content });
  }
  if (changes.length > 0) {
    const statements = changes.map((c) =>
      db
        .update(entries)
        .set({ content: c.content, size: new TextEncoder().encode(c.content).length, version: c.version, updatedAt: now })
        .where(and(eq(entries.id, c.id), eq(entries.projectId, input.projectId), eq(entries.version, c.version - 1))),
    );
    await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
  }
  return { replaced, files: changes.map(({ id, path, version, content }) => ({ id, path, version, content })) };
}
