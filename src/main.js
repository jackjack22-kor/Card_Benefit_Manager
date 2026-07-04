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
  getFillSpendRecommendations,
  getMonthlyShortfall,
  getOrderedCards,
  getShortfallCards,
  recommendCards,
  setBenefitUsage
} from './lib/recommend.js';
import { clamp, compactWon, escapeHtml, pct, won } from './lib/format.js';

let state = loadState();
const app = document.querySelector('#app');
let suppressNextOpen = false;

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
  saveState(state);
  render();
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
  saveState(state);
  render();
}

function updateMonthlyCard(cardId, patch) {
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
  saveState(state);
  render();
}

function updateSettings(patch) {
  state = { ...state, settings: { ...state.settings, ...patch } };
  saveState(state);
  render();
}

function updatePointValue(key, value) {
  updateSettings({ pointValues: { ...state.settings.pointValues, [key]: Number(value || 0) } });
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
  return `
    <header class="app-header">
      <div class="brand-title">
        <span class="eyebrow">CARD OPS</span>
        <h1>카드 혜택 매니저</h1>
      </div>
      ${renderMonthNavigator()}
      <button class="icon-button" data-action="toggle-dark" aria-label="테마 변경">${state.settings.darkMode ? 'Light' : 'Dark'}</button>
    </header>
  `;
}

function renderMonthNavigator() {
  return `
    <div class="month-nav" aria-label="월 이동">
      <button data-month-move="-1" aria-label="이전 달">‹</button>
      <strong>${formatMonthLabel(selectedMonthKey())}</strong>
      <button data-month-move="1" aria-label="다음 달">›</button>
      <button class="today-button" data-month-today>이번달</button>
    </div>
  `;
}

function renderTabs() {
  const tabs = [
    ['dashboard', '카드현황'],
    ['recommend', '결제추천'],
    ['cards', '카드상세'],
    ['settings', '설정/백업']
  ];
  return `<nav class="tabs">${tabs.map(([id, label]) => `<button class="tab ${state.selectedTab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('')}</nav>`;
}

