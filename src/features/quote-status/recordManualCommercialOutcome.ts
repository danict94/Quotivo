type CommercialOutcome = 'PENDING' | 'ACCEPTED' | 'REJECTED';
type CommercialOutcomeSource = 'MANUAL' | 'PUBLIC_LINK' | null;

export type CanonicalCommercialOutcome = Readonly<{
  outcome: CommercialOutcome;
  source: CommercialOutcomeSource;
  decidedAt: string | null;
}>;

export type ManualCommercialOutcome = Exclude<CommercialOutcome, 'PENDING'>;

export class CommercialOutcomeRemoteError extends Error {
  constructor(readonly code: 'ALREADY_DECIDED' | 'OFFLINE' | 'AUTH' | 'RLS' | 'REMOTE_ERROR') {
    super(code);
  }
}

export interface CommercialOutcomeRepository {
  recordManualOutcome(issuanceId: string, outcome: ManualCommercialOutcome): Promise<CanonicalCommercialOutcome>;
  getCommercialOutcome(issuanceId: string): Promise<CanonicalCommercialOutcome>;
}

/** Server-first: callers must persist or render only the returned canonical record. */
export async function recordManualCommercialOutcome(
  repository: CommercialOutcomeRepository,
  issuanceId: string,
  outcome: ManualCommercialOutcome,
) {
  if (!issuanceId) throw new Error('Emissione Quotivo non disponibile.');
  if (outcome !== 'ACCEPTED' && outcome !== 'REJECTED') throw new Error('Esito commerciale non valido.');
  return repository.recordManualOutcome(issuanceId, outcome);
}

export function commercialOutcomeProvenanceLabel(value: CanonicalCommercialOutcome): string | null {
  if (value.outcome === 'PENDING' || !value.decidedAt || !value.source) return null;
  const date = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeZone: 'Europe/Rome' }).format(new Date(value.decidedAt));
  return `${value.outcome === 'ACCEPTED' ? 'Accettato' : 'Rifiutato'} il ${date}\n${value.source === 'MANUAL' ? 'Registrato manualmente' : 'Tramite link Quotivo'}`;
}
