import { loadConfig } from "../config/runtime.js";
import { validSignature } from "../shared/security.js";
import { immediate, complete } from "../discord/interactions.js";
import { message } from "../discord/components.js";
import { editResponse } from "../discord/client.js";
import { isSetup } from "../discord/setup.js";
import { text, json } from "../http/responses.js";

export async function interactions(request, env, ctx, openStore) {
  // Verify the exact raw body before parsing or executing any command.
  if (Number(request.headers.get("content-length")) > 65536)
    return text("Payload too large", 413);
  const body = await request.text();
  if (new TextEncoder().encode(body).length > 65536)
    return text("Payload too large", 413);
  if (!(await validSignature(request, body, env.DISCORD_PUBLIC_KEY)))
    return text("Invalid request signature", 401);
  let interaction;
  try {
    interaction = JSON.parse(body);
  } catch {
    return text("Invalid JSON", 400);
  }
  // Endpoint registration PING works before other bot credentials are configured.
  if (interaction.type === 1) return json({ type: 1 });
  let config;
  try {
    config = loadConfig(env, { setup: true });
  } catch {
    return json(
      message(
        "Core bot configuration is incomplete. Ask an administrator to run npm run setup:check.",
      ),
    );
  }
  if (
    interaction.application_id !== config.DISCORD_CLIENT_ID ||
    interaction.guild_id !== config.DISCORD_GUILD_ID ||
    !interaction.member?.user?.id
  )
    return json(message("Use this bot in the configured Underscore server."));
  if (
    !interaction.data ||
    !/^\d{17,20}$/.test(interaction.id) ||
    typeof interaction.token !== "string"
  )
    return text("Invalid interaction", 400);
  const response = immediate(interaction, config);
  if (response) return json(response);
  // Acknowledge before connecting to MongoDB; finish work in the background.
  ctx.waitUntil(
    (async () => {
      try {
        await openStore(env, async (store) => {
          const effective = loadConfig(
            { ...env, ...(await store.settings()) },
            { setup: isSetup(interaction) },
          );
          await complete(interaction, effective, store);
        });
      } catch (error) {
        console.error("Database or configuration operation failed", error.name);
        await editResponse(config, interaction, {
          content:
            "Database or verification setup is incomplete. Ask an administrator to check MongoDB connectivity, run db:init, and configure /tiktok setup, /youtube setup, and /getrole.",
          components: [],
        }).catch(() => {});
      }
    })(),
  );
  return json({ type: 5, data: { flags: 64 } });
}
