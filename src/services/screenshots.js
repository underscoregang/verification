import { api } from "../http/client.js";
const maxSize = 8 * 1024 * 1024;
const imageTypes = ["image/png", "image/jpeg", "image/webp"];

// Returns a member-facing reason when a message attachment is not a usable
// screenshot uploaded to Discord, or null when it can be downloaded and scanned.
export function attachmentError(attachment) {
  if (
    !attachment ||
    !imageTypes.includes(attachment.content_type) ||
    !Number.isInteger(attachment.size) ||
    attachment.size <= 0 ||
    attachment.size > maxSize
  )
    return "Please upload a PNG, JPG or WebP screenshot (up to 8 MB) directly to Discord.";
  try {
    const url = new URL(attachment.url);
    if (
      url.protocol !== "https:" ||
      !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      !/^\/(?:ephemeral-)?attachments\//.test(url.pathname)
    )
      return "Please upload the screenshot directly to Discord.";
  } catch {
    return "Please upload the screenshot directly to Discord.";
  }
  return null;
}
export async function screenshotFile(attachment) {
  const response = await fetch(attachment.url, {
    signal: AbortSignal.timeout(6000),
    // Workers reject redirect: "error"; a manual 3xx response fails the ok check below.
    redirect: "manual",
  });
  if (
    !response.ok ||
    Number(response.headers.get("content-length")) > maxSize ||
    !response.body
  )
    throw new Error("Screenshot download failed");
  const reader = response.body.getReader(),
    chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxSize) throw new Error("Screenshot too large");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const png =
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    );
  const jpg =
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255;
  const webp =
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  const extension = png ? "png" : jpg ? "jpg" : webp ? "webp" : null;
  const contentType = png
    ? "image/png"
    : jpg
      ? "image/jpeg"
      : webp
        ? "image/webp"
        : null;
  if (!extension)
    throw new Error("Invalid screenshot image");
  return {
    filename: `proof.${extension}`,
    blob: new Blob([bytes], { type: contentType }),
  };
}
export async function postScreenshot(config, channelId, payload, file) {
  const body = new FormData();
  body.set(
    "payload_json",
    JSON.stringify({
      ...payload,
      attachments: [{ id: 0, filename: file.filename }],
    }),
  );
  body.set("files[0]", file.blob, file.filename);
  return api(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bot ${config.DISCORD_TOKEN}` },
      body,
    },
    "discord",
  );
}
