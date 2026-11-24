import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { ConfigurationError, gatewayUrl } from "@every-app/sdk/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { getPrefs } from "@/server/users";

/**
 * The Gateway's origin (in `everyapp dev`, the local launcher's): the way
 * back to the other apps, and the host the light/dark cookie is set on so
 * the launcher and every app share the pick. Null when the Worker has no
 * GATEWAY_URL; the pick then stays in this app's localStorage.
 */
export const getGatewayUrl = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context: { user } }) => {
    // The member's saved colour mode, applied once per page load.
    const { colorMode } = await getPrefs(user);
    try {
      return { gatewayUrl: new URL(gatewayUrl(env)).origin, colorMode };
    } catch (error) {
      if (!(error instanceof ConfigurationError)) throw error;
      return { gatewayUrl: null, colorMode };
    }
  });
