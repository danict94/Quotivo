import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const encoder = new TextEncoder();
const htmlHeaders = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };
const generic = () => new Response('<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Preventivo non disponibile</title></head><body><main>Preventivo non disponibile.</main></body></html>', { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');

// Older snapshots may contain the two common UTF-8-as-Latin-1 artifacts. This
// display-only normalization leaves immutable snapshot data unchanged.
const normalizeLegacyText = (value: unknown) => String(value ?? '')
  .replace(/\u00e2\u201a\u00ac/g, '\u20ac')
  .replace(/\u00c2\u00b7/g, '\u00b7');
const escape = (value: unknown) => normalizeLegacyText(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));
const displayDate = (value: unknown) => {
  const match = normalizeLegacyText(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : normalizeLegacyText(value);
};
const displayDateTime = (value: string | null) => value ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Rome' }).format(new Date(value)) : '';

type PublicItem = { description?: unknown; totalFormatted?: unknown };
type PublicPayload = {
  numberLabel?: unknown; issueDate?: unknown; validUntil?: unknown; title?: unknown;
  introduction?: unknown; conditions?: unknown; paymentTerms?: unknown; totalFormatted?: unknown;
  business?: { businessName?: unknown; address?: unknown; phone?: unknown; email?: unknown };
  items?: PublicItem[];
};

function page(payload: PublicPayload, outcome: string, decisionAt: string | null, superseded = false) {
  const business = payload.business && typeof payload.business === 'object' ? payload.business : {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const pdf = '<p class="pdf-help muted">Apri il PDF completo per consultare tutti i dettagli, le lavorazioni e le condizioni del preventivo.</p><a class="action secondary" id="pdf-link">Visualizza PDF completo</a>';
  const final = superseded
    ? `<h2>Documento sostituito</h2><p>Documento sostituito da una revisione più recente.</p>${pdf}`
    : outcome === 'ACCEPTED'
    ? `<h2>Preventivo accettato</h2><p>Decisione registrata ${escape(displayDateTime(decisionAt))}</p>${pdf}`
    : outcome === 'REJECTED'
      ? `<h2>Preventivo rifiutato</h2><p>Decisione registrata ${escape(displayDateTime(decisionAt))}</p>${pdf}`
      : `${pdf}<button type="button" data-decision="ACCEPT">Accetta preventivo</button><button type="button" class="secondary" data-decision="REJECT">Rifiuta</button><p class="muted">Puoi decidere anche pi&ugrave; tardi. Conserva questo link per riaprire il preventivo.</p>`;
  const businessDetails = [business.address, business.phone, business.email]
    .map((value) => escape(value)).filter(Boolean).join('<br>');
  const itemRows = items.map((item) => `<li><span>${escape(item?.description)}</span><strong>${escape(item?.totalFormatted)}</strong></li>`).join('');

  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Preventivo ${escape(payload.numberLabel)}</title>
  <style>
    :root{color-scheme:light}*{box-sizing:border-box}body{font:16px system-ui,sans-serif;margin:0;background:#f7f7f5;color:#192226}.wrap{max-width:680px;margin:auto;padding:24px}.card{background:#fff;border-radius:16px;padding:20px;margin:12px 0;box-shadow:0 1px 5px #0001}h1{font-size:1.5rem;margin:.7rem 0}h2{font-size:1.15rem}.muted{color:#667;overflow-wrap:anywhere}ul{list-style:none;padding:0;margin:0}li{display:flex;gap:12px;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e7e8e7;overflow-wrap:anywhere}li strong{white-space:nowrap}.total{font-size:1.25rem}.pdf-help{font-size:.9375rem;line-height:1.45;margin:0 0 10px}.action,button{display:block;width:100%;min-height:48px;padding:15px;margin:7px 0;border-radius:10px;font:inherit;font-weight:700;border:1px solid #2d5650;background:#2d5650;color:#fff;text-align:center;text-decoration:none}.secondary{background:#fff;color:#2d5650}.brand-link{color:inherit;text-underline-offset:2px}footer{padding:8px 2px 16px;line-height:1.5}dialog{border:0;border-radius:16px;max-width:min(92vw,480px);padding:24px}dialog::backdrop{background:#0008}
  </style>
</head>
<body>
  <main class="wrap">
    <section class="card"><strong>${escape(business.businessName || 'Preventivo')}</strong>${businessDetails ? `<p class="muted">${businessDetails}</p>` : ''}<div class="muted">Preventivo ${escape(payload.numberLabel)} &middot; ${escape(displayDate(payload.issueDate))}</div><h1>${escape(payload.title)}</h1><p>${escape(payload.introduction)}</p></section>
    <section class="card"><h2>Lavorazioni</h2><ul>${itemRows}</ul><h2 class="total">Totale ${escape(payload.totalFormatted)}</h2>${payload.validUntil ? `<p class="muted">Valido fino al ${escape(displayDate(payload.validUntil))}</p>` : ''}${payload.conditions ? `<p>${escape(payload.conditions)}</p>` : ''}${payload.paymentTerms ? `<p>${escape(payload.paymentTerms)}</p>` : ''}</section>
    <section class="card" aria-live="polite">${final}</section>
    <footer class="muted">Gestito con Quotivo<br>Un prodotto della famiglia <a class="brand-link" href="https://www.esigenta.it" target="_blank" rel="noopener noreferrer">Esigenta</a></footer><dialog id="decision"><h2 id="decision-title"></h2><p>Preventivo ${escape(payload.numberLabel)} · Totale ${escape(payload.totalFormatted)}</p><p>Questa scelta &egrave; definitiva.</p><label><input id="decision-check" type="checkbox"> <span id="decision-label"></span></label><button id="decision-confirm" disabled></button><button class="secondary" id="decision-cancel">Annulla</button></dialog>
  </main>
  <script>
    (() => {
      const submit = async (decision) => {
        const response = await fetch(window.location.pathname, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'text/plain' }, body: JSON.stringify({ decision }) });
        if (response.ok) window.location.reload(); else window.alert('Questa decisione non \\u00e8 pi\\u00f9 disponibile.');
      };
      document.querySelector('#pdf-link')?.setAttribute('href', window.location.pathname + '/pdf');const dialog=document.querySelector('#decision'),check=document.querySelector('#decision-check'),confirmButton=document.querySelector('#decision-confirm');let decision='';const open=(next)=>{decision=next;document.querySelector('#decision-title').textContent=next==='ACCEPT'?'Accetta preventivo':'Rifiuta preventivo';document.querySelector('#decision-label').textContent=next==='ACCEPT'?'Confermo di voler accettare questo preventivo':'Confermo di voler rifiutare questo preventivo';confirmButton.textContent=next==='ACCEPT'?'Conferma accettazione':'Conferma rifiuto';check.checked=false;confirmButton.disabled=true;dialog.showModal()};document.querySelector('[data-decision="ACCEPT"]')?.addEventListener('click',()=>open('ACCEPT'));document.querySelector('[data-decision="REJECT"]')?.addEventListener('click',()=>open('REJECT'));check?.addEventListener('change',()=>confirmButton.disabled=!check.checked);confirmButton?.addEventListener('click',()=>submit(decision));document.querySelector('#decision-cancel')?.addEventListener('click',()=>dialog.close());
    })();
  </script>
</body>
</html>`;
}

function logDatabaseFailure(operation: string, error: { code?: string; message?: string; details?: string | null; hint?: string | null }) {
  console.error('quote-public database failure', { operation, code: error.code, message: error.message, details: error.details, hint: error.hint });
}

Deno.serve(async (request) => {
  const match = new URL(request.url).pathname.match(/\/p\/([A-Za-z0-9_-]{32,})(\/pdf)?$/);
  if (!match || !['GET', 'POST'].includes(request.method)) return generic();

  const { data: share, error: shareError } = await db.from('quote_shares')
    .select('id,owner_user_id,lifecycle,commercial_outcome,opened_at,snapshot_id,quote_issuance_id,accepted_at,rejected_at').eq('token_hash', await hash(match[1])).maybeSingle();
  if (shareError) { logDatabaseFailure('share lookup', shareError); return generic(); }
  if (!share || (share.lifecycle !== 'ACTIVE' && share.lifecycle !== 'SUPERSEDED')) return generic();
  const { error: lifecycleError } = await db.rpc('assert_account_active', { p_user_id: share.owner_user_id });
  if (lifecycleError) return generic();
  const { data: canonicalOutcome, error: canonicalOutcomeError } = await db.from('quote_commercial_outcomes')
    .select('outcome,decided_at').eq('quote_issuance_id', share.quote_issuance_id).maybeSingle();
  if (canonicalOutcomeError) { logDatabaseFailure('canonical outcome lookup', canonicalOutcomeError); return generic(); }
  const commercialOutcome = canonicalOutcome?.outcome ?? 'PENDING';

  if (match[2]) {
    if (request.method !== 'GET') return generic();
    const { data: document, error } = await db.from('quote_documents').select('storage_path,mime_type').eq('issuance_id', share.quote_issuance_id).maybeSingle();
    if (error || !document) return generic();
    const { data: pdf, error: downloadError } = await db.storage.from('quote-documents').download(document.storage_path);
    if (downloadError || !pdf) return generic();
    return new Response(pdf.stream(), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }

  if (request.method === 'POST') {
    if (share.lifecycle !== 'ACTIVE') return generic();
    let body: { decision?: unknown };
    try { body = await request.json(); } catch { return generic(); }
    if (body.decision !== 'ACCEPT' && body.decision !== 'REJECT') return generic();
    if (commercialOutcome !== 'PENDING') return generic();
    const nextStatus = body.decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
    const { data: recorded, error: recordError } = await db.rpc('record_quote_commercial_outcome', {
      p_issuance_id: share.quote_issuance_id,
      p_outcome: nextStatus,
      p_source: 'PUBLIC_LINK',
      p_source_share_id: share.id,
    });
    if (recordError || !recorded?.length) { if (recordError) logDatabaseFailure('canonical decision', recordError); return generic(); }
    // Legacy compatibility projection only: canonical outcome remains authoritative
    // even if this best-effort update cannot be completed.
    const decidedAt = recorded[0].decided_at;
    const { error: legacyProjectionError } = await db.from('quote_shares')
      .update({ commercial_outcome: nextStatus, responded_at: decidedAt, accepted_at: nextStatus === 'ACCEPTED' ? decidedAt : null, rejected_at: nextStatus === 'REJECTED' ? decidedAt : null })
      .eq('id', share.id).eq('lifecycle', 'ACTIVE').eq('commercial_outcome', 'PENDING');
    if (legacyProjectionError) logDatabaseFailure('legacy decision projection', legacyProjectionError);
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }

  if (share.lifecycle === 'ACTIVE') {
    const now = new Date().toISOString();
    const { error: openedError } = await db.from('quote_shares').update({
      opened_at: share.opened_at ?? now,
      first_opened_at: share.opened_at ? undefined : now,
      last_opened_at: now,
    }).eq('id', share.id).eq('lifecycle', 'ACTIVE');
    if (openedError) logDatabaseFailure('opened tracking', openedError);
  }

  const { data: snapshot, error: snapshotError } = await db.from('quote_share_snapshots').select('payload').eq('id', share.snapshot_id).maybeSingle();
  if (snapshotError) { logDatabaseFailure('snapshot lookup', snapshotError); return generic(); }
  return snapshot ? new Response(page(snapshot.payload as PublicPayload, commercialOutcome, canonicalOutcome?.decided_at ?? null, share.lifecycle === 'SUPERSEDED'), { headers: htmlHeaders }) : generic();
});
