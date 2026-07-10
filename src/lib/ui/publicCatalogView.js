import { PUBLIC_CARD_PUBLICATION_CATALOG as PUBLIC_CARD_CATALOG, PUBLIC_CARD_CATALOG_CHECKED_AT } from '../../data/publicCardCatalogIndex.js';
import { compactWon, escapeHtml } from '../format.js';

const PAGE_SIZE = 60;
const STATUS_META = {
  candidate_index: { label: '공식 검증 전', className: 'candidate' },
  official_catalog: { label: '카드사 공식 목록', className: 'official' },
  operational_candidate: { label: '체크카드 운영후보', className: 'candidate' },
  official_detail_verified: { label: '공식 상세 검증', className: 'verified' }
};
const ISSUANCE_STATUS_META = {
  official_application_reachable: { label: '공식 신청 경로 확인', className: 'verified' },
  official_application_url_verified: { label: '공식 신청 URL 확인', className: 'official' }
};

const catalogState = {
  query: '',
  issuer: '',
  productType: '',
  network: '',
  status: '',
  visibleLimit: PAGE_SIZE,
  openCardId: ''
};

const issuerOptions = uniqueSorted(PUBLIC_CARD_CATALOG.map((card) => card.issuer));
const networkOptions = uniqueSorted(PUBLIC_CARD_CATALOG.flatMap((card) => card.networks || []));
const searchIndex = new Map(PUBLIC_CARD_CATALOG.map((card) => [card.id, normalizeSearchText([
  card.issuer,
  card.name,
  ...(card.networks || []),
  ...(card.summaryBenefits || []).flatMap((benefit) => [benefit.title, ...(benefit.tags || [])])
].join(' '))]));

export function renderPublicCatalog(options = {}) {
  const statusCounts = countBy(PUBLIC_CARD_CATALOG, (card) => card.collectionStatus);
  const creditCardCount = PUBLIC_CARD_CATALOG.filter((card) => card.productType === 'credit').length;
  const verifiedCount = Number(statusCounts.official_detail_verified || 0);
  const verificationRate = (verifiedCount / creditCardCount) * 100;
  return `
    <section class="catalog-page">
      <section class="page-head compact-head catalog-head">
        <div>
          <h2>카드 목록</h2>
          <p>카드사와 제휴 브랜드별 상품을 찾고, 데이터 검증 상태를 함께 확인합니다.</p>
        </div>
        <span class="catalog-checked-at">${escapeHtml(PUBLIC_CARD_CATALOG_CHECKED_AT)} 기준</span>
      </section>
      <section class="catalog-summary" aria-label="카드 카탈로그 현황">
        <strong>${PUBLIC_CARD_CATALOG.length.toLocaleString('ko-KR')}개 카드</strong>
        <span>공개 후보 신용카드 ${creditCardCount.toLocaleString('ko-KR')}</span>
        <span>카드사 공식 목록 ${Number(statusCounts.official_catalog || 0).toLocaleString('ko-KR')}</span>
        <span>공식 상세 검증 ${Number(statusCounts.official_detail_verified || 0).toLocaleString('ko-KR')}</span>
        <span>체크카드 운영후보 ${Number(statusCounts.operational_candidate || 0).toLocaleString('ko-KR')}</span>
      </section>
      <section class="catalog-verification-progress" aria-label="공식 상세 검증 진행률">
        <div><strong>신용카드 공식 상세 검증</strong><span>${verifiedCount.toLocaleString('ko-KR')} / ${creditCardCount.toLocaleString('ko-KR')}</span></div>
        <progress value="${verifiedCount}" max="${creditCardCount}">${verificationRate.toFixed(1)}%</progress>
      </section>
      <p class="catalog-disclaimer">신용카드는 공식 신청 경로 또는 카드사 공식 목록이 확인된 상품만 공개합니다. 발급 경로를 확인하지 못한 상품과 단종 상품은 제외합니다. 체크카드는 운영후보로만 제공하며 혜택 계산과 추천에는 반영하지 않습니다.</p>
      ${renderCatalogFilters()}
      <div data-catalog-results aria-live="polite">${renderCatalogResults(options)}</div>
    </section>
  `;
}

export function bindPublicCatalogEvents(root, options = {}) {
  if (!root) return;
  const queryInput = root.querySelector('[data-catalog-query]');
  queryInput?.addEventListener('input', () => {
    catalogState.query = queryInput.value;
    catalogState.visibleLimit = PAGE_SIZE;
    updateCatalogResults(root, options);
  });
  for (const field of ['issuer', 'productType', 'network', 'status']) {
    root.querySelector(`[data-catalog-filter="${field}"]`)?.addEventListener('change', (event) => {
      catalogState[field] = event.target.value;
      catalogState.visibleLimit = PAGE_SIZE;
      updateCatalogResults(root, options);
    });
  }
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !catalogState.openCardId) return;
    catalogState.openCardId = '';
    updateCatalogResults(root, options);
  });
  bindCatalogResultEvents(root, options);
}

