import { api } from "../http/client.js";
const maxSize = 8 * 1024 * 1024;
export function modalFields(data) {
  return (data.components || []).flatMap((item) =>
    item.component ? [item.component] : item.components || [],
  );
}
export function screenshotInput(interaction) {
  const fields = modalFields(interaction.data);
  const options = interaction.data.options || [];
  const username = (
    fields.find((item) => item.custom_id === "username")?.value ||
    options.find((item) => item.name === "username")?.value ||
    ""
  )
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  const upload = fields.find((item) => item.custom_id === "screenshot");
  const id =
    upload?.values?.length === 1
      ? upload.values[0]
      : options.find((item) => item.name === "screenshot")?.value;
  const attachment = interaction.data.resolved?.attachments?.[id];
  if (!/^[\p{L}\p{N}._-]{2,100}$/u.test(username))
    return {
      error:
        "Enter your account username without spaces, not the channel display name.",
    };
  if (
    !attachment ||
    attachment.id !== id ||
    !["image/png", "image/jpeg", "image/webp"].includes(
      attachment.content_type,
    ) ||
    !Number.isInteger(attachment.size) ||
    attachment.size <= 0 ||
    attachment.size > maxSize
  )
    return {
      error:
        "Attach one PNG, JPG or WebP screenshot up to 8 MB. Use the upload button or `/verify platform:youtube screenshot:<image> username:<your username>`.",
    };
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
      return { error: "Please upload the screenshot directly to Discord." };
  } catch {
    return { error: "Please upload the screenshot directly to Discord." };
  }
  return { username, attachment };
}
export async function screenshotFile(attachment) {
  const response = await fetch(attachment.url, {
    signal: AbortSignal.timeout(6000),
    redirect: "error",
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
  if (!extension || contentType !== attachment.content_type)
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
