import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import * as entries from "@/server/entries";
import * as projects from "@/server/projects";
import * as search from "@/server/search";
import * as users from "@/server/users";

// Every function runs behind ensureUserMiddleware, and every query takes the
// signed-in user's id: a project or file of anyone else is "not found".

export const getStart = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context: { user } }) => {
    await users.ensureUser(user);
    return { projects: await projects.listProjects(user.id) };
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => z.object({ name: projects.projectName }).strict().parse(data))
  .handler(async ({ data, context: { user } }) => {
    await users.ensureUser(user);
    return projects.createProject(user.id, data.name);
  });

export const renameProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) =>
    z.object({ id: projects.projectId, name: projects.projectName }).strict().parse(data),
  )
  .handler(({ data, context: { user } }) => projects.renameProject(user.id, data.id, data.name));

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => z.object({ id: projects.projectId }).strict().parse(data))
  .handler(({ data, context: { user } }) => projects.deleteProject(user.id, data.id));

export const openProject = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => z.object({ id: z.string().max(100) }).strict().parse(data))
  .handler(async ({ data, context: { user } }) => {
    const [project, prefs] = await Promise.all([
      projects.openProject(user.id, data.id),
      users.getPrefs(user),
    ]);
    return { project, prefs };
  });

export const getTree = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => z.object({ projectId: projects.projectId }).strict().parse(data))
  .handler(async ({ data, context: { user } }) => {
    await projects.requireProject(user.id, data.projectId);
    return projects.listEntries(data.projectId);
  });

export const saveTabs = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.tabsInput.parse(data))
  .handler(({ data, context: { user } }) => projects.saveTabs(user.id, data));

export const createEntry = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => entries.createEntryInput.parse(data))
  .handler(({ data, context: { user } }) => entries.createEntry(user.id, data));

export const readFile = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).strict().parse(data))
  .handler(({ data, context: { user } }) => entries.readFile(user.id, data.id));

export const saveFile = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => entries.saveFileInput.parse(data))
  .handler(({ data, context: { user } }) => entries.saveFile(user.id, data));

export const moveEntry = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => entries.moveEntryInput.parse(data))
  .handler(({ data, context: { user } }) => entries.moveEntry(user.id, data));

export const deleteEntry = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => entries.deleteEntryInput.parse(data))
  .handler(({ data, context: { user } }) => entries.deleteEntry(user.id, data));

export const importFiles = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => entries.importInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    await users.ensureUser(user);
    let projectId = data.projectId;
    if (projectId) await projects.requireProject(user.id, projectId);
    else projectId = (await projects.createProject(user.id, data.newProjectName ?? "Imported files")).id;
    return { projectId, ...(await entries.importFiles(user.id, projectId, data.files)) };
  });

export const searchProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => search.searchInput.parse(data))
  .handler(({ data, context: { user } }) => search.searchProject(user.id, data));

export const replaceInProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => search.replaceInput.parse(data))
  .handler(({ data, context: { user } }) => search.replaceInProject(user.id, data));

export const getPrefs = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(({ context: { user } }) => users.getPrefs(user));

export const savePrefs = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => users.prefsInput.partial().strict().parse(data))
  .handler(({ data, context: { user } }) => users.savePrefs(user, data));
