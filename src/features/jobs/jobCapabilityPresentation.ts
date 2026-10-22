import { JobCapability } from './JobRepository';

export type JobCapabilityPresentation =
  | Readonly<{ kind: 'ACTION'; label: 'Avvia lavoro' | 'Apri lavoro' }>
  | Readonly<{ kind: 'UNAVAILABLE' }>
  | Readonly<{ kind: 'ERROR'; message: string; recoveryLabel?: 'Sincronizza dati preventivo' }>;

/** Presentation-only mapping: remote/domain authority remains in JobApplicationService. */
export function jobCapabilityPresentation(capability: JobCapability): JobCapabilityPresentation {
  if (capability.kind === 'START') return { kind: 'ACTION', label: 'Avvia lavoro' };
  if (capability.kind === 'OPEN') return { kind: 'ACTION', label: 'Apri lavoro' };
  if (capability.kind === 'NONE') return { kind: 'UNAVAILABLE' };
  if (capability.code === 'SNAPSHOT_MISSING') {
    return {
      kind: 'ERROR',
      message: 'I dati immutabili di questo preventivo non sono ancora sincronizzati.',
      recoveryLabel: 'Sincronizza dati preventivo',
    };
  }
  if (capability.code === 'OFFLINE') return { kind: 'ERROR', message: 'Non è possibile verificare il lavoro collegato senza connessione.' };
  return { kind: 'ERROR', message: 'Non è possibile verificare il lavoro collegato. Riprova quando sei online.' };
}
