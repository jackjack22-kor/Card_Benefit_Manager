import { CARDS } from '../data/cards.js';
import { getMonthKey, getCycle, monthsInCycle } from './cycles.js';

export function getOrderedCards(state) {
  const map = new Map(CARDS.map((card) => [card.id, card]));
  return state.cardOrder.map((id) => map.get(id)).filter(Boolean);
}

export function getCardOverride(state, cardId) {
  return state.cardOverrides[cardId] || {};
}

export function getBenefitUsage(state, benefitId, monthKey = getMonthKey()) {
  return state.usage[benefitId]?.[monthKey] || {};
}

export function setBenefitUsage(state, benefitId, monthKey, patch) {
  const usage = { ...(state.usage || {}) };
  usage[benefitId] = { ...(usage[benefitId] || {}) };
  usage[benefitId][monthKey] = { ...(usage[benefitId][monthKey] || {}), ...patch };
  return { ...state, usage };
}

export function calculateMonthlyCap(benefit, prevSpend = 0) {
  if (Array.isArray(benefit.monthlyCapBySpend)) {
    const sorted = [...benefit.monthlyCapBySpend].sort((a, b) => a.min - b.min);
    let cap = 0;
    for (const row of sorted) {
      if (prevSpend >= row.min) cap = row.cap;
    }
    return cap;
  }
  return Number(benefit.monthlyCap || 0);
}

export function calculateRate(benefit, prevSpend = 0) {
  if (Array.isArray(benefit.rateBySpend)) {
    const sorted = [...benefit.rateBySpend].sort((a, b) => a.min - b.min);
    let rate = 0;
    for (const row of sorted) {
      if (prevSpend >= row.min) rate = row.rate;
    }
    return rate;
  }
  return Number(benefit.rate || 0);
}

export function calculateFixedBenefit(benefit, amount = 0) {
  if (Array.isArray(benefit.fixedBenefitByAmount)) {
    const sorted = [...benefit.fixedBenefitByAmount].sort((a, b) => a.min - b.min);
    let value = 0;
    for (const row of sorted) {
      if (amount >= row.min) value = row.value;
    }
    return value;
  }
  return Number(benefit.fixedBenefit || 0);
}

export function getAnnualUsageCount(state, card, benefit, date = new Date()) {
  const cycle = getCycle(card, getCardOverride(state, card.id), benefit, date);
  const monthKeys = monthsInCycle(cycle);
  return monthKeys.reduce((sum, monthKey) => {
    const usage = getBenefitUsage(state, benefit.id, monthKey);
    return sum + Number(usage.count || 0) + (usage.checked ? 1 : 0) + (usage.tx1 ? 1 : 0) + (usage.tx2 ? 1 : 0);
  }, 0);
}

export function getAnnualBenefitValue(state, card, benefit, date = new Date()) {
  const cycle = getCycle(card, getCardOverride(state, card.id), benefit, date);
  return monthsInCycle(cycle).reduce((sum, monthKey) => {
    const usage = getBenefitUsage(state, benefit.id, monthKey);
    return sum + Number(usage.benefitValue || usage.usedBenefit || 0);
  }, 0);
}

export function getBenefitHomeStatus(state, card, benefit, date = new Date()) {
  const monthKey = getMonthKey(date);
  const usage = getBenefitUsage(state, benefit.id, monthKey);
  const override = getCardOverride(state, card.id);
  const prevSpend = inferPrevSpend(card, override);
  const annualCount = getAnnualUsageCount(state, card, benefit, date);
  const monthlyCount = Number(usage.count || 0) + (usage.checked ? 1 : 0) + (usage.tx1 ? 1 : 0) + (usage.tx2 ? 1 : 0);

  if (benefit.type === 'amount_cap' || benefit.type === 'amount_cap_pool') {
    const cap = calculateMonthlyCap(benefit, prevSpend);
    const used = Number(usage.benefitValue || 0);
    return `${benefit.homeLabel || benefit.name} ${Math.min(used, cap).toLocaleString()}${cap ? `/${cap.toLocaleString()}` : ''}`;
  }
  if (benefit.type === 'count' || benefit.type === 'count_amount' || benefit.type === 'info_check') {
    if (benefit.annualLimitCount) return `${benefit.homeLabel || benefit.name} ${annualCount}/${benefit.annualLimitCount}`;
    if (benefit.monthlyLimitCount) return `${benefit.homeLabel || benefit.name} ${monthlyCount}/${benefit.monthlyLimitCount}`;
    return `${benefit.homeLabel || benefit.name} ${monthlyCount ? '사용' : '가능'}`;
  }
  if (benefit.type === 'check') {
    return `${benefit.homeLabel || benefit.name} ${annualCount ? '사용' : '미사용'}`;
  }
  if (benefit.type === 'two_transactions') {
    const done = Number(Boolean(usage.tx1)) + Number(Boolean(usage.tx2));
    const remaining = Math.max(0, 2 - done);
    return `1만원 이상 결제 ${done}/2건${remaining ? `, ${remaining}건 더 필요` : ', 완료'}`;
  }
  if (benefit.type === 'milestone') {
    const target = nextMilestone(benefit, Number(override.annualSpend || 0));
    return target ? `${benefit.homeLabel || benefit.name} ${target.label}까지` : `${benefit.homeLabel || benefit.name} 달성권`;
  }
  if (benefit.type === 'reward' || benefit.type === 'reward_cap_pool') {
    return benefit.homeLabel || benefit.name;
  }
  return benefit.homeLabel || benefit.name;
}

