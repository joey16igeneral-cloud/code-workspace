import { createFileRoute } from "@tanstack/react-router";
import { ownedEntry } from "@/server/entries";
import { attachment, callerId, notFound, unauthorized } from "@/server/http";
import { baseName } from "@/shared/paths";

export const Route = createFileRoute("/api/files/$fileId")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { fileId: string } }) => {
        const userId = await callerId(request);
        if (!userId) return unauthorized();
        const entry = await ownedEntry(userId, params.fileId);
        if (!entry || entry.kind !== "file") return notFound();
        return new Response(entry.content, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "content-disposition": attachment(baseName(entry.path)),
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
