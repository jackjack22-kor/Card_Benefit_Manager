export function won(value) {
  const n = Number(value || 0);
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

export function compactWon(value) {
  const n = Number(value || 0);
  if (n >= 100000000) return `${(n / 100000000).toFixed(1).replace('.0', '')}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만`;
  return n.toLocaleString('ko-KR');
}

export function pct(value, fractionDigits = 1) {
  const n = Number(value || 0);
  return `${(n * 100).toFixed(fractionDigits).replace(/\.0$/, '')}%`;
}

export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function yearKey(date = new Date()) {
  return String(date.getFullYear());
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
