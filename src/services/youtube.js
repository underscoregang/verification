import { api } from "../http/client.js";

export function parseYoutube(value) {
  if (typeof value !== "string") return;
  value = value.trim();
  if (/^UC[\w-]{22}$/.test(value)) return { id: value };
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (
        !["youtube.com", "www.youtube.com", "m.youtube.com"].includes(
          url.hostname,
        ) ||
        url.username ||
        url.password
      )
        return;
      const parts = url.pathname
        .split("/")
        .filter(Boolean)
        .map(decodeURIComponent);
      if (
        parts[0] === "channel" &&
        parts.length === 2 &&
        /^UC[\w-]{22}$/.test(parts[1])
      )
        return { id: parts[1] };
      if (
        parts[0] === "user" &&
        parts.length === 2 &&
        /^[a-z0-9._-]{1,100}$/i.test(parts[1])
      )
        return { username: parts[1] };
      if (parts.length === 1 && parts[0].startsWith("@")) value = parts[0];
      else return;
    } catch {
      return;
    }
  }
  if (/^@[^\s/@<>?#]{1,100}$/u.test(value)) return { handle: value };
  if (/^[a-z0-9._-]{1,100}$/i.test(value))
    return { handle: `@${value}`, username: value };
}
export async function resolveYoutube(config, input) {
  const parsed = parseYoutube(input);
  if (!parsed)
    return {
      error:
        "Enter a YouTube @handle, username, UC... channel ID, or youtube.com channel URL.",
    };
  if (parsed.id) return parsed;
  if (!config.YOUTUBE_API_KEY)
    return {
      error:
        "Username lookup needs YOUTUBE_API_KEY in the Worker secrets. Ask the bot owner to add a YouTube Data API v3 API key, or enter the UC... channel ID directly.",
    };
  try {
    for (const [key, value] of [
      ["forHandle", parsed.handle],
      ["forUsername", parsed.username],
    ]) {
      if (!value) continue;
      const params = new URLSearchParams({
        part: "id",
        [key]: value,
        key: config.YOUTUBE_API_KEY,
      });
      const result = await api(
        `https://www.googleapis.com/youtube/v3/channels?${params}`,
        {},
        "google",
      );
      if (/^UC[\w-]{22}$/.test(result.items?.[0]?.id || ""))
        return { id: result.items[0].id };
    }
    return {
      error:
        "YouTube channel not found. Check the @handle or use a UC... channel ID.",
    };
  } catch {
    return {
      error:
        "YouTube lookup failed. Check YOUTUBE_API_KEY, YouTube Data API v3 activation, and API quota, or use a UC... channel ID.",
    };
  }
}
