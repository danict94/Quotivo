import { useEffect, useState } from 'react';

import { Quote } from '../../domain';
import { Button, DetailList, Section, Stack } from '../../ui/components';
import { Job, JobCapability } from './JobRepository';
import { JobApplicationService } from './JobApplicationService';
import { jobCapabilityPresentation } from './jobCapabilityPresentation';

export function JobQuoteAction({ quote, service, onOpenJob }: { quote: Quote; service: JobApplicationService; onOpenJob: (job: Job) => void }) {
  const [capability, setCapability] = useState<JobCapability | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingCacheRecovery, setPendingCacheRecovery] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setMessage(null);
    void service.resolveForQuote(quote).then((next) => { if (active) setCapability(next); }).catch(() => { if (active) setCapability({ kind: 'ERROR', code: 'REMOTE_ERROR' }); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, quote, service]);

  async function runStart() {
    try {
      setActionLoading(true); setMessage(null);
      if (capability?.kind === 'OPEN') { onOpenJob(capability.job); return; }
      const result = await service.startForQuote(quote);
      if (result.kind === 'COMPLETE') { onOpenJob(result.job); return; }
      setPendingCacheRecovery(true);
      setMessage('Il lavoro è stato avviato, ma va ancora salvato sul dispositivo. Riprova per completare il recupero.');
    } catch {
      setMessage('Non è stato possibile avviare il lavoro. Controlla la connessione e riprova.');
    } finally { setActionLoading(false); }
  }

  async function recoverSnapshot() {
    try {
      setActionLoading(true); setMessage(null);
      await service.recoverSnapshotForQuote(quote);
      setAttempt((value) => value + 1);
    } catch {
      setMessage('Non è stato possibile sincronizzare i dati del preventivo. Riprova quando sei online.');
    } finally { setActionLoading(false); }
  }

  if (loading) return <Section title="Lavoro"><DetailList items={[{ label: 'Stato', value: 'Verifica lavoro…' }]} /></Section>;
  if (pendingCacheRecovery) return <Section title="Lavoro"><Stack gap="sm"><DetailList items={[{ label: 'Stato', value: message ?? 'Recupero locale in attesa.' }]} /><Button disabled={actionLoading} onPress={() => void runStart()}>{actionLoading ? 'Recupero in corso…' : 'Riprova salvataggio'}</Button></Stack></Section>;
  if (!capability) return null;
  const presentation = jobCapabilityPresentation(capability);
  if (presentation.kind === 'UNAVAILABLE') return null;
  if (presentation.kind === 'ERROR') return <Section title="Lavoro"><Stack gap="sm"><DetailList items={[{ label: 'Stato', value: message ?? presentation.message }]} /><Button disabled={actionLoading} variant="secondary" onPress={presentation.recoveryLabel ? () => void recoverSnapshot() : () => setAttempt((value) => value + 1)}>{actionLoading ? 'Sincronizzazione…' : presentation.recoveryLabel ?? 'Riprova'}</Button></Stack></Section>;
  return <Section title="Lavoro"><Stack gap="sm">{message && <DetailList items={[{ label: 'Stato', value: message }]} />}<Button disabled={actionLoading} onPress={() => void runStart()}>{actionLoading ? (capability.kind === 'OPEN' ? 'Apertura lavoro…' : 'Avvio lavoro…') : presentation.label}</Button></Stack></Section>;
}
