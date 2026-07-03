import { todayKey } from './format.js';

export const CYCLE_LABELS = {
  calendar: '캘린더 연도',
  anniversary: '연회비 주기',
  issueMonth: '발급월 기준',
  quarter: '분기 기준'
};

export function getMonthKey(date = new Date()) {
  return todayKey(date);
}

export function getCycle(card, override = {}, benefit = {}, date = new Date()) {
  const cardCycle = {
    ...(card.defaultCycle || { type: 'calendar', startMonth: 1 }),
    ...(override.cycle || {})
  };
  const cycleType = benefit.cycleType || cardCycle.type || 'calendar';
  const startMonth = getCycleStartMonth(cycleType, cardCycle);
  return cycleRange(cycleType, startMonth, date);
}

export function getCycleStartMonth(cycleType, cycle = {}) {
  if (cycleType === 'anniversary') return Number(cycle.annualFeeStartMonth || cycle.startMonth || 1);
  if (cycleType === 'issueMonth') return Number(cycle.issueMonth || cycle.startMonth || 1);
  if (cycleType === 'calendar' || cycleType === 'quarter') return 1;
  return Number(cycle.startMonth || 1);
}

export function cycleRange(type, startMonth = 1, date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (type === 'quarter') {
    const qStart = Math.floor((month - 1) / 3) * 3 + 1;
    return rangeFromMonths(year, qStart, 3, 'quarter');
  }
  if (type === 'calendar') {
    return rangeFromMonths(year, 1, 12, 'calendar');
  }
  const startYear = month >= startMonth ? year : year - 1;
  return rangeFromMonths(startYear, startMonth, 12, type);
}

function rangeFromMonths(startYear, startMonth, months, type) {
  const start = new Date(startYear, startMonth - 1, 1);
  const end = new Date(startYear, startMonth - 1 + months, 0);
  const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
  const endKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
  return {
    type,
    start,
    end,
    startKey,
    endKey,
    label: `${start.getFullYear()}.${String(start.getMonth() + 1).padStart(2, '0')} ~ ${end.getFullYear()}.${String(end.getMonth() + 1).padStart(2, '0')}`
  };
}

export function isMonthInCycle(monthKey, cycle) {
  return monthKey >= cycle.startKey && monthKey <= cycle.endKey;
}

export function monthsInCycle(cycle) {
  const result = [];
  const cursor = new Date(cycle.start);
  while (cursor <= cycle.end) {
    result.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
}
