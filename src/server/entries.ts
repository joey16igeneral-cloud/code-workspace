import { and, count, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { entries, projects } from "@/db/schema";
import { NotFoundError, projectId, requireProject } from "@/server/projects";
import {
  MAX_ENTRIES,
  MAX_FILE_BYTES,
  byteLength,
  dirName,
  isInside,
  normalizePath,
  parentPaths,
} from "@/shared/paths";

export class UserError extends Error {}

const entryId = z.string().uuid();

function cleanPath(input: string): string {
  const result = normalizePath(input);
  if ("error" in result) throw new UserError(result.error);
  return result.path;
}

/** An entry when its project belongs to this user, else null. */
export async function ownedEntry(userId: string, id: string) {
  if (!entryId.safeParse(id).success) return null;
  const [row] = await db
    .select({
      id: entries.id,
      projectId: entries.projectId,
      path: entries.path,
      kind: entries.kind,
      content: entries.content,
      version: entries.version,
    })
    .from(entries)
    .innerJoin(projects, eq(projects.id, entries.projectId))
    .where(and(eq(entries.id, id), eq(projects.ownerId, userId)));
  return row ?? null;
}

async function requireEntry(userId: string, id: string) {
  const entry = await ownedEntry(userId, id);
  if (!entry) throw new NotFoundError("File");
  return entry;
}

async function existing(project: string, paths: string[]) {
  if (paths.length === 0) return new Map<string, "file" | "folder">();
  const rows = await db
    .select({ path: entries.path, kind: entries.kind })
    .from(entries)
    .where(and(eq(entries.projectId, project), inArray(entries.path, paths)));
  return new Map(rows.map((r) => [r.path, r.kind]));
}

async function entryCount(project: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(entries)
    .where(eq(entries.projectId, project));
  return row?.n ?? 0;
}

/** The parent folders of `path` that don't exist yet; refuses a parent that is a file. */
async function missingParents(project: string, path: string) {
  const parents = parentPaths(path);
  const found = await existing(project, parents);
  for (const parent of parents) {
    if (found.get(parent) === "file") {
      throw new UserError(`${parent} is a file, not a folder`);
    }
  }
  return parents.filter((p) => !found.has(p));
}

function folderRow(project: string, path: string, now: number) {
  return { id: crypto.randomUUID(), projectId: project, path, kind: "folder" as const, updatedAt: now };
}

export const createEntryInput = z
  .object({ projectId, path: z.string().max(600), kind: z.enum(["file", "folder"]) })
  .strict();

export async function createEntry(userId: string, input: z.infer<typeof createEntryInput>) {
  await requireProject(userId, input.projectId);
  const path = cleanPath(input.path);
  if ((await existing(input.projectId, [path])).size > 0) {
    throw new UserError(`${path} already exists`);
  }
  const parents = await missingParents(input.projectId, path);
  if ((await entryCount(input.projectId)) + parents.length + 1 > MAX_ENTRIES) {
    throw new UserError(`A project holds at most ${MAX_ENTRIES} files and folders`);
  }
  const now = Date.now();
  const row = { id: crypto.randomUUID(), projectId: input.projectId, path, kind: input.kind, updatedAt: now };
  await db.batch([
    db.insert(entries).values(row),
    ...parents.map((p) => db.insert(entries).values(folderRow(input.projectId, p, now))),
  ]);
  return { id: row.id, path, kind: input.kind };
}

export async function readFile(userId: string, id: string) {
  const entry = await requireEntry(userId, id);
  if (entry.kind !== "file") throw new UserError("That is a folder");
  return { id: entry.id, path: entry.path, content: entry.content, version: entry.version };
}

export const saveFileInput = z
  .object({ id: entryId, content: z.string(), version: z.number().int() })
  .strict();

export type SaveResult = { ok: true; version: number } | { ok: false; conflict: true };

/** Stores the text only when it was edited from the latest version. */
export async function saveFile(userId: string, input: z.infer<typeof saveFileInput>): Promise<SaveResult> {
  const size = byteLength(input.content);
  if (size > MAX_FILE_BYTES) throw new UserError("A file can be at most 1 MB");
  const [row] = await db
    .update(entries)
    .set({ content: input.content, size, version: sql`${entries.version} + 1`, updatedAt: Date.now() })
    .where(
      and(
        eq(entries.id, input.id),
        eq(entries.kind, "file"),
        eq(entries.version, input.version),
        inArray(entries.projectId, db.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, userId))),
      ),
    )
    .returning({ version: entries.version });
  if (row) return { ok: true, version: row.version };
  await requireEntry(userId, input.id);
  return { ok: false, conflict: true };
}

export const moveEntryInput = z.object({ id: entryId, path: z.string().max(600) }).strict();

