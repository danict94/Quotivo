export const allowedLogoMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
const maxLogoBytes = 5 * 1024 * 1024;

export function validateLogoBytes(bytes: Uint8Array, declaredMime?: string | null) {
  if (!bytes.length || bytes.length > maxLogoBytes) throw new Error('Il logo deve avere una dimensione massima di 5 MB.');
  const isPng = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value);
  const isJpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  let ascii = '';
  const limit = Math.min(bytes.length, 1024 * 1024);
  for (let index = 0; index < limit; index += 1) ascii += String.fromCharCode(bytes[index]);
  const isWebp = ascii.slice(0, 4) === 'RIFF' && ascii.slice(8, 12) === 'WEBP';
  const normalized = ascii.replace(/^\uFEFF/, '').trimStart();
  const isSvg = /^<svg(?:\s|>)/i.test(normalized) || /^<\?xml[\s\S]*?<svg(?:\s|>)/i.test(normalized);
  const detected = (isPng ? 'image/png' : isJpeg ? 'image/jpeg' : isWebp ? 'image/webp' : isSvg ? 'image/svg+xml' : null) as typeof allowedLogoMimeTypes[number] | null;
  if (!detected) throw new Error('Formato logo non riconosciuto. Usa PNG, JPG, WEBP o SVG.');
  if (declaredMime && declaredMime !== 'application/octet-stream' && !allowedLogoMimeTypes.includes(declaredMime as typeof allowedLogoMimeTypes[number])) throw new Error('Tipo di file non consentito.');
  if (declaredMime && declaredMime !== 'application/octet-stream' && declaredMime !== detected) throw new Error('Il contenuto del logo non corrisponde al tipo dichiarato.');
  if (detected === 'image/svg+xml' && /<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b|\bon\w+\s*=|javascript\s*:|(?:href|xlink:href)\s*=\s*["'](?:https?:|\/\/|file:)/i.test(ascii)) {
    throw new Error('SVG non sicuro: rimuovi script, eventi e riferimenti esterni.');
  }
  return detected;
}
