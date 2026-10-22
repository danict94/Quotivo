export const jobDetailTabs = [
  { value: 'summary', label: 'Riepilogo', accessibilityLabel: 'Scheda riepilogo lavoro' },
  { value: 'activities', label: 'Attività', accessibilityLabel: 'Scheda attività lavoro' },
  { value: 'costs', label: 'Costi', accessibilityLabel: 'Scheda costi lavoro' },
  { value: 'extras', label: 'Extra', accessibilityLabel: 'Scheda extra lavoro' },
] as const;

export type JobDetailTab = (typeof jobDetailTabs)[number]['value'];
export const defaultJobDetailTab: JobDetailTab = 'summary';
