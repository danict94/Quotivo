import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Client, deleteClient, listClients, saveClient } from '../../database';
import { Input } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { localCrudStyles } from '../../ui/localCrudStyles';
import { showError } from '../../ui/showOperationError';
import { Theme } from '../../ui/tokens';

export function ClientsEditor({ onCreateQuote }: { onCreateQuote: (client: Client) => Promise<void> }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(''); const [address, setAddress] = useState(''); const [taxId, setTaxId] = useState(''); const [vatNumber, setVatNumber] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState(''); const [contactName, setContactName] = useState('');
  const refresh = useCallback(async () => setClients(await listClients(query)), [query]);
  useEffect(() => { refresh().catch(showError); }, [refresh]);

  function edit(client: Client) { setEditing(client); setName(client.name); setAddress(client.address); setTaxId(client.taxId); setVatNumber(client.vatNumber); setPhone(client.phone); setEmail(client.email); setContactName(client.contactName); }
  function create() { setEditing({ id: '', name: '', address: '', taxId: '', vatNumber: '', phone: '', email: '', contactName: '', createdAt: '', updatedAt: '' }); setName(''); setAddress(''); setTaxId(''); setVatNumber(''); setPhone(''); setEmail(''); setContactName(''); }
  async function save() { if (!editing) return; try { setSaving(true); const saved = await saveClient({ id: editing.id || undefined, name, address, taxId, vatNumber, phone, email, contactName }); setClients((current) => [...current.filter((client) => client.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, 'it'))); setEditing(null); } catch (error) { showError(error); } finally { setSaving(false); } }
  async function createQuote() { if (!editing) return; try { setSaving(true); const saved = await saveClient({ id: editing.id || undefined, name, address, taxId, vatNumber, phone, email, contactName }); await onCreateQuote(saved); } catch (error) { showError(error); } finally { setSaving(false); } }
  function remove(client: Client) { Alert.alert('Eliminare cliente?', `“${client.name}” verrà rimosso solo dalla rubrica; i preventivi restano invariati.`, [{ text: 'Annulla', style: 'cancel' }, { text: 'Elimina', style: 'destructive', onPress: async () => { try { await deleteClient(client.id); setClients((current) => current.filter((value) => value.id !== client.id)); setEditing(null); } catch (error) { showError(error); } } }]); }

  if (editing) return <View><View style={styles.header}><View><Text style={styles.pageTitle}>{editing.id ? 'Modifica cliente' : 'Nuovo cliente'}</Text><Text style={styles.pageSubtitle}>I preventivi già creati non vengono modificati.</Text></View><Pressable onPress={() => setEditing(null)}><Text style={styles.linkText}>Chiudi</Text></Pressable></View><Input label="Nome / Ragione sociale" value={name} editable placeholder="Es. Mario Rossi" onChangeText={setName} /><Input label="Indirizzo" value={address} editable onChangeText={setAddress} /><View style={styles.twoColumns}><View style={styles.column}><Input label="Codice fiscale" value={taxId} editable onChangeText={setTaxId} /></View><View style={styles.column}><Input label="P. IVA" value={vatNumber} editable onChangeText={setVatNumber} /></View></View><Input label="Telefono" value={phone} editable keyboardType="phone-pad" onChangeText={setPhone} /><Input label="Email" value={email} editable keyboardType="email-address" autoCapitalize="none" onChangeText={setEmail} /><Input label="Referente" value={contactName} editable onChangeText={setContactName} /><Pressable disabled={saving} style={styles.primaryAction} onPress={save}><Text style={styles.primaryButtonText}>{saving ? 'Salvataggio…' : 'Salva modifiche'}</Text></Pressable><Pressable disabled={saving} style={styles.previewAction} onPress={() => void createQuote()}><Text style={styles.previewActionText}>Crea preventivo</Text></Pressable>{Boolean(editing.id) && <Pressable disabled={saving} style={styles.deleteAction} onPress={() => remove(editing)}><Text style={styles.deleteLink}>Elimina cliente</Text></Pressable>}</View>;
  return <View><View style={styles.header}><View><Text style={styles.pageTitle}>Clienti</Text><Text style={styles.pageSubtitle}>Rubrica locale del dispositivo.</Text></View><Pressable style={styles.smallButton} onPress={create}><Text style={styles.smallButtonText}>+ Nuovo cliente</Text></Pressable></View><Input label="Cerca cliente" value={query} editable placeholder="Nome o referente" onChangeText={setQuery} />{clients.map((client) => <Pressable key={client.id} style={styles.compactItemCard} onPress={() => edit(client)}><Text style={styles.quoteTitle}>{client.name}</Text>{Boolean(client.address) && <Text style={styles.quoteClient}>{client.address}</Text>}</Pressable>)}{!clients.length && <View style={styles.emptyCard}><Text style={styles.emptyTitle}>{query ? 'Nessun risultato' : 'Rubrica vuota'}</Text><Text style={styles.emptyText}>Aggiungi un cliente o salvalo durante un preventivo.</Text></View>}</View>;
}

function createStyles(theme: Theme) { return StyleSheet.create({
  ...localCrudStyles(theme),
  twoColumns: { flexDirection: 'row', gap: 8 }, column: { flex: 1, minWidth: 0 }, previewAction: { backgroundColor: theme.violetSoft, borderWidth: 1, borderColor: theme.violet, borderRadius: 16, padding: 15, alignItems: 'center', marginBottom: 10 }, previewActionText: { color: theme.violet, fontSize: 13, fontWeight: '800' },
}); }
