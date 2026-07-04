import './styles.css';
import { CARDS, CARD_MAP } from './data/cards.js';
import { CATEGORIES, CATEGORY_MAP, getSubcategories } from './data/categories.js';
import { CYCLE_LABELS, getCycle, getMonthKey, monthsInCycle } from './lib/cycles.js';
import { APP_VERSION, exportState, importState, loadState, resetState, saveState } from './lib/storage.js';
import {
  calculateMonthlyCap,
  calculateRate,
  getAnnualBenefitValue,
  getAnnualShortfall,
  getAnnualSpend,
  getAnnualUsageCount,
  getBenefitHomeStatus,
  getBenefitUsage,
  getCardOverride,
  getEffectiveBenefitRate,
  getFillSpendRecommendations,
  getMonthlyBenefitValue,
  getMonthlyBenefitValueForBenefit,
  getMonthlyShortfall,
  getOrderedCards,
  getShortfallCards,
  getTotalMonthlyBenefitValue,
  inferPrevSpend,
  recommendCards,
  setBenefitUsage
} from './lib/recommend.js';
import { clamp, compactWon, escapeHtml, pct, won } from './lib/format.js';
import {
  getInitialSyncStatus,
  initSync,
  queueCloudSave,
  requestCloudSignIn,
  requestCloudSignOut,
  requestCloudSyncNow
} from './lib/sync/syncManager.js';

let state = loadState();
const app = document.querySelector('#app');
let suppressNextOpen = false;
const openBenefits = new Set();
const openSettings = new Set();
let categoryExpanded = false;
let subcategoryExpanded = false;
let syncStatus = getInitialSyncStatus();
let suppressMonthlyInputRenderUntil = 0;

const PRIMARY_CATEGORIES = ['coffee', 'transit', 'movie', 'department', 'medical', 'simplepay', 'overseas'];

// 화면 이동/보기 상태(기기별 로컬 전용, 클라우드 동기화·미러링 제외)
const UI_STATE_KEYS = ['selectedTab', 'selectedMonth', 'selectedCategory', 'selectedSubcategory', 'recommendationAmount', 'isSortingCards', 'cardSettingsOpen', 'selectedCardId'];

function selectedMonthKey() {
  return state.selectedMonth || getMonthKey();
}

function selectedDate() {
  return new Date(`${selectedMonthKey()}-01T00:00:00`);
}

function monthKey() {
  return selectedMonthKey();
}

function setState(patch) {
  state = { ...state, ...patch };
  state = saveState(state, { touch: false });
  render();
}

// 데이터 변경: 로컬 저장 + 클라우드 동기화 큐잉
function persistState(nextState) {
  state = saveState(nextState);
  queueCloudSave(state);
}

function updateCard(cardId, patch) {
  const next = {
    ...state,
    cardOverrides: {
      ...state.cardOverrides,
      [cardId]: {
        ...(state.cardOverrides[cardId] || {}),
        ...patch,
        cycle: { ...(state.cardOverrides[cardId]?.cycle || {}), ...(patch.cycle || {}) }
      }
    }
  };
  state = next;
  persistState(state);
  render();
}

function updateMonthlyCard(cardId, patch, options = {}) {
  const key = selectedMonthKey();
  state = {
    ...state,
    monthlyCardUsage: {
      ...(state.monthlyCardUsage || {}),
      [key]: {
        ...(state.monthlyCardUsage?.[key] || {}),
        [cardId]: {
          ...(state.monthlyCardUsage?.[key]?.[cardId] || {}),
          ...patch
        }
      }
    }
  };
  persistState(state);
  if (options.render !== false) render();
}

function commitActiveMonthlyCardInput(options = {}) {
  if (options.suppressRenderMs) suppressMonthlyInputRenderUntil = Date.now() + options.suppressRenderMs;
  const input = document.activeElement;
  const isEditable = input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement;
  if (!isEditable || !input.dataset.monthlyCardField || !input.dataset.cardId) return;
  updateMonthlyCard(input.dataset.cardId, { [input.dataset.monthlyCardField]: normalizeInput(input.value) }, { render: false });
}

function commitMonthlyInputBeforeAction(element) {
  if (!element) return;
  const commitBeforeNavigation = () => commitActiveMonthlyCardInput({ suppressRenderMs: 500 });
  element.addEventListener('pointerdown', commitBeforeNavigation, { capture: true });
  element.addEventListener('touchstart', commitBeforeNavigation, { capture: true, passive: true });
}

function updateSettings(patch) {
  // 테마 등 기기별 표시 설정: 로컬 전용
  state = { ...state, settings: { ...state.settings, ...patch } };
  state = saveState(state, { touch: false });
  render();
}

function updatePointValue(key, value) {
  // 포인트 가치는 실제 데이터: 동기화 대상
  state = { ...state, settings: { ...state.settings, pointValues: { ...state.settings.pointValues, [key]: Number(value || 0) } } };
  persistState(state);
  render();
}

function selectCard(cardId) {
  if (state.selectedCardId === cardId) return;
  commitActiveMonthlyCardInput();
  state = { ...state, selectedCardId: cardId };
  const main = document.querySelector('.detail-main');
  if (!main || state.selectedTab !== 'cards') { render(); return; }
  const selected = CARD_MAP[cardId] || getOrderedCards(state)[0] || CARDS[0];
  document.querySelectorAll('.card-picker-item').forEach((el) => el.classList.toggle('active', el.dataset.selectCard === cardId));
  main.innerHTML = renderCardDetailMain(selected);
  bindDetailMainEvents(main);
}

function render() {
  document.documentElement.dataset.theme = state.settings.darkMode ? 'dark' : 'light';
  app.innerHTML = `
    <div class="app-shell">
      ${renderHeader()}
      <main class="view ${state.selectedTab}">
        ${state.selectedTab === 'dashboard' ? renderDashboard() : ''}
        ${state.selectedTab === 'recommend' ? renderRecommend() : ''}
        ${state.selectedTab === 'cards' ? renderCardDetail() : ''}
        ${state.selectedTab === 'settings' ? renderSettings() : ''}
      </main>
      ${renderTabs()}
    </div>
  `;
  bindEvents();
}

function renderHeader() {
  const themeIcon = state.settings.darkMode
    ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>'
    : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>';
  return `
    <header class="app-header">
      <div class="brand-title">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 100 100" width="36" height="36"><defs><linearGradient id="brandg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b9bff"/><stop offset="1" stop-color="#3459d6"/></linearGradient></defs><rect x="4" y="4" width="92" height="92" rx="22" fill="url(#brandg)"/><rect x="24" y="30" width="52" height="34" rx="7" fill="#ffffff"/><rect x="24" y="38" width="52" height="6" fill="#cdd9f2"/><circle cx="70" cy="64" r="15" fill="#2fd085" stroke="#3459d6" stroke-width="4"/><path d="M63.5 64.5 l4.5 4.5 l8 -9" fill="none" stroke="#ffffff" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        <div class="brand-text">
          <h1>CardFit</h1>
          <span class="brand-sub">카드 혜택 매니저</span>
        </div>
      </div>
      <button class="icon-button" data-action="toggle-dark" aria-label="테마 변경">${themeIcon}</button>
    </header>
  `;
}

function renderMonthStepper() {
  const isThisMonth = selectedMonthKey() === getMonthKey();
  return `
    <div class="month-stepper" aria-label="월 이동">
      <button data-month-move="-1" aria-label="이전 달">‹</button>
      <strong>${formatMonthLabel(selectedMonthKey())}</strong>
      <button data-month-move="1" aria-label="다음 달">›</button>
      ${isThisMonth ? '' : '<button class="today-button" data-month-today>오늘</button>'}
    </div>
  `;
}

