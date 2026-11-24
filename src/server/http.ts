import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";

/** The signed-in caller of a server route; every route here is private. */
export async function callerId(request: Request): Promise<string | null> {
  const user = await getEveryAppUser(request, env);
  return user?.id ?? null;
}

export const notFound = () => Response.json({ error: "Not found" }, { status: 404 });
export const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

export function attachment(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
