import { gateway } from './discord/gateway.js';
import { withStore } from "./database/connection.js";
import { text } from "./http/responses.js";
import { interactions } from "./routes/interactions.js";
import { health } from "./routes/health.js";

export function createWorker(openStore = withStore) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      try {
        if (url.pathname === '/internal/gateway') {
          if (!env.DISCORD_TOKEN || request.method !== 'POST' || request.headers.get('Authorization') !== 'Bearer ' + env.DISCORD_TOKEN) return text('Unauthorized', 401);
          return gateway(env, 'POST');
        }
        if (url.pathname === "/interactions") {
          if (request.method !== "POST")
            return text("Method not allowed", 405, { Allow: "POST" });
          return await interactions(request, env, ctx, openStore);
        }
        if (request.method !== "GET")
          return text("Method not allowed", 405, { Allow: "GET" });
        if (url.pathname === "/")
          return text(
            "Underscore Verification. Post your subscription or follow screenshot directly in the Discord verification channel. Clear screenshots are checked automatically using Cloudflare Workers AI; uncertain images go to staff before the access role is granted. No Google sign-in is required. Screenshot copies stay in the staff review channel; verification records remain until removed by an administrator. Contact server staff for help or data removal.",
          );
        if (url.pathname === "/health") return await health(env, openStore);
        if (
          ["/start", "/oauth/discord", "/oauth/google"].includes(url.pathname)
        )
          return text('Verification now uses screenshot uploads in Discord. Use /verify and upload a fresh screenshot. Google sign-in is no longer required.', 410);
        return text("Not found", 404);
      } catch (error) {
        console.error(
          "Verification request failed",
          error.name,
          error.status || "",
        );
        return text(
          "Verification could not finish. Retry /verify, or /verification-status if verification was saved. Ask an administrator to check credentials, account conflicts, and role permissions.",
          502,
        );
      }
    },
    async scheduled(event, env, ctx) {
      if (env.DISCORD_GATEWAY) ctx.waitUntil(gateway(env, 'POST').catch(() => {}));
      ctx.waitUntil(
        openStore(env, (store) => store.cleanup()).catch((error) => {
          console.error("MongoDB cleanup failed", error.name);
        }),
      );
    },
  };
}
export default createWorker();
