import { loadConfig } from "../config/runtime.js";
import { randomToken, hash, cookie, browserCookie } from "../shared/security.js";
import { api } from "../http/client.js";
import { grant } from "../discord/roles.js";
import { text, redirect } from "../http/responses.js";
import { urlWith } from "../http/urls.js";

async function exchange(config, provider, code) {
  const discord = provider === "discord";
  return api(
    discord
      ? "https://discord.com/api/oauth2/token"
      : "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: discord ? config.DISCORD_CLIENT_ID : config.GOOGLE_CLIENT_ID,
        client_secret: discord
          ? config.DISCORD_CLIENT_SECRET
          : config.GOOGLE_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${config.baseUrl}/oauth/${provider}`,
      }),
    },
    provider,
  );
}
export async function oauth(request, env, url, store) {
  const config = loadConfig({ ...env, ...(await store.settings()) });
  if (config.policy === "tiktok")
    return text("YouTube verification is disabled.", 404);
  if (url.origin !== config.baseUrl)
    return text("Use the configured verification domain.", 400);
  if (url.pathname === "/start") {
    const session = await store.consume(url.searchParams.get("token"), "start");
    if (!session)
      return text("Invalid or expired link. Use /verify again.", 400);
    const nonce = randomToken();
    const state = await store.session({
      stage: "discord",
      user: session.user,
      browser: await hash(nonce),
    });
    return redirect(
      urlWith("https://discord.com/oauth2/authorize", {
        client_id: config.DISCORD_CLIENT_ID,
        redirect_uri: `${config.baseUrl}/oauth/discord`,
        response_type: "code",
        scope: "identify",
        state,
      }),
      { "Set-Cookie": browserCookie(nonce, config.baseUrl) },
    );
  }
  const provider = url.pathname === "/oauth/discord" ? "discord" : "google";
  const nonce = cookie(request);
  const session = await store.consume(
    url.searchParams.get("state"),
    provider,
    nonce ? await hash(nonce) : null,
  );
  const code = url.searchParams.get("code");
  if (!session || !code || url.searchParams.has("error"))
    return text(
      "Sign-in expired, canceled, or could not be tied to this browser. Use /verify again.",
      400,
    );
  const token = await exchange(config, provider, code);
  if (provider === "discord") {
    const user = await api(
      "https://discord.com/api/v10/users/@me",
      { headers: { Authorization: `Bearer ${token.access_token}` } },
      "discord",
    );
    if (user.id !== session.user)
      return text(
        "Wrong Discord account. Use /verify again and sign into the same Discord account.",
        403,
      );
    const state = await store.session({
      stage: "google",
      user: session.user,
      browser: session.browser,
    });
    return redirect(
      urlWith("https://accounts.google.com/o/oauth2/v2/auth", {
        client_id: config.GOOGLE_CLIENT_ID,
        redirect_uri: `${config.baseUrl}/oauth/google`,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/youtube.readonly",
        state,
        access_type: "online",
        prompt: "select_account",
      }),
    );
  }
  const auth = { headers: { Authorization: `Bearer ${token.access_token}` } };
  const subscriptions = await api(
    urlWith("https://www.googleapis.com/youtube/v3/subscriptions", {
      part: "id",
      mine: "true",
      forChannelId: config.YOUTUBE_CHANNEL_ID,
      maxResults: "1",
    }),
    auth,
    "google",
  );
  if (!subscriptions.items?.length)
    return text(
      "Subscription not found. Subscribe to our YouTube channel, then use /verify again.",
      403,
    );
  const channels = await api(
    "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true",
    auth,
    "google",
  );
  if (!channels.items?.[0]?.id) throw new Error("YouTube identity unavailable");
  await store.verify(
    session.user,
    "youtube",
    channels.items[0].id,
    config.YOUTUBE_CHANNEL_ID,
  );
  const granted = await grant(config, store, session.user);
  return text(
    granted
      ? "YouTube subscription verified. Your Underscore access role has been granted. You can close this tab."
      : "YouTube verified. Complete TikTok review in Discord to meet the server requirement.",
    200,
    { "Set-Cookie": browserCookie("", config.baseUrl, true) },
  );
}
