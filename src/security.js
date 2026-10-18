const encoder = new TextEncoder();
export function hex(bytes) { return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''); }
export function randomToken() { return hex(crypto.getRandomValues(new Uint8Array(32))); }
export async function hash(value) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
function unhex(value) { return Uint8Array.from(value.match(/../g), byte => parseInt(byte, 16)); }
export async function validSignature(request, body, publicKey) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  if (!/^[a-f0-9]{128}$/i.test(signature || '') || !/^\d{10,11}$/.test(timestamp || '') || !/^[a-f0-9]{64}$/i.test(publicKey || '')) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  try {
    const key = await crypto.subtle.importKey('raw', unhex(publicKey), 'Ed25519', false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, unhex(signature), encoder.encode(timestamp + body));
  } catch { return false; }
}
export function hasPermission(value, permission) {
  try { const permissions = BigInt(value || '0'); return (permissions & 8n) !== 0n || (permissions & permission) !== 0n; } catch { return false; }
}
export function cookie(request) {
  return request.headers.get('cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith('underscore_oauth='))?.slice('underscore_oauth='.length);
}
export function browserCookie(value, baseUrl, clear = false) {
  return `underscore_oauth=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 600}${baseUrl.startsWith('https:') ? '; Secure' : ''}`;
}
export function validateProof(handle, proof) {
  if (typeof handle !== 'string' || typeof proof !== 'string') return;
  handle = handle.trim().toLowerCase();
  if (!/^[a-z0-9._]{2,24}$/.test(handle) || proof.length > 500 || /[\s<>]/.test(proof.trim())) return;
  try {
    const url = new URL(proof.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return;
    return { handle, proof: url.href };
  } catch { return; }
}
