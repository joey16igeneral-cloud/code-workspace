import { createFileRoute } from "@tanstack/react-router";
import { strToU8, zipSync, type Zippable } from "fflate";
import { emptyFolders, projectFiles } from "@/server/entries";
import { attachment, callerId, notFound, unauthorized } from "@/server/http";
import { ownedProject } from "@/server/projects";

export const Route = createFileRoute("/api/projects/$projectId/zip")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { projectId: string } }) => {
        const userId = await callerId(request);
        if (!userId) return unauthorized();
        const project = await ownedProject(userId, params.projectId);
        if (!project) return notFound();
        const tree: Zippable = {};
        for (const file of await projectFiles(project.id)) tree[file.path] = strToU8(file.content);
        for (const folder of await emptyFolders(project.id)) tree[`${folder}/`] = new Uint8Array();
        const name = `${project.name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "project"}.zip`;
        return new Response(zipSync(tree, { level: 6 }), {
          headers: { "content-type": "application/zip", "content-disposition": attachment(name) },
        });
      },
    },
  },
});
