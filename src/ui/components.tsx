import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { radius, spacing, touchTargets, typography } from './tokens';
import { useTheme } from './theme';

type PressableProps = ComponentProps<typeof Pressable>;
export type StatusTone = 'neutral' | 'warning' | 'success' | 'danger';

export function statusTonePalette(theme: import('./tokens').Theme, tone: StatusTone) {
  if (tone === 'neutral') return { backgroundColor: theme.neutralSoft, color: theme.neutral };
  if (tone === 'warning') return { backgroundColor: theme.warningSoft, color: theme.warning };
  if (tone === 'success') return { backgroundColor: theme.greenSoft, color: theme.greenStrong };
  return { backgroundColor: theme.dangerSoft, color: theme.danger };
}

/** Shared semantic badge using the active Design System theme. */
export function StatusBadge({ label, tone, icon, accessibilityLabel }: { label: string; tone: StatusTone; icon?: ReactNode; accessibilityLabel?: string }) {
  const { theme } = useTheme(); const styles = createStyles(theme); const palette = statusTonePalette(theme, tone);
  return <View accessibilityLabel={accessibilityLabel ?? label} style={[styles.statusBadge, { backgroundColor: palette.backgroundColor }]}>{icon}<Text numberOfLines={1} style={[styles.statusBadgeText, { color: palette.color }]}>{label}</Text></View>;
}

export function Button({ children, variant = 'primary', style, ...props }: Omit<PressableProps, 'children' | 'style'> & { children: ReactNode; variant?: 'primary' | 'secondary' | 'danger'; style?: StyleProp<ViewStyle> }) {
  const {theme}=useTheme(); const styles=createStyles(theme);
  return <Pressable {...props} style={[styles.button, styles[`button_${variant}`], style]}><Text style={[styles.buttonText, styles[`buttonText_${variant}`]]}>{children}</Text></Pressable>;
}

export function Input({ label, compact = false, style, ...props }: ComponentProps<typeof TextInput> & { label: string; compact?: boolean }) {
  const {theme}=useTheme(); const styles=createStyles(theme);
  return <View style={compact ? styles.compactField : styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} style={[compact ? styles.compactInput : styles.input, props.editable === false && styles.inputLocked, style]} placeholderTextColor={theme.muted} /></View>;
}

