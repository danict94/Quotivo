import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { defaultIssuedQuoteDetailTab, issuedQuoteDetailTabs } from '../src/features/quote-detail/issuedQuoteDetailTabs';

test('il dettaglio issued apre Riepilogo e definisce le tre tab locali', () => {
  assert.equal(defaultIssuedQuoteDetailTab, 'summary');
  assert.deepEqual(issuedQuoteDetailTabs.map((tab) => tab.value), ['summary', 'document', 'activity']);
});

test('le tab sono collegate allo stato locale e alle tre superfici del dettaglio', async () => {
  const source = await readFile(path.join(process.cwd(), 'App.tsx'), 'utf8');
  assert.match(source, /useState<IssuedQuoteDetailTab>\(defaultIssuedQuoteDetailTab\)/);
  assert.match(source, /<SegmentedTabs tabs=\{issuedQuoteDetailTabs\} value=\{activeTab\} onChange=\{setActiveTab\}\/>/);
  assert.match(source, /activeTab==='summary'/);
  assert.match(source, /activeTab==='document'/);
  assert.match(source, /activeTab==='activity'/);
});