export function nextMilestone(benefit, spend) {
  const milestones = benefit.milestones || [];
  return milestones.find((item) => spend < item.spend) || milestones[milestones.length - 1] || null;
}

export function inferPrevSpend(card, override) {
  if (override.prevMonthStatus === 'met') return Math.max(Number(override.monthlyTarget || 0), card.defaultMonthlyTarget || 0);
  if (override.prevMonthStatus === 'unmet') return 0;
  return Number(override.prevMonthSpend || override.monthlyTarget || 0);
}

export function getMonthlyShortfall(card, override) {
  const target = Number(override.monthlyTarget || 0);
  if (!target) return 0;
  return Math.max(0, target - Number(override.currentMonthSpend || 0));
}

export function getAnnualShortfall(card, override) {
  const target = Number(override.annualTarget || 0);
  if (!target) return 0;
  return Math.max(0, target - Number(override.annualSpend || 0));
}

export function recommendCards(state, categoryId, amount = 10000) {
  const cards = getOrderedCards(state);
  const results = cards.map((card) => scoreCard(state, card, categoryId, amount)).filter((item) => item.score > 0 || item.baseValue > 0);
  return results.sort((a, b) => b.score - a.score || b.value - a.value);
}

export function getFillSpendRecommendations(state, categoryId, amount = 10000) {
  return getOrderedCards(state)
    .map((card) => {
      const override = getCardOverride(state, card.id);
      const monthlyShortfall = getMonthlyShortfall(card, override);
      const annualShortfall = getAnnualShortfall(card, override);
      const matching = card.benefits.filter((benefit) => benefit.categories?.includes(categoryId) || benefit.categories?.includes('other'));
      const usable = matching.find((benefit) => benefit.priority === 'core') || matching[0];
      const monthlyHelp = monthlyShortfall > 0 ? Math.min(amount, monthlyShortfall) : 0;
      const annualHelp = annualShortfall > 0 ? Math.min(amount, annualShortfall) : 0;
      const score = monthlyHelp * 1.2 + annualHelp * 0.4 + (usable ? 500 : 0);
      return {
        card,
        score,
        value: monthlyHelp + annualHelp,
        monthlyShortfall,
        annualShortfall,
        matching: usable ? [{ benefit: usable, reason: usable.summary || usable.name }] : [],
        status: statusText(override),
        reason: buildFillReason(monthlyShortfall, annualShortfall, amount, usable)
      };
    })
    .filter((item) => item.monthlyShortfall > 0 || item.annualShortfall > 0)
    .sort((a, b) => b.score - a.score || b.monthlyShortfall - a.monthlyShortfall || b.annualShortfall - a.annualShortfall);
}

export function scoreCard(state, card, categoryId, amount) {
  const override = getCardOverride(state, card.id);
  const prevSpend = inferPrevSpend(card, override);
  const matching = [];
  let value = 0;
  let score = 0;
  let bestRate = 0;

  for (const benefit of card.benefits) {
    if (!benefit.categories?.includes(categoryId) && !benefit.categories?.includes('other')) continue;
    const result = estimateBenefitValue(state, card, benefit, categoryId, amount, prevSpend);
    if (result.value > 0 || result.rate > 0) {
      matching.push({ benefit, ...result });
      value += result.value;
      bestRate = Math.max(bestRate, result.rate || 0);
    }
  }

  if (matching.length === 0) {
    return { card, score: 0, value: 0, baseValue: 0, bestRate: 0, matching: [], status: statusText(override), reason: '해당 카테고리 혜택 없음' };
  }

  const shortfall = getMonthlyShortfall(card, override);
  const annualShortfall = getAnnualShortfall(card, override);
  const spendContribution = shortfall > 0 ? Math.min(amount, shortfall) * 0.005 : 0;
  const annualContribution = annualShortfall > 0 ? Math.min(amount, annualShortfall) * 0.001 : 0;
  score = value + spendContribution + annualContribution;

  return {
    card,
    score,
    value,
    baseValue: value,
    bestRate,
    matching,
    status: statusText(override),
    reason: matching[0]?.reason || matching[0]?.benefit?.summary || '혜택 적용 가능'
  };
}