/** @public Primitiva UI condivisa per superfici con bordo e padding. */
export function Card({ children, style }: { children: ReactNode; style?: ComponentProps<typeof View>['style'] }) { const {theme}=useTheme();const styles=createStyles(theme); return <View style={[styles.card, style]}>{children}</View>; }
/** @public Primitiva UI condivisa per sezioni con intestazione. */
export function Section({ title, trailing, children }: { title: string; trailing?: ReactNode; children: ReactNode }) { const {theme}=useTheme();const styles=createStyles(theme); return <View style={styles.section}><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text>{trailing}</View>{children}</View>; }
export function Select({ value, onPress, disabled }: { value: string; onPress: () => void; disabled?: boolean }) { const {theme}=useTheme();const styles=createStyles(theme); return <Pressable disabled={disabled} style={[styles.select, disabled && styles.disabled]} onPress={onPress}><Text style={styles.selectText}>{value}</Text><Icon name="chevron-down" size={18} /></Pressable>; }
export function Toggle({ label, active, onPress, disabled, fullWidth }: { label: string; active: boolean; onPress: () => void; disabled?: boolean; fullWidth?: boolean }) { const {theme}=useTheme();const styles=createStyles(theme); return <Pressable disabled={disabled} onPress={onPress} style={[styles.toggle, fullWidth && styles.toggleFullWidth, active && styles.toggleActive, disabled && styles.disabled]}><Text style={[styles.toggleText, active && styles.toggleTextActive]}>{label}</Text></Pressable>; }
export type SegmentedTab<Value extends string> = Readonly<{ value: Value; label: string; accessibilityLabel?: string }>;
/** Shared compact in-page navigation for a small, mutually-exclusive set of sections. */
export function SegmentedTabs<Value extends string>({ tabs, value, onChange }: { tabs: readonly SegmentedTab<Value>[]; value: Value; onChange: (value: Value) => void }) { const {theme}=useTheme();const styles=createStyles(theme); return <View accessibilityRole="tablist" style={styles.segmentedTabs}>{tabs.map((tab)=>{const selected=tab.value===value;return <Pressable key={tab.value} accessibilityRole="tab" accessibilityLabel={tab.accessibilityLabel??tab.label} accessibilityState={{selected}} onPress={()=>onChange(tab.value)} style={[styles.segmentedTab,selected&&styles.segmentedTabSelected]}><Text numberOfLines={1} style={[styles.segmentedTabText,selected&&styles.segmentedTabTextSelected]}>{tab.label}</Text></Pressable>;})}</View>; }
export function Stack({ children, gap = 'md' }: { children: ReactNode; gap?: keyof typeof spacing }) { return <View style={{ gap: spacing[gap] }}>{children}</View>; }
export function ScreenContent({ children, bottom = false }: { children: ReactNode; bottom?: boolean }) { const {theme}=useTheme();const styles=createStyles(theme);return <View style={[styles.screenContent,bottom&&styles.screenContentBottom]}>{children}</View>; }
export function UsageSummary({ title, primary, secondary, error, loading }: { title: string; primary?: string; secondary?: string; error?: string | null; loading?: boolean }) { const {theme}=useTheme();const styles=createStyles(theme);return <View style={styles.usageSummary}><Text style={styles.usageTitle}>{title}</Text>{loading?<Text style={styles.usageSecondary}>Caricamento quota…</Text>:error?<Text style={styles.usageError}>{error}</Text>:<><Text style={styles.usagePrimary}>{primary}</Text><Text style={styles.usageSecondary}>{secondary}</Text></>}</View>; }
/** Shared compact action row for secondary navigation or settings. */
export function InlineAction({ label, accessibilityLabel, onPress }: { label: string; accessibilityLabel?: string; onPress: () => void }) { const {theme}=useTheme();const styles=createStyles(theme); return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress} style={styles.inlineAction}><Text numberOfLines={1} style={styles.inlineActionText}>{label}</Text><Icon name="chevron-right" size={18} color={theme.violet}/></Pressable>; }
/** Shared read-only row with an optional explicit action. */
export function DetailListRow({ title, details, trailing, actionLabel, onAction, disabled }: { title: string; details: string; trailing?: ReactNode; actionLabel?: string; onAction?: () => void; disabled?: boolean }) { const {theme}=useTheme();const styles=createStyles(theme); return <Card><View style={styles.detailListRowTop}><View style={styles.detailListRowCopy}><Text style={styles.detailListRowTitle}>{title}</Text><Text style={styles.detailListRowDetails}>{details}</Text></View>{trailing}</View>{actionLabel&&onAction&&<Button disabled={disabled} variant="secondary" onPress={onAction}>{actionLabel}</Button>}</Card>; }
export function EmptyState({ title, body }: { title: string; body: string }) { const {theme}=useTheme();const styles=createStyles(theme); return <Card style={styles.empty}><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyBody}>{body}</Text></Card>; }

