export const row = (...components) => ({ type: 1, components });
export const button = (custom_id, label, style = 1) => ({
  type: 2,
  custom_id,
  label,
  style,
});
export function choices(config) {
  const buttons = [];
  if (config.policy !== "tiktok")
    buttons.push(button("youtube", "Verify YouTube"));
  if (config.policy !== "youtube")
    buttons.push(button("tiktok", "Submit TikTok evidence", 2));
  return row(...buttons);
}
export const message = (content, components = [], flags = 64) => ({
  type: 4,
  data: { content, components, flags, allowed_mentions: { parse: [] } },
});
