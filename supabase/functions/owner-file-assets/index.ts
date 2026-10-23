import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const url = Deno.env.get('SUPABASE_URL')!; const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const decoder = new TextDecoder();
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (item) => item.charCodeAt(0));
const toBase64 = (value: Uint8Array) => { let text = ''; for (let offset = 0; offset < value.length; offset += 0x8000) text += String.fromCharCode(...value.subarray(offset, offset + 0x8000)); return btoa(text); };
const sha256 = async (value: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
const mimeFor = (kind: string) => kind === 'PDF' ? 'application/pdf' : kind === 'DOCX' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : null;
const logoMime = (mime: string) => ['image/png','image/jpeg','image/webp','image/svg+xml'].includes(mime);
function failure(error: { message?: string; code?: string }) {
  const code = error.message === 'OWNER_FILE_ASSET_CONFLICT' ? 'CHECKSUM_CONFLICT' : error.message === 'OWNER_FILE_ASSET_NOT_FOUND' ? 'NOT_FOUND' : error.message === 'ACCOUNT_DEACTIVATED' ? 'ACCOUNT_DEACTIVATED' : 'REMOTE_ERROR';
  return json({ error: code }, code === 'CHECKSUM_CONFLICT' ? 409 : code === 'NOT_FOUND' ? 404 : code === 'ACCOUNT_DEACTIVATED' ? 403 : 503);
}
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return json({ error:'NOT_FOUND' }, 404);
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''); if (!bearer) return json({ error:'AUTH_REQUIRED' }, 401);
  const auth = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global:{ headers:{ Authorization:`Bearer ${bearer}` } } });
  const { data:{ user } } = await auth.auth.getUser(); if (!user) return json({ error:'AUTH_REQUIRED' }, 401);
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return json({ error:'INVALID_REQUEST' },400); }
  const service = createClient(url, serviceKey); const action = body.action;
  if (action === 'upload') {
    const kind = typeof body.kind === 'string' ? body.kind : ''; const issuanceId = typeof body.issuanceId === 'string' ? body.issuanceId : null;
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : ''; const encoded = typeof body.base64 === 'string' ? body.base64 : '';
    if ((kind !== 'LOGO' && kind !== 'PDF' && kind !== 'DOCX') || (kind === 'LOGO' ? !logoMime(mimeType) : mimeFor(kind) !== mimeType)) return json({ error:'INVALID_FILE' },400);
    let bytes: Uint8Array; try { bytes=fromBase64(encoded); } catch { return json({ error:'INVALID_FILE' },400); }
    if (!bytes.length || bytes.length > 20971520) return json({ error:'INVALID_FILE' },400);
    if ((kind === 'PDF' && !decoder.decode(bytes.slice(0,5)).startsWith('%PDF-')) || (kind === 'DOCX' && !(bytes[0]===0x50 && bytes[1]===0x4b))) return json({ error:'INVALID_FILE' },400);
    const assetKey = kind === 'LOGO' ? 'business-logo' : `issuance:${issuanceId}:${kind.toLowerCase()}`;
    const storagePath = kind === 'LOGO' ? `${user.id}/logo/business-logo` : `${user.id}/issuances/${issuanceId}/${kind.toLowerCase()}`;
    const checksum = await sha256(bytes);
    const { data: existing, error: existingError } = await auth.rpc('get_owner_file_manifest');
    if (existingError) return failure(existingError);
    const found = Array.isArray(existing) ? existing.find((asset) => asset.asset_key === assetKey) : null;
    if (found && found.sha256 === checksum) return json({ asset:found });
    if (found && kind !== 'LOGO') return json({ error:'CHECKSUM_CONFLICT' },409);
    const { error: uploadError } = await service.storage.from('quotivo-owner-assets').upload(storagePath, bytes, { contentType:mimeType, upsert:kind === 'LOGO' });
    if (uploadError) return json({ error:'FILE_UPLOAD_FAILED' },409);
    const { data, error } = await auth.rpc('register_owner_file_asset', { p_kind:kind, p_asset_key:assetKey, p_issuance_id:issuanceId, p_storage_path:storagePath, p_mime_type:mimeType, p_size_bytes:bytes.length, p_sha256:checksum });
    if (error || !data?.[0]) { await service.storage.from('quotivo-owner-assets').remove([storagePath]); return failure(error ?? { message:'EMPTY_ASSET' }); }
    return json({ asset:data[0] },201);
  }
  if (action === 'download') {
    const assetId = typeof body.assetId === 'string' ? body.assetId : ''; if (!assetId) return json({ error:'INVALID_REQUEST' },400);
    const { data: manifest, error } = await auth.rpc('get_owner_file_manifest'); if (error) return failure(error);
    const asset = Array.isArray(manifest) ? manifest.find((entry) => entry.id === assetId) : null; if (!asset) return json({ error:'NOT_FOUND' },404);
    const { data: blob, error: downloadError } = await service.storage.from('quotivo-owner-assets').download(asset.storage_path);
    if (downloadError || !blob) return json({ error:'FILE_UNAVAILABLE' },404);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length !== asset.size_bytes || await sha256(bytes) !== asset.sha256) return json({ error:'FILE_INTEGRITY_FAILED' },409);
    return json({ asset, base64:toBase64(bytes) });
  }
  return json({ error:'NOT_FOUND' },404);
});
