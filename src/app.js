import { withStore } from "./database/connection.js";
import { text } from "./http/responses.js";
import { interactions } from "./routes/interactions.js";
import { oauth } from "./routes/oauth.js";
import { health } from "./routes/health.js";

export function createWorker(openStore = withStore) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      try {
        if (url.pathname === "/interactions") {
          if (request.method !== "POST")
            return text("Method not allowed", 405, { Allow: "POST" });
          return await interactions(request, env, ctx, openStore);
        }
        if (request.method !== "GET")
          return text("Method not allowed", 405, { Allow: "GET" });
        if (url.pathname === "/")
          return text(
            "Underscore Verification. Start with /verify in Discord. Google tokens are used only during verification and are not stored. Verification records and TikTok evidence URLs remain until removed by an administrator. Contact your server administrators for data removal.",
          );
        if (url.pathname === "/health") return await health(env, openStore);
        if (
          ["/start", "/oauth/discord", "/oauth/google"].includes(url.pathname)
        )
          return await openStore(env, (store) =>
            oauth(request, env, url, store),
          );
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
      ctx.waitUntil(
        openStore(env, (store) => store.cleanup()).catch((error) => {
          console.error("MongoDB cleanup failed", error.name);
        }),
      );
    },
  };
}
export default createWorker();
