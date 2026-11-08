import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLedgerCsv, DEMO_REPORT_LABEL, escapeHtml } from '../src/utils/reports.js';

test('report text escapes script, attribute, and HTML markup', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">&\'pond\''),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;pond&#39;');
  assert.equal(escapeHtml(null), '');
});

test('CSV preserves commas, quotes, line breaks, and Unicode', () => {
  const csv = buildLedgerCsv({ id: 'BAT-1', count: 10, pond: 'Pond "A", Nagpur\nपाणी', priceFormatted: '₹50.25' });
  assert.ok(csv.includes('"Pond ""A"", Nagpur\nपाणी"'));
  assert.ok(csv.includes('₹50.25'));
  assert.ok(csv.includes('"Saved AI count record"'));
});

test('CSV marks demo samples and neutralizes spreadsheet formulas', () => {
  const csv = buildLedgerCsv({ id: 'BAT-DEMO', count: 100, pond: '=HYPERLINK("https://example.test")', isDemo: true });
  assert.ok(csv.includes(DEMO_REPORT_LABEL));
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.test"")"'));
  assert.ok(csv.includes('Mortality Assumption'));
});