function statusText(override) {
  if (override.prevMonthStatus === 'met') return { ok: true, text: '실적 충족 — 사용 가능' };
  if (override.prevMonthStatus === 'unmet') return { ok: false, text: '실적 미달 — 기본조건만 적용' };
  return { ok: null, text: '직접 확인 필요' };
}

function buildFillReason(monthlyShortfall, annualShortfall, amount, benefit) {
  const parts = [];
  if (monthlyShortfall > 0) parts.push(`이번달 실적 ${Math.min(amount, monthlyShortfall).toLocaleString('ko-KR')}원 반영 가능`);
  if (annualShortfall > 0) parts.push(`연간 실적 ${Math.min(amount, annualShortfall).toLocaleString('ko-KR')}원 반영 가능`);
  if (benefit) parts.push(`${benefit.homeLabel || benefit.name} 혜택도 함께 확인`);
  return parts.join(' · ') || '실적 보강 후보';
}

function estimateBenefitValue(state, card, benefit, categoryId, amount, prevSpend) {
  const monthKey = getMonthKey();
  const usage = getBenefitUsage(state, benefit.id, monthKey);
  const requiresSpend = Boolean(benefit.conditions?.includes('전월') || benefit.monthlyCapBySpend || benefit.rateBySpend);
  const isMet = getCardOverride(state, card.id).prevMonthStatus !== 'unmet';
  if (requiresSpend && !isMet && benefit.type !== 'reward') {
    return { value: 0, rate: 0, reason: `${benefit.name}: 전월실적 미달` };
  }
  if (benefit.type === 'amount_cap' || benefit.type === 'amount_cap_pool' || benefit.type === 'reward_cap_pool') {
    const rate = calculateRate(benefit, prevSpend);
    const cap = calculateMonthlyCap(benefit, prevSpend);
    const used = Number(usage.benefitValue || 0);
    const raw = amount * rate;
    const value = cap ? Math.max(0, Math.min(raw, cap - used)) : raw;
    return { value, rate, reason: `${benefit.name}: ${Math.round(rate * 1000) / 10}% 예상` };
  }
  if (benefit.type === 'count_amount') {
    const current = Number(usage.count || 0);
    if (benefit.monthlyLimitCount && current >= benefit.monthlyLimitCount) return { value: 0, rate: 0, reason: `${benefit.name}: 월 횟수 소진` };
    if (benefit.minAmount && amount < benefit.minAmount) return { value: 0, rate: 0, reason: `${benefit.name}: 최소 결제금액 미달` };
    const fixed = calculateFixedBenefit(benefit, amount);
    const rate = benefit.rate ? benefit.rate : fixed / Math.max(amount, 1);
    const value = fixed || amount * rate;
    return { value, rate, reason: `${benefit.name}: 횟수형 혜택 가능` };
  }
  if (benefit.type === 'two_transactions') {
    const done = Number(Boolean(usage.tx1)) + Number(Boolean(usage.tx2));
    if (amount < benefit.minAmount) return { value: 0, rate: 0, reason: `${benefit.name}: 1만원 이상 결제 필요` };
    const value = done < 2 ? (done === 1 ? 2000 : 1000) : 0;
    return { value, rate: value / Math.max(amount, 1), reason: `${benefit.name}: ${Math.min(done + 1, 2)}/2건 진행 가능` };
  }
  if (benefit.type === 'reward') {
    const pointValue = state.settings.pointValues[benefit.pointCurrency] || 1;
    let value = 0;
    let rate = 0;
    if (benefit.pointsPer1000) {
      value = (amount / 1000) * benefit.pointsPer1000 * pointValue;
      rate = value / Math.max(amount, 1);
    } else if (benefit.rate) {
      value = amount * benefit.rate * pointValue;
      rate = benefit.rate * pointValue;
      if (pointValue !== 1) rate = value / Math.max(amount, 1);
    }
    return { value, rate, reason: `${benefit.name}: 포인트/마일 가치 반영` };
  }
  if (benefit.type === 'check') {
    const annual = getAnnualUsageCount(state, card, benefit);
    if (benefit.annualLimitCount && annual >= benefit.annualLimitCount) return { value: 0, rate: 0, reason: `${benefit.name}: 연간 사용 완료` };
    return { value: Number(benefit.fixedBenefit || 0), rate: 0, reason: `${benefit.name}: 연간 혜택 미사용` };
  }
  return { value: 0, rate: 0, reason: benefit.summary || benefit.name };
}

export function getShortfallCards(state) {
  return getOrderedCards(state)
    .map((card) => {
      const override = getCardOverride(state, card.id);
      return {
        card,
        monthlyShortfall: getMonthlyShortfall(card, override),
        annualShortfall: getAnnualShortfall(card, override),
        override
      };
    })
    .filter((item) => item.monthlyShortfall > 0 || item.annualShortfall > 0)
    .sort((a, b) => b.monthlyShortfall - a.monthlyShortfall || b.annualShortfall - a.annualShortfall);
}