function renderDashboard() {
  const cards = getOrderedCards(state);
  const shortfallCards = cards.filter((card) => {
    const override = getCardOverride(state, card.id);
    return Number(override.monthlyTarget || 0) > 0 && getMonthlyShortfall(card, override) > 0;
  });
  const completeCards = cards.filter((card) => !shortfallCards.includes(card));

  return `
    <section class="page-head compact-head">
      <div>
        <h2>${formatMonthLabel(selectedMonthKey())} 카드 현황</h2>
        <p>각 카드의 전월실적 충족 여부와 이번달 실적 달성 여부만 빠르게 확인합니다.</p>
      </div>
      <button class="ghost" data-action="toggle-sort">${state.isSortingCards ? '정렬 완료' : '정렬'}</button>
    </section>
    ${renderDashboardGroup('실적 부족 카드', shortfallCards, 'shortfall')}
    ${renderDashboardGroup('실적 충족/관리 카드', completeCards, 'complete')}
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
  const prevLabel = override.prevMonthStatus === 'met' ? '전월실적 충족' : override.prevMonthStatus === 'unmet' ? '전월실적 미달' : '전월실적 확인';
  const monthlyLabel = monthlyTarget ? (monthlyShortfall ? `${won(monthlyShortfall)} 부족` : '이번달 달성') : '실적 관리 없음';

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
            <span>${monthlyTarget ? `${won(monthlySpend)} / ${won(monthlyTarget)}` : '목표 없음'}</span>
          </div>
          <b class="${monthlyShortfall ? 'warn-text' : 'good-text'}">${monthlyLabel}</b>
        </div>
        <div class="bar"><i style="width:${monthlyPct * 100}%"></i></div>
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
        <input type="number" min="0" step="1000" value="${amount}" data-field="recommendationAmount">
      </label>
    </section>

    <section class="picker-panel">
      <div class="category-pills">
        ${CATEGORIES.filter((c) => !['breakfast', 'premiumgift'].includes(c.id)).map((cat) => `<button class="${category === cat.id ? 'active' : ''}" data-category="${cat.id}">${cat.label}</button>`).join('')}
      </div>
      ${subcategories.length ? `
        <div class="subcategory-pills">
          <button class="${!subcategory ? 'active' : ''}" data-subcategory="">전체</button>
          ${subcategories.map((item) => `<button class="${subcategory === item.id ? 'active' : ''}" data-subcategory="${item.id}">${item.label}</button>`).join('')}
        </div>
      ` : '<p class="selector-note">이 업종은 현재 세부 사용처보다 카드사 업종 분류 확인이 더 중요합니다.</p>'}
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

function renderRankItem(result, index, mode = 'value') {
  const amount = Math.max(Number(state.recommendationAmount || 1), 1);
  const estimatedRate = result.value ? result.value / amount : result.bestRate;
  const fillText = mode === 'fill'
    ? [
        result.monthlyShortfall ? `월 ${won(result.monthlyShortfall)} 부족` : '',
        result.annualShortfall ? `연 ${won(result.annualShortfall)} 부족` : ''
      ].filter(Boolean).join(' · ')
    : `${pct(estimatedRate, 1)} 예상`;

  return `
    <article class="rank-item" data-open-card="${result.card.id}">
      <div class="rank-no">${index + 1}</div>
      <div class="rank-body">
        <strong>${escapeHtml(result.card.shortName)}</strong>
        <span>${mode === 'fill' ? escapeHtml(fillText) : `${won(result.value)} 혜택 예상`}</span>
        <small class="${result.status.ok ? 'good-text' : result.status.ok === false ? 'bad-text' : 'muted'}">${escapeHtml(result.status.text)}</small>
        <p>${escapeHtml(result.reason)}</p>
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
      </div>
      <div class="rank-value">
        <strong>${mode === 'fill' ? '실적' : `~${pct(estimatedRate, 1)}`}</strong>
        <span>${mode === 'fill' ? fillText : won(result.value)}</span>
      </div>
    </article>
  `;
}

function renderCardDetail() {
  const selected = CARD_MAP[state.selectedCardId] || getOrderedCards(state)[0] || CARDS[0];
  const override = getCardOverride(state, selected.id);
  const cycle = getCycle(selected, override, {}, selectedDate());
  const annualSpend = getAnnualSpend(state, selected, selectedDate());
  const annualShortfall = getAnnualShortfall(selected, override, state);
  const coreBenefits = selected.benefits.filter((benefit) => benefit.priority === 'core').slice(0, 6);

  return `
    <section class="detail-layout">
      <aside class="card-list-panel">
        <h3>카드 목록</h3>
        ${getOrderedCards(state).map((card) => `<button class="card-list-item ${selected.id === card.id ? 'active' : ''}" data-select-card="${card.id}">${escapeHtml(card.shortName)}</button>`).join('')}
      </aside>
      <div class="detail-main">
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
                ${renderMetric('현재 주기', cycle.label, 'neutral')}
              </div>
            </div>
            ${renderCardImage(selected, 'detail-card-image')}
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
      </div>
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
        <input type="number" data-monthly-card-field="currentMonthSpend" data-card-id="${card.id}" value="${Number(override.currentMonthSpend || 0)}" step="10000">
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
          <input type="number" data-card-field="annualSpend" data-card-id="${card.id}" value="${Number(state.cardOverrides?.[card.id]?.annualSpend || 0)}" step="100000">
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
  const cap = calculateMonthlyCap(benefit, Number(override.monthlyTarget || 0));
  const rate = calculateRate(benefit, Number(override.monthlyTarget || 0));
  const benefitCycle = getCycle(card, override, benefit, selectedDate());
  const monthlyCount = Number(usage.count || 0) + (usage.checked ? 1 : 0) + (usage.tx1 ? 1 : 0) + (usage.tx2 ? 1 : 0);
  const monthlyValue = Number(usage.benefitValue || 0);

  return `
    <article class="benefit-card" data-benefit-id="${benefit.id}">
      <div class="benefit-head">
        <div>
          <span class="benefit-type">${escapeHtml(benefit.priority === 'core' ? '핵심 혜택' : '부가 혜택')}</span>
          <h4>${escapeHtml(benefit.name)}</h4>
          <p>${escapeHtml(benefit.summary || '')}</p>
        </div>
        <div class="benefit-status">
          ${benefit.type === 'two_transactions' ? `<strong>${Number(Boolean(usage.tx1)) + Number(Boolean(usage.tx2))}/2건</strong>` : ''}
          ${benefit.annualLimitCount ? `<strong>연 ${annualCount}/${benefit.annualLimitCount}</strong>` : ''}
          ${benefit.monthlyLimitCount && benefit.type !== 'two_transactions' ? `<span>월 ${Number(usage.count || 0)}/${benefit.monthlyLimitCount}</span>` : ''}
          ${cap ? `<span>${Number(usage.benefitValue || 0).toLocaleString()}/${cap.toLocaleString()}</span>` : ''}
        </div>
      </div>
      <div class="benefit-meta">
        <span>유형: ${escapeHtml(benefitTypeLabel(benefit.type))}</span>
        <span>주기: ${escapeHtml(CYCLE_LABELS[benefit.cycleType || override.cycle?.type || card.defaultCycle?.type] || '기본')}</span>
        <span>${escapeHtml(benefitCycle.label)}</span>
        ${rate ? `<span>혜택률 ${pct(rate)}</span>` : ''}
        ${limitText(benefit, cap)}
      </div>
      ${renderBenefitControls(benefit, usage, cap)}
      <label class="benefit-memo">메모
        <textarea data-usage-field="memo" data-benefit-id="${benefit.id}" placeholder="확인한 조건, 사용 예정일, 예외사항 등을 기록하세요.">${escapeHtml(usage.memo || '')}</textarea>
      </label>
      <details>
        <summary>대상/조건/제외 상세 보기</summary>
        <dl class="benefit-detail">
          <dt>혜택 유형</dt><dd>${escapeHtml(benefitTypeLabel(benefit.type))}</dd>
          <dt>대상</dt><dd>${escapeHtml(benefit.targets || '-')}</dd>
          <dt>필요 전월실적</dt><dd>${escapeHtml(requiredSpendText(benefit, card))}</dd>
          <dt>월 한도/횟수</dt><dd>${escapeHtml(monthlyLimitText(benefit, cap))}</dd>
          <dt>연 한도/횟수</dt><dd>${escapeHtml(annualLimitText(benefit))}</dd>
          <dt>이번달 사용</dt><dd>${escapeHtml(monthlyUsageText(benefit, usage, monthlyCount, monthlyValue))}</dd>
          <dt>연간 누적</dt><dd>${benefit.annualLimitCount ? `${annualCount}/${benefit.annualLimitCount}회` : '-'} ${annualValue ? `· 누적 혜택 ${won(annualValue)}` : ''}</dd>
          <dt>잔여 한도</dt><dd>${escapeHtml(remainingText(benefit, cap, usage, annualCount, annualValue))}</dd>
          <dt>조건</dt><dd>${escapeHtml(benefit.conditions || '-')}</dd>
          <dt>제외/주의</dt><dd>${escapeHtml(benefit.exclusions || '-')}</dd>
          <dt>메모</dt><dd>${escapeHtml(usage.memo || '-')}</dd>
        </dl>
      </details>
    </article>
  `;
}

