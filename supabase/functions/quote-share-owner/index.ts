import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const serverUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const encoder = new TextEncoder(); const decoder = new TextDecoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (text: string) => Uint8Array.from(atob(text), char => char.charCodeAt(0));
const sha256 = async (value: Uint8Array | string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value))).map(byte => byte.toString(16).padStart(2, '0')).join('');
const publicUrl = (base: string, token: string) => `${base.replace(/\/$/, '')}/p/${token}`;
const cryptoKey = crypto.subtle.digest('SHA-256', encoder.encode(serviceKey)).then(key => crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt', 'decrypt']));
const legacyStatus = (share: { lifecycle: string; commercial_outcome: string; opened_at?: string | null }) => share.lifecycle === 'REVOKED' ? 'REVOKED' : share.lifecycle === 'SUPERSEDED' ? 'SUPERSEDED' : share.commercial_outcome === 'ACCEPTED' ? 'ACCEPTED' : share.commercial_outcome === 'REJECTED' ? 'REJECTED' : share.opened_at ? 'OPENED' : 'PENDING';
const presentShare = <T extends { lifecycle: string; commercial_outcome: string; opened_at?: string | null }>(share: T) => ({ ...share, status: legacyStatus(share) });
async function encrypt(value: string) { const iv = crypto.getRandomValues(new Uint8Array(12)); const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey, encoder.encode(value)); return `${b64(iv)}.${b64(new Uint8Array(data))}`; }
async function decrypt(value: string) { const [iv, data] = value.split('.'); if (!iv || !data) throw new Error('INVALID_VAULT'); return decoder.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await cryptoKey, fromB64(data))); }
async function configuredPublicUrl(service: ReturnType<typeof createClient>) { const { data, error } = await service.from('app_config').select('value').eq('key', 'public_base_url').maybeSingle(); if (error || typeof data?.value !== 'string' || !data.value) throw new Error('PUBLIC_URL_UNAVAILABLE'); return data.value; }
async function ownedIssuance(service: ReturnType<typeof createClient>, issuanceId: string, userId: string) { const { data } = await service.from('quote_issuances').select('id').eq('id', issuanceId).eq('user_id', userId).maybeSingle(); return Boolean(data); }
async function activePro(auth: ReturnType<typeof createClient>, userId: string) { const now = new Date().toISOString(); const { data } = await auth.from('entitlement_grants').select('id').eq('user_id', userId).eq('access_level', 'PRO').is('revoked_at', null).lte('starts_at', now).or(`ends_at.is.null,ends_at.gte.${now}`).limit(1); return Boolean(data?.length); }
async function requireActiveAccount(auth: ReturnType<typeof createClient>) {
  const { error } = await auth.rpc('assert_account_active');
  if (!error) return null;
  if (error.message === 'AUTH_REQUIRED') return { error: 'AUTH_REQUIRED', status: 401 };
  if (error.message === 'ACCOUNT_DEACTIVATED') return { error: 'ACCOUNT_DEACTIVATED', status: 403 };
  return { error: 'REMOTE_ERROR', status: 503 };
}
function commercialOutcomeFailure(error: { code?: string; message?: string }) {
  if (error.message === 'ALREADY_DECIDED') return { error: 'ALREADY_DECIDED', status: 409 };
  if (error.code === '42501') return { error: 'RLS', status: 403 };
  console.error('quote commercial outcome failed', { code: error.code, message: error.message });
  return { error: 'REMOTE_ERROR', status: 503 };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return json({ error: 'NOT_FOUND' }, 404);
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''); if (!bearer) return json({ error: 'AUTH_REQUIRED' }, 401);
  const auth = createClient(serverUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${bearer}` } } });
  const { data: { user } } = await auth.auth.getUser(); if (!user) return json({ error: 'AUTH_REQUIRED' }, 401);
  const lifecycleFailure = await requireActiveAccount(auth); if (lifecycleFailure) return json({ error: lifecycleFailure.error }, lifecycleFailure.status);
  const service = createClient(serverUrl, serviceKey); let body: Record<string, unknown>; try { body = await request.json(); } catch { return json({ error: 'INVALID_REQUEST' }, 400); }
  const action = body.action;
  if (action === 'document-status' || action === 'upload-document') {
    const issuanceId = typeof body.issuanceId === 'string' ? body.issuanceId : '';
    if (!issuanceId || !await ownedIssuance(service, issuanceId, user.id)) return json({ error: 'NOT_FOUND' }, 404);
    const { data: existing } = await service.from('quote_documents').select('id,issuance_id,sha256,size_bytes,mime_type,storage_path,created_at').eq('issuance_id', issuanceId).maybeSingle();
    if (action === 'document-status') return json({ document: existing ?? null });
    if (existing) return json({ document: existing });
    if (!await activePro(auth, user.id)) return json({ error: 'PRO_REQUIRED' }, 403);
    const encoded = typeof body.pdfBase64 === 'string' ? body.pdfBase64 : ''; const sizeBytes = typeof body.sizeBytes === 'number' ? body.sizeBytes : 0;
    let bytes: Uint8Array; try { bytes = fromB64(encoded); } catch { return json({ error: 'INVALID_DOCUMENT' }, 400); }
    if (bytes.length !== sizeBytes || bytes.length === 0 || bytes.length > 20971520 || !decoder.decode(bytes.slice(0, 5)).startsWith('%PDF-')) return json({ error: 'INVALID_DOCUMENT' }, 400);
    const documentSha256 = await sha256(bytes);
    const storagePath = `${user.id}/${issuanceId}/quote.pdf`;
    const { error: uploadError } = await service.storage.from('quote-documents').upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false });
    if (uploadError) return json({ error: 'DOCUMENT_UPLOAD_FAILED' }, 409);
    const document = { owner_user_id: user.id, issuance_id: issuanceId, storage_path: storagePath, sha256: documentSha256, size_bytes: sizeBytes, mime_type: 'application/pdf' };
    const { data: inserted, error: insertError } = await service.from('quote_documents').insert(document).select('id,issuance_id,sha256,size_bytes,mime_type,storage_path,created_at').single();
    if (insertError) { await service.storage.from('quote-documents').remove([storagePath]); return json({ error: 'DOCUMENT_REGISTER_FAILED' }, 500); }
    return json({ document: inserted }, 201);
  }
  if (action === 'create') {
    const issuanceId = typeof body.issuanceId === 'string' ? body.issuanceId : ''; const payload = body.snapshotPayload;
    if (!issuanceId || !payload || typeof payload !== 'object' || Array.isArray(payload)) return json({ error: 'INVALID_SNAPSHOT' }, 400);
    const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, ''); const cipher = await encrypt(token);
    const { data, error } = await auth.rpc('create_quote_share_secure', { p_issuance_id: issuanceId, p_snapshot_payload: payload, p_token_hash: await sha256(token), p_token_ciphertext: cipher });
    if (error) { console.error('quote-share create failed', { code: error.code, message: error.message }); return json({ error: error.message === 'PRO_REQUIRED' ? 'PRO_REQUIRED' : 'CREATE_FAILED' }, error.message === 'PRO_REQUIRED' ? 403 : 400); }
    const { data: canonicalOutcome, error: canonicalOutcomeError } = await service.from('quote_commercial_outcomes').select('outcome,source,decided_at').eq('quote_issuance_id', issuanceId).maybeSingle();
    if (canonicalOutcomeError) return json({ error: 'REMOTE_ERROR' }, 503);
    try { return json({ ...data?.[0], commercial_outcome: canonicalOutcome?.outcome ?? 'PENDING', outcome_source: canonicalOutcome?.source ?? null, outcome_decided_at: canonicalOutcome?.decided_at ?? null, status: 'PENDING', url: publicUrl(await configuredPublicUrl(service), token) }); } catch { return json({ error: 'PUBLIC_URL_UNAVAILABLE' }, 503); }
  }
  if (action === 'supersede-revision-parent') {
    const parentIssuanceId = typeof body.parentIssuanceId === 'string' ? body.parentIssuanceId : '';
    const revisionIssuanceId = typeof body.revisionIssuanceId === 'string' ? body.revisionIssuanceId : '';
    if (!parentIssuanceId || !revisionIssuanceId) return json({ error: 'INVALID_REQUEST' }, 400);
    const { data, error } = await auth.rpc('supersede_parent_revision_shares', { p_parent_issuance_id: parentIssuanceId, p_revision_issuance_id: revisionIssuanceId });
    return error ? json({ error: 'SUPERSEDE_FAILED' }, 400) : json({ superseded: data ?? 0 });
  }
  if (action === 'record-manual-outcome') {
    const issuanceId = typeof body.issuanceId === 'string' ? body.issuanceId : '';
    const outcome = body.outcome;
    if (!issuanceId || (outcome !== 'ACCEPTED' && outcome !== 'REJECTED')) return json({ error: 'INVALID_REQUEST' }, 400);
    if (!await ownedIssuance(service, issuanceId, user.id)) return json({ error: 'NOT_FOUND' }, 404);
    const { data, error } = await service.rpc('record_quote_commercial_outcome', {
      p_issuance_id: issuanceId,
      p_outcome: outcome,
      p_source: 'MANUAL',
      p_source_share_id: null,
    });
    if (error || !data?.[0]) {
      const failure = commercialOutcomeFailure(error ?? { message: 'EMPTY_OUTCOME_RESPONSE' });
      return json({ error: failure.error }, failure.status);
    }
    return json({ outcome: data[0] }, 201);
  }
  if (action === 'commercial-outcome-status') {
    const issuanceId = typeof body.issuanceId === 'string' ? body.issuanceId : '';
    if (!issuanceId || !await ownedIssuance(service, issuanceId, user.id)) return json({ error: 'NOT_FOUND' }, 404);
    const { data, error } = await service.from('quote_commercial_outcomes').select('outcome,source,decided_at').eq('quote_issuance_id', issuanceId).maybeSingle();
    if (error) return json({ error: error.code === '42501' ? 'RLS' : 'REMOTE_ERROR' }, error.code === '42501' ? 403 : 503);
    return json({ outcome: data ?? { outcome: 'PENDING', source: null, decided_at: null } });
  }
  const shareId = typeof body.shareId === 'string' ? body.shareId : ''; if (!shareId) return json({ error: 'INVALID_REQUEST' }, 400);
  const { data: share } = await auth.from('quote_shares').select('id,quote_issuance_id,lifecycle,commercial_outcome,opened_at,first_opened_at,last_opened_at,responded_at,accepted_at,rejected_at,revoked_at,superseded_at').eq('id', shareId).maybeSingle(); if (!share) return json({ error: 'NOT_FOUND' }, 404);
  const { data: canonicalOutcome, error: canonicalOutcomeError } = await service.from('quote_commercial_outcomes').select('outcome,source,decided_at').eq('quote_issuance_id', share.quote_issuance_id).maybeSingle();
  if (canonicalOutcomeError) return json({ error: 'REMOTE_ERROR' }, 503);
  const responseShare = presentShare({ ...share, commercial_outcome: canonicalOutcome?.outcome ?? 'PENDING', outcome_source: canonicalOutcome?.source ?? null, outcome_decided_at: canonicalOutcome?.decided_at ?? null });
  if (action === 'status') return json({ share: responseShare });
  if (action === 'revoke') { const { data, error } = await auth.rpc('revoke_quote_share', { p_share_id: shareId }); return error || !data ? json({ error: 'REVOKE_FAILED' }, 400) : json({ revoked: true }); }
  if (action === 'recover') { if (share.lifecycle !== 'ACTIVE') return json({ error: 'LINK_UNAVAILABLE' }, 409); const { data: vault, error } = await service.from('quote_share_token_secrets').select('token_ciphertext').eq('share_id', shareId).maybeSingle(); if (error || !vault) return json({ error: 'LINK_UNAVAILABLE' }, 409); try { return json({ share: responseShare, url: publicUrl(await configuredPublicUrl(service), await decrypt(vault.token_ciphertext)) }); } catch { return json({ error: 'PUBLIC_URL_UNAVAILABLE' }, 503); } }
  return json({ error: 'NOT_FOUND' }, 404);
});
