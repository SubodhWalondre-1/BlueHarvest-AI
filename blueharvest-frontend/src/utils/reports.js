export const DEMO_REPORT_LABEL = 'DEMO DATA - includes illustrative samples, not real AI measurements';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function csvCell(value) {
  const text = String(value ?? '');
  const safe = /^\s*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function buildLedgerCsv(batch) {
  const count = Number(batch.count) || 0;
  const headers = ['Batch ID', 'Date & Time', 'Spawn Count', 'Price', 'Surviving (1-4h Transit - 2% Mortality Assumption)',
    'Surviving (12-24h Transit - 10% Mortality Assumption)', 'Surviving (Pond Stocking - 70% Mortality Assumption)', 'Pond Location', 'Record Type'];
  const values = [batch.id, batch.time, count, batch.priceFormatted, Math.round(count * 0.98), Math.round(count * 0.90),
    Math.round(count * 0.30), batch.pond, batch.isDemo ? DEMO_REPORT_LABEL : 'Saved AI count record'];
  return [headers, values].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