function renderTabs() {
  const icon = (paths) => `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const icons = {
    dashboard: icon('<rect x="3" y="3" width="8" height="8" rx="2"></rect><rect x="13" y="3" width="8" height="8" rx="2"></rect><rect x="3" y="13" width="8" height="8" rx="2"></rect><rect x="13" y="13" width="8" height="8" rx="2"></rect>'),
    recommend: icon('<path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4z"></path><path d="M19 14l.8 2 .2.8.8.2-2 .8-.8 2-.8-2-2-.8 2-.8z"></path>'),
    cards: icon('<rect x="2.5" y="5" width="19" height="14" rx="3"></rect><path d="M2.5 9.5h19"></path><path d="M6 15h4"></path>'),
    settings: icon('<path d="M4 6h10"></path><path d="M18 6h2"></path><circle cx="16" cy="6" r="2"></circle><path d="M4 12h2"></path><path d="M10 12h10"></path><circle cx="8" cy="12" r="2"></circle><path d="M4 18h10"></path><path d="M18 18h2"></path><circle cx="16" cy="18" r="2"></circle>')
  };
  const tabs = [
    ['dashboard', '카드현황'],
    ['cards', '카드상세'],
    ['recommend', '결제추천'],
    ['settings', '설정']
  ];
  return `<nav class="tabs">${tabs.map(([id, label]) => `<button class="tab ${state.selectedTab === id ? 'active' : ''}" data-tab="${id}">${icons[id]}<span>${label}</span></button>`).join('')}</nav>`;
}

function renderDashboard() {
  const cards = getOrderedCards(state);
  const shortfallCards = cards.filter((card) => {
    const override = getCardOverride(state, card.id);
    return Number(override.monthlyTarget || 0) > 0 && getMonthlyShortfall(card, override) > 0;
  });
  const completeCards = cards.filter((card) => !shortfallCards.includes(card));

  const managed = cards.filter((card) => Number(getCardOverride(state, card.id).monthlyTarget || 0) > 0);
  const filledCount = managed.length - shortfallCards.length;
  const shortfallSum = shortfallCards.reduce((sum, card) => sum + getMonthlyShortfall(card, getCardOverride(state, card.id)), 0);
  const totalSpend = cards.reduce((sum, card) => sum + Number(getCardOverride(state, card.id).currentMonthSpend || 0), 0);
  const totalBenefit = getTotalMonthlyBenefitValue(state, cards, selectedMonthKey());
  const totalBenefitRate = getEffectiveBenefitRate(totalSpend, totalBenefit);

  return `
    <section class="page-head compact-head">
      <div class="head-top">
        ${renderMonthStepper()}
        ${renderOverflowMenu(`<button data-action="toggle-sort">${state.isSortingCards ? '정렬 완료' : '카드 순서 정렬'}</button>`)}
      </div>
      <div>
        <h2>카드 현황</h2>
        <p>전월실적 충족과 이번달 실적 달성 현황을 한눈에 확인합니다.</p>
      </div>
    </section>
    <div class="summary-strip">
      <div class="summary-chip">
        <span>이번달 총 사용 금액</span>
        <strong>${won(totalSpend)} <em>실사용 혜택 ${won(totalBenefit)} · ${benefitRateText(totalBenefitRate, totalSpend)}</em></strong>
      </div>
      <div class="summary-chip ${shortfallSum ? 'warn' : 'good'}">
        <span>채울 실적 합계</span>
        <strong>${shortfallSum ? won(shortfallSum) : '모두 달성'} <em>${filledCount} / ${managed.length} 달성</em></strong>
      </div>
    </div>
    ${renderDashboardGroup('실적 부족 카드', shortfallCards, 'shortfall')}
    ${renderDashboardGroup('실적 충족/관리 카드', completeCards, 'complete')}
  `;
}

function renderOverflowMenu(itemsHtml) {
  return `
    <details class="overflow-menu">
      <summary aria-label="더보기"><span class="dots">⋯</span></summary>
      <div class="overflow-list">${itemsHtml}</div>
    </details>
  `;
}

function renderDashboardGroup(title, cards, kind) {
  return `
    <section class="dashboard-group">
      <div class="group-title">
        <h3>${title}</h3>
        <span>${cards.length}장</span>
      </div>
      <div class="card-grid compact">
        ${cards.length ? cards.map((card) => renderDashboardCard(card, kind)).join('') : '<div class="empty-note">해당 카드가 없습니다.</div>'}
      </div>
    </section>
  `;
}

function renderDashboardCard(card, kind) {
  const override = getCardOverride(state, card.id);
  const monthlyTarget = Number(override.monthlyTarget || 0);
  const monthlySpend = Number(override.currentMonthSpend || 0);
  const monthlyShortfall = getMonthlyShortfall(card, override);
  const monthlyPct = monthlyTarget ? clamp(monthlySpend / monthlyTarget, 0, 1) : 1;
  const practicalBenefit = getMonthlyBenefitValue(state, card, selectedMonthKey());
  const practicalRate = getEffectiveBenefitRate(monthlySpend, practicalBenefit);
  const prevLabel = override.prevMonthStatus === 'met' ? '전월실적 충족' : override.prevMonthStatus === 'unmet' ? '전월실적 미달' : '전월실적 확인';
  const monthlyLabel = monthlyTarget ? (monthlyShortfall ? `${won(monthlyShortfall)} 더 채우면 달성` : '이번달 목표 달성') : '사용액 참고';

  return `
    <article class="dashboard-card theme-${card.theme} ${kind}" draggable="${state.isSortingCards ? 'true' : 'false'}" data-card-id="${card.id}" data-open-card="${card.id}">
      <div class="dashboard-card-head">
        <div class="dashboard-card-copy">
          <span class="issuer">${escapeHtml(card.issuer)}</span>
          <h3>${escapeHtml(card.shortName)}</h3>
          <span class="status-badge ${override.prevMonthStatus}">${prevLabel}</span>
        </div>
        ${renderCardImage(card, 'card-thumb')}
      </div>
      <div class="progress-block">
        <div class="progress-row">
          <div>
            <strong>이번달 실적</strong>
            <span>${monthlyTarget ? `${won(monthlySpend)} / ${won(monthlyTarget)}` : won(monthlySpend)}</span>
          </div>
          <b class="${monthlyShortfall ? 'warn-text' : 'good-text'}">${monthlyLabel}</b>
        </div>
        <div class="bar ${monthlyTarget ? (monthlyShortfall ? 'short' : 'met') : 'none'}"><i style="width:${monthlyPct * 100}%"></i></div>
        <div class="benefit-rate-line">실사용 혜택 ${won(practicalBenefit)} · ${benefitRateText(practicalRate, monthlySpend)}</div>
      </div>
      ${state.isSortingCards ? `
        <div class="sort-controls">
          <button data-move-up="${card.id}" aria-label="위로">위로</button>
          <button data-move-down="${card.id}" aria-label="아래로">아래</button>
        </div>
      ` : ''}
    </article>
  `;
}

function renderCardImage(card, className = 'card-image') {
  if (!card.image) return '';
  return `<figure class="${className}"><img src="${escapeHtml(card.image)}" alt="${escapeHtml(card.shortName)} 카드 이미지" loading="lazy"></figure>`;
}

function renderRecommend() {
  const category = state.selectedCategory;
  const subcategory = state.selectedSubcategory || '';
  const amount = Number(state.recommendationAmount || 0);
  const subcategories = getSubcategories(category);
  const valueResults = recommendCards(state, category, amount, subcategory);
  const fillResults = getFillSpendRecommendations(state, category, amount, subcategory);

  return `
    <section class="page-head">
      <div>
        <span class="eyebrow">BEST PICK</span>
        <h2>결제 직전 카드 추천</h2>
        <p>업종과 필요 시 세부 사용처를 고르면 해당 혜택만 추려서 계산 근거와 함께 보여줍니다.</p>
      </div>
      <label class="amount-input">결제 예정 금액
        <input type="text" inputmode="numeric" data-money-input value="${formatNumberInput(amount)}" data-field="recommendationAmount">
      </label>
    </section>

    <section class="picker-panel">
      ${renderCategoryPills(category)}
      ${subcategories.length ? renderSubcategoryPills(subcategories, subcategory)
        : '<p class="selector-note">이 업종은 현재 세부 사용처보다 카드사 업종 분류 확인이 더 중요합니다.</p>'}
    </section>

    <section class="recommend-columns">
      <div>
        <div class="list-head">
          <span class="eyebrow">A. VALUE</span>
          <h3>최대 혜택 추천</h3>
          <p>${escapeHtml(CATEGORY_MAP[category]?.label || '카테고리')} ${subcategory ? `· ${escapeHtml(subcategories.find((item) => item.id === subcategory)?.label || '')}` : ''} 기준입니다.</p>
        </div>
        <div class="rank-list">
          ${valueResults.slice(0, 8).map((result, index) => renderRankItem(result, index, 'value')).join('') || '<div class="empty-note">선택한 사용처에 맞는 추천 결과가 없습니다.</div>'}
        </div>
      </div>
      <aside>
        <div class="list-head">
          <span class="eyebrow">B. SPEND</span>
          <h3>실적 채우기 추천</h3>
          <p>혜택이 있고 아직 실적이 부족한 카드를 우선으로 올렸습니다.</p>
        </div>
        <div class="rank-list">
          ${fillResults.slice(0, 8).map((result, index) => renderRankItem(result, index, 'fill')).join('') || '<div class="empty-note">부족 실적 카드가 없습니다.</div>'}
        </div>
      </aside>
    </section>
  `;
}

function renderCategoryPills(category) {
  const visible = CATEGORIES.filter((c) => !['breakfast', 'premiumgift'].includes(c.id));
  const primary = PRIMARY_CATEGORIES.map((id) => visible.find((c) => c.id === id)).filter(Boolean);
  const rest = visible.filter((c) => !PRIMARY_CATEGORIES.includes(c.id));
  const shown = categoryExpanded ? [...primary, ...rest] : [...primary];
  if (!categoryExpanded && !shown.some((c) => c.id === category)) {
    const sel = visible.find((c) => c.id === category);
    if (sel) shown.push(sel);
  }
  return `
    <div class="category-pills">
      ${shown.map((cat) => `<button class="${category === cat.id ? 'active' : ''}" data-category="${cat.id}">${escapeHtml(cat.label)}</button>`).join('')}
      ${rest.length ? `<button class="more-pill" data-toggle-categories>${categoryExpanded ? '접기' : '더보기'}</button>` : ''}
    </div>
  `;
}

function renderSubcategoryPills(subcategories, subcategory) {
  const shown = subcategoryExpanded ? subcategories : subcategories.slice(0, 3);
  if (!subcategoryExpanded && subcategory && !shown.some((s) => s.id === subcategory)) {
    const sel = subcategories.find((s) => s.id === subcategory);
    if (sel) shown.push(sel);
  }
  const hasMore = subcategories.length > shown.length || (subcategoryExpanded && subcategories.length > 3);
  return `
    <div class="subcategory-pills">
      <button class="${!subcategory ? 'active' : ''}" data-subcategory="">전체</button>
      ${shown.map((item) => `<button class="${subcategory === item.id ? 'active' : ''}" data-subcategory="${item.id}">${escapeHtml(item.label)}</button>`).join('')}
      ${hasMore ? `<button class="more-pill" data-toggle-subcategories>${subcategoryExpanded ? '접기' : '더보기'}</button>` : ''}
    </div>
  `;
}

function renderRankItem(result, index, mode = 'value') {
  const amount = Math.max(Number(state.recommendationAmount || 1), 1);
  const estimatedRate = result.value ? result.value / amount : result.bestRate;
  const shortfallLabel = result.monthlyShortfall
    ? `월 ${compactWon(result.monthlyShortfall)}`
    : result.annualShortfall ? `연 ${compactWon(result.annualShortfall)}` : '';
  const hasConditions = mode === 'value' && result.conditions?.length;
  const isBlocked = hasConditions && result.value === 0;
  const reasonText = hasConditions ? String(result.reason).replace(/\s*·\s*조건 확인:.*$/, '') : result.reason;

  return `
    <article class="rank-item ${mode === 'fill' ? 'fill' : 'value'}" data-open-card="${result.card.id}">
      <div class="rank-no">${index + 1}</div>
      <div class="rank-body">
        <strong>${escapeHtml(result.card.shortName)}</strong>
        ${mode === 'fill' ? '' : `<span>${won(result.value)} 혜택 예상</span>`}
        <small class="${result.status.ok ? 'good-text' : result.status.ok === false ? 'bad-text' : 'muted'}">${escapeHtml(result.status.text)}</small>
        ${hasConditions ? `
          <div class="rank-hint ${isBlocked ? '' : 'compact'}">
            ${result.conditions.slice(0, isBlocked ? 2 : 1).map((reason) => `<span><em>조건 미충족</em>${escapeHtml(reason)}</span>`).join('')}
          </div>
        ` : ''}
        ${isBlocked ? '' : `
          <p>${escapeHtml(reasonText)}</p>
          ${result.matching?.length ? `
            <div class="calc-list">
              ${result.matching.slice(0, 4).map((item) => `
                <div>
                  <b>${escapeHtml(item.benefit.name)}</b>
                  <span>${escapeHtml(item.reason)}${item.value ? ` · ${won(item.value)}` : ''}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        `}
      </div>
      <div class="rank-value">
        ${mode === 'fill'
          ? `<span class="fill-badge">${escapeHtml(shortfallLabel || '실적 부족')}</span><span>더 채우기</span>`
          : `<strong>~${pct(estimatedRate, 1)}</strong><span>${won(result.value)}</span>`}
      </div>
    </article>
  `;
}

function renderCardDetail() {
  const selected = CARD_MAP[state.selectedCardId] || getOrderedCards(state)[0] || CARDS[0];
  return `
    <section class="detail-view">
      <section class="page-head compact-head">
        <div class="head-top">
          ${renderMonthStepper()}
        </div>
        <div>
          <h2>카드 상세</h2>
          <p>카드를 선택해 월·연 실적과 혜택 사용 현황을 관리합니다.</p>
        </div>
      </section>
      <div class="card-picker">
        ${getOrderedCards(state).map((card) => `
          <button class="card-picker-item ${selected.id === card.id ? 'active' : ''}" data-select-card="${card.id}" title="${escapeHtml(card.shortName)}" aria-label="${escapeHtml(card.shortName)}">
            ${card.image ? `<img src="${escapeHtml(card.image)}" alt="" loading="lazy">` : `<span class="card-picker-fallback">${escapeHtml(card.shortName)}</span>`}
          </button>
        `).join('')}
      </div>
      <div class="detail-main">${renderCardDetailMain(selected)}</div>
    </section>
  `;
}

function renderCardDetailMain(selected) {
  const override = getCardOverride(state, selected.id);
  const cycle = getCycle(selected, override, {}, selectedDate());
  const annualSpend = getAnnualSpend(state, selected, selectedDate());
  const annualShortfall = getAnnualShortfall(selected, override, state);
  const monthlySpend = Number(override.currentMonthSpend || 0);
  const practicalBenefit = getMonthlyBenefitValue(state, selected, selectedMonthKey());
  const practicalRate = getEffectiveBenefitRate(monthlySpend, practicalBenefit);
  const coreBenefits = selected.benefits.filter((benefit) => benefit.priority === 'core').slice(0, 6);

  return `
        <section class="detail-card theme-${selected.theme}">
          <div class="detail-hero">
            <div class="detail-copy">
              <div class="detail-title">
                <div>
                  <span class="issuer">${escapeHtml(selected.issuer)}</span>
                  <h2>${escapeHtml(selected.name)}</h2>
                  <p>${escapeHtml(selected.sourceNote || '')}</p>
                </div>
                <span class="annual-fee">연회비 ${selected.annualFee ? won(selected.annualFee) : '확인 필요'}</span>
              </div>
              <div class="summary-grid">
                ${renderMetric('전월실적', prevMonthLabel(override.prevMonthStatus), override.prevMonthStatus === 'met' ? 'good' : override.prevMonthStatus === 'unmet' ? 'bad' : 'warn')}
                ${renderMetric('이번달 실적', monthlyMetricText(selected, override), getMonthlyShortfall(selected, override) ? 'warn' : 'good')}
                ${renderMetric('연간 실적', annualMetricText(override, annualSpend, annualShortfall), annualShortfall ? 'warn' : 'good')}
                ${renderMetric('실사용 혜택률', `${won(practicalBenefit)} · ${benefitRateText(practicalRate, monthlySpend)}`, practicalBenefit ? 'good' : 'neutral')}
                ${renderMetric('현재 주기', cycle.label, 'neutral')}
              </div>
            </div>
          </div>
          <div class="benefit-chips prominent">
            ${coreBenefits.map((benefit) => `<span>${escapeHtml(getBenefitHomeStatus(state, selected, benefit, selectedDate()))}</span>`).join('')}
          </div>
        </section>

        <section class="detail-card">
          <div class="section-head small">
            <div>
              <h3>${formatMonthLabel(selectedMonthKey())} 실적 입력</h3>
              <p>이 값은 선택한 월에만 저장됩니다. 월을 이동하면 해당 월 기록을 따로 입력할 수 있습니다.</p>
            </div>
          </div>
          ${renderMonthlyCardInputs(selected, override)}
        </section>

        <details class="detail-settings" ${state.cardSettingsOpen ? 'open' : ''}>
          <summary>상세설정</summary>
          ${renderCardControls(selected, override, cycle)}
        </details>

        <section class="benefit-list">
          <div class="section-head small">
            <div>
              <h3>혜택 상세 및 사용 관리</h3>
              <p>월 사용 체크/금액/횟수 입력은 선택한 월 기준으로 저장되고, 연간 횟수는 해당 주기 안에서 합산됩니다.</p>
            </div>
          </div>
          ${selected.benefits.map((benefit) => renderBenefitEditor(selected, benefit)).join('')}
        </section>
  `;
}

function renderMetric(label, value, tone) {
  return `
    <div class="metric ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderMonthlyCardInputs(card, override) {
  return `
    <div class="control-grid monthly-grid">
      <label>전월실적 상태
        <select data-monthly-card-field="prevMonthStatus" data-card-id="${card.id}">
          ${option('met', '충족', override.prevMonthStatus)}
          ${option('unmet', '미달', override.prevMonthStatus)}
          ${option('manual', '직접 확인', override.prevMonthStatus)}
        </select>
      </label>
      <label>이번달 사용액
        <input type="text" inputmode="numeric" data-money-input data-monthly-card-field="currentMonthSpend" data-card-id="${card.id}" value="${formatNumberInput(override.currentMonthSpend)}">
      </label>
      <label>이번달 목표
        <input value="${Number(override.monthlyTarget || 0) ? won(override.monthlyTarget) : '관리 안 함'}" readonly>
      </label>
    </div>
  `;
}

function renderCardControls(card, override, cycle) {
  return `
    <div class="settings-drawer">
      <div class="control-grid">
        <label>월 실적 목표
          <select data-card-field="monthlyTarget" data-card-id="${card.id}">
            ${[0, ...(card.monthlyTargets || [])].map((target) => option(String(target), target ? won(target) : '관리 안 함', String(override.monthlyTarget || 0))).join('')}
          </select>
        </label>
        <label>연간 실적 목표
          <select data-card-field="annualTarget" data-card-id="${card.id}">
            ${[0, ...(card.annualTargets || [])].map((target) => option(String(target), target ? won(target) : '관리 안 함', String(override.annualTarget || 0))).join('')}
          </select>
        </label>
        <label>연간 사용액 보정
          <input type="text" inputmode="numeric" data-money-input data-card-field="annualSpend" data-card-id="${card.id}" value="${formatNumberInput(state.cardOverrides?.[card.id]?.annualSpend)}">
        </label>
        <label>연간 기준
          <select data-cycle-field="type" data-card-id="${card.id}">
            ${Object.entries(CYCLE_LABELS).map(([id, label]) => option(id, label, override.cycle?.type || card.defaultCycle?.type)).join('')}
          </select>
        </label>
        <label>연회비 시작월
          <select data-cycle-field="annualFeeStartMonth" data-card-id="${card.id}">
            ${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => option(String(m), `${m}월`, String(override.cycle?.annualFeeStartMonth || override.cycle?.startMonth || card.defaultCycle?.startMonth || 1))).join('')}
          </select>
        </label>
        <label>발급월
          <select data-cycle-field="issueMonth" data-card-id="${card.id}">
            ${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => option(String(m), `${m}월`, String(override.cycle?.issueMonth || override.cycle?.startMonth || card.defaultCycle?.startMonth || 1))).join('')}
          </select>
        </label>
        <label>현재 주기
          <input value="${escapeHtml(cycle.label)}" readonly>
        </label>
      </div>
      <label class="benefit-memo">카드 메모
        <textarea data-card-memo="${card.id}" placeholder="카드별 고정 메모를 남겨두세요.">${escapeHtml(state.cardOverrides?.[card.id]?.memo || '')}</textarea>
      </label>
    </div>
  `;
}

function renderBenefitEditor(card, benefit) {
  const usage = getBenefitUsage(state, benefit.id, monthKey());
  const annualCount = getAnnualUsageCount(state, card, benefit, selectedDate());
  const annualValue = getAnnualBenefitValue(state, card, benefit, selectedDate());
  const override = getCardOverride(state, card.id);
  const capBasis = Math.max(Number(override.monthlyTarget || 0), Number(override.currentMonthSpend || 0));
  const cap = calculateMonthlyCap(benefit, capBasis);
  const rate = calculateRate(benefit, capBasis);
  const benefitCycle = getCycle(card, override, benefit, selectedDate());
  const monthlyCount = Number(usage.count || 0) + (usage.checked ? 1 : 0) + (usage.tx1 ? 1 : 0) + (usage.tx2 ? 1 : 0);
  const monthlyValue = getMonthlyBenefitValueForBenefit(state, card, benefit, monthKey());

  return `
    <details class="benefit-card" data-benefit-id="${benefit.id}" ${openBenefits.has(benefit.id) ? 'open' : ''}>
      <summary class="benefit-summary">
        <div class="benefit-summary-main">
          <span class="benefit-type">${escapeHtml(benefit.priority === 'core' ? '핵심 혜택' : '부가 혜택')}</span>
          <h4>${escapeHtml(benefit.name)}</h4>
          <p>${escapeHtml(benefit.summary || '')}</p>
        </div>
        <div class="benefit-summary-side">
          ${benefitStatusChips(benefit, usage, cap, annualCount, annualValue, monthlyValue)}
          <span class="benefit-caret" aria-hidden="true">⌄</span>
        </div>
      </summary>
      <div class="benefit-body">
      <div class="benefit-meta">
        <span>유형: ${escapeHtml(benefitTypeLabel(benefit.type))}</span>
        <span>주기: ${escapeHtml(CYCLE_LABELS[benefit.cycleType || override.cycle?.type || card.defaultCycle?.type] || '기본')}</span>
        <span>${escapeHtml(benefitCycle.label)}</span>
        ${rate ? `<span>혜택률 ${pct(rate)}</span>` : ''}
        ${limitText(benefit, cap)}
      </div>
      ${renderBenefitControls(benefit, usage, cap, annualValue, monthlyValue)}
      <label class="benefit-memo">메모
        <textarea data-usage-field="memo" data-benefit-id="${benefit.id}" placeholder="확인한 조건, 사용 예정일, 예외사항 등을 기록하세요.">${escapeHtml(usage.memo || '')}</textarea>
      </label>
      <details class="benefit-detail-toggle">
        <summary>대상/조건/제외 상세 보기</summary>
        <dl class="benefit-detail">
          <dt>혜택 유형</dt><dd>${escapeHtml(benefitTypeLabel(benefit.type))}</dd>
          <dt>대상</dt><dd>${escapeHtml(benefit.targets || '-')}</dd>
          <dt>필요 전월실적</dt><dd>${escapeHtml(requiredSpendText(benefit, card))}</dd>
          <dt>월 한도/횟수</dt><dd>${escapeHtml(monthlyLimitText(benefit, cap))}</dd>
          <dt>연 한도/횟수</dt><dd>${escapeHtml(annualLimitText(benefit))}</dd>
          <dt>이번달 사용</dt><dd>${escapeHtml(monthlyUsageText(benefit, usage, monthlyCount, monthlyValue))}</dd>
          <dt>연간 누적</dt><dd>${benefit.annualLimitCount ? `${annualCount}/${benefit.annualLimitCount}회` : '-'} ${annualValue ? `· 누적 혜택 ${won(annualValue)}` : ''}</dd>
          <dt>잔여 한도</dt><dd>${escapeHtml(remainingText(benefit, cap, usage, annualCount, annualValue, monthlyValue))}</dd>
          <dt>조건</dt><dd>${escapeHtml(benefit.conditions || '-')}</dd>
          <dt>제외/주의</dt><dd>${escapeHtml(benefit.exclusions || '-')}</dd>
          <dt>메모</dt><dd>${escapeHtml(usage.memo || '-')}</dd>
        </dl>
      </details>
      </div>
    </details>
  `;
}

function benefitStatusChips(benefit, usage, cap, annualCount, annualValue, effectiveMonthlyValue = Number(usage.benefitValue || 0)) {
  const chip = (label, value, done) => `<span class="status-chip ${done ? 'done' : ''}"><em>${label}</em>${escapeHtml(value)}</span>`;
  const chips = [];
  if (benefit.type === 'two_transactions') {
    const n = effectiveMonthlyValue >= Number(benefit.fixedBenefit || 0) ? 2 : Number(Boolean(usage.tx1)) + Number(Boolean(usage.tx2));
    chips.push(chip('이번달', `${n}/2건`, n >= 2));
  }
  if (benefit.monthlyLimitCount && benefit.type !== 'two_transactions') {
    const c = Number(usage.count || 0);
    chips.push(chip('월', `${c}/${benefit.monthlyLimitCount}회`, c >= benefit.monthlyLimitCount));
  }
  if (benefit.annualLimitCount) {
    chips.push(chip('연', `${annualCount}/${benefit.annualLimitCount}회`, annualCount >= benefit.annualLimitCount));
  }
  if (cap) {
    const v = Number(effectiveMonthlyValue || 0);
    chips.push(chip('월한도', `${compactWon(v)}/${compactWon(cap)}`, v >= cap));
  }
  if (benefit.annualCap) {
    chips.push(chip('연한도', `${compactWon(annualValue)}/${compactWon(benefit.annualCap)}`, annualValue >= benefit.annualCap));
  }
  if (!chips.length) {
    chips.push(chip('이번달', usage.checked ? '사용함' : '미사용', !!usage.checked));
  }
  return `<div class="status-chips">${chips.slice(0, 2).join('')}</div>`;
}

function renderBenefitControls(benefit, usage, cap, annualValue = 0, effectiveMonthlyValue = Number(usage.benefitValue || 0)) {
  if (benefit.type === 'amount_cap' || benefit.type === 'amount_cap_pool' || benefit.type === 'reward_cap_pool') {
    return `
      <div class="benefit-controls">
        <label>이번달 사용금액 <input type="text" inputmode="numeric" data-money-input value="${formatNumberInput(usage.usedAmount)}" data-usage-field="usedAmount" data-benefit-id="${benefit.id}"></label>
        <label>이번달 혜택 사용액/적립액 <input type="text" inputmode="numeric" data-money-input value="${formatNumberInput(usage.benefitValue)}" data-usage-field="benefitValue" data-benefit-id="${benefit.id}"></label>
        ${cap ? `<span class="remaining">남은 한도 ${won(Math.max(0, cap - Number(effectiveMonthlyValue || 0)))}</span>` : ''}
        ${benefit.annualCap ? `<span class="remaining">남은 연한도 ${won(Math.max(0, benefit.annualCap - annualValue))}</span>` : ''}
      </div>`;
  }
  if (benefit.type === 'count' || benefit.type === 'count_amount' || benefit.type === 'info_check') {
    return `
      <div class="counter-controls">
        <button data-count-minus="${benefit.id}">−</button>
        <input type="number" min="0" value="${Number(usage.count || 0)}" data-usage-field="count" data-benefit-id="${benefit.id}">
        <button data-count-plus="${benefit.id}">+</button>
        ${benefit.type === 'count_amount' ? `<input class="money-input" type="text" inputmode="numeric" data-money-input placeholder="혜택금액" value="${formatNumberInput(usage.benefitValue)}" data-usage-field="benefitValue" data-benefit-id="${benefit.id}">` : ''}
        <label class="inline-check"><input type="checkbox" ${usage.checked ? 'checked' : ''} data-usage-check="checked" data-benefit-id="${benefit.id}"> 이번달 사용함</label>
      </div>`;
  }
  if (benefit.type === 'check') {
    return `<label class="wide-check"><input type="checkbox" ${usage.checked ? 'checked' : ''} data-usage-check="checked" data-benefit-id="${benefit.id}"> 현재 주기 사용 완료</label>`;
  }
  if (benefit.type === 'two_transactions') {
    return `
      <div class="two-tx">
        <label><input type="checkbox" ${usage.tx1 ? 'checked' : ''} data-usage-check="tx1" data-benefit-id="${benefit.id}"> 1만원 이상 결제 1건</label>
        <label><input type="checkbox" ${usage.tx2 ? 'checked' : ''} data-usage-check="tx2" data-benefit-id="${benefit.id}"> 1만원 이상 결제 2건</label>
        <strong>${Number(Boolean(usage.tx1)) + Number(Boolean(usage.tx2))}/2건</strong>
      </div>`;
  }
  if (benefit.type === 'milestone') {
    return `<div class="milestone-list">${(benefit.milestones || []).map((m) => `<span>${won(m.spend)} → ${escapeHtml(m.label)}</span>`).join('')}</div>`;
  }
  return `<label class="wide-check"><input type="checkbox" ${usage.checked ? 'checked' : ''} data-usage-check="checked" data-benefit-id="${benefit.id}"> 이번달 확인/사용 메모</label>`;
}

function renderSettings() {
  return `
    <section class="page-head compact-head">
      <div>
        <h2>설정</h2>
        <p>동기화, 포인트 가치, 백업을 관리합니다.</p>
      </div>
    </section>
    <div class="settings-list">
      ${renderCloudSyncCard()}
      ${renderSettingsSection('points', '포인트 가치', `
        <p>추천 탭의 예상 혜택 계산에 사용합니다.</p>
        ${Object.entries(state.settings.pointValues).map(([key, value]) => `<label>${escapeHtml(pointLabel(key))}<input type="number" step="0.1" value="${value}" data-point-value="${key}"></label>`).join('')}
      `)}
      ${renderSettingsSection('order', '카드 순서 편집', `
        <p>카드현황 화면 표시 순서입니다.</p>
        <div class="order-list">
          ${getOrderedCards(state).map((card) => `<div><span>${escapeHtml(card.shortName)}</span><button data-move-up="${card.id}">위</button><button data-move-down="${card.id}">아래</button></div>`).join('')}
        </div>
      `)}
      ${renderSettingsSection('backup', '백업 / 복원', `
        <p>JSON 백업으로 데이터를 다른 기기로 옮기거나 복원합니다.</p>
        <p class="sync-meta">마지막 백업: <strong>${escapeHtml(lastBackupLabel())}</strong> · 앱 버전 ${escapeHtml(APP_VERSION)}</p>
        <div class="backup-actions">
          <button data-action="export-json">JSON 내보내기</button>
          <label class="file-button">JSON 불러오기<input type="file" accept="application/json" data-action="import-json"></label>
          <button class="danger" data-action="reset-all">초기화</button>
        </div>
        <textarea id="backupBox" placeholder="내보낸 JSON이 여기에 표시됩니다."></textarea>
        <div class="section-note">
          <p><strong>데이터 이동 순서</strong>: ① 기존 기기에서 JSON 내보내기 → ② 파일을 새 기기로 이동 → ③ 새 기기에서 접속 → ④ JSON 불러오기로 복원</p>
          <p>백업 JSON에는 개인 카드 사용 패턴이 들어가므로 공개 저장소에 올리지 마세요.</p>
        </div>
      `)}
      <div class="settings-card">
        <h3>앱 / 저장 안내</h3>
        <p>GitHub Pages 주소를 브라우저에서 열어 사용합니다. 비로그인 데이터는 이 브라우저의 localStorage에만 저장되고, Google 로그인 시 Firebase Firestore와 동기화됩니다.</p>
        <p class="sync-meta">데이터는 실적·혜택 사용내역 등 값을 입력·변경할 때만 클라우드에 저장됩니다. 화면 이동은 기기별로 따로 동작합니다.</p>
      </div>
    </div>
  `;
}

function renderSettingsSection(id, title, bodyHtml) {
  return `
    <details class="settings-card settings-accordion" data-settings-id="${id}" ${openSettings.has(id) ? 'open' : ''}>
      <summary>${escapeHtml(title)}</summary>
      <div class="settings-body">${bodyHtml}</div>
    </details>
  `;
}

function renderCloudSyncCard() {
  const user = syncStatus.user;
  const tone = syncStatus.state === 'synced' ? 'good' : syncStatus.state === 'error' ? 'warn' : '';
  const statusText = syncStatusLabel(syncStatus.state);
  return `
    <div class="settings-card cloud-sync-card ${tone}">
      <h3>클라우드 동기화</h3>
      ${user ? `
        <div class="sync-row">
          <span class="sync-status ${escapeHtml(syncStatus.state)}">${escapeHtml(statusText)}</span>
          <button data-action="cloud-sync-now">지금 동기화</button>
        </div>
        <details class="account-expand">
          <summary>계정 정보</summary>
          <div class="sync-account">
            <strong>${escapeHtml(user.displayName || 'Google 계정')}</strong>
            <span>${escapeHtml(user.email || '')}</span>
          </div>
          <p class="sync-meta">마지막 동기화: <strong>${escapeHtml(syncStatus.lastSyncedAt ? formatDateTime(syncStatus.lastSyncedAt) : '아직 없음')}</strong></p>
          ${syncStatus.error ? `<p class="sync-error">${escapeHtml(syncStatus.error)}</p>` : ''}
          <div class="backup-actions">
            <button data-action="cloud-signout">로그아웃</button>
          </div>
        </details>
      ` : `
        <div class="sync-row">
          <span class="sync-status ${escapeHtml(syncStatus.state)}">${escapeHtml(statusText)}</span>
          <button data-action="cloud-signin" ${syncStatus.configured ? '' : 'disabled'}>Google 로그인</button>
        </div>
        ${syncStatus.error ? `<p class="sync-error">${escapeHtml(syncStatus.error)}</p>` : ''}
      `}
    </div>
  `;
}

function renderBackupNotice(className = 'backup-notice') {
  const status = getBackupStatus();
  return `
    <section class="${className} ${status.shouldWarn ? 'warn' : 'good'}">
      <h3>${status.shouldWarn ? '백업 권장' : '백업 상태'}</h3>
      <p>${escapeHtml(status.message)}</p>
    </section>
  `;
}

function bindDetailMainEvents(root) {
  root.querySelectorAll('[data-money-input]').forEach((input) => input.addEventListener('input', () => {
    const digits = String(input.value).replace(/[^\d]/g, '');
    input.value = digits ? formatNumberInput(digits) : '';
  }));
  root.querySelectorAll('[data-monthly-card-field]').forEach((input) => {
    const saveMonthlyInput = (options = {}) => {
      const render = options.render ?? Date.now() > suppressMonthlyInputRenderUntil;
      updateMonthlyCard(input.dataset.cardId, { [input.dataset.monthlyCardField]: normalizeInput(input.value) }, { render });
    };
    input.addEventListener('change', () => saveMonthlyInput());
    input.addEventListener('blur', () => saveMonthlyInput());
    if (input.dataset.monthlyCardField === 'currentMonthSpend') {
      input.addEventListener('input', () => saveMonthlyInput({ render: false }));
    }
  });
  root.querySelectorAll('[data-card-field]').forEach((input) => input.addEventListener('change', () => updateCard(input.dataset.cardId, { [input.dataset.cardField]: normalizeInput(input.value) })));
  root.querySelectorAll('[data-cycle-field]').forEach((input) => input.addEventListener('change', () => updateCard(input.dataset.cardId, { cycle: { [input.dataset.cycleField]: normalizeInput(input.value) } })));
  root.querySelector('.detail-settings')?.addEventListener('toggle', (event) => {
    state = { ...state, cardSettingsOpen: event.target.open };
    state = saveState(state, { touch: false });
  });
  root.querySelectorAll('details.benefit-card').forEach((el) => el.addEventListener('toggle', () => {
    if (el.open) openBenefits.add(el.dataset.benefitId);
    else openBenefits.delete(el.dataset.benefitId);
  }));
  root.querySelectorAll('[data-card-memo]').forEach((input) => input.addEventListener('blur', () => updateCard(input.dataset.cardMemo, { memo: input.value })));

  root.querySelectorAll('[data-usage-field]').forEach((input) => {
    const isMemo = input.dataset.usageField === 'memo';
    const saveUsageField = () => {
      const value = isMemo ? input.value : Number(String(input.value).replace(/[^\d]/g, '') || 0);
      updateUsage(input.dataset.benefitId, { [input.dataset.usageField]: value });
    };
    if (isMemo) {
      input.addEventListener('blur', saveUsageField);
    } else {
      input.addEventListener('change', saveUsageField);
      input.addEventListener('blur', saveUsageField);
    }
  });
  root.querySelectorAll('[data-usage-check]').forEach((input) => input.addEventListener('change', () => updateUsage(input.dataset.benefitId, { [input.dataset.usageCheck]: input.checked })));
  root.querySelectorAll('[data-count-plus]').forEach((button) => button.addEventListener('click', () => bumpCount(button.dataset.countPlus, 1)));
  root.querySelectorAll('[data-count-minus]').forEach((button) => button.addEventListener('click', () => bumpCount(button.dataset.countMinus, -1)));
}

function bindEvents() {
  document.querySelectorAll('[data-tab]').forEach((button) => {
    commitMonthlyInputBeforeAction(button);
    button.addEventListener('click', () => {
      commitActiveMonthlyCardInput();
      setState({ selectedTab: button.dataset.tab });
    });
  });
  document.querySelector('[data-action="toggle-dark"]')?.addEventListener('click', () => updateSettings({ darkMode: !state.settings.darkMode }));
  document.querySelector('[data-action="toggle-sort"]')?.addEventListener('click', () => setState({ isSortingCards: !state.isSortingCards }));
  document.querySelectorAll('[data-month-move]').forEach((button) => {
    commitMonthlyInputBeforeAction(button);
    button.addEventListener('click', () => {
      commitActiveMonthlyCardInput();
      moveMonth(Number(button.dataset.monthMove || 0));
    });
  });
  const todayButton = document.querySelector('[data-month-today]');
  commitMonthlyInputBeforeAction(todayButton);
  todayButton?.addEventListener('click', () => {
    commitActiveMonthlyCardInput();
    setState({ selectedMonth: getMonthKey() });
  });

  document.querySelectorAll('[data-open-card]').forEach((el) => el.addEventListener('click', (event) => {
    if (event.target.closest('button, input, select, textarea, summary, details')) return;
    if (state.isSortingCards && el.classList.contains('dashboard-card')) return;
    if (suppressNextOpen) {
      suppressNextOpen = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    commitActiveMonthlyCardInput();
    setState({ selectedTab: 'cards', selectedCardId: el.dataset.openCard });
  }));
  document.querySelectorAll('[data-open-card]').forEach(commitMonthlyInputBeforeAction);
  document.querySelectorAll('[data-select-card]').forEach((el) => {
    commitMonthlyInputBeforeAction(el);
    el.addEventListener('click', () => selectCard(el.dataset.selectCard));
  });
  document.querySelectorAll('[data-move-up]').forEach((el) => el.addEventListener('click', (event) => { event.stopPropagation(); moveCard(el.dataset.moveUp, -1); }));
  document.querySelectorAll('[data-move-down]').forEach((el) => el.addEventListener('click', (event) => { event.stopPropagation(); moveCard(el.dataset.moveDown, 1); }));

  bindDetailMainEvents(document);

  document.querySelectorAll('details.settings-accordion').forEach((el) => el.addEventListener('toggle', () => {
    if (el.open) openSettings.add(el.dataset.settingsId);
    else openSettings.delete(el.dataset.settingsId);
  }));
  document.querySelector('[data-toggle-categories]')?.addEventListener('click', () => { categoryExpanded = !categoryExpanded; render(); });
  document.querySelector('[data-toggle-subcategories]')?.addEventListener('click', () => { subcategoryExpanded = !subcategoryExpanded; render(); });
  document.querySelectorAll('[data-category]').forEach((button) => button.addEventListener('click', () => { subcategoryExpanded = false; setState({ selectedCategory: button.dataset.category, selectedSubcategory: '' }); }));
  document.querySelectorAll('[data-subcategory]').forEach((button) => button.addEventListener('click', () => setState({ selectedSubcategory: button.dataset.subcategory || '' })));
  document.querySelector('[data-field="recommendationAmount"]')?.addEventListener('change', (event) => setState({ recommendationAmount: Number(String(event.target.value).replace(/[^\d]/g, '') || 0) }));
  document.querySelectorAll('[data-point-value]').forEach((input) => input.addEventListener('change', () => updatePointValue(input.dataset.pointValue, input.value)));

  document.querySelector('[data-action="export-json"]')?.addEventListener('click', exportJson);
  document.querySelector('[data-action="import-json"]')?.addEventListener('change', importJson);
  document.querySelector('[data-action="cloud-signin"]')?.addEventListener('click', async () => {
    try {
      await requestCloudSignIn();
    } catch (error) {
      alert(`Google 로그인에 실패했습니다.\n\n${error.message}`);
    }
  });
  document.querySelector('[data-action="cloud-signout"]')?.addEventListener('click', async () => {
    try {
      await requestCloudSignOut();
    } catch (error) {
      alert(`로그아웃에 실패했습니다.\n\n${error.message}`);
    }
  });
  document.querySelector('[data-action="cloud-sync-now"]')?.addEventListener('click', async () => {
    try {
      await requestCloudSyncNow();
    } catch (error) {
      alert(`동기화에 실패했습니다.\n\n${error.message}`);
    }
  });
  document.querySelector('[data-action="reset-all"]')?.addEventListener('click', () => {
    if (confirm('모든 입력 데이터를 초기화할까요?')) {
      state = resetState();
      queueCloudSave(state);
      render();
    }
  });
  bindDragSort();
}

function normalizeInput(value) {
  if (value === 'met' || value === 'unmet' || value === 'manual' || value === 'calendar' || value === 'anniversary' || value === 'issueMonth' || value === 'quarter') return value;
  const number = Number(String(value).replace(/,/g, ''));
  return Number.isNaN(number) ? value : number;
}

function formatNumberInput(value) {
  return Number(value || 0).toLocaleString('ko-KR');
}

function benefitRateText(rate, spend) {
  return Number(spend || 0) > 0 ? pct(rate, 1) : '-';
}

function updateUsage(benefitId, patch) {
  state = setBenefitUsage(state, benefitId, monthKey(), withAutoBenefitValue(benefitId, patch));
  persistState(state);
  render();
}

function withAutoBenefitValue(benefitId, patch) {
  if (!Object.prototype.hasOwnProperty.call(patch, 'usedAmount') || Object.prototype.hasOwnProperty.call(patch, 'benefitValue')) return patch;
  const context = findBenefitContext(benefitId);
  if (!context || !canAutoCalculateBenefitValue(context.benefit)) return patch;
  return {
    ...patch,
    benefitValue: calculateAutoBenefitValue(context.card, context.benefit, Number(patch.usedAmount || 0))
  };
}

function canAutoCalculateBenefitValue(benefit) {
  return ['amount_cap', 'amount_cap_pool', 'reward_cap_pool'].includes(benefit.type) && (benefit.rate || benefit.rateBySpend || benefit.monthlyCap || benefit.monthlyCapBySpend || benefit.capPoolId);
}

function findBenefitContext(benefitId) {
  for (const card of CARDS) {
    const benefit = card.benefits.find((item) => item.id === benefitId);
    if (benefit) return { card, benefit };
  }
  return null;
}

function calculateAutoBenefitValue(card, benefit, usedAmount) {
  if (!usedAmount) return 0;
  if (benefit.minAmount && usedAmount < benefit.minAmount) return 0;
  const override = getCardOverride(state, card.id);
  const prevSpend = inferPrevSpend(card, override);
  const rate = calculateRate(benefit, prevSpend);
  const raw = usedAmount * rate;
  const currentMonthKey = monthKey();
  const monthlyCap = effectiveMonthlyCap(card, benefit, prevSpend);
  const monthlyUsedByOthers = monthlyCap && benefit.capPoolId ? getMonthlyPoolBenefitValue(card, benefit, currentMonthKey) : 0;
  const monthlyRemaining = monthlyCap ? Math.max(0, monthlyCap - monthlyUsedByOthers) : Infinity;
  const annualUsedBeforeThisMonth = benefit.annualCap
    ? getAnnualBenefitValue(state, card, benefit, selectedDate(), { excludeMonthKey: currentMonthKey })
    : 0;
  const annualRemaining = benefit.annualCap ? Math.max(0, benefit.annualCap - annualUsedBeforeThisMonth) : Infinity;
  return Math.round(Math.max(0, Math.min(raw, monthlyRemaining, annualRemaining)));
}

function effectiveMonthlyCap(card, benefit, prevSpend) {
  const ownCap = calculateMonthlyCap(benefit, prevSpend);
  if (ownCap) return ownCap;
  if (!benefit.capPoolId) return 0;
  const pool = card.benefits.find((item) => item.id === benefit.capPoolId);
  return pool ? calculateMonthlyCap(pool, prevSpend) : 0;
}

function getMonthlyPoolBenefitValue(card, benefit, currentMonthKey) {
  if (!benefit.capPoolId) return 0;
  return card.benefits
    .filter((item) => item.capPoolId === benefit.capPoolId && item.id !== benefit.id)
    .reduce((sum, item) => sum + Number(getBenefitUsage(state, item.id, currentMonthKey).benefitValue || 0), 0);
}

function bumpCount(benefitId, delta) {
  const current = Number(getBenefitUsage(state, benefitId, monthKey()).count || 0);
  updateUsage(benefitId, { count: Math.max(0, current + delta) });
}

function moveMonth(delta) {
  const current = new Date(`${selectedMonthKey()}-01T00:00:00`);
  current.setMonth(current.getMonth() + delta);
  setState({ selectedMonth: getMonthKey(current) });
}

function moveCard(cardId, direction) {
  const order = [...state.cardOrder];
  const idx = order.indexOf(cardId);
  const nextIdx = idx + direction;
  if (idx < 0 || nextIdx < 0 || nextIdx >= order.length) return;
  [order[idx], order[nextIdx]] = [order[nextIdx], order[idx]];
  state = { ...state, cardOrder: order };
  persistState(state);
  render();
}

function bindDragSort() {
  if (!state.isSortingCards) return;
  let draggedId = null;
  let pointerDrag = null;
  document.querySelectorAll('.dashboard-card[draggable="true"]').forEach((el) => {
    const startManualDrag = (event) => {
      if (event.target.closest('button, input, select, textarea, summary, details')) return;
      pointerDrag = { id: el.dataset.cardId, x: event.clientX, y: event.clientY, active: false };
    };
    const moveManualDrag = (event) => {
      if (!pointerDrag || pointerDrag.id !== el.dataset.cardId) return;
      const moved = Math.hypot(event.clientX - pointerDrag.x, event.clientY - pointerDrag.y);
      if (moved > 12) {
        pointerDrag.active = true;
        el.classList.add('dragging');
      }
    };
    const endManualDrag = (event) => {
      if (!pointerDrag || pointerDrag.id !== el.dataset.cardId) return;
      const wasActive = pointerDrag.active;
      el.classList.remove('dragging');
      if (wasActive) {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.dashboard-card');
        const targetId = target?.dataset.cardId;
        if (targetId && targetId !== pointerDrag.id) reorderCardBefore(pointerDrag.id, targetId);
        suppressNextOpen = true;
      }
      pointerDrag = null;
    };
    el.addEventListener('dragstart', () => {
      draggedId = el.dataset.cardId;
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      draggedId = null;
      el.classList.remove('dragging');
    });
    el.addEventListener('dragover', (event) => event.preventDefault());
    el.addEventListener('drop', (event) => {
      event.preventDefault();
      const targetId = el.dataset.cardId;
      if (!draggedId || draggedId === targetId) return;
      reorderCardBefore(draggedId, targetId);
    });
    el.addEventListener('pointerdown', startManualDrag);
    el.addEventListener('pointermove', moveManualDrag);
    el.addEventListener('pointerup', endManualDrag);
  });
}

function reorderCardBefore(draggedId, targetId) {
  const order = [...state.cardOrder];
  const from = order.indexOf(draggedId);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return;
  order.splice(from, 1);
  order.splice(to, 0, draggedId);
  setState({ cardOrder: order });
}

function benefitTypeLabel(type) {
  const labels = {
    amount_cap: '금액한도형',
    amount_cap_pool: '금액한도형',
    reward_cap_pool: '적립형',
    count: '횟수형',
    count_amount: '횟수형',
    check: '기프트형',
    info_check: '횟수형',
    two_transactions: '실적형',
    milestone: '실적형',
    reward: '적립형',
    info: '안내형'
  };
  return labels[type] || type || '확인 필요';
}

function limitText(benefit, cap) {
  if (benefit.type === 'two_transactions') return '<span>월 2건</span>';
  const labels = [];
  if (cap) labels.push(`월 ${won(cap)}`);
  if (benefit.monthlyLimitCount) labels.push(`월 ${benefit.monthlyLimitCount}회`);
  if (benefit.annualCap) labels.push(`연 ${won(benefit.annualCap)}`);
  if (benefit.annualLimitCount) labels.push(`연 ${benefit.annualLimitCount}회`);
  return labels.map((label) => `<span>${escapeHtml(label)}</span>`).join('');
}

function requiredSpendText(benefit, card) {
  const match = String(benefit.conditions || '').match(/전월[^.。]*?(\d[\d,]*)만원/);
  if (match) return `전월 ${match[1]}만원 이상`;
  if (card.defaultMonthlyTarget) return `보통 전월 ${compactWon(card.defaultMonthlyTarget)}원 기준, 상세 조건 확인`;
  return benefit.conditions?.includes('전월') ? '전월실적 조건 확인 필요' : '전월실적 조건 없음 또는 별도 확인';
}

function monthlyLimitText(benefit, cap) {
  if (benefit.type === 'two_transactions') return `월 2건 · 건당 ${won(benefit.minAmount || 10000)} 이상`;
  const parts = [];
  if (cap) parts.push(won(cap));
  if (benefit.monthlyLimitCount) parts.push(`${benefit.monthlyLimitCount}회`);
  if (benefit.minAmount) parts.push(`건당 ${won(benefit.minAmount)} 이상`);
  return parts.join(' · ') || '-';
}

function annualLimitText(benefit) {
  const parts = [];
  if (benefit.annualCap) parts.push(won(benefit.annualCap));
  if (benefit.annualLimitCount) parts.push(`${benefit.annualLimitCount}회`);
  if (benefit.milestones?.length) parts.push(benefit.milestones.map((item) => `${compactWon(item.spend)}원 ${item.label}`).join(', '));
  return parts.join(' · ') || '-';
}

function monthlyUsageText(benefit, usage, monthlyCount, monthlyValue) {
  if (benefit.type === 'two_transactions') {
    const done = Number(Boolean(usage.tx1)) + Number(Boolean(usage.tx2));
    return `1만원 이상 결제 ${done}/2건`;
  }
  if (monthlyValue) return `${won(monthlyValue)} 사용`;
  if (monthlyCount) return `${monthlyCount}회 사용`;
  return usage.checked ? '사용함' : '미사용';
}

function remainingText(benefit, cap, usage, annualCount, annualValue, effectiveMonthlyValue = Number(usage.benefitValue || 0)) {
  if (benefit.type === 'two_transactions') {
    const done = Number(Boolean(usage.tx1)) + Number(Boolean(usage.tx2));
    return `${Math.max(0, 2 - done)}건 더 필요`;
  }
  const parts = [];
  if (cap) parts.push(`월 ${won(Math.max(0, cap - Number(effectiveMonthlyValue || 0)))}`);
  if (benefit.monthlyLimitCount) parts.push(`월 ${Math.max(0, benefit.monthlyLimitCount - Number(usage.count || 0))}회`);
  if (benefit.annualLimitCount) parts.push(`연 ${Math.max(0, benefit.annualLimitCount - annualCount)}회`);
  if (benefit.annualCap) parts.push(`연 ${won(Math.max(0, benefit.annualCap - annualValue))}`);
  return parts.join(' · ') || '-';
}

function prevMonthLabel(status) {
  if (status === 'met') return '충족';
  if (status === 'unmet') return '미달';
  return '확인 필요';
}

function monthlyMetricText(card, override) {
  const target = Number(override.monthlyTarget || 0);
  if (!target) return '관리 안 함';
  const shortfall = getMonthlyShortfall(card, override);
  return shortfall ? `${won(shortfall)} 부족` : '달성';
}

function annualMetricText(override, annualSpend, annualShortfall) {
  const target = Number(override.annualTarget || 0);
  if (!target) return '관리 안 함';
  return annualShortfall ? `${won(annualSpend)} / ${won(target)}` : '달성';
}

function getBackupStatus() {
  const lastBackupAt = state.backupMeta?.lastBackupAt;
  if (!lastBackupAt) {
    return {
      shouldWarn: true,
      message: '아직 JSON 백업 기록이 없습니다. 스마트폰 변경이나 브라우저 데이터 삭제 전에 JSON 내보내기를 실행하세요.'
    };
  }
  const elapsed = Date.now() - new Date(lastBackupAt).getTime();
  const days = Math.floor(elapsed / 86400000);
  return {
    shouldWarn: days >= 30,
    message: days >= 30
      ? `마지막 백업 후 ${days}일이 지났습니다. 데이터 유실 방지를 위해 JSON 내보내기를 권장합니다.`
      : `마지막 백업은 ${formatDate(lastBackupAt)}입니다. 백업 JSON은 안전한 개인 저장소에 보관하세요.`
  };
}

function lastBackupLabel() {
  const lastBackupAt = state.backupMeta?.lastBackupAt;
  return lastBackupAt ? formatDate(lastBackupAt) : '없음';
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '확인 필요';
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '확인 필요';
  return date.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatMonthLabel(value) {
  const [year, month] = String(value).split('-');
  return `${year}년 ${Number(month)}월`;
}

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
}

function pointLabel(key) {
  const labels = {
    koreanAir: '대한항공 1마일',
    asiana: '아시아나 1마일',
    marriott: '메리어트 1P',
    hyundaiMR: '현대 MR 1P',
    myShinhan: '마이신한 1P',
    kbPointree: 'KB 포인트리 1P',
    ecoMoney: '에코머니 1P',
    wooriMoa: '우리 모아포인트 1P',
    hanaDiscount: '하나 할인 1원',
    samsungBigPoint: '삼성 빅포인트 1P'
  };
  return labels[key] || key;
}

function syncStatusLabel(value) {
  const labels = {
    disabled: '비활성',
    initializing: '준비 중',
    'signed-out': '로컬 전용',
    loading: '확인 중',
    syncing: '동기화 중',
    synced: '동기화됨',
    error: '확인 필요'
  };
  return labels[value] || '확인 중';
}

function exportJson() {
  const now = new Date().toISOString();
  state = {
    ...state,
    backupMeta: {
      ...(state.backupMeta || {}),
      lastBackupAt: now
    }
  };
  persistState(state);
  const text = exportState(state);
  const box = document.querySelector('#backupBox');
  if (box) box.value = text;
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `card-benefit-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  render();
  alert('JSON 백업 파일을 생성했습니다. 다운로드된 파일을 안전한 개인 저장소에 보관하세요.');
}

function importJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!confirm('현재 입력 데이터가 백업 파일 내용으로 덮어써집니다. 계속 불러올까요?')) {
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = importState(String(reader.result));
      persistState(state);
      render();
      alert('백업을 불러왔습니다. 카드 설정과 혜택 사용내역이 복원되었습니다.');
    } catch (error) {
      alert(`백업 파일을 읽지 못했습니다.\n\n${error.message}`);
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

render();
initSync({
  getState: () => state,
  applyRemoteState: (remoteState) => {
    // 원격에서 데이터만 반영하고, 화면 이동/보기 상태와 테마는 이 기기 것을 유지
    const preserved = {};
    for (const key of UI_STATE_KEYS) preserved[key] = state[key];
    state = {
      ...remoteState,
      ...preserved,
      settings: { ...remoteState.settings, darkMode: state.settings?.darkMode }
    };
    state = saveState(state, { touch: false });
    render();
  },
  onStatusChange: (nextStatus) => {
    syncStatus = nextStatus;
    render();
  }
});
