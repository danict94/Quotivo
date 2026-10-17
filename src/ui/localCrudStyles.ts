import { Theme } from './tokens';

/** Shared presentation tokens for local CRUD feature screens. */
export function localCrudStyles(theme: Theme) {
  return {
    header: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, justifyContent: 'space-between' as const, alignItems: 'flex-end' as const, gap: 12, marginBottom: 4 },
    pageTitle: { color: theme.text, fontSize: 30, fontWeight: '800' as const, flexShrink: 1 },
    pageSubtitle: { color: theme.muted, fontSize: 13, marginTop: 5, flexShrink: 1 },
    linkText: { color: theme.violet, fontWeight: '800' as const, fontSize: 12 },
    primaryAction: { backgroundColor: theme.green, borderRadius: 16, padding: 15, alignItems: 'center' as const, marginBottom: 10 },
    primaryButtonText: { color: theme.onGreen, fontSize: 12, fontWeight: '800' as const },
    deleteAction: { padding: 18, alignItems: 'center' as const },
    deleteLink: { color: theme.danger, fontSize: 11, fontWeight: '800' as const },
    smallButton: { backgroundColor: theme.green, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 13, flexShrink: 0 },
    smallButtonText: { color: theme.onGreen, fontWeight: '800' as const, fontSize: 12 },
    compactItemCard: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 18, padding: 14, marginBottom: 10 },
    quoteTitle: { color: theme.text, fontWeight: '800' as const, fontSize: 13, flexShrink: 1 },
    quoteClient: { color: theme.muted, fontSize: 11, marginTop: 5, flexShrink: 1 },
    emptyCard: { padding: 24, alignItems: 'center' as const },
    emptyTitle: { color: theme.text, fontWeight: '800' as const, marginBottom: 6 },
    emptyText: { color: theme.muted, textAlign: 'center' as const, fontSize: 12, lineHeight: 18 },
  };
}