function renderCatalogFilters() {
  return `
    <section class="catalog-controls" aria-label="카드 목록 필터">
      <label class="catalog-search">
        <span>카드 검색</span>
        <input type="search" value="${escapeHtml(catalogState.query)}" placeholder="카드명, 혜택, 카드사 검색" data-catalog-query>
      </label>
      <label>
        <span>카드사</span>
        <select data-catalog-filter="issuer">
          ${renderOption('', '전체 카드사', catalogState.issuer)}
          ${issuerOptions.map((issuer) => renderOption(issuer, issuer, catalogState.issuer)).join('')}
        </select>
      </label>
      <label>
        <span>카드 종류</span>
        <select data-catalog-filter="productType">
          ${renderOption('', '신용·체크 전체', catalogState.productType)}
          ${renderOption('credit', '신용카드', catalogState.productType)}
          ${renderOption('check', '체크카드', catalogState.productType)}
        </select>
      </label>
      <label>
        <span>제휴 브랜드</span>
        <select data-catalog-filter="network">
          ${renderOption('', '전체 브랜드', catalogState.network)}
          ${networkOptions.map((network) => renderOption(network, network, catalogState.network)).join('')}
        </select>
      </label>
      <label>
        <span>검증 상태</span>
        <select data-catalog-filter="status">
          ${renderOption('', '전체 상태', catalogState.status)}
          ${renderOption('official_detail_verified', '공식 상세 검증', catalogState.status)}
          ${renderOption('official_catalog', '카드사 공식 목록', catalogState.status)}
          ${renderOption('operational_candidate', '체크카드 운영후보', catalogState.status)}
          ${renderOption('candidate_index', '공식 검증 전', catalogState.status)}
        </select>
      </label>
    </section>
  `;
}

function renderCatalogResults(options = {}) {
  const cards = filteredCards();
  const visibleCards = cards.slice(0, catalogState.visibleLimit);
  if (!cards.length) {
    return `
      <section class="catalog-empty">
        <strong>검색 결과가 없습니다.</strong>
        <button type="button" class="ghost" data-catalog-reset>필터 초기화</button>
      </section>
    `;
  }
  return `
    <div class="catalog-result-head">
      <strong>${cards.length.toLocaleString('ko-KR')}개 결과</strong>
      <span>${visibleCards.length.toLocaleString('ko-KR')}개 표시</span>
    </div>
    <section class="catalog-grid">
      ${visibleCards.map((card) => renderCatalogCard(card, options)).join('')}
    </section>
    ${visibleCards.length < cards.length ? `
      <div class="catalog-load-more">
        <button type="button" class="ghost" data-catalog-more>카드 더 보기</button>
      </div>
    ` : ''}
    ${renderCatalogDetail(options)}
  `;
}

