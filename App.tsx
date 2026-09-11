import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  Pressable,
  View,
} from 'react-native';

type QuoteStatus = 'Bozza' | 'Inviato' | 'Accettato';

type Quote = {
  id: string;
  number: number;
  client: string;
  title: string;
  date: string;
  total: string;
  status: QuoteStatus;
};

const initialQuotes: Quote[] = [
  {
    id: 'q-3',
    number: 3,
    client: 'Famiglia Rizzo',
    title: 'Ristrutturazione bagno',
    date: '10 set 2026',
    total: '4.860,00 €',
    status: 'Bozza',
  },
  {
    id: 'q-2',
    number: 2,
    client: 'Studio Ferrara',
    title: 'Opere murarie interne',
    date: '8 set 2026',
    total: '2.140,00 €',
    status: 'Inviato',
  },
  {
    id: 'q-1',
    number: 1,
    client: 'Luca Caruso',
    title: 'Ripristino pareti',
    date: '3 set 2026',
    total: '980,00 €',
    status: 'Accettato',
  },
];

const statusColors: Record<QuoteStatus, { background: string; text: string }> = {
  Bozza: { background: '#F2EEE8', text: '#756958' },
  Inviato: { background: '#E7EEF7', text: '#41668D' },
  Accettato: { background: '#E5F1E9', text: '#397151' },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'quotes' | 'settings'>('home');
  const [quotes, setQuotes] = useState(initialQuotes);

  const nextNumber = useMemo(
    () => quotes.reduce((highest, quote) => Math.max(highest, quote.number), 0) + 1,
    [quotes],
  );

  function createDraft() {
    const draft: Quote = {
      id: `q-${nextNumber}`,
      number: nextNumber,
      client: 'Nuovo cliente',
      title: 'Nuovo preventivo',
      date: 'Oggi',
      total: '0,00 €',
      status: 'Bozza',
    };
    setQuotes((current) => [draft, ...current]);
    setActiveTab('quotes');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.appShell}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <View>
              <Text style={styles.eyebrow}>QUOTIVO / 01</Text>
              <Text style={styles.greeting}>Buongiorno, Daniele</Text>
            </View>
            <View style={styles.avatar}><Text style={styles.avatarText}>DS</Text></View>
          </View>

          {activeTab === 'home' && (
            <>
              <View style={styles.heroCard}>
                <View style={styles.heroCopy}>
                  <Text style={styles.heroKicker}>IL TUO CONTROLLO, IN UN SOLO POSTO</Text>
                  <Text style={styles.heroTitle}>Crea il prossimo preventivo in pochi minuti.</Text>
                  <Text style={styles.heroDescription}>Template ordinati, numeri automatici e documenti pronti da inviare.</Text>
                  <Pressable style={styles.primaryButton} onPress={createDraft}>
                    <Text style={styles.primaryButtonText}>+ Nuovo preventivo</Text>
                  </Pressable>
                </View>
                <View style={styles.heroMark}><Text style={styles.heroMarkText}>Q</Text></View>
              </View>

              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Panoramica</Text>
                <Text style={styles.sectionMeta}>SETTEMBRE 2026</Text>
              </View>
              <View style={styles.statsRow}>
                <StatCard label="Totale" value="7.980 €" detail="3 preventivi" />
                <StatCard label="Da seguire" value="2" detail="bozze aperte" />
              </View>

              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Ultimi preventivi</Text>
                <Pressable onPress={() => setActiveTab('quotes')}><Text style={styles.linkText}>Vedi archivio</Text></Pressable>
              </View>
              {quotes.slice(0, 3).map((quote) => <QuoteRow key={quote.id} quote={quote} />)}
            </>
          )}

          {activeTab === 'quotes' && (
            <>
              <View style={styles.archiveHeader}>
                <View><Text style={styles.pageTitle}>Archivio</Text><Text style={styles.pageSubtitle}>{quotes.length} preventivi salvati</Text></View>
                <Pressable style={styles.smallButton} onPress={createDraft}><Text style={styles.smallButtonText}>+ Nuovo</Text></Pressable>
              </View>
              {quotes.map((quote) => <QuoteRow key={quote.id} quote={quote} />)}
            </>
          )}

          {activeTab === 'settings' && (
            <>
              <Text style={styles.pageTitle}>Impostazioni</Text>
              <Text style={styles.pageSubtitle}>Configura Quotivo una volta sola.</Text>
              {['Profilo attività', 'Template e voci', 'Logo e documento', 'Esportazioni'].map((item, index) => (
                <Pressable key={item} style={styles.settingsRow}>
                  <View style={styles.settingsIcon}><Text style={styles.settingsIconText}>{['A', 'T', 'L', 'D'][index]}</Text></View>
                  <Text style={styles.settingsLabel}>{item}</Text><Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </>
          )}
        </ScrollView>
        <View style={styles.tabBar}>
          <TabButton label="Home" symbol="⌂" active={activeTab === 'home'} onPress={() => setActiveTab('home')} />
          <TabButton label="Preventivi" symbol="▤" active={activeTab === 'quotes'} onPress={() => setActiveTab('quotes')} />
          <Pressable style={styles.floatingAdd} onPress={createDraft}><Text style={styles.floatingAddText}>+</Text></Pressable>
          <TabButton label="Impostazioni" symbol="◌" active={activeTab === 'settings'} onPress={() => setActiveTab('settings')} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <View style={styles.statCard}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text><Text style={styles.statDetail}>{detail}</Text></View>;
}

function QuoteRow({ quote }: { quote: Quote }) {
  const colors = statusColors[quote.status];
  return <Pressable style={styles.quoteRow}><View style={styles.quoteNumber}><Text style={styles.quoteNumberText}>{String(quote.number).padStart(2, '0')}</Text></View><View style={styles.quoteMain}><Text style={styles.quoteTitle}>{quote.title}</Text><Text style={styles.quoteClient}>{quote.client} · {quote.date}</Text></View><View style={styles.quoteRight}><Text style={styles.quoteTotal}>{quote.total}</Text><View style={[styles.statusPill, { backgroundColor: colors.background }]}><Text style={[styles.statusText, { color: colors.text }]}>{quote.status}</Text></View></View></Pressable>;
}

function TabButton({ label, symbol, active, onPress }: { label: string; symbol: string; active: boolean; onPress: () => void }) {
  return <Pressable style={styles.tabButton} onPress={onPress}><Text style={[styles.tabSymbol, active && styles.tabActive]}>{symbol}</Text><Text style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F7F4' },
  appShell: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 110 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  eyebrow: { color: '#9A938A', fontSize: 11, letterSpacing: 1.6, fontWeight: '700' },
  greeting: { color: '#1E252B', fontSize: 24, fontWeight: '700', marginTop: 6 },
  avatar: { height: 42, width: 42, borderRadius: 21, backgroundColor: '#192A3A', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#F4EFE8', fontWeight: '800', fontSize: 12 },
  heroCard: { backgroundColor: '#20384C', borderRadius: 24, padding: 22, minHeight: 230, flexDirection: 'row', overflow: 'hidden', marginBottom: 28 },
  heroCopy: { flex: 1, zIndex: 2 },
  heroKicker: { color: '#C9A58B', fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 14 },
  heroTitle: { color: '#FFFFFF', fontSize: 25, lineHeight: 30, fontWeight: '800', maxWidth: 285 },
  heroDescription: { color: '#C6D0D8', fontSize: 13, lineHeight: 19, marginTop: 12, maxWidth: 260 },
  heroMark: { position: 'absolute', right: -20, bottom: -34, width: 150, height: 150, borderRadius: 75, backgroundColor: '#2B4A61', alignItems: 'center', justifyContent: 'center' },
  heroMarkText: { color: '#3B5B70', fontSize: 104, fontWeight: '900' },
  primaryButton: { backgroundColor: '#D08B69', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, alignSelf: 'flex-start', marginTop: 18 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 4 },
  sectionTitle: { color: '#26323A', fontSize: 17, fontWeight: '800' },
  sectionMeta: { color: '#A29A90', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  linkText: { color: '#B76F50', fontWeight: '700', fontSize: 12 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  statCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, flex: 1, borderWidth: 1, borderColor: '#ECE8E2' },
  statLabel: { color: '#8C867E', fontSize: 12, fontWeight: '700' },
  statValue: { color: '#1F2D36', fontSize: 23, fontWeight: '800', marginTop: 10 },
  statDetail: { color: '#A29A90', fontSize: 11, marginTop: 4 },
  quoteRow: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ECE8E2' },
  quoteNumber: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#F0E5DE', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  quoteNumberText: { color: '#B76F50', fontSize: 12, fontWeight: '900' },
  quoteMain: { flex: 1 },
  quoteTitle: { color: '#26323A', fontWeight: '800', fontSize: 13 },
  quoteClient: { color: '#9A938A', fontSize: 11, marginTop: 5 },
  quoteRight: { alignItems: 'flex-end', marginLeft: 8 },
  quoteTotal: { color: '#26323A', fontWeight: '800', fontSize: 12, marginBottom: 6 },
  statusPill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 9, fontWeight: '800' },
  archiveHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22 },
  pageTitle: { color: '#1E252B', fontSize: 30, fontWeight: '800' },
  pageSubtitle: { color: '#8C867E', fontSize: 13, marginTop: 5 },
  smallButton: { backgroundColor: '#20384C', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 13 },
  smallButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  settingsRow: { backgroundColor: '#FFFFFF', borderRadius: 15, padding: 15, flexDirection: 'row', alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#ECE8E2' },
  settingsIcon: { height: 36, width: 36, borderRadius: 10, backgroundColor: '#F0E5DE', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  settingsIconText: { color: '#B76F50', fontWeight: '900' },
  settingsLabel: { flex: 1, color: '#26323A', fontWeight: '700', fontSize: 14 },
  chevron: { color: '#A29A90', fontSize: 23 },
  tabBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 78, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#ECE8E2', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 30 },
  tabButton: { alignItems: 'center', minWidth: 70 },
  tabSymbol: { color: '#ADA69D', fontSize: 20, lineHeight: 24 },
  tabLabel: { color: '#ADA69D', fontSize: 10, fontWeight: '700', marginTop: 3 },
  tabActive: { color: '#B76F50' },
  floatingAdd: { width: 52, height: 52, borderRadius: 18, backgroundColor: '#D08B69', alignItems: 'center', justifyContent: 'center', marginTop: -28, shadowColor: '#8F4F35', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  floatingAddText: { color: '#FFFFFF', fontSize: 30, fontWeight: '300', lineHeight: 32 },
});
