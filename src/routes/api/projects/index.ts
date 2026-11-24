import { createFileRoute } from "@tanstack/react-router";
import { callerId, unauthorized } from "@/server/http";
import { listProjects } from "@/server/projects";

export const Route = createFileRoute("/api/projects/")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const userId = await callerId(request);
        if (!userId) return unauthorized();
        return Response.json({ projects: await listProjects(userId) });
      },
    },
  },
});
