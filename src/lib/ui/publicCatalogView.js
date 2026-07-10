import { PUBLIC_CARD_CATALOG, PUBLIC_CARD_CATALOG_CHECKED_AT } from '../../data/publicCardCatalog.js';
import { compactWon, escapeHtml } from '../format.js';

const PAGE_SIZE = 60;
const STATUS_META = {
  candidate_index: { label: '공식 검증 전', className: 'candidate' },
  official_catalog: { label: '카드사 공식 목록', className: 'official' },
  official_detail_verified: { label: '공식 상세 검증', className: 'verified' }
};

const catalogState = {
  query: '',
  issuer: '',
  productType: '',
  network: '',
  status: '',
  visibleLimit: PAGE_SIZE
};

const issuerOptions = uniqueSorted(PUBLIC_CARD_CATALOG.map((card) => card.issuer));
const networkOptions = uniqueSorted(PUBLIC_CARD_CATALOG.flatMap((card) => card.networks || []));
const searchIndex = new Map(PUBLIC_CARD_CATALOG.map((card) => [card.id, normalizeSearchText([
  card.issuer,
  card.name,
  ...(card.networks || []),
  ...(card.summaryBenefits || []).flatMap((benefit) => [benefit.title, ...(benefit.tags || [])])
].join(' '))]));

export function renderPublicCatalog() {
  const statusCounts = countBy(PUBLIC_CARD_CATALOG, (card) => card.collectionStatus);
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
        <span>카드사 공식 목록 ${Number(statusCounts.official_catalog || 0).toLocaleString('ko-KR')}</span>
        <span>공식 상세 검증 ${Number(statusCounts.official_detail_verified || 0).toLocaleString('ko-KR')}</span>
      </section>
      <p class="catalog-disclaimer">‘공식 검증 전’ 정보는 비교를 위한 후보 자료입니다. 혜택 계산과 추천에는 공식 상세 검증이 끝난 카드만 반영됩니다.</p>
      ${renderCatalogFilters()}
      <div data-catalog-results aria-live="polite">${renderCatalogResults()}</div>
    </section>
  `;
}

export function bindPublicCatalogEvents(root) {
  if (!root) return;
  const queryInput = root.querySelector('[data-catalog-query]');
  queryInput?.addEventListener('input', () => {
    catalogState.query = queryInput.value;
    catalogState.visibleLimit = PAGE_SIZE;
    updateCatalogResults(root);
  });
  for (const field of ['issuer', 'productType', 'network', 'status']) {
    root.querySelector(`[data-catalog-filter="${field}"]`)?.addEventListener('change', (event) => {
      catalogState[field] = event.target.value;
      catalogState.visibleLimit = PAGE_SIZE;
      updateCatalogResults(root);
    });
  }
  bindCatalogResultEvents(root);
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
          ${renderOption('candidate_index', '공식 검증 전', catalogState.status)}
        </select>
      </label>
    </section>
  `;
}

function renderCatalogResults() {
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
      ${visibleCards.map(renderCatalogCard).join('')}
    </section>
    ${visibleCards.length < cards.length ? `
      <div class="catalog-load-more">
        <button type="button" class="ghost" data-catalog-more>카드 더 보기</button>
      </div>
    ` : ''}
  `;
}

function renderCatalogCard(card) {
  const status = STATUS_META[card.collectionStatus] || STATUS_META.candidate_index;
  const detailsUrl = card.officialUrl || card.referenceUrl || card.source?.url || '';
  const benefits = (card.summaryBenefits || []).slice(0, 3);
  const networkTags = card.networks?.length ? card.networks : ['국내전용'];
  return `
    <article class="catalog-card">
      <div class="catalog-card-media">
        ${card.imageUrl ? `<img src="${escapeHtml(card.imageUrl)}" alt="${escapeHtml(card.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-catalog-image>` : ''}
        <span class="catalog-image-fallback${card.imageUrl ? '' : ' is-visible'}" aria-hidden="true">CARD</span>
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
        <dl class="catalog-card-meta">
          <div><dt>연회비</dt><dd>${escapeHtml(card.annualFeeText || '확인 필요')}</dd></div>
          <div><dt>전월실적</dt><dd>${card.previousMonthSpend ? `${compactWon(card.previousMonthSpend)} 이상` : '없음 또는 확인 필요'}</dd></div>
        </dl>
        ${benefits.length ? `<ul class="catalog-benefits">${benefits.map((benefit) => `<li><strong>${escapeHtml(benefit.title)}</strong><span>${escapeHtml((benefit.tags || []).join(' · '))}</span></li>`).join('')}</ul>` : '<p class="catalog-benefit-empty">요약 혜택 확인 필요</p>'}
        <div class="catalog-card-footer">
          <span>${escapeHtml(card.source?.label || '출처 확인 필요')}</span>
          ${detailsUrl ? `<a href="${escapeHtml(detailsUrl)}" target="_blank" rel="noopener noreferrer">출처 보기</a>` : ''}
        </div>
      </div>
    </article>
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

function updateCatalogResults(root) {
  const container = root.querySelector('[data-catalog-results]');
  if (!container) return;
  container.innerHTML = renderCatalogResults();
  bindCatalogResultEvents(root);
}

function bindCatalogResultEvents(root) {
  const container = root.querySelector('[data-catalog-results]');
  if (!container) return;
  container.querySelector('[data-catalog-more]')?.addEventListener('click', () => {
    catalogState.visibleLimit += PAGE_SIZE;
    updateCatalogResults(root);
  });
  container.querySelector('[data-catalog-reset]')?.addEventListener('click', () => {
    Object.assign(catalogState, { query: '', issuer: '', productType: '', network: '', status: '', visibleLimit: PAGE_SIZE });
    const queryInput = root.querySelector('[data-catalog-query]');
    if (queryInput) queryInput.value = '';
    for (const field of ['issuer', 'productType', 'network', 'status']) {
      const select = root.querySelector(`[data-catalog-filter="${field}"]`);
      if (select) select.value = '';
    }
    updateCatalogResults(root);
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
