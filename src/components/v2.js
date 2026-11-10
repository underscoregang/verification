// Components V2 building blocks. A message sent with IS_COMPONENTS_V2 must not
// carry content or embeds: all text, images and buttons live in components.
export const EPHEMERAL = 64;
export const IS_COMPONENTS_V2 = 32768;

export const colors = {
  brand: 0x8b5cf6,
  success: 0x22c55e,
  warning: 0xf59e0b,
  danger: 0xef4444,
  info: 0x3b82f6,
};

// Layout and content components.
export const textDisplay = (content) => ({ type: 10, content });
export const thumbnail = (url) => ({ type: 11, media: { url } });
export const mediaGallery = (...urls) => ({
  type: 12,
  items: urls.map((url) => ({ media: { url } })),
});
export const separator = (divider = true, spacing = 1) => ({
  type: 14,
  divider,
  spacing,
});
// Text with an accessory (thumbnail or button) on the right.
export const section = (content, accessory) => ({
  type: 9,
  components: [textDisplay(content)],
  accessory,
});
export const container = (components, tone = "brand") => ({
  type: 17,
  accent_color: colors[tone] ?? tone,
  components: components.filter(Boolean),
});

// Interactive components.
export const row = (...components) => ({ type: 1, components });
export const button = (custom_id, label, style = 1) => ({
  type: 2,
  custom_id,
  label,
  style,
});
export const linkButton = (label, url) => ({ type: 2, style: 5, label, url });

// A complete V2 message body. Mentions render but ping nobody unless listed.
export function v2(components, { ephemeral = false, mentions = [] } = {}) {
  return {
    flags: IS_COMPONENTS_V2 | (ephemeral ? EPHEMERAL : 0),
    components: [].concat(components).filter(Boolean),
    allowed_mentions: { parse: [], ...(mentions.length ? { users: mentions } : {}) },
  };
}

// One accented card: optional heading, body text, an optional accessory beside
// the text, and any extra components (separators, galleries, button rows).
export function card({ title, body, tone = "brand", accessory, extra = [] }) {
  const text = [title && `## ${title}`, body].filter(Boolean).join("\n");
  return container(
    [accessory ? section(text, accessory) : textDisplay(text), ...extra],
    tone,
  );
}

// Short single-card reply used for confirmations, errors and simple answers.
export const notice = (body, tone = "brand", options) =>
  v2(card({ body, tone }), options);

// Immediate interaction reply (type 4). Always private to the invoking user.
export const reply = (body) => ({
  type: 4,
  data: { ...body, flags: (body.flags ?? IS_COMPONENTS_V2) | EPHEMERAL },
});
export const message = (text, tone = "danger") => reply(notice(text, tone));
