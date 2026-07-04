import { CARDS } from '../data/cards.js';
import { SUBCATEGORY_MAP } from '../data/categories.js';
import { getMonthKey, getCycle, monthsInCycle } from './cycles.js';

export function getOrderedCards(state) {
  const map = new Map(CARDS.map((card) => [card.id, card]));
  return (state.cardOrder || CARDS.map((card) => card.id)).map((id) => map.get(id)).filter(Boolean);
}

export function getCardOverride(state, cardId) {
  const override = state.cardOverrides?.[cardId] || {};
  const monthKey = selectedMonthKey(state);
  const monthly = state.monthlyCardUsage?.[monthKey]?.[cardId] || {};
  return {
    ...override,
    ...monthly,
    cycle: { ...(override.cycle || {}) }
  };
}

export function getBenefitUsage(state, benefitId, monthKey = selectedMonthKey(state)) {
  return state.usage?.[benefitId]?.[monthKey] || {};
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

export function getAnnualUsageCount(state, card, benefit, date = selectedDate(state)) {
  const cycle = getCycle(card, getCardOverride(state, card.id), benefit, date);
  const monthKeys = monthsInCycle(cycle);
  return monthKeys.reduce((sum, monthKey) => {
    const usage = getBenefitUsage(state, benefit.id, monthKey);
    return sum + Number(usage.count || 0) + (usage.checked ? 1 : 0) + (usage.tx1 ? 1 : 0) + (usage.tx2 ? 1 : 0);
  }, 0);
}

export function getAnnualBenefitValue(state, card, benefit, date = selectedDate(state), options = {}) {
  const cycle = getCycle(card, getCardOverride(state, card.id), benefit, date);
  return monthsInCycle(cycle).reduce((sum, monthKey) => {
    if (monthKey === options.excludeMonthKey) return sum;
    const usage = getBenefitUsage(state, benefit.id, monthKey);
    return sum + Number(usage.benefitValue || usage.usedBenefit || 0);
  }, 0);
}

export function getAnnualSpend(state, card, date = selectedDate(state)) {
  const override = getCardOverride(state, card.id);
  const cycle = getCycle(card, override, {}, date);
  const monthlyUsage = state.monthlyCardUsage || {};
  const total = monthsInCycle(cycle).reduce((sum, monthKey) => {
    return sum + Number(monthlyUsage[monthKey]?.[card.id]?.currentMonthSpend || 0);
  }, 0);
  return total || Number(override.annualSpend || 0);
}

export function getBenefitHomeStatus(state, card, benefit, date = selectedDate(state)) {
  const monthKey = selectedMonthKey(state);
  const usage = getBenefitUsage(state, benefit.id, monthKey);
  const override = getCardOverride(state, card.id);
  const prevSpend = inferPrevSpend(card, override);
  const annualCount = getAnnualUsageCount(state, card, benefit, date);
  const monthlyCount = Number(usage.count || 0) + (usage.checked ? 1 : 0) + (usage.tx1 ? 1 : 0) + (usage.tx2 ? 1 : 0);

  if (benefit.type === 'amount_cap' || benefit.type === 'amount_cap_pool' || benefit.type === 'reward_cap_pool') {
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
    const target = nextMilestone(benefit, getAnnualSpend(state, card, date));
    return target ? `${benefit.homeLabel || benefit.name} ${target.label}까지` : `${benefit.homeLabel || benefit.name} 달성권`;
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

export function getAnnualShortfall(card, override, state = null) {
  const target = Number(override.annualTarget || 0);
  if (!target) return 0;
  const current = state ? getAnnualSpend(state, card) : Number(override.annualSpend || 0);
  return Math.max(0, target - current);
}

export function recommendCards(state, categoryId, amount = 10000, subcategoryId = state.selectedSubcategory || '') {
  const cards = getOrderedCards(state);
  const results = cards
    .map((card) => scoreCard(state, card, categoryId, amount, subcategoryId))
    .filter((item) => item.score > 0 || item.baseValue > 0 || item.hasDirectMatch);
  return results.sort((a, b) => b.score - a.score || b.value - a.value || Number(b.hasDirectMatch) - Number(a.hasDirectMatch));
}

export function getFillSpendRecommendations(state, categoryId, amount = 10000, subcategoryId = state.selectedSubcategory || '') {
  return getOrderedCards(state)
    .map((card) => {
      const override = getCardOverride(state, card.id);
      const monthlyShortfall = getMonthlyShortfall(card, override);
      const annualShortfall = getAnnualShortfall(card, override, state);
      const matchingBenefits = card.benefits.filter((benefit) => benefitMatchesSelection(benefit, categoryId, subcategoryId));
      const usable = matchingBenefits.find((benefit) => benefit.priority === 'core') || matchingBenefits[0];
      const monthlyHelp = monthlyShortfall > 0 ? Math.min(amount, monthlyShortfall) : 0;
      const annualHelp = annualShortfall > 0 ? Math.min(amount, annualShortfall) : 0;
      const score = monthlyHelp * 1.2 + annualHelp * 0.35 + (usable ? 5000 : 0);
      return {
        card,
        score,
        value: monthlyHelp + annualHelp,
        monthlyShortfall,
        annualShortfall,
        matching: usable ? [{ benefit: usable, value: 0, rate: 0, reason: usable.summary || usable.name }] : [],
        status: statusText(override),
        reason: buildFillReason(monthlyShortfall, annualShortfall, amount, usable)
      };
    })
    .filter((item) => item.monthlyShortfall > 0 || item.annualShortfall > 0)
    .sort((a, b) => b.score - a.score || b.monthlyShortfall - a.monthlyShortfall || b.annualShortfall - a.annualShortfall);
}

export function scoreCard(state, card, categoryId, amount, subcategoryId = '') {
  const override = getCardOverride(state, card.id);
  const prevSpend = inferPrevSpend(card, override);
  const primaryBenefits = card.benefits.filter((benefit) => benefitMatchesSelection(benefit, categoryId, subcategoryId));
  const primaryBenefitIds = new Set(primaryBenefits.map((benefit) => benefit.id));
  const baseRewards = categoryId === 'other' || primaryBenefits.length === 0
    ? []
    : card.benefits.filter((benefit) => benefit.type === 'reward' && benefit.categories?.includes('other'));
  const candidates = uniqueBenefits([...primaryBenefits, ...baseRewards]);
  const matching = [];
  let value = 0;
  let bestRate = 0;

  for (const benefit of candidates) {
    const result = estimateBenefitValue(state, card, benefit, categoryId, amount, prevSpend);
    const isDirectMatch = primaryBenefitIds.has(benefit.id);
    if (result.value > 0 || result.rate > 0 || isDirectMatch) {
      matching.push({ benefit, ...result, isDirectMatch });
      value += result.value;
      bestRate = Math.max(bestRate, result.rate || 0);
    }
  }

  if (matching.length === 0) {
    return {
      card,
      score: 0,
      value: 0,
      baseValue: 0,
      bestRate: 0,
      hasDirectMatch: false,
      matching: [],
      conditions: [],
      status: statusText(override),
      reason: '선택한 사용처에 직접 연결되는 혜택이 없습니다.'
    };
  }

  const conditions = matching
    .filter((item) => item.isDirectMatch && (item.value || 0) <= 0 && (item.rate || 0) <= 0)
    .map((item) => item.reason)
    .filter(Boolean);

  const shortfall = getMonthlyShortfall(card, override);
  const annualShortfall = getAnnualShortfall(card, override, state);
  const spendContribution = shortfall > 0 ? Math.min(amount, shortfall) * 0.005 : 0;
  const annualContribution = annualShortfall > 0 ? Math.min(amount, annualShortfall) * 0.001 : 0;
  const hasDirectMatch = primaryBenefits.length > 0;
  const conditionSignal = hasDirectMatch && value === 0 ? 1 : 0;
  const score = value + spendContribution + annualContribution + conditionSignal;

  return {
    card,
    score,
    value,
    baseValue: value,
    bestRate,
    hasDirectMatch,
    matching,
    conditions,
    status: statusText(override),
    reason: buildValueReason(matching, value)
  };
}

export function getShortfallCards(state) {
  return getOrderedCards(state)
    .map((card) => {
      const override = getCardOverride(state, card.id);
      return {
        card,
        monthlyShortfall: getMonthlyShortfall(card, override),
        annualShortfall: getAnnualShortfall(card, override, state),
        override
      };
    })
    .filter((item) => item.monthlyShortfall > 0 || item.annualShortfall > 0)
    .sort((a, b) => b.monthlyShortfall - a.monthlyShortfall || b.annualShortfall - a.annualShortfall);
}

function estimateBenefitValue(state, card, benefit, categoryId, amount, prevSpend) {
  const monthKey = selectedMonthKey(state);
  const usage = getBenefitUsage(state, benefit.id, monthKey);
  const requiresSpend = Boolean(benefit.conditions?.includes('전월') || benefit.monthlyCapBySpend || benefit.rateBySpend);
  const isMet = getCardOverride(state, card.id).prevMonthStatus !== 'unmet';

  if (requiresSpend && !isMet && benefit.type !== 'reward') {
    return { value: 0, rate: 0, reason: `${benefit.name}: 전월실적 미달로 제외` };
  }

  if (benefit.type === 'amount_cap' || benefit.type === 'amount_cap_pool' || benefit.type === 'reward_cap_pool') {
    const rate = calculateRate(benefit, prevSpend);
    const cap = effectiveMonthlyCap(card, benefit, prevSpend);
    const used = benefit.capPoolId
      ? getMonthlyPoolBenefitValue(state, card, benefit, monthKey)
      : Number(usage.benefitValue || 0);
    const raw = amount * rate;
    const monthlyRemaining = cap ? Math.max(0, cap - used) : Infinity;
    const annualUsed = benefit.annualCap ? getAnnualBenefitValue(state, card, benefit) : 0;
    const annualRemaining = benefit.annualCap ? Math.max(0, benefit.annualCap - annualUsed) : Infinity;
    const value = Math.max(0, Math.min(raw, monthlyRemaining, annualRemaining));
    const capText = [
      cap ? `잔여 월한도 ${monthlyRemaining.toLocaleString('ko-KR')}원` : '',
      benefit.annualCap ? `잔여 연한도 ${annualRemaining.toLocaleString('ko-KR')}원` : ''
    ].filter(Boolean).join(', ');
    if (benefit.annualCap && annualRemaining <= 0) return { value: 0, rate: 0, reason: `${benefit.name}: 연간 한도 소진` };
    if (cap && monthlyRemaining <= 0) return { value: 0, rate: 0, reason: `${benefit.name}: 월 한도 소진` };
    return { value, rate, reason: `${benefit.name}: ${percent(rate)} x ${amount.toLocaleString('ko-KR')}원${capText ? `, ${capText}` : ''}` };
  }

  if (benefit.type === 'count_amount') {
    const current = Number(usage.count || 0);
    if (benefit.monthlyLimitCount && current >= benefit.monthlyLimitCount) return { value: 0, rate: 0, reason: `${benefit.name}: 월 사용 횟수 소진` };
    const annual = getAnnualUsageCount(state, card, benefit);
    if (benefit.annualLimitCount && annual >= benefit.annualLimitCount) return { value: 0, rate: 0, reason: `${benefit.name}: 연간 사용 횟수 소진` };
    if (benefit.minAmount && amount < benefit.minAmount) return { value: 0, rate: 0, reason: `${benefit.name}: 최소 ${benefit.minAmount.toLocaleString('ko-KR')}원 이상 필요` };
    const fixed = calculateFixedBenefit(benefit, amount);
    const rate = calculateRate(benefit, prevSpend);
    const rateValue = rate ? amount * rate : 0;
    const raw = fixed || rateValue;
    const used = Number(usage.benefitValue || 0);
    const monthlyRemaining = benefit.monthlyCap ? Math.max(0, benefit.monthlyCap - used) : Infinity;
    const value = Math.max(0, Math.min(raw, monthlyRemaining));
    const basis = fixed ? `${fixed.toLocaleString('ko-KR')}원 정액` : `${percent(rate)} 할인/적립`;
    return { value, rate: value / Math.max(amount, 1), reason: `${benefit.name}: ${basis}, ${current}/${benefit.monthlyLimitCount || '-'}회 사용${benefit.annualLimitCount ? `, 연 ${annual}/${benefit.annualLimitCount}회` : ''}` };
  }

  if (benefit.type === 'two_transactions') {
    const done = Number(Boolean(usage.tx1)) + Number(Boolean(usage.tx2));
    if (amount < benefit.minAmount) return { value: 0, rate: 0, reason: `${benefit.name}: 1만원 이상 결제 필요` };
    const value = done < 2 ? (done === 1 ? 2000 : 1000) : 0;
    return { value, rate: value / Math.max(amount, 1), reason: `${benefit.name}: ${Math.min(done + 1, 2)}/2건 진행 가능` };
  }

  if (benefit.type === 'reward') {
    const pointValue = state.settings?.pointValues?.[benefit.pointCurrency] || 1;
    let value = 0;
    let rate = 0;
    let reason = '';
    if (benefit.pointsPer1000) {
      const points = (amount / 1000) * benefit.pointsPer1000;
      value = points * pointValue;
      rate = value / Math.max(amount, 1);
      reason = `${benefit.name}: ${Math.round(points).toLocaleString('ko-KR')}P/마일 x ${pointValue.toLocaleString('ko-KR')}원 가치`;
    } else if (benefit.rate) {
      value = amount * benefit.rate * pointValue;
      rate = value / Math.max(amount, 1);
      reason = `${benefit.name}: ${percent(benefit.rate)} x 포인트가치 ${pointValue.toLocaleString('ko-KR')}원`;
    }
    return { value, rate, reason };
  }

  if (benefit.type === 'check') {
    const annual = getAnnualUsageCount(state, card, benefit);
    if (benefit.annualLimitCount && annual >= benefit.annualLimitCount) return { value: 0, rate: 0, reason: `${benefit.name}: 연간 사용 완료` };
    return { value: Number(benefit.fixedBenefit || 0), rate: 0, reason: `${benefit.name}: 연간 혜택 미사용` };
  }

  return { value: 0, rate: 0, reason: benefit.summary || benefit.name };
}

function effectiveMonthlyCap(card, benefit, prevSpend) {
  const ownCap = calculateMonthlyCap(benefit, prevSpend);
  if (ownCap) return ownCap;
  if (!benefit.capPoolId) return 0;
  const pool = card.benefits.find((item) => item.id === benefit.capPoolId);
  return pool ? calculateMonthlyCap(pool, prevSpend) : 0;
}

function getMonthlyPoolBenefitValue(state, card, benefit, monthKey) {
  if (!benefit.capPoolId) return Number(getBenefitUsage(state, benefit.id, monthKey).benefitValue || 0);
  return card.benefits
    .filter((item) => item.capPoolId === benefit.capPoolId)
    .reduce((sum, item) => sum + Number(getBenefitUsage(state, item.id, monthKey).benefitValue || 0), 0);
}

function benefitMatchesSelection(benefit, categoryId, subcategoryId = '') {
  if (!categoryId) return false;
  const categories = benefit.categories || [];
  if (!categories.includes(categoryId)) return false;
  if (!subcategoryId) return true;

  const subcategory = SUBCATEGORY_MAP[`${categoryId}:${subcategoryId}`];
  if (!subcategory) return true;

  const rawText = [benefit.name, benefit.summary, benefit.targets, benefit.exclusions, benefit.conditions, benefit.homeLabel].join(' ');
  const text = normalizeText(rawText);
  const hasKeyword = (subcategory.keywords || []).some((keyword) => keywordMatchesText(rawText, text, keyword));
  if (hasKeyword) return true;
  if (hasCompetingSubcategoryKeyword(text, categoryId, subcategoryId)) return false;

  return isBroadCategoryBenefit(text, categoryId);
}

function isBroadCategoryBenefit(text, categoryId) {
  const broadKeywords = {
    coffee: ['커피업종', '대상커피업종', '모든커피', '전커피'],
    movie: ['모든영화관', '전국영화관', '영화관전체'],
    simplepay: ['간편결제', '페이'],
    ott: ['ott', '스트리밍'],
    hotel: ['호텔', '특급호텔'],
    marriott: ['메리어트'],
    airline: ['항공'],
    taxi: ['택시'],
    evcharge: ['전기차', '충전'],
    dutyfree: ['면세점'],
    themepark: ['놀이공원', '워터파크'],
    parking: ['주차장전체', '모든주차장']
  };
  return (broadKeywords[categoryId] || []).some((keyword) => text.includes(normalizeText(keyword)));
}

function hasCompetingSubcategoryKeyword(text, categoryId, selectedSubcategoryId) {
  const groups = {
    coffee: [
      ['starbucks', ['스타벅스', '스벅', 'starbucks']],
      ['paul-basset', ['폴바셋', 'paul']],
      ['ediya', ['이디야', 'ediya']],
      ['angelinus', ['엔제리너스', 'angel']],
      ['coffee-bean', ['커피빈', 'coffeebean']],
      ['twosome', ['투썸', 'twosome']],
      ['hollys', ['할리스', 'hollys']]
    ],
    movie: [
      ['cgv', ['cgv']],
      ['lotte-cinema', ['롯데시네마']],
      ['megabox', ['메가박스']]
    ],
    telecom: [
      ['skt', ['skt', 'sk텔레콤', 'sktelecom']],
      ['kt', ['kt']],
      ['lgu', ['lgu', 'lgu+', 'lg유플러스']],
      ['mvno', ['알뜰폰']]
    ]
  };
  if (selectedSubcategoryId.startsWith('other-')) return false;
  return (groups[categoryId] || []).some(([id, keywords]) => (
    id !== selectedSubcategoryId && keywords.some((keyword) => text.includes(normalizeText(keyword)))
  ));
}

function keywordMatchesText(rawText, normalizedText, keyword) {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) return false;
  if (/^[a-z0-9]{1,2}$/.test(normalizedKeyword)) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedKeyword)}([^a-z0-9]|$)`, 'i');
    return pattern.test(String(rawText || '').toLowerCase());
  }
  return normalizedText.includes(normalizedKeyword);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueBenefits(benefits) {
  const seen = new Set();
  return benefits.filter((benefit) => {
    if (seen.has(benefit.id)) return false;
    seen.add(benefit.id);
    return true;
  });
}

function statusText(override) {
  if (override.prevMonthStatus === 'met') return { ok: true, text: '전월실적 충족: 혜택 적용 가능' };
  if (override.prevMonthStatus === 'unmet') return { ok: false, text: '전월실적 미달: 기본 혜택만 가능' };
  return { ok: null, text: '전월실적 직접 확인 필요' };
}

function buildValueReason(matching, totalValue) {
  const valued = matching.filter((item) => item.value > 0);
  if (valued.length > 0) {
    const names = valued.map((item) => `${item.benefit.name} ${Math.round(item.value).toLocaleString('ko-KR')}원`).join(' + ');
    const conditional = matching.find((item) => item.value <= 0 && item.isDirectMatch && item.benefit.type !== 'info');
    const conditionText = conditional ? ` · 조건 확인: ${conditional.reason}` : '';
    return `${names} = 총 ${Math.round(totalValue).toLocaleString('ko-KR')}원 예상 혜택${conditionText}`;
  }
  const direct = matching.find((item) => item.isDirectMatch) || matching[0];
  return direct ? `선택한 사용처 혜택은 있으나 조건 확인 필요: ${direct.reason}` : '선택한 사용처에 직접 연결되는 혜택이 없습니다.';
}

function buildFillReason(monthlyShortfall, annualShortfall, amount, benefit) {
  const parts = [];
  if (monthlyShortfall > 0) parts.push(`이번달 실적 ${Math.min(amount, monthlyShortfall).toLocaleString('ko-KR')}원 반영 가능`);
  if (annualShortfall > 0) parts.push(`연간 실적 ${Math.min(amount, annualShortfall).toLocaleString('ko-KR')}원 반영 가능`);
  if (benefit) parts.push(`${benefit.homeLabel || benefit.name} 혜택도 함께 확인`);
  return parts.join(' · ') || '실적 보강 후보';
}

function selectedMonthKey(state) {
  return state.selectedMonth || getMonthKey();
}

function selectedDate(state) {
  return new Date(`${selectedMonthKey(state)}-01T00:00:00`);
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1).replace(/\.0$/, '')}%`;
}