/** Renames or moves an entry; a folder takes everything inside it along. */
export async function moveEntry(userId: string, input: z.infer<typeof moveEntryInput>) {
  const entry = await requireEntry(userId, input.id);
  const to = cleanPath(input.path);
  const from = entry.path;
  if (to === from) return { from, to };
  if (entry.kind === "folder" && isInside(to, from)) {
    throw new UserError("A folder can't move into itself");
  }
  if ((await existing(entry.projectId, [to])).size > 0) {
    throw new UserError(`${to} already exists`);
  }
  const parents = (await missingParents(entry.projectId, to)).filter((p) => p !== from && !isInside(p, from));
  const now = Date.now();
  const prefixLength = from.length + 1;
  await db.batch([
    db.update(entries).set({ path: to, updatedAt: now }).where(eq(entries.id, entry.id)),
    ...(entry.kind === "folder"
      ? [
          db
            .update(entries)
            .set({ path: sql`${to} || '/' || substr(${entries.path}, ${prefixLength + 1})` })
            .where(and(eq(entries.projectId, entry.projectId), sql`substr(${entries.path}, 1, ${prefixLength}) = ${`${from}/`}`)),
        ]
      : []),
    ...parents.map((p) => db.insert(entries).values(folderRow(entry.projectId, p, now))),
  ]);
  return { from, to };
}

export const deleteEntryInput = z.object({ id: entryId }).strict();

/** Deletes a file, or a folder with everything in it. */
export async function deleteEntry(userId: string, input: z.infer<typeof deleteEntryInput>) {
  const entry = await requireEntry(userId, input.id);
  await db
    .delete(entries)
    .where(
      and(
        eq(entries.projectId, entry.projectId),
        or(eq(entries.path, entry.path), sql`substr(${entries.path}, 1, ${entry.path.length + 1}) = ${`${entry.path}/`}`),
      ),
    );
  return { path: entry.path };
}

export const importInput = z
  .object({
    projectId: projectId.optional(),
    newProjectName: z.string().trim().min(1).max(120).optional(),
    files: z.array(z.object({ path: z.string().max(600), content: z.string() }).strict()).max(500),
  })
  .strict();

/** Adds text files; a path that already exists is reported, never overwritten. */
export async function importFiles(userId: string, project: string, files: { path: string; content: string }[]) {
  const imported: string[] = [];
  const clashes: string[] = [];
  const skipped: string[] = [];
  const cleaned = new Map<string, string>();
  for (const file of files) {
    const result = normalizePath(file.path);
    if ("error" in result) {
      skipped.push(file.path);
      continue;
    }
    if (byteLength(file.content) > MAX_FILE_BYTES) {
      skipped.push(result.path);
      continue;
    }
    if (cleaned.has(result.path)) clashes.push(result.path);
    else cleaned.set(result.path, file.content);
  }
  const wanted = [...cleaned.keys()];
  const allParents = [...new Set(wanted.flatMap(parentPaths))];
  const found = new Map<string, "file" | "folder">();
  const lookup = [...wanted, ...allParents];
  for (let i = 0; i < lookup.length; i += 90) {
    for (const [k, v] of await existing(project, lookup.slice(i, i + 90))) found.set(k, v);
  }
  const newFolders = new Set<string>();
  const rows: (typeof entries.$inferInsert)[] = [];
  const now = Date.now();
  for (const [path, content] of cleaned) {
    const parents = parentPaths(path);
    if (found.has(path) || parents.some((p) => found.get(p) === "file" || cleaned.has(p))) {
      clashes.push(path);
      continue;
    }
    for (const p of parents) if (!found.has(p)) newFolders.add(p);
    rows.push({ id: crypto.randomUUID(), projectId: project, path, kind: "file", content, size: byteLength(content), updatedAt: now });
    imported.push(path);
  }
  for (const p of newFolders) rows.push(folderRow(project, p, now));
  if ((await entryCount(project)) + rows.length > MAX_ENTRIES) {
    throw new UserError(`A project holds at most ${MAX_ENTRIES} files and folders`);
  }
  const statements = rows.map((row) => db.insert(entries).values(row));
  for (let i = 0; i < statements.length; i += 50) {
    const chunk = statements.slice(i, i + 50);
    await db.batch(chunk as [(typeof chunk)[number], ...typeof chunk]);
  }
  return { imported, clashes, skipped, dir: dirName(imported[0] ?? "") };
}

/** Every file of a project with its text, for search and the zip. */
export function projectFiles(project: string) {
  return db
    .select({ id: entries.id, path: entries.path, content: entries.content, version: entries.version })
    .from(entries)
    .where(and(eq(entries.projectId, project), eq(entries.kind, "file")))
    .orderBy(entries.path);
}

export async function emptyFolders(project: string) {
  const all = await db
    .select({ path: entries.path, kind: entries.kind })
    .from(entries)
    .where(eq(entries.projectId, project));
  const paths = all.map((e) => e.path);
  return all.filter((e) => e.kind === "folder" && !paths.some((p) => isInside(p, e.path))).map((e) => e.path);
}
