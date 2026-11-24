import { createFileRoute } from "@tanstack/react-router";

// Private like every route here: an uptime monitor reaches it with a personal access token.
export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: () => Response.json({ ok: true }),
    },
  },
});
