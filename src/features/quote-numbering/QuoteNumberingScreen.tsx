import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { listQuotes } from '../../database';
import { SupabaseQuoteNumberingRepository } from './SupabaseQuoteNumberingRepository';
import { Input } from '../../ui/components';
import { showError } from '../../ui/showOperationError';
import { useLegacyStyles } from '../../ui/legacyStyles';

const quoteNumberingRepository = new SupabaseQuoteNumberingRepository();

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  return <Input {...props} />;
}

export function QuoteNumberingScreen({onClose,closeLabel='Chiudi'}:{onClose:()=>void;closeLabel?:string}) {
  const styles = useLegacyStyles();
  const year=new Date().getFullYear(); const [current,setCurrent]=useState<{lastNumber:number;nextNumber:number}|undefined>(undefined); const [external,setExternal]=useState(''); const [localMax,setLocalMax]=useState(0); const [saving,setSaving]=useState(false);
  useEffect(()=>{Promise.all([quoteNumberingRepository.get(year),listQuotes()]).then(([sequence,quotes])=>{setCurrent(sequence??{lastNumber:0,nextNumber:1});setLocalMax(Math.max(0,...quotes.filter(q=>q.numberYear===year).map(q=>q.number??0)));}).catch(showError);},[year]);
  const typed=Number(external); const baseline=Math.max(localMax,Number.isSafeInteger(typed)&&typed>=0?typed:0); const next=(current?.lastNumber??baseline)+1;
  async function save(start:boolean){try{setSaving(true);const value=start?baseline:typed;if(!Number.isSafeInteger(value)||value<0)throw new Error('Inserisci un numero valido.');if(!start&&current&&value<=current.lastNumber)throw new Error('Inserisci un numero maggiore dell’ultimo già registrato.');const result=start?await quoteNumberingRepository.initialize(year,value):await quoteNumberingRepository.advance(year,value);setCurrent(result);setExternal('');Alert.alert('Numerazione aggiornata',`Il prossimo preventivo sarà ${result.nextNumber}/${year}.`);}catch(error){showError(error)}finally{setSaving(false)}}
  if(!current)return <View style={styles.center}><ActivityIndicator color="#B76F50"/></View>;
  const active=current.lastNumber>0||current.nextNumber>1;
  return <View><View style={styles.archiveHeader}><View><Text style={styles.pageTitle}>Numerazione preventivi</Text><Text style={styles.pageSubtitle}>Mantieni una numerazione continua anche se usi altri software.</Text></View><Pressable onPress={onClose}><Text style={styles.linkText}>{closeLabel}</Text></Pressable></View>{!active?<><Text style={styles.formSection}>PRIMA CONFIGURAZIONE</Text><View style={styles.compactItemCard}><Text style={styles.quoteTitle}>Come vuoi iniziare la numerazione?</Text><Text style={styles.quoteClient}>Utile se stai passando a Quotivo da un altro software.</Text><Pressable disabled={saving} style={styles.primaryAction} onPress={()=>void save(true)}><Text style={styles.primaryButtonText}>Inizia una nuova numerazione</Text></Pressable><Text style={styles.quoteClient}>Prossimo preventivo: {Math.max(1,baseline+1)}/{year}</Text></View><View style={styles.compactItemCard}><Text style={styles.quoteTitle}>Continua la numerazione che usi già</Text><Field label="Ultimo numero utilizzato" value={external} editable={!saving} keyboardType="number-pad" placeholder="Es. 47" onChangeText={setExternal}/><Text style={styles.quoteClient}>Il prossimo preventivo sarà {Math.max(1,baseline+1)}/{year}</Text><Pressable disabled={saving} style={styles.previewAction} onPress={()=>void save(true)}><Text style={styles.previewActionText}>Continua numerazione</Text></Pressable></View></>:<><View style={styles.compactItemCard}><Text style={styles.quoteTitle}>Numerazione {year}</Text><Text style={styles.quoteClient}>Ultimo numero: {current.lastNumber}/{year}</Text><Text style={styles.quoteTotal}>Prossimo: {current.nextNumber}/{year}</Text></View><Text style={styles.formSection}>AGGIORNA</Text><View style={styles.compactItemCard}><Text style={styles.quoteTitle}>Ho emesso preventivi fuori Quotivo</Text><Text style={styles.quoteClient}>Se utilizzi anche altri software, aggiorna qui l’ultimo numero utilizzato prima di emettere il prossimo preventivo con Quotivo.</Text><Field label="Ultimo numero utilizzato fuori Quotivo" value={external} editable={!saving} keyboardType="number-pad" onChangeText={setExternal}/>{Number.isSafeInteger(typed)&&typed>current.lastNumber&&<Text style={styles.quoteClient}>Il prossimo Quotivo sarà {typed+1}/{year}</Text>}<Pressable disabled={saving} style={styles.previewAction} onPress={()=>void save(false)}><Text style={styles.previewActionText}>Aggiorna numero</Text></Pressable></View></>}</View>;
}

