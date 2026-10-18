export class ProviderError extends Error {
  constructor(provider, status) {
    super(`${provider} request failed`);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
  }
}
export async function api(url, options = {}, provider = "provider") {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new ProviderError(provider, response.status);
  if (response.status === 204) return null;
  return response.json();
}
