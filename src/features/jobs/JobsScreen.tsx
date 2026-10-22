import { useEffect, useState } from 'react';

import { Button, DetailList, DetailListRow, EmptyState, InlineAction, RecordHeader, ScreenContent, Section, SegmentedTabs, Stack, StatusBadge } from '../../ui/components';
import { Job, JobStatusTransition } from './JobRepository';
import { JobApplicationService, JobListItem } from './JobApplicationService';
import { defaultJobDetailTab, jobDetailTabs, JobDetailTab } from './jobDetailTabs';
import { availableJobStatusTransitions, jobListFilters, JobListFilter, matchesJobListFilter } from './jobStatus';
import { jobStatusPresentation, jobTransitionPresentation } from './jobStatusPresentation';

export function JobsScreen({ service, onOpenJob }: { service: JobApplicationService; onOpenJob: (job: Job) => void }) {
  const [jobs, setJobs] = useState<readonly JobListItem[]>([]);
  const [filter, setFilter] = useState<JobListFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    setLoading(true); setError(null);
    void service.list().then(setJobs).catch(() => setError('Non è stato possibile caricare i lavori salvati sul dispositivo.')).finally(() => setLoading(false));
  };
  useEffect(load, [service]);
  const visibleJobs = jobs.filter(({ job }) => matchesJobListFilter(job.status, filter));
  return <ScreenContent bottom><Stack gap="lg"><RecordHeader title="Lavori" subtitle="I lavori avviati dai preventivi accettati." /><SegmentedTabs tabs={jobListFilters} value={filter} onChange={setFilter} />{loading ? <DetailList items={[{ label: 'Stato', value: 'Caricamento lavori…' }]} /> : error ? <Stack gap="sm"><DetailList items={[{ label: 'Stato', value: error }]} /><Button variant="secondary" onPress={load}>Riprova</Button></Stack> : visibleJobs.length ? <Stack gap="sm">{visibleJobs.map(({ job, sourceReference }) => <JobListRow key={job.id} job={job} sourceReference={sourceReference} onOpenJob={onOpenJob} />)}</Stack> : <EmptyState title="Nessun lavoro avviato" body={filter === 'ALL' ? 'Avvia un lavoro dal dettaglio di un preventivo accettato.' : 'Non ci sono lavori in questo stato.'} />}</Stack></ScreenContent>;
}

function JobListRow({ job, sourceReference, onOpenJob }: { job: Job; sourceReference: string; onOpenJob: (job: Job) => void }) {
  const status = jobStatusPresentation(job.status);
  return <DetailListRow title={job.title} details={`${job.clientName} · ${sourceReference} · ${formatJobAmount(job.quotedAmountCents)}`} trailing={<StatusBadge label={status.label} tone={status.tone} />} actionLabel="Apri lavoro" onAction={() => onOpenJob(job)} />;
}

export function JobDetailScreen({ job, sourceReference, service, onJobUpdated, onClose }: { job: Job; sourceReference: string; service: JobApplicationService; onJobUpdated: (job: Job) => void; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<JobDetailTab>(defaultJobDetailTab);
  const [currentJob, setCurrentJob] = useState(job);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { setCurrentJob(job); setMessage(null); }, [job]);
  const status = jobStatusPresentation(currentJob.status);
  const transitions = availableJobStatusTransitions(currentJob.status);
  const date = new Date(currentJob.startedAt).toLocaleDateString('it-IT');
  async function transition(targetStatus: JobStatusTransition) {
    try {
      setActionLoading(true); setMessage(null);
      const result = await service.transitionStatus(currentJob, targetStatus);
      setCurrentJob(result.job); onJobUpdated(result.job);
      if (result.kind === 'PENDING_CACHE_RECOVERY') setMessage('Stato aggiornato. Riprova più tardi per completare il salvataggio sul dispositivo.');
    } catch { setMessage('Non è stato possibile aggiornare lo stato del lavoro. Controlla la connessione e riprova.'); } finally { setActionLoading(false); }
  }
  return <ScreenContent bottom><Stack gap="lg"><InlineAction label="Torna ai lavori" accessibilityLabel="Torna all'elenco lavori" onPress={onClose} /><RecordHeader overline="Lavoro" title={currentJob.title} subtitle={`${currentJob.clientName} · Da preventivo ${sourceReference}`} trailing={<StatusBadge label={status.label} tone={status.tone} />} /><SegmentedTabs tabs={jobDetailTabs} value={activeTab} onChange={setActiveTab}/>{activeTab === 'summary' ? <Section title="Riepilogo"><Stack gap="sm"><DetailList items={[{ label: 'Cliente', value: currentJob.clientName }, { label: 'Preventivo sorgente', value: sourceReference }, { label: 'Revisione baseline', value: `Rev.${currentJob.sourceRevisionNumber}` }, { label: 'Importo baseline', value: formatJobAmount(currentJob.quotedAmountCents) }, { label: 'Data avvio', value: date }, { label: 'Stato', value: status.label }]} />{message && <DetailList items={[{ label: 'Stato aggiornamento', value: message }]} />}{transitions.length > 0 && <Stack gap="sm">{transitions.map((target) => <Button key={target} disabled={actionLoading} variant={target === 'COMPLETED' ? 'primary' : 'secondary'} onPress={() => void transition(target)}>{actionLoading ? 'Aggiornamento in corso…' : jobTransitionPresentation(target)}</Button>)}</Stack>}</Stack></Section> : <EmptyState title={`${jobDetailTabs.find((tab) => tab.value === activeTab)?.label ?? 'Sezione'} non ancora disponibile`} body="Questa sezione sarà attivata nel relativo scope di prodotto." />}</Stack></ScreenContent>;
}

function formatJobAmount(amountCents: number) { return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amountCents / 100); }
