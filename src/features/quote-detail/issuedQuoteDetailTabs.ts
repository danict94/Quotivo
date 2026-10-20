export const issuedQuoteDetailTabs = [
  { value: 'summary', label: 'Riepilogo', accessibilityLabel: 'Scheda riepilogo' },
  { value: 'document', label: 'Documento', accessibilityLabel: 'Scheda documento' },
  { value: 'activity', label: 'Attività', accessibilityLabel: 'Scheda attività' },
] as const;

export type IssuedQuoteDetailTab = (typeof issuedQuoteDetailTabs)[number]['value'];
export const defaultIssuedQuoteDetailTab: IssuedQuoteDetailTab = 'summary';
