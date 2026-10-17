import { Pressable, StyleSheet, Text } from 'react-native';

import { formatMoney } from '../../domain';
import { statusTonePalette, StatusTone } from '../../ui/components';
import { useTheme } from '../../ui/theme';

export function CommercialStatCard({ label, count, amountCents, tone, onPress }: { label: string; count: number; amountCents: number; tone: StatusTone; onPress: () => void }) {
  const { theme } = useTheme(); const styles = createStyles(theme); const palette = statusTonePalette(theme, tone);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}: apri archivio filtrato`} onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: palette.backgroundColor, opacity: pressed ? .86 : 1 }]}><Text style={[styles.label, { color: palette.color }]}>{label}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.72} style={styles.value}>{formatMoney(amountCents)}</Text><Text style={styles.detail}>{count} {count === 1 ? 'preventivo' : 'preventivi'}</Text></Pressable>;
}

function createStyles(theme: import('../../ui/tokens').Theme) { return StyleSheet.create({ card:{borderRadius:18,padding:14,flexGrow:1,flexBasis:'46%',minWidth:138},label:{fontSize:11,fontWeight:'900'},value:{color:theme.text,fontSize:18,fontWeight:'900',marginTop:10},detail:{color:theme.muted,fontSize:11,marginTop:4} }); }
