import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyQuoteItem, Quote } from '../src/domain';
import { restoreEditorDraft, saveDraftBeforePrerequisite } from '../src/features/quote-editor/editorPrerequisiteNavigation';

function draft(id = 'quote-1', title = 'Originale'): Quote {
  return {
    id, number: null, numberYear: null, clientId: null, client: 'Cliente', clientContactName: '', clientPhone: '', clientEmail: '', clientAddress: '', clientTaxId: '', clientVatNumber: '', siteAddress: '', title, introduction: '', defaultVatBasisPoints: 2200, revisionRootQuoteId: null, parentQuoteId: null, revisionNumber: 0, globalDiscountBasisPoints: 0, status: 'draft', createdAt: '2026-10-18T10:00:00.000Z', updatedAt: '2026-10-18T10:00:00.000Z', issuedAt: null, issuedLocalDate: null, issuedOffsetMinutes: null, validUntil: null, items: [{ ...createEmptyQuoteItem('item-1', 0), description: 'Lavorazione aggiornata', confirmed: false }],
  };
}

for (const prerequisite of ['business-profile', 'numbering'] as const) {
  test(`salva e riprende lo stesso draft per il prerequisito ${prerequisite}`, async () => {
    const original = draft();
    const edited = { ...original, title: 'Modifica non autosalvata', items: [{ ...original.items[0], description: 'Voce non autosalvata' }] };
    const stored: Quote[] = [original];
    const intent = await saveDraftBeforePrerequisite(edited, prerequisite, async (value) => {
      const index = stored.findIndex((quote) => quote.id === value.id);
      assert.equal(index, 0);
      stored[index] = value;
    });

    const restored = restoreEditorDraft(intent, stored);
    assert.equal(intent.quoteId, original.id);
    assert.equal(restored.id, original.id);
    assert.equal(restored.title, 'Modifica non autosalvata');
    assert.equal(restored.items[0].description, 'Voce non autosalvata');
    assert.equal(stored.length, 1);
  });
}

test('non riprende un draft assente o non più modificabile', () => {
  const intent = { quoteId: 'quote-1', prerequisite: 'numbering' as const };
  assert.throws(() => restoreEditorDraft(intent, []), /non è disponibile/);
  assert.throws(() => restoreEditorDraft(intent, [{ ...draft(), status: 'issued', number: 1, numberYear: 2026, issuedAt: '2026-10-18T10:00:00.000Z', issuedLocalDate: '2026-10-18', issuedOffsetMinutes: 120 }]), /non è disponibile/);
});
