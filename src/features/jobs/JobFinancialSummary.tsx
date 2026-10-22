import { useEffect, useState } from 'react';

import { formatMoney } from '../../domain';
import { DetailList, Section, Stack, StatusBadge } from '../../ui/components';
import { JobInputsApplicationService } from './JobInputsApplicationService';
import { Job } from './JobRepository';
import { createJobMetrics, JobEconomicState, JobMetrics, projectJobFinancial } from './jobMetrics';
import { projectJobWorkInputs } from './jobFinancialProjection';

const economicStatePresentation: Record<JobEconomicState, Readonly<{ label: string; tone: 'success' | 'neutral' | 'danger' }>> = {
  PROFIT: { label: 'In profitto', tone: 'success' },
  BREAK_EVEN: { label: 'Pareggio', tone: 'neutral' },
  LOSS: { label: 'In perdita', tone: 'danger' },
};

export function JobFinancialSummary({ job, service }: { job: Job; service: JobInputsApplicationService }) {
  const [metrics, setMetrics] = useState<JobMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setMetrics(null); setError(null);
    void service.load(job.id).then(({ inputs }) => {
      if (!active) return;
      setMetrics(createJobMetrics(projectJobFinancial({ ...projectJobWorkInputs(inputs.costs, inputs.workEntries), baselineQuotedRevenue: job.quotedAmountCents })));
    }).catch(() => { if (active) setError('Non è stato possibile calcolare il riepilogo economico.'); });
    return () => { active = false; };
  }, [job.id, job.quotedAmountCents, service]);
  if (error) return <DetailList items={[{ label: 'Riepilogo economico', value: error }]} />;
  if (!metrics) return <DetailList items={[{ label: 'Riepilogo economico', value: 'Caricamento dati economici…' }]} />;
  const state = economicStatePresentation[metrics.economicState];
  return <Section title="Situazione economica" trailing={<StatusBadge label={state.label} tone={state.tone} />}><Stack gap="sm"><DetailList items={[
    { label: 'Ricavo previsto', value: formatMoney(metrics.projectedRevenue) },
    { label: 'Costi registrati', value: formatMoney(metrics.totalActualCosts) },
    { label: 'Margine operativo', value: formatMoney(metrics.operatingMargin) },
    { label: 'Margine %', value: metrics.operatingMarginPercent === null ? 'Non calcolabile' : `${(metrics.operatingMarginPercent / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` },
    { label: 'Ricavo per giornata titolare', value: metrics.revenuePerOwnerDay === null ? 'Non calcolabile' : formatMoney(metrics.revenuePerOwnerDay) },
    { label: 'Margine per giornata titolare', value: metrics.operatingMarginPerOwnerDay === null ? 'Non calcolabile' : formatMoney(metrics.operatingMarginPerOwnerDay) },
  ]} /></Stack></Section>;
}