function createStyles(theme: import('./tokens').Theme) { return StyleSheet.create({
  button:{minHeight:touchTargets.minimum,borderRadius:radius.md,paddingHorizontal:spacing.md,alignItems:'center',justifyContent:'center'},button_primary:{backgroundColor:theme.green},button_secondary:{backgroundColor:theme.violetSoft,borderWidth:1,borderColor:theme.violet},button_danger:{backgroundColor:theme.surface,borderWidth:1,borderColor:theme.danger},buttonText:{...typography.button},buttonText_primary:{color:theme.onGreen},buttonText_secondary:{color:theme.violet},buttonText_danger:{color:theme.danger},
  field:{marginTop:18},compactField:{flex:1},label:{...typography.label,color:theme.text,marginBottom:7,textTransform:'uppercase'},input:{backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border,borderRadius:radius.md,paddingHorizontal:13,paddingVertical:12,color:theme.text,fontSize:14},compactInput:{backgroundColor:theme.surface2,borderWidth:1,borderColor:theme.border,borderRadius:radius.sm,paddingHorizontal:9,paddingVertical:10,color:theme.text,fontSize:13},inputLocked:{backgroundColor:theme.surface2,color:theme.muted},
  card:{backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border,borderRadius:radius.lg,padding:spacing.md},section:{marginTop:spacing.lg},sectionHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:spacing.sm},sectionTitle:{...typography.section,color:theme.text},
  select:{minHeight:touchTargets.minimum,backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border,borderRadius:radius.sm,paddingHorizontal:spacing.sm,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},selectText:{color:theme.text,fontWeight:'800',fontSize:13,flexShrink:1},toggle:{borderWidth:1,borderColor:theme.border,borderRadius:radius.pill,paddingHorizontal:12,paddingVertical:8,backgroundColor:theme.surface2,minHeight:touchTargets.compact,justifyContent:'center'},toggleFullWidth:{alignSelf:'stretch',alignItems:'center'},toggleActive:{backgroundColor:theme.green,borderColor:theme.green},toggleText:{fontSize:11,fontWeight:'700',color:theme.muted},toggleTextActive:{color:theme.onGreen},disabled:{opacity:0.55},
  segmentedTabs:{flexDirection:'row',gap:spacing.xxs,padding:spacing.xxs,borderRadius:radius.lg,backgroundColor:theme.surface2,borderWidth:1,borderColor:theme.border},segmentedTab:{flex:1,minWidth:0,minHeight:touchTargets.minimum,borderRadius:radius.md,alignItems:'center',justifyContent:'center',paddingHorizontal:spacing.xs},segmentedTabSelected:{backgroundColor:theme.green},segmentedTabText:{...typography.button,color:theme.muted},segmentedTabTextSelected:{color:theme.onGreen},screenContent:{paddingHorizontal:spacing.lg,paddingTop:spacing.lg},screenContentBottom:{paddingBottom:spacing.section},
  usageSummary:{borderTopWidth:1,borderTopColor:theme.border,marginTop:spacing.sm,paddingTop:spacing.sm,gap:spacing.xxs},usageTitle:{...typography.label,color:theme.text},usagePrimary:{...typography.body,color:theme.text,fontWeight:'800'},usageSecondary:{...typography.bodySmall,color:theme.muted},usageError:{...typography.bodySmall,color:theme.danger},
  inlineAction:{minHeight:touchTargets.compact,backgroundColor:theme.surface2,borderWidth:1,borderColor:theme.border,borderRadius:radius.md,paddingHorizontal:spacing.sm,flexDirection:'row',alignItems:'center',gap:spacing.xs},inlineActionText:{...typography.bodySmall,color:theme.violet,fontWeight:'800',flex:1,minWidth:0},detailListRowTop:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:spacing.sm,marginBottom:spacing.sm},detailListRowCopy:{flex:1,minWidth:0,gap:spacing.xxs},detailListRowTitle:{...typography.label,color:theme.text},detailListRowDetails:{...typography.bodySmall,color:theme.muted},
  empty:{padding:spacing.xl,alignItems:'center'},emptyTitle:{color:theme.text,fontWeight:'800',marginBottom:6},emptyBody:{color:theme.muted,textAlign:'center',fontSize:12,lineHeight:18},
  statusBadge:{flexDirection:'row',alignItems:'center',gap:4,borderRadius:radius.pill,maxWidth:'100%',paddingHorizontal:8,paddingVertical:4},statusBadgeText:{fontSize:9,fontWeight:'800'},
}); }
