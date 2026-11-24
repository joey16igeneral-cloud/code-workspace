import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { entries, projects } from "@/db/schema";

export class NotFoundError extends Error {
  constructor(what = "Project") {
    super(`${what} not found`);
  }
}

export const projectName = z.string().trim().min(1, "Enter a name").max(120);
export const projectId = z.string().uuid();

export interface ProjectSummary {
  id: string;
  name: string;
  openedAt: number;
  files: number;
}

export async function listProjects(userId: string): Promise<ProjectSummary[]> {
  const rows = await db
    .select({ id: projects.id, name: projects.name, openedAt: projects.openedAt })
    .from(projects)
    .where(eq(projects.ownerId, userId))
    .orderBy(desc(projects.openedAt), projects.name);
  if (rows.length === 0) return [];
  const counts = await db
    .select({ projectId: entries.projectId, n: count() })
    .from(entries)
    .innerJoin(projects, eq(projects.id, entries.projectId))
    .where(and(eq(projects.ownerId, userId), eq(entries.kind, "file")))
    .groupBy(entries.projectId);
  const byId = new Map(counts.map((c) => [c.projectId, c.n]));
  return rows.map((row) => ({ ...row, files: byId.get(row.id) ?? 0 }));
}

/** The project when this user owns it, else null. */
export async function ownedProject(userId: string, id: string) {
  if (!projectId.safeParse(id).success) return null;
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, userId)));
  return row ?? null;
}

export async function requireProject(userId: string, id: string) {
  const project = await ownedProject(userId, id);
  if (!project) throw new NotFoundError();
  return project;
}

export async function createProject(userId: string, name: string) {
  const now = Date.now();
  const [row] = await db
    .insert(projects)
    .values({ id: crypto.randomUUID(), ownerId: userId, name, createdAt: now, openedAt: now })
    .returning({ id: projects.id, name: projects.name });
  return row!;
}

export async function renameProject(userId: string, id: string, name: string) {
  const [row] = await db
    .update(projects)
    .set({ name })
    .where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
    .returning({ id: projects.id, name: projects.name });
  if (!row) throw new NotFoundError();
  return row;
}

export async function deleteProject(userId: string, id: string) {
  await requireProject(userId, id);
  await db.batch([
    db.delete(entries).where(eq(entries.projectId, id)),
    db.delete(projects).where(and(eq(projects.id, id), eq(projects.ownerId, userId))),
  ]);
}

export interface TreeEntry {
  id: string;
  path: string;
  kind: "file" | "folder";
  size: number;
}

export function listEntries(projectIdValue: string): Promise<TreeEntry[]> {
  return db
    .select({ id: entries.id, path: entries.path, kind: entries.kind, size: entries.size })
    .from(entries)
    .where(eq(entries.projectId, projectIdValue))
    .orderBy(entries.path);
}

/** Opening a project moves it to the top of the start page. */
export async function openProject(userId: string, id: string) {
  const project = await ownedProject(userId, id);
  if (!project) return null;
  await db.update(projects).set({ openedAt: Date.now() }).where(eq(projects.id, id));
  return {
    id: project.id,
    name: project.name,
    openTabs: parseTabs(project.openTabs),
    activePath: project.activePath,
    entries: await listEntries(id),
  };
}

function parseTabs(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

export const tabsInput = z
  .object({
    projectId,
    openTabs: z.array(z.string().max(512)).max(50),
    activePath: z.string().max(512).nullable(),
  })
  .strict();

export async function saveTabs(userId: string, input: z.infer<typeof tabsInput>) {
  const [row] = await db
    .update(projects)
    .set({ openTabs: JSON.stringify(input.openTabs), activePath: input.activePath })
    .where(and(eq(projects.id, input.projectId), eq(projects.ownerId, userId)))
    .returning({ id: projects.id });
  if (!row) throw new NotFoundError();
}
