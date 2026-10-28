// Components V2 messages use layout/text components instead of content/embeds.
export const textDisplay = content => ({ type: 10, content });
export const thumbnail = url => ({ type: 11, media: { url } });
export const section = (content, accessory) => ({
  type: 9,
  components: [textDisplay(content)],
  accessory,
});
export const container = (...components) => ({ type: 17, accent_color: 0x8b5cf6, components });
export const componentV2 = (...components) => ({ flags: 32768, components, allowed_mentions: { parse: [] } });
