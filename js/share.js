// share.js — encode a plan into a URL hash for a no-backend, view-only link.
// Uses the Compression Streams API when available, with a plain-base64 fallback.

function bytesToB64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deflate(bytes) {
  const cs = new CompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodePlan(plan) {
  const json = JSON.stringify(plan);
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream !== "undefined") {
    try { return "z" + bytesToB64url(await deflate(bytes)); } catch { /* fall through */ }
  }
  return "j" + bytesToB64url(bytes);
}

export async function decodePlan(param) {
  const tag = param[0];
  let bytes = b64urlToBytes(param.slice(1));
  if (tag === "z") bytes = await inflate(bytes);
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function makeShareLink(plan) {
  const enc = await encodePlan(plan);
  const base = location.origin + location.pathname;
  return `${base}#view=${enc}`;
}

// Returns the encoded payload if the URL is a view-only share link, else null.
export function sharedParam() {
  const m = /[#&]view=([^&]+)/.exec(location.hash);
  return m ? m[1] : null;
}
