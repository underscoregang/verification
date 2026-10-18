const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
};
export const text = (body, status = 200, extra = {}) =>
  new Response(body, {
    status,
    headers: {
      ...headers,
      "Content-Type": "text/plain; charset=utf-8",
      ...extra,
    },
  });
export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
export const redirect = (location, extra = {}) =>
  text("Redirecting...", 302, { Location: location, ...extra });