function renderBenefitControls(benefit, usage, cap) {
  if (benefit.type === 'amount_cap' || benefit.type === 'amount_cap_pool' || benefit.type === 'reward_cap_pool') {
    return `
      <div class="benefit-controls">
        <label>이번달 사용금액 <input type="number" min="0" value="${Number(usage.usedAmount || 0)}" data-usage-field="usedAmount" data-benefit-id="${benefit.id}"></label>
        <label>이번달 혜택 사용액/적립액 <input type="number" min="0" value="${Number(usage.benefitValue || 0)}" data-usage-field="benefitValue" data-benefit-id="${benefit.id}"></label>
        ${cap ? `<span class="remaining">남은 한도 ${won(Math.max(0, cap - Number(usage.benefitValue || 0)))}</span>` : ''}
      </div>`;
  }
  if (benefit.type === 'count' || benefit.type === 'count_amount' || benefit.type === 'info_check') {
    return `
      <div class="counter-controls">
        <button data-count-minus="${benefit.id}">−</button>
        <input type="number" min="0" value="${Number(usage.count || 0)}" data-usage-field="count" data-benefit-id="${benefit.id}">
        <button data-count-plus="${benefit.id}">+</button>
        ${benefit.type === 'count_amount' ? `<input class="money-input" type="number" min="0" placeholder="혜택금액" value="${Number(usage.benefitValue || 0)}" data-usage-field="benefitValue" data-benefit-id="${benefit.id}">` : ''}
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
    <section class="settings-grid">
      <div class="settings-card full-span">
        <h3>GitHub Pages 사용 안내</h3>
        <p>현재 권장 방식은 GitHub Pages 주소를 스마트폰 브라우저에서 열어 사용하는 것입니다. 개인 데이터는 GitHub에 저장되지 않고, 현재 브라우저의 localStorage에 저장됩니다.</p>
      </div>
      ${renderBackupNotice('settings-card full-span')}
      <div class="settings-card">
        <h3>포인트 가치</h3>
        <p>추천 탭의 예상 혜택 계산에 사용합니다.</p>
        ${Object.entries(state.settings.pointValues).map(([key, value]) => `<label>${escapeHtml(pointLabel(key))}<input type="number" step="0.1" value="${value}" data-point-value="${key}"></label>`).join('')}
      </div>
      <div class="settings-card">
        <h3>카드 순서 편집</h3>
        <p>카드현황 화면 표시 순서입니다.</p>
        <div class="order-list">
          ${getOrderedCards(state).map((card) => `<div><span>${escapeHtml(card.shortName)}</span><button data-move-up="${card.id}">위</button><button data-move-down="${card.id}">아래</button></div>`).join('')}
        </div>
      </div>
      <div class="settings-card">
        <h3>백업/복원</h3>
        <p>폰 변경, 브라우저 변경, 사이트 데이터 삭제에 대비하려면 JSON 백업이 필요합니다. iPhone Safari에서도 Pages 주소로 접속한 상태라면 내보내기/불러오기가 가능합니다.</p>
        <p>마지막 백업: <strong>${escapeHtml(lastBackupLabel())}</strong> · 앱 버전 ${escapeHtml(APP_VERSION)}</p>
        <div class="backup-actions">
          <button data-action="export-json">JSON 내보내기</button>
          <label class="file-button">JSON 불러오기<input type="file" accept="application/json" data-action="import-json"></label>
          <button class="danger" data-action="reset-all">초기화</button>
        </div>
        <textarea id="backupBox" placeholder="내보낸 JSON이 여기에 표시됩니다."></textarea>
      </div>
      <div class="settings-card">
        <h3>데이터 이동 순서</h3>
        <p>1. 기존 스마트폰에서 JSON 내보내기</p>
        <p>2. 백업 JSON을 새 스마트폰으로 이동</p>
        <p>3. 새 스마트폰에서 GitHub Pages 주소 접속</p>
        <p>4. JSON 불러오기로 기존 설정과 혜택 사용내역 복원</p>
        <p>백업 JSON에는 개인 카드 사용 패턴이 들어가므로 공개 저장소에 올리지 마세요.</p>
      </div>
    </section>
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

function bindEvents() {
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => setState({ selectedTab: button.dataset.tab })));
  document.querySelector('[data-action="toggle-dark"]')?.addEventListener('click', () => updateSettings({ darkMode: !state.settings.darkMode }));
  document.querySelector('[data-action="toggle-sort"]')?.addEventListener('click', () => setState({ isSortingCards: !state.isSortingCards }));
  document.querySelectorAll('[data-month-move]').forEach((button) => button.addEventListener('click', () => moveMonth(Number(button.dataset.monthMove || 0))));
  document.querySelector('[data-month-today]')?.addEventListener('click', () => setState({ selectedMonth: getMonthKey() }));

  document.querySelectorAll('[data-open-card]').forEach((el) => el.addEventListener('click', (event) => {
    if (event.target.closest('button, input, select, textarea, summary, details')) return;
    if (suppressNextOpen) {
      suppressNextOpen = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    setState({ selectedTab: 'cards', selectedCardId: el.dataset.openCard });
  }));
  document.querySelectorAll('[data-select-card]').forEach((el) => el.addEventListener('click', () => setState({ selectedCardId: el.dataset.selectCard })));
  document.querySelectorAll('[data-move-up]').forEach((el) => el.addEventListener('click', (event) => { event.stopPropagation(); moveCard(el.dataset.moveUp, -1); }));
  document.querySelectorAll('[data-move-down]').forEach((el) => el.addEventListener('click', (event) => { event.stopPropagation(); moveCard(el.dataset.moveDown, 1); }));

  document.querySelectorAll('[data-monthly-card-field]').forEach((input) => input.addEventListener('change', () => updateMonthlyCard(input.dataset.cardId, { [input.dataset.monthlyCardField]: normalizeInput(input.value) })));
  document.querySelectorAll('[data-card-field]').forEach((input) => input.addEventListener('change', () => updateCard(input.dataset.cardId, { [input.dataset.cardField]: normalizeInput(input.value) })));
  document.querySelectorAll('[data-cycle-field]').forEach((input) => input.addEventListener('change', () => updateCard(input.dataset.cardId, { cycle: { [input.dataset.cycleField]: normalizeInput(input.value) } })));
  document.querySelector('.detail-settings')?.addEventListener('toggle', (event) => {
    state = { ...state, cardSettingsOpen: event.target.open };
    saveState(state);
  });
  document.querySelectorAll('[data-card-memo]').forEach((input) => input.addEventListener('blur', () => updateCard(input.dataset.cardMemo, { memo: input.value })));

  document.querySelectorAll('[data-usage-field]').forEach((input) => {
    const saveUsageField = () => {
      const value = input.dataset.usageField === 'memo' ? input.value : Number(input.value || 0);
      updateUsage(input.dataset.benefitId, { [input.dataset.usageField]: value });
    };
    input.addEventListener(input.dataset.usageField === 'memo' ? 'input' : 'change', saveUsageField);
    input.addEventListener('blur', saveUsageField);
  });
  document.querySelectorAll('[data-usage-check]').forEach((input) => input.addEventListener('change', () => updateUsage(input.dataset.benefitId, { [input.dataset.usageCheck]: input.checked })));
  document.querySelectorAll('[data-count-plus]').forEach((button) => button.addEventListener('click', () => bumpCount(button.dataset.countPlus, 1)));
  document.querySelectorAll('[data-count-minus]').forEach((button) => button.addEventListener('click', () => bumpCount(button.dataset.countMinus, -1)));

  document.querySelectorAll('[data-category]').forEach((button) => button.addEventListener('click', () => setState({ selectedCategory: button.dataset.category, selectedSubcategory: '' })));
  document.querySelectorAll('[data-subcategory]').forEach((button) => button.addEventListener('click', () => setState({ selectedSubcategory: button.dataset.subcategory || '' })));
  document.querySelector('[data-field="recommendationAmount"]')?.addEventListener('change', (event) => setState({ recommendationAmount: Number(event.target.value || 0) }));
  document.querySelectorAll('[data-point-value]').forEach((input) => input.addEventListener('change', () => updatePointValue(input.dataset.pointValue, input.value)));

  document.querySelector('[data-action="export-json"]')?.addEventListener('click', exportJson);
  document.querySelector('[data-action="import-json"]')?.addEventListener('change', importJson);
  document.querySelector('[data-action="reset-all"]')?.addEventListener('click', () => {
    if (confirm('모든 입력 데이터를 초기화할까요?')) {
      state = resetState();
      render();
    }
  });
  bindDragSort();
}

function normalizeInput(value) {
  if (value === 'met' || value === 'unmet' || value === 'manual' || value === 'calendar' || value === 'anniversary' || value === 'issueMonth' || value === 'quarter') return value;
  const number = Number(value);
  return Number.isNaN(number) ? value : number;
}

function updateUsage(benefitId, patch) {
  state = setBenefitUsage(state, benefitId, monthKey(), patch);
  saveState(state);
  render();
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
  setState({ cardOrder: order });
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

function remainingText(benefit, cap, usage, annualCount, annualValue) {
  if (benefit.type === 'two_transactions') {
    const done = Number(Boolean(usage.tx1)) + Number(Boolean(usage.tx2));
    return `${Math.max(0, 2 - done)}건 더 필요`;
  }
  const parts = [];
  if (cap) parts.push(`월 ${won(Math.max(0, cap - Number(usage.benefitValue || 0)))}`);
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

function exportJson() {
  const now = new Date().toISOString();
  state = {
    ...state,
    backupMeta: {
      ...(state.backupMeta || {}),
      lastBackupAt: now
    }
  };
  saveState(state);
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
      saveState(state);
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
