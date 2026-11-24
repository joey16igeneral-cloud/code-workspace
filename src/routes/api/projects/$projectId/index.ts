import { createFileRoute } from "@tanstack/react-router";
import { callerId, notFound, unauthorized } from "@/server/http";
import { listEntries, ownedProject } from "@/server/projects";

export const Route = createFileRoute("/api/projects/$projectId/")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { projectId: string } }) => {
        const userId = await callerId(request);
        if (!userId) return unauthorized();
        const project = await ownedProject(userId, params.projectId);
        if (!project) return notFound();
        return Response.json({
          project: { id: project.id, name: project.name },
          entries: await listEntries(project.id),
        });
      },
    },
  },
});
