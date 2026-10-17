import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Quote } from '../../domain';
import { EmptyState, Input, Toggle } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { QuoteShareCommercialOutcome } from '../quote-sharing/QuoteSharingRepository';
import { ArchiveCommercialFilter, filterArchiveQuotes } from '../quote-status/archiveQuoteFilter';
import { ArchiveNavigationIntent, archiveCommercialFilterForNavigationIntent } from './archiveNavigation';
import { QuoteRow } from './QuoteRow';

export function ArchiveScreen({ quotes, outcomes, initialArchiveFilter, onStartDraft, onOpenQuote, onDeleteDraft }: { quotes: Quote[]; outcomes: Readonly<Record<string, QuoteShareCommercialOutcome | null>>; initialArchiveFilter?: ArchiveNavigationIntent; onStartDraft: () => void; onOpenQuote: (quote: Quote) => void; onDeleteDraft: (quote: Quote) => void }) {
  const [query, setQuery] = useState('');
  const [commercialFilter, setCommercialFilter] = useState<ArchiveCommercialFilter>(() => archiveCommercialFilterForNavigationIntent(initialArchiveFilter));
  const { theme } = useTheme(); const styles = createStyles(theme); const archiveQuotes = filterArchiveQuotes({ quotes, outcomes, commercialFilter, query });
  return <><View style={styles.header}><View><Text style={styles.pageTitle}>Archivio</Text><Text style={styles.pageSubtitle}>{quotes.length} preventivi salvati sul dispositivo</Text></View><Pressable style={styles.smallButton} onPress={onStartDraft}><Text style={styles.smallButtonText}>+ Nuovo</Text></Pressable></View><Input label="Cerca preventivo" value={query} placeholder="Numero, intervento o cliente" onChangeText={setQuery}/><View style={styles.filters} accessibilityRole="radiogroup" accessibilityLabel="Filtro stato commerciale"><Toggle label="Tutti" active={commercialFilter==='ALL'} onPress={()=>setCommercialFilter('ALL')}/><Toggle label="Bozze" active={commercialFilter==='DRAFT'} onPress={()=>setCommercialFilter('DRAFT')}/><Toggle label="Emessi" active={commercialFilter==='ISSUED'} onPress={()=>setCommercialFilter('ISSUED')}/><Toggle label="In attesa" active={commercialFilter==='PENDING'} onPress={()=>setCommercialFilter('PENDING')}/><Toggle label="Accettati" active={commercialFilter==='ACCEPTED'} onPress={()=>setCommercialFilter('ACCEPTED')}/><Toggle label="Rifiutati" active={commercialFilter==='REJECTED'} onPress={()=>setCommercialFilter('REJECTED')}/></View>{archiveQuotes.map((quote) => <QuoteRow key={quote.id} archive quote={quote} commercialOutcome={outcomes[quote.id] ?? null} onPress={() => onOpenQuote(quote)} onDeleteDraft={quote.status==='draft'?()=>onDeleteDraft(quote):undefined} />)}{!quotes.length ? <EmptyState title="Ancora nessun preventivo" body="Crea una bozza: verrà salvata nell'archivio locale." /> : !archiveQuotes.length && <EmptyState title="Nessun preventivo trovato" body="Modifica la ricerca o il filtro commerciale." />}</>;
}

function createStyles(theme: import('../../ui/tokens').Theme) { return StyleSheet.create({
  header:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'flex-end',gap:12,marginBottom:4},filters:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:12,marginBottom:16},pageTitle:{color:theme.text,fontSize:30,fontWeight:'800',flexShrink:1},pageSubtitle:{color:theme.muted,fontSize:13,marginTop:5,flexShrink:1},smallButton:{backgroundColor:theme.green,borderRadius:12,paddingVertical:11,paddingHorizontal:13,flexShrink:0},smallButtonText:{color:theme.onGreen,fontWeight:'800',fontSize:12},
}); }
