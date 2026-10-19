// mongodb-connection-string-url only needs URL, which Workers provide natively.
// A default export keeps esbuild's CommonJS interop from warning at build time.
export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;
export default { URL, URLSearchParams };
