import { StatusTone } from '../../ui/components';
import { JobStatus, JobStatusTransition } from './JobRepository';

export type JobStatusPresentation = Readonly<{ label: string; tone: StatusTone }>;

/** Presentation adapter only: lifecycle authority lives in the Job domain/RPC. */
export function jobStatusPresentation(status: JobStatus): JobStatusPresentation {
  if (status === 'ACTIVE') return { label: 'Attivo', tone: 'success' };
  if (status === 'PAUSED') return { label: 'In pausa', tone: 'warning' };
  if (status === 'COMPLETED') return { label: 'Concluso', tone: 'neutral' };
  return { label: 'Annullato', tone: 'danger' };
}

export function jobTransitionPresentation(target: JobStatusTransition): string {
  if (target === 'PAUSED') return 'Sospendi';
  if (target === 'ACTIVE') return 'Riprendi';
  if (target === 'COMPLETED') return 'Completa';
  return 'Annulla';
}