function renderCatalogCard(card, options = {}) {
  const status = ISSUANCE_STATUS_META[card.issuanceStatus] || STATUS_META[card.collectionStatus] || STATUS_META.candidate_index;
  const detailsUrl = card.officialUrl || card.referenceUrl || card.source?.url || '';
  const benefits = (card.summaryBenefits || []).slice(0, 3);
  const networkTags = card.networks?.length ? card.networks : ['국내전용'];
  const imageUrl = card.publicationImage || card.localImage || card.imageUrl;
  const isOwned = ownedCardIdSet(options).has(getOwnershipId(card));
  return `
    <article class="catalog-card${isOwned ? ' is-owned' : ''}" data-catalog-open="${escapeHtml(card.id)}" tabindex="0" aria-label="${escapeHtml(card.name)} 상세 보기">
      <div class="catalog-card-media">
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(card.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-catalog-image>` : ''}
        <span class="catalog-image-fallback${imageUrl ? '' : ' is-visible'}" aria-hidden="true">CARD</span>
      </div>
      <div class="catalog-card-body">
        <div class="catalog-card-heading">
          <div>
            <span class="catalog-issuer">${escapeHtml(card.issuer)} · ${card.productType === 'check' ? '체크' : '신용'}</span>
            <h3>${escapeHtml(card.name)}</h3>
          </div>
          <span class="catalog-status ${status.className}">${status.label}</span>
        </div>
        <div class="catalog-network-row">${networkTags.map((network) => `<span>${escapeHtml(network)}</span>`).join('')}</div>
        ${card.collectionStatus === 'official_detail_verified' ? `<span class="catalog-model-status ${card.calculationStatus === 'modeled' ? 'modeled' : 'catalog-only'}">${card.calculationStatus === 'modeled' ? '혜택 계산 반영' : '공식 정보 확인 · 계산 모델 준비 중'}</span>` : ''}
        <dl class="catalog-card-meta">
          <div><dt>연회비</dt><dd>${escapeHtml(card.annualFeeText || '확인 필요')}</dd></div>
          <div><dt>전월실적</dt><dd>${card.previousMonthSpend ? `${compactWon(card.previousMonthSpend)} 이상` : '없음 또는 확인 필요'}</dd></div>
        </dl>
        ${benefits.length ? `<ul class="catalog-benefits">${benefits.map((benefit) => `<li><strong>${escapeHtml(benefit.title)}</strong><span>${escapeHtml((benefit.tags || []).join(' · '))}</span></li>`).join('')}</ul>` : '<p class="catalog-benefit-empty">요약 혜택 확인 필요</p>'}
        <div class="catalog-card-footer">
          <span>${escapeHtml(card.verification?.verifiedAt ? `${card.source?.label || '공식 출처'} · ${card.verification.verifiedAt}` : (card.source?.label || '출처 확인 필요'))}</span>
          <div class="catalog-card-actions">
            <button type="button" class="ghost compact" data-catalog-preview="${escapeHtml(card.id)}">상세</button>
            ${isOwned
              ? `<button type="button" class="ghost compact" data-catalog-owned-detail="${escapeHtml(card.id)}">내 카드 보기</button>`
              : `<button type="button" data-catalog-add="${escapeHtml(card.id)}">내 카드로 추가</button>`}
            ${detailsUrl ? `<a href="${escapeHtml(detailsUrl)}" target="_blank" rel="noopener noreferrer">출처 보기</a>` : ''}
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderCatalogDetail(options = {}) {
  const card = PUBLIC_CARD_CATALOG.find((item) => item.id === catalogState.openCardId);
  if (!card) return '';
  const status = ISSUANCE_STATUS_META[card.issuanceStatus] || STATUS_META[card.collectionStatus] || STATUS_META.candidate_index;
  const isOwned = ownedCardIdSet(options).has(getOwnershipId(card));
  const imageUrl = card.publicationImage || card.localImage || card.imageUrl;
  const detailsUrl = card.officialUrl || card.referenceUrl || card.source?.url || '';
  const networkTags = card.networks?.length ? card.networks : ['국내전용'];
  const benefits = card.summaryBenefits || [];
  return `
    <div class="catalog-detail-overlay" data-catalog-close-overlay>
      <section class="catalog-detail-panel" role="dialog" aria-modal="true" aria-labelledby="catalog-detail-title">
        <button type="button" class="catalog-detail-close" data-catalog-close aria-label="닫기">×</button>
        <div class="catalog-detail-hero">
          <div class="catalog-detail-image">
            ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(card.name)}" data-catalog-image>` : '<span class="catalog-image-fallback is-visible">CARD</span>'}
          </div>
          <div>
            <span class="catalog-issuer">${escapeHtml(card.issuer)} · ${card.productType === 'check' ? '체크카드' : '신용카드'}</span>
            <h3 id="catalog-detail-title">${escapeHtml(card.name)}</h3>
            <div class="catalog-network-row">${networkTags.map((network) => `<span>${escapeHtml(network)}</span>`).join('')}</div>
            <span class="catalog-status ${status.className}">${status.label}</span>
          </div>
        </div>
        <dl class="catalog-detail-meta">
          <div><dt>연회비</dt><dd>${escapeHtml(card.annualFeeText || '확인 필요')}</dd></div>
          <div><dt>전월실적</dt><dd>${card.previousMonthSpend ? `${compactWon(card.previousMonthSpend)} 이상` : '없음 또는 확인 필요'}</dd></div>
          <div><dt>계산 지원</dt><dd>${card.calculationStatus === 'modeled' ? '혜택 계산 및 추천 지원' : '수동 실적 관리 지원 · 추천 계산 미반영'}</dd></div>
        </dl>
        <section class="catalog-detail-benefits">
          <h4>주요 혜택</h4>
          ${benefits.length ? benefits.map((benefit) => `
            <div><strong>${escapeHtml(benefit.title)}</strong><span>${escapeHtml((benefit.tags || []).join(' · ') || '상세 조건 확인 필요')}</span></div>
          `).join('') : '<p>등록된 요약 혜택이 없습니다.</p>'}
        </section>
        <p class="catalog-detail-note">카드를 추가하면 월 실적, 연간 실적, 연회비 시작월과 메모를 관리할 수 있습니다. 계산 모델이 검증된 카드만 결제 추천에 반영됩니다.</p>
        <div class="catalog-detail-actions">
          ${isOwned
            ? `<button type="button" data-catalog-owned-detail="${escapeHtml(card.id)}">카드상세로 이동</button>`
            : `<button type="button" data-catalog-add="${escapeHtml(card.id)}">내 카드로 추가</button>`}
          ${detailsUrl ? `<a href="${escapeHtml(detailsUrl)}" target="_blank" rel="noopener noreferrer">카드사 공식 정보</a>` : ''}
        </div>
      </section>
    </div>
  `;
}

function filteredCards() {
  const query = normalizeSearchText(catalogState.query);
  return PUBLIC_CARD_CATALOG.filter((card) => {
    if (query && !searchIndex.get(card.id)?.includes(query)) return false;
    if (catalogState.issuer && card.issuer !== catalogState.issuer) return false;
    if (catalogState.productType && card.productType !== catalogState.productType) return false;
    if (catalogState.network && !(card.networks || []).includes(catalogState.network)) return false;
    if (catalogState.status && card.collectionStatus !== catalogState.status) return false;
    return true;
  });
}

function updateCatalogResults(root, options = {}) {
  const container = root.querySelector('[data-catalog-results]');
  if (!container) return;
  container.innerHTML = renderCatalogResults(options);
  bindCatalogResultEvents(root, options);
}

function bindCatalogResultEvents(root, options = {}) {
  const container = root.querySelector('[data-catalog-results]');
  if (!container) return;
  container.querySelector('[data-catalog-more]')?.addEventListener('click', () => {
    catalogState.visibleLimit += PAGE_SIZE;
    updateCatalogResults(root, options);
  });
  container.querySelector('[data-catalog-reset]')?.addEventListener('click', () => {
    Object.assign(catalogState, { query: '', issuer: '', productType: '', network: '', status: '', visibleLimit: PAGE_SIZE });
    const queryInput = root.querySelector('[data-catalog-query]');
    if (queryInput) queryInput.value = '';
    for (const field of ['issuer', 'productType', 'network', 'status']) {
      const select = root.querySelector(`[data-catalog-filter="${field}"]`);
      if (select) select.value = '';
    }
    updateCatalogResults(root, options);
  });
  container.querySelectorAll('[data-catalog-open]').forEach((item) => {
    const open = (event) => {
      if (event.target.closest('button, a')) return;
      if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      catalogState.openCardId = item.dataset.catalogOpen;
      updateCatalogResults(root, options);
    };
    item.addEventListener('click', open);
    item.addEventListener('keydown', open);
  });
  container.querySelectorAll('[data-catalog-add]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    const card = PUBLIC_CARD_CATALOG.find((item) => item.id === button.dataset.catalogAdd);
    if (card) options.onAddCard?.(card);
  }));
  container.querySelectorAll('[data-catalog-preview]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    catalogState.openCardId = button.dataset.catalogPreview;
    updateCatalogResults(root, options);
  }));
  container.querySelectorAll('[data-catalog-owned-detail]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    const card = PUBLIC_CARD_CATALOG.find((item) => item.id === button.dataset.catalogOwnedDetail);
    if (card) options.onOpenOwnedCard?.(card);
  }));
  container.querySelector('[data-catalog-close]')?.addEventListener('click', () => {
    catalogState.openCardId = '';
    updateCatalogResults(root, options);
  });
  container.querySelector('[data-catalog-close-overlay]')?.addEventListener('click', (event) => {
    if (event.target !== event.currentTarget) return;
    catalogState.openCardId = '';
    updateCatalogResults(root, options);
  });
  container.querySelectorAll('[data-catalog-image]').forEach((image) => {
    const showFallback = () => {
      image.classList.add('is-broken');
      image.nextElementSibling?.classList.add('is-visible');
    };
    image.addEventListener('error', showFallback, { once: true });
    if (image.complete && image.naturalWidth === 0) showFallback();
  });
}

function getOwnershipId(card) {
  return String(card?.verification?.relatedCardModelId || card?.id || '');
}

function ownedCardIdSet(options = {}) {
  return new Set(Array.isArray(options.ownedCardIds) ? options.ownedCardIds : []);
}

function renderOption(value, label, selected) {
  return `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

function normalizeSearchText(value) {
  return String(value || '').normalize('NFKC').trim().toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ');
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, 'ko-KR'));
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}
