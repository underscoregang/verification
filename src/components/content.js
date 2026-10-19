export const message = (content, components = [], flags = 64) => ({ type: 4, data: { content, components, flags, allowed_mentions: { parse: [] } } });
