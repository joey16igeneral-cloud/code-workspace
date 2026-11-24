// The app's tools for AI clients, served by the Gateway at /mcp with the
// signed-in user. Read-only: they list the user's own projects and files.
import { ToolError, defineTools } from "@every-app/sdk/server";
import { z } from "zod";
import { readFile } from "@/server/entries";
import { listEntries, listProjects, ownedProject } from "@/server/projects";

export const tools = defineTools(
  {
    list_projects: {
      description: "List the user's projects, most recently opened first.",
      risk: "read",
      input: z.object({}).strict(),
      handler: (_input, { user }) => listProjects(user.id),
    },
    list_files: {
      description: "List the files and folders in one of the user's projects.",
      risk: "read",
      input: z.object({ projectId: z.string() }).strict(),
      handler: async ({ projectId }, { user }) => {
        if (!(await ownedProject(user.id, projectId))) throw new ToolError("No project with that id");
        return listEntries(projectId);
      },
    },
    read_file: {
      description: "Read the text of one file by its id.",
      risk: "read",
      input: z.object({ id: z.string() }).strict(),
      handler: async ({ id }, { user }) => {
        try {
          return await readFile(user.id, id);
        } catch {
          throw new ToolError("No file with that id");
        }
      },
    },
  },
  { instructions: "Call list_projects, then list_files, to find ids before reading a file." },
);
