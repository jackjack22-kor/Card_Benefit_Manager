import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { CARDS, DEFAULT_HIDDEN_CARD_IDS, POINT_DEFAULTS } from '../src/data/cards.js';
import {
  PUBLIC_CARD_CATALOG as RAW_PUBLIC_CARD_CATALOG,
  PUBLIC_CARD_CATALOG_CHECKED_AT as RAW_PUBLIC_CARD_CATALOG_CHECKED_AT,
  PUBLIC_CARD_CATALOG_STATUSES
} from '../src/data/publicCardCatalog.js';
import { PUBLIC_CARD_CATALOG, PUBLIC_CARD_CATALOG_CHECKED_AT, PUBLIC_CARD_CATALOG_DUPLICATE_IDS } from '../src/data/publicCardCatalogIndex.js';
import { PUBLIC_CARD_VERIFICATION_OVERLAYS } from '../src/data/publicCardVerificationOverlays.js';
import {
  PRIORITY_CREDIT_CARD_BATCH,
  PRIORITY_CREDIT_CARD_BATCH_BY_ISSUER,
  PRIORITY_CREDIT_CARD_ISSUERS,
  PRIORITY_CREDIT_CARD_TARGET_PER_ISSUER
} from '../src/data/publicCreditCardPriorityBatch.js';
import { CATEGORIES } from '../src/data/categories.js';
import {
  getAnnualUsageCount,
  getAllOrderedCards,
  getBenefitAmountInput,
  getBenefitHomeStatus,
  getCardOverride,
  getMonthlyBenefitValue,
  getMonthlyBenefitValueForBenefit,
  getMonthlyShortfall,
  getOrderedCards,
  getTotalMonthlyBenefitValue,
  hasPrevMonthRequirement,
  isCheckOnlyFixedAmountBenefit,
  isCapContainerBenefit,
  recommendCards
} from '../src/lib/recommend.js';
import { createInitialState, importState, migrateState } from '../src/lib/storage.js';

const MONTH = '2026-07';
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const appEditionSource = readFileSync(new URL('../src/lib/appEdition.js', import.meta.url), 'utf8');
const storageSource = readFileSync(new URL('../src/lib/storage.js', import.meta.url), 'utf8');
const publicCatalogViewSource = readFileSync(new URL('../src/lib/ui/publicCatalogView.js', import.meta.url), 'utf8');
const lazySyncSource = readFileSync(new URL('../src/lib/sync/lazySync.js', import.meta.url), 'utf8');
const syncManagerSource = readFileSync(new URL('../src/lib/sync/syncManager.js', import.meta.url), 'utf8');
const firebaseClientSource = readFileSync(new URL('../src/lib/sync/firebaseClient.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const readmeSource = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const firebaseJson = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
const firebaseRc = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8'));
const hostingBuildSource = readFileSync(new URL('../tools/prepare-hosting-build.mjs', import.meta.url), 'utf8');
const cloudflareBuildSource = readFileSync(new URL('../tools/prepare-cloudflare-build.mjs', import.meta.url), 'utf8');
const verifyPublicDistSource = readFileSync(new URL('../tools/verify-public-dist.mjs', import.meta.url), 'utf8');
const cardSourceReportSource = readFileSync(new URL('../tools/card-source-report.mjs', import.meta.url), 'utf8');
const cardCatalogReportSource = readFileSync(new URL('../tools/card-catalog-report.mjs', import.meta.url), 'utf8');
const collectPublicCardCatalogSource = readFileSync(new URL('../tools/collect-public-card-catalog.mjs', import.meta.url), 'utf8');
const publicCatalogIndexSource = readFileSync(new URL('../src/data/publicCardCatalogIndex.js', import.meta.url), 'utf8');
const publicCardVerificationOverlaysSource = readFileSync(new URL('../src/data/publicCardVerificationOverlays.js', import.meta.url), 'utf8');
const publicCreditCardPriorityBatchSource = readFileSync(new URL('../src/data/publicCreditCardPriorityBatch.js', import.meta.url), 'utf8');
const verifyPublicCardCatalogSource = readFileSync(new URL('../tools/verify-public-card-catalog.mjs', import.meta.url), 'utf8');
const cardVerificationQueueSource = readFileSync(new URL('../tools/card-verification-queue.mjs', import.meta.url), 'utf8');
const firebaseHostingWorkflow = readFileSync(new URL('../.github/workflows/firebase-hosting.yml', import.meta.url), 'utf8');
const githubPagesWorkflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
const publicProductImplementationPlan = readFileSync(new URL('../docs/PUBLIC_PRODUCT_IMPLEMENTATION_PLAN.md', import.meta.url), 'utf8');
const publicDistributionPlan = readFileSync(new URL('../docs/PUBLIC_DISTRIBUTION_PLAN.md', import.meta.url), 'utf8');
const cardDataResearchGuide = readFileSync(new URL('../docs/CARD_DATA_RESEARCH_GUIDE.md', import.meta.url), 'utf8');
const cardDataSourceMatrix = readFileSync(new URL('../docs/CARD_DATA_SOURCE_MATRIX.md', import.meta.url), 'utf8');
const publicCardCatalogCollection = readFileSync(new URL('../docs/PUBLIC_CARD_CATALOG_COLLECTION.md', import.meta.url), 'utf8');
const cardVerificationPipeline = readFileSync(new URL('../docs/CARD_VERIFICATION_PIPELINE.md', import.meta.url), 'utf8');
const creditCardPriorityBatchPlan = readFileSync(new URL('../docs/CREDIT_CARD_PRIORITY_BATCH.md', import.meta.url), 'utf8');

function card(id) {
  const item = CARDS.find((candidate) => candidate.id === id);
  assert.ok(item, `Missing card: ${id}`);
  return item;
}

function baseState({ selectedCategory = 'coffee', amount = 10000, monthly = {}, overrides = {}, usage = {}, hiddenCardIds = [] } = {}) {
  return {
    selectedMonth: MONTH,
    selectedCategory,
    selectedSubcategory: '',
    recommendationAmount: amount,
    cardOrder: CARDS.map((item) => item.id),
    hiddenCardIds,
    settings: { pointValues: { ...POINT_DEFAULTS }, darkMode: true },
    cardOverrides: Object.fromEntries(CARDS.map((item) => [
      item.id,
      {
        monthlyTarget: item.defaultMonthlyTarget || 0,
        annualTarget: item.defaultAnnualTarget || 0,
        prevMonthStatus: 'met',
        ...(overrides[item.id] || {})
      }
    ])),
    monthlyCardUsage: {
      [MONTH]: monthly
    },
    usage
  };
}

function withSpend(cardId, spend, options = {}) {
  return baseState({
    ...options,
    monthly: {
      ...(options.monthly || {}),
      [cardId]: { currentMonthSpend: spend, ...(options.monthly?.[cardId] || {}) }
    }
  });
}

function monthlyValue(cardId, spend, options = {}) {
  return getMonthlyBenefitValue(withSpend(cardId, spend, options), card(cardId), MONTH);
}

function findRecommendation(state, cardId) {
  const result = recommendCards(state, state.selectedCategory, state.recommendationAmount, state.selectedSubcategory)
    .find((item) => item.card.id === cardId);
  assert.ok(result, `Missing recommendation result for ${cardId}`);
  return result;
}

function assertEqual(actual, expected, label) {
  assert.equal(actual, expected, `${label}: expected ${expected}, got ${actual}`);
  console.log(`ok - ${label}: ${actual}`);
}

function assertBetween(actual, min, max, label) {
  assert.ok(actual >= min && actual <= max, `${label}: expected ${min}..${max}, got ${actual}`);
  console.log(`ok - ${label}: ${actual}`);
}

function readPngDimensions(imageUrl) {
  const buffer = readFileSync(imageUrl);
  const pngSignature = '89504e470d0a1a0a';
  assert.equal(buffer.subarray(0, 8).toString('hex'), pngSignature, `${imageUrl.pathname} must be a PNG file`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

const categoryIds = new Set(CATEGORIES.map((item) => item.id));
const unknownCategories = [];
const cardIds = new Set();
const benefitIds = new Set();
const structuredSourceCardIds = new Set();
const allowedBenefitPriorities = new Set(['core', 'normal']);
const allowedCycleTypes = new Set(['calendar', 'anniversary', 'issueMonth']);
const allowedSourceStatuses = new Set(['official_verified', 'needs_official_recheck']);
const allowedNetworkNames = new Set(['VISA', 'Mastercard', 'American Express', 'UnionPay', 'BC', 'Private Label']);
assert.ok(publicCatalogIndexSource.includes('PUBLIC_CARD_VERIFICATION_OVERLAYS'), 'effective catalog applies durable verification overlays');
assert.ok(publicCatalogIndexSource.includes('official_detail_verified: 0'), 'effective catalog sorts verified records first');
assert.ok(publicCardVerificationOverlaysSource.includes('official_product_page_and_documents'), 'verification overlay records official document methodology');
for (const requiredVerificationToken of ['requiredVerifiedFields', 'official_issuer_detail', 'effective verified count', 'discontinued verified cards must stay outside the priority batch']) {
  assert.ok(verifyPublicCardCatalogSource.includes(requiredVerificationToken), `catalog verification gate must include ${requiredVerificationToken}`);
}
for (const requiredQueueToken of ['PRIORITY_CREDIT_CARD_BATCH', 'Excluded discontinued credit cards', 'official issuance check pending', 'CardGorilla issuer ranking is a popularity signal']) {
  assert.ok(cardVerificationQueueSource.includes(requiredQueueToken), `catalog verification queue must include ${requiredQueueToken}`);
}
for (const requiredPriorityToken of ['card.isDiscontinued !== true', "card.productType === 'credit'", 'pending_official_check', 'PRIORITY_PREMIUM_TARGET_PER_ISSUER']) {
  assert.ok(publicCreditCardPriorityBatchSource.includes(requiredPriorityToken), `priority credit-card batch must include ${requiredPriorityToken}`);
}
for (const item of CARDS) {
  assert.ok(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id), `card id must be stable kebab-case: ${item.id}`);
  assert.ok(!cardIds.has(item.id), `duplicate card id: ${item.id}`);
  cardIds.add(item.id);
  assert.ok(item.issuer, `card issuer is required: ${item.id}`);
  assert.ok(item.name, `card name is required: ${item.id}`);
  assert.ok(item.shortName, `card shortName is required: ${item.id}`);
  assert.ok(item.sourceNote, `card sourceNote is required: ${item.id}`);
  assert.ok(item.source, `card structured source metadata is required: ${item.id}`);
  assert.ok(Array.isArray(item.monthlyTargets), `card monthlyTargets must be an array: ${item.id}`);
  assert.ok(Array.isArray(item.annualTargets), `card annualTargets must be an array: ${item.id}`);
  assert.ok(item.defaultCycle?.type && allowedCycleTypes.has(item.defaultCycle.type), `card default cycle type is invalid: ${item.id}`);
  assert.ok(Number.isFinite(Number(item.defaultMonthlyTarget || 0)), `card default monthly target must be numeric: ${item.id}`);
  assert.ok(Number.isFinite(Number(item.annualFee || 0)), `card annual fee must be numeric: ${item.id}`);
  structuredSourceCardIds.add(item.id);
  assert.ok(allowedSourceStatuses.has(item.source.status), `card source status is invalid: ${item.id}`);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(item.source.checkedAt || ''), `card source checkedAt must use YYYY-MM-DD: ${item.id}`);
  assert.ok(item.source.url || item.source.pdf || item.source.appCapture, `card source must include an official URL, PDF, or app capture: ${item.id}`);
  assert.ok(item.source.note, `card source note is required: ${item.id}`);
  if (item.source.officialEntryUrl) assert.ok(/^https:\/\//.test(item.source.officialEntryUrl), `card official entry URL must be https: ${item.id}`);
  if (item.source.recheckBatch) assert.ok(/^[a-z0-9]+-\d{4}-\d{2}$/.test(item.source.recheckBatch), `card recheck batch must use issuer-YYYY-MM: ${item.id}`);
  if (item.networks) {
    assert.ok(Array.isArray(item.networks) && item.networks.length > 0, `card networks must be a non-empty array: ${item.id}`);
    for (const network of item.networks) {
      assert.ok(allowedNetworkNames.has(network.name), `card network is invalid: ${item.id}:${network.name}`);
      if (network.annualFee !== undefined) assert.ok(Number.isFinite(Number(network.annualFee)), `card network annual fee must be numeric: ${item.id}:${network.name}`);
      if (network.services !== undefined) assert.ok(Array.isArray(network.services), `card network services must be an array: ${item.id}:${network.name}`);
    }
  }
  assert.ok(String(item.image || '').startsWith('image/clean/'), `card image must use image/clean: ${item.id}`);
  assert.ok(String(item.image || '').endsWith('.png'), `card image must be a PNG: ${item.id}`);
  const imageUrl = new URL(`../${item.image}`, import.meta.url);
  assert.ok(existsSync(imageUrl), `card image file must exist: ${item.id}`);
  const imageInfo = readPngDimensions(imageUrl);
  assert.ok(imageInfo.width >= imageInfo.height, `card image must be landscape: ${item.id}`);
  assert.ok(imageInfo.width >= 250 && imageInfo.height >= 150, `card image is too small: ${item.id}`);
  assert.ok(Array.isArray(item.benefits) && item.benefits.length > 0, `card benefits are required: ${item.id}`);
  const cardBenefitIds = new Set(item.benefits.map((benefit) => benefit.id));
  for (const benefit of item.benefits || []) {
    assert.ok(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(benefit.id), `benefit id must be stable kebab-case: ${item.id}:${benefit.id}`);
    assert.ok(!benefitIds.has(benefit.id), `duplicate benefit id: ${benefit.id}`);
    benefitIds.add(benefit.id);
    assert.ok(benefit.name, `benefit name is required: ${item.id}:${benefit.id}`);
    assert.ok(benefit.type, `benefit type is required: ${item.id}:${benefit.id}`);
    assert.ok(allowedBenefitPriorities.has(benefit.priority), `benefit priority is invalid: ${item.id}:${benefit.id}`);
    assert.ok(Array.isArray(benefit.categories) && benefit.categories.length > 0, `benefit categories are required: ${item.id}:${benefit.id}`);
    assert.ok(benefit.summary, `benefit summary is required: ${item.id}:${benefit.id}`);
    assert.ok(benefit.homeLabel, `benefit homeLabel is required: ${item.id}:${benefit.id}`);
    if (benefit.cycleType) assert.ok(allowedCycleTypes.has(benefit.cycleType), `benefit cycle type is invalid: ${item.id}:${benefit.id}`);
    if (benefit.minPrevSpend !== undefined) assert.ok(Number.isFinite(Number(benefit.minPrevSpend)) && Number(benefit.minPrevSpend) >= 0, `benefit minPrevSpend must be non-negative: ${item.id}:${benefit.id}`);
    if (benefit.capBasis !== undefined) assert.equal(benefit.capBasis, 'previous_month', `benefit capBasis is invalid: ${item.id}:${benefit.id}`);
    if (benefit.capPoolId) assert.ok(cardBenefitIds.has(benefit.capPoolId), `benefit capPoolId must reference the same card: ${item.id}:${benefit.id}`);
    for (const categoryId of benefit.categories || []) {
      if (!categoryIds.has(categoryId)) unknownCategories.push(`${item.id}:${benefit.id}:${categoryId}`);
    }
  }
}

if (unknownCategories.length) {
  console.warn(`warn - unknown categories: ${unknownCategories.join(', ')}`);
}
console.log(`ok - card catalog data quality gates passed: ${cardIds.size} cards, ${benefitIds.size} benefits`);
assertEqual(structuredSourceCardIds.size, CARDS.length, 'all cards have structured source metadata');

const publicCatalogIds = new Set();
const publicCatalogStatuses = new Set(PUBLIC_CARD_CATALOG_STATUSES);
const publicCatalogProductTypes = new Set(['credit', 'check']);
const publicCatalogStatusCounts = new Map();
for (const item of RAW_PUBLIC_CARD_CATALOG) {
  assert.ok(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id), `public catalog id must be stable kebab-case: ${item.id}`);
  assert.ok(!publicCatalogIds.has(item.id), `duplicate public catalog id: ${item.id}`);
  publicCatalogIds.add(item.id);
  assert.ok(item.issuer, `public catalog issuer is required: ${item.id}`);
  assert.ok(item.name, `public catalog name is required: ${item.id}`);
  assert.ok(publicCatalogProductTypes.has(item.productType), `public catalog product type is invalid: ${item.id}`);
  assert.ok(publicCatalogStatuses.has(item.collectionStatus), `public catalog status is invalid: ${item.id}`);
  assert.ok(item.imageUrl && /^https:\/\//.test(item.imageUrl), `public catalog image URL must be https: ${item.id}`);
  assert.ok(item.source?.url && /^https:\/\//.test(item.source.url), `public catalog source URL must be https: ${item.id}`);
  assert.ok(item.source.checkedAt === RAW_PUBLIC_CARD_CATALOG_CHECKED_AT, `public catalog checkedAt must match batch date: ${item.id}`);
  assert.ok(item.source.note, `public catalog source note is required: ${item.id}`);
  publicCatalogStatusCounts.set(item.collectionStatus, (publicCatalogStatusCounts.get(item.collectionStatus) || 0) + 1);
  if (item.collectionStatus === 'official_catalog') {
    assert.ok(item.issuerProductCode, `official catalog item requires issuer product code: ${item.id}`);
    assert.ok(item.officialUrl && /^https:\/\//.test(item.officialUrl), `official catalog item requires official URL: ${item.id}`);
    assert.equal(item.source.type, 'official_issuer_catalog', `official catalog source type is required: ${item.id}`);
  }
  if (item.collectionStatus === 'candidate_index') {
    assert.ok(Number.isInteger(item.cardGorillaId), `candidate index item requires CardGorilla id: ${item.id}`);
    assert.ok(item.referenceUrl && /^https:\/\//.test(item.referenceUrl), `candidate index item requires reference URL: ${item.id}`);
    assert.equal(item.source.type, 'third_party_index', `candidate index source type is required: ${item.id}`);
  }
}
assert.ok(RAW_PUBLIC_CARD_CATALOG.length >= 1500, 'public catalog must include the large candidate batch');
assert.ok((publicCatalogStatusCounts.get('official_catalog') || 0) >= 15, 'public catalog must include official KB seed records');
assert.ok((publicCatalogStatusCounts.get('candidate_index') || 0) >= 1500, 'public catalog must include bulk candidate records');
assert.ok(RAW_PUBLIC_CARD_CATALOG.some((item) => item.id === 'kb-09297' && item.collectionStatus === 'official_catalog'), 'public catalog includes KB WE:SH All+ official seed');
assert.ok(RAW_PUBLIC_CARD_CATALOG.some((item) => item.id === 'cg-crd-13' && item.collectionStatus === 'candidate_index'), 'public catalog includes CardGorilla candidate sample');
console.log(`ok - public card catalog gates passed: ${RAW_PUBLIC_CARD_CATALOG.length} records`);

const effectiveStatusCounts = new Map();
for (const item of PUBLIC_CARD_CATALOG) effectiveStatusCounts.set(item.collectionStatus, (effectiveStatusCounts.get(item.collectionStatus) || 0) + 1);
assert.equal(PUBLIC_CARD_CATALOG.length, RAW_PUBLIC_CARD_CATALOG.length - 3, 'effective catalog removes known duplicate candidates');
assert.equal(PUBLIC_CARD_CATALOG_DUPLICATE_IDS.length, 3, 'known candidate duplicate count');
assert.equal(effectiveStatusCounts.get('official_detail_verified'), 3, 'credit-card official detail verification batch size');
assert.equal(effectiveStatusCounts.get('operational_candidate'), 456, 'all effective check cards remain operational candidates');
assert.equal(effectiveStatusCounts.get('official_catalog'), 8, 'credit-card official catalog seeds remain queued');
assert.equal(effectiveStatusCounts.get('candidate_index'), 1121, 'unverified credit-card candidates remain queued');
assert.equal(Object.values(PUBLIC_CARD_VERIFICATION_OVERLAYS).filter((overlay) => overlay.collectionStatus === 'official_detail_verified').length, 3, 'credit-card verification overlay count');
assert.equal(PUBLIC_CARD_CATALOG_CHECKED_AT, '2026-07-10', 'effective catalog date follows latest verification');
for (const verifiedId of ['cg-crd-2280', 'kb-09922', 'kb-09297']) {
  const verifiedCard = PUBLIC_CARD_CATALOG.find((item) => item.id === verifiedId);
  assert.equal(verifiedCard?.collectionStatus, 'official_detail_verified', `effective catalog promotes verified card: ${verifiedId}`);
  assert.equal(verifiedCard?.source?.type, 'official_issuer_detail', `verified card uses official detail source: ${verifiedId}`);
  assert.ok(verifiedCard?.verification?.fields?.includes('benefits'), `verified card tracks verified fields: ${verifiedId}`);
  assert.ok(['catalog_only', 'modeled'].includes(verifiedCard?.calculationStatus), `verified card tracks calculation readiness: ${verifiedId}`);
}
assert.equal(PUBLIC_CARD_CATALOG.find((item) => item.id === 'cg-crd-2280')?.calculationStatus, 'modeled', 'Hyundai verified catalog record links to the calculation model');
for (const [catalogId, modelId] of [['cg-crd-2280', 'hyundai-amex-platinum'], ['kb-09297', 'kb-wesh-all-plus'], ['kb-09922', 'kb-all']]) {
  assert.equal(PUBLIC_CARD_CATALOG.find((item) => item.id === catalogId)?.calculationStatus, 'modeled', `verified catalog card is calculation-ready: ${catalogId}`);
  assert.equal(PUBLIC_CARD_CATALOG.find((item) => item.id === catalogId)?.verification?.relatedCardModelId, modelId, `verified catalog card links to model: ${catalogId}`);
}
const noriOperationalCandidate = PUBLIC_CARD_CATALOG.find((item) => item.id === 'kb-07964');
assert.equal(noriOperationalCandidate?.collectionStatus, 'operational_candidate', 'KB Nori2 remains an operational check-card candidate');
assert.equal(noriOperationalCandidate?.calculationStatus, 'catalog_only', 'KB Nori2 does not enable benefit calculation');
assert.equal(noriOperationalCandidate?.verification, undefined, 'KB Nori2 does not claim official detail verification');
assert.ok(PUBLIC_CARD_CATALOG.filter((item) => item.productType === 'check').every((item) => item.collectionStatus === 'operational_candidate'), 'every check card is restricted to operational-candidate status');
assert.equal(RAW_PUBLIC_CARD_CATALOG.find((item) => item.id === 'cg-crd-2280')?.collectionStatus, 'candidate_index', 'raw candidate remains replaceable without losing verification overlay');
for (const duplicateId of ['cg-crd-2837', 'cg-crd-2440', 'cg-chk-2422']) {
  assert.equal(PUBLIC_CARD_CATALOG.some((item) => item.id === duplicateId), false, `effective catalog hides duplicate candidate: ${duplicateId}`);
}

assert.equal(PRIORITY_CREDIT_CARD_ISSUERS.length, 10, 'priority batch covers the ten primary credit-card issuers');
assert.equal(PRIORITY_CREDIT_CARD_BATCH.length, PRIORITY_CREDIT_CARD_ISSUERS.length * PRIORITY_CREDIT_CARD_TARGET_PER_ISSUER, 'priority batch contains twenty cards per issuer');
assert.equal(new Set(PRIORITY_CREDIT_CARD_BATCH.map((item) => item.id)).size, PRIORITY_CREDIT_CARD_BATCH.length, 'priority batch card ids are unique');
assert.ok(PRIORITY_CREDIT_CARD_BATCH.every((item) => item.productType === 'credit'), 'priority batch contains credit cards only');
assert.ok(PRIORITY_CREDIT_CARD_BATCH.every((item) => item.isDiscontinued !== true), 'priority batch excludes discontinued cards');
assert.ok(PRIORITY_CREDIT_CARD_BATCH.every((item) => ['officially_issuable', 'officially_listed', 'pending_official_check'].includes(item.availabilityStatus)), 'priority batch separates official issuance status from popularity');
for (const config of PRIORITY_CREDIT_CARD_ISSUERS) {
  const issuerBatch = PRIORITY_CREDIT_CARD_BATCH_BY_ISSUER[config.issuer];
  assert.equal(issuerBatch.length, PRIORITY_CREDIT_CARD_TARGET_PER_ISSUER, `priority batch size: ${config.issuer}`);
  assert.ok(issuerBatch.every((item) => item.issuer === config.issuer), `priority batch issuer ownership: ${config.issuer}`);
  assert.equal(issuerBatch.filter((item) => item.selectionReason === 'popular_rank').length, 5, `priority batch includes five popularity-ranked cards: ${config.issuer}`);
  assert.ok(issuerBatch.filter((item) => item.premium).length <= 8, `priority batch limits premium allocation: ${config.issuer}`);
  assert.ok(issuerBatch.every((item) => item.popularitySourceUrl === `https://www.card-gorilla.com/team/detail/${config.cardGorillaTeamId}`), `priority batch tracks popularity source: ${config.issuer}`);
}
console.log(`ok - priority credit-card verification batch gates passed: ${PRIORITY_CREDIT_CARD_BATCH.length} records`);

const hyundaiAmexPlatinum = card('hyundai-amex-platinum');
assert.equal(hyundaiAmexPlatinum.source.status, 'official_verified', 'Hyundai Amex official source verification is promoted');
assert.equal(hyundaiAmexPlatinum.source.checkedAt, '2026-07-10', 'Hyundai Amex official verification date is tracked');
assert.ok(hyundaiAmexPlatinum.source.url.includes('hyundaicard.com'), 'Hyundai Amex uses a product-specific official URL');
assert.deepEqual(hyundaiAmexPlatinum.networks.map((item) => item.name), ['American Express'], 'Hyundai Amex network model is explicit');
assert.equal(hyundaiAmexPlatinum.networks[0].annualFee, hyundaiAmexPlatinum.annualFee, 'Hyundai Amex network annual fee matches card annual fee');

for (const id of ['shinhan-ace-blue', 'marriott-best-shinhan', 'marriott-classic-shinhan', 'shinhan-always-on']) {
  assert.equal(card(id).source.status, 'needs_official_recheck', `Shinhan recheck batch must not be treated as official verified: ${id}`);
  assert.equal(card(id).source.recheckBatch, 'shinhan-2026-07', `Shinhan recheck batch is tracked: ${id}`);
  assert.equal(card(id).source.officialEntryUrl, 'https://www.shinhancard.com/', `Shinhan official entrypoint is tracked: ${id}`);
}

const networkCards = CARDS.filter((item) => item.networks);
assert.ok(networkCards.length >= 5, 'network model covers initial brand-difference batch');
assert.deepEqual(card('bc-goat-card').networks.map((item) => item.name), ['Mastercard', 'VISA'], 'BC GOAT tracks Mastercard and VISA network variants');
assert.equal(card('kb-skypass-platinum').networks[0].name, 'Mastercard', 'KB Skypass current model is tied to Mastercard');
assert.equal(card('lotte-amex-skypass').networks[0].name, 'American Express', 'Lotte Amex Skypass network is explicit');
assert.ok(card('samsung-the1-skypass').networks[0].services.includes('American Express PLATINUM ELITE'), 'Samsung THE 1 tracks AMEX Platinum Elite service tier');

const operationalCalculationCandidates = CARDS.filter((item) => item.operationalCandidate);
assert.deepEqual(operationalCalculationCandidates.map((item) => item.id), ['kb-nori2-check'], 'check-card calculation model remains dormant for saved-data preservation');
assert.equal(card('kb-nori2-check').source.status, 'needs_official_recheck', 'dormant check-card model does not claim official verification');
assertEqual(getOrderedCards(baseState()).length, CARDS.length - operationalCalculationCandidates.length, 'only active credit-card models are orderable');
assert.deepEqual(createInitialState().hiddenCardIds, DEFAULT_HIDDEN_CARD_IDS, 'new optional cards are hidden by default for fresh installs');
const oldStateWithoutNewCards = migrateState({
  schemaVersion: '2.0.1',
  cardOrder: CARDS.map((item) => item.id).filter((id) => !DEFAULT_HIDDEN_CARD_IDS.includes(id)),
  monthlyCardUsage: { [MONTH]: {} }
});
assert.deepEqual(oldStateWithoutNewCards.hiddenCardIds, DEFAULT_HIDDEN_CARD_IDS, 'new optional cards are hidden when introduced to existing state');
const userUnhiddenOptionalCards = migrateState({
  schemaVersion: '2.0.1',
  cardOrder: CARDS.map((item) => item.id),
  hiddenCardIds: [],
  monthlyCardUsage: { [MONTH]: {} }
});
assert.deepEqual(userUnhiddenOptionalCards.hiddenCardIds, [], 'visible optional cards stay visible after the user enables them');
const hiddenCardState = withSpend('kb-talktalk-my-point', 200000, { hiddenCardIds: ['kb-talktalk-my-point'] });
assertEqual(getAllOrderedCards(hiddenCardState).length, CARDS.length - operationalCalculationCandidates.length, 'settings exclude dormant operational candidates');
assertEqual(getAllOrderedCards(baseState()).some((item) => item.id === 'kb-nori2-check'), false, 'operational check-card candidate is excluded from active settings');
assert.ok(createInitialState().cardOverrides['kb-nori2-check'], 'operational check-card saved-data slot remains preserved');
const dormantNoriSavedState = migrateState({
  schemaVersion: '2.0.1',
  cardOrder: CARDS.map((item) => item.id),
  cardOverrides: {
    'kb-nori2-check': { monthlyTarget: 300000, monthlyTargetUserSet: true, monthlyTargetUpdatedAt: '2026-07-10T10:00:00.000Z' }
  },
  monthlyCardUsage: {
    [MONTH]: { 'kb-nori2-check': { currentMonthSpend: 123456, currentMonthSpendUpdatedAt: '2026-07-10T10:00:00.000Z' } }
  },
  usage: {
    'kb-nori2-coffee': { [MONTH]: { usedAmount: 30000, manualAmountOverride: true } }
  }
});
assert.equal(dormantNoriSavedState.cardOverrides['kb-nori2-check'].monthlyTarget, 300000, 'dormant check-card user target remains stored');
assert.equal(dormantNoriSavedState.monthlyCardUsage[MONTH]['kb-nori2-check'].currentMonthSpend, 123456, 'dormant check-card monthly usage remains stored');
assert.equal(dormantNoriSavedState.usage['kb-nori2-coffee'][MONTH].usedAmount, 30000, 'dormant check-card benefit usage remains stored');
assertEqual(getOrderedCards(hiddenCardState).some((item) => item.id === 'kb-talktalk-my-point'), false, 'hidden card is excluded from visible ordered cards');
assertEqual(recommendCards({ ...hiddenCardState, selectedCategory: 'simplepay', recommendationAmount: 10000 }, 'simplepay', 10000).some((item) => item.card.id === 'kb-talktalk-my-point'), false, 'hidden card is excluded from recommendations');
assertEqual(getTotalMonthlyBenefitValue(hiddenCardState, getOrderedCards(hiddenCardState), MONTH), 0, 'hidden card is excluded from visible benefit totals');
assertEqual(getMonthlyShortfall(card('kb-talktalk-my-point'), { monthlyTarget: 200000, currentMonthSpend: 100000 }), 100000, 'monthly shortfall');
const lazyInitSyncBody = exportedFunctionBody(lazySyncSource, 'initSync');
const lazyQueueCloudSaveBody = exportedFunctionBody(lazySyncSource, 'queueCloudSave');
const managerQueueCloudSaveBody = exportedFunctionBody(syncManagerSource, 'queueCloudSave');
const managerSignInBody = exportedFunctionBody(syncManagerSource, 'requestCloudSignIn');
assert.ok(packageJson.scripts['build:personal'].includes('--mode personal'), 'personal build must pin the personal edition mode');
assert.ok(packageJson.scripts['build:public'].includes('--mode public'), 'public build must pin the public edition mode');
assert.ok(packageJson.scripts['build:public'].includes('prepare-cloudflare-build.mjs'), 'public build must prepare Cloudflare Pages artifacts');
assert.ok(packageJson.scripts['build:public'].includes('verify-public-dist.mjs'), 'public build must verify Cloudflare Pages artifacts');
assert.ok(packageJson.scripts['verify:public']?.includes('verify-public-dist.mjs'), 'public dist verifier must be runnable directly');
assert.ok(packageJson.scripts['source:report']?.includes('card-source-report.mjs'), 'card source report must be runnable directly');
assert.ok(packageJson.scripts['catalog:report']?.includes('card-catalog-report.mjs'), 'public catalog report must be runnable directly');
assert.ok(packageJson.scripts['catalog:collect']?.includes('collect-public-card-catalog.mjs'), 'public catalog collector must be runnable directly');
assert.ok(packageJson.scripts['catalog:verify']?.includes('verify-public-card-catalog.mjs'), 'public catalog verification gate must be runnable directly');
assert.ok(packageJson.scripts['catalog:queue']?.includes('card-verification-queue.mjs'), 'public catalog queue must be runnable directly');
assert.ok(appEditionSource.includes("rawEdition === 'public' ? 'public' : 'personal'"), 'unknown app editions must fall back to the personal edition');
assert.ok(appEditionSource.includes("export const ENABLE_CLOUD_SYNC = !IS_PUBLIC_EDITION"), 'public edition must disable cloud sync centrally');
assertContainsInOrder(appEditionSource, ["export const APP_STORAGE_KEY", "cardfit.public.v1", "cardBenefitManager.v1"], 'public and personal editions use separate local storage keys');
assert.ok(storageSource.includes("import { APP_STORAGE_KEY, IS_PUBLIC_EDITION } from './appEdition.js'"), 'storage layer must read edition-aware storage and tab settings');
assert.ok(storageSource.includes('export const STORAGE_KEY = APP_STORAGE_KEY'), 'storage key must be provided by app edition config');
assert.ok(storageSource.includes("...(IS_PUBLIC_EDITION ? ['catalog'] : [])"), 'only the public edition may restore the catalog tab');
assert.ok(mainSource.includes("import { APP_TITLE, ENABLE_CLOUD_SYNC, IS_PUBLIC_EDITION } from './lib/appEdition.js'"), 'main UI must read app edition flags');
assert.ok(mainSource.includes("import('./lib/ui/publicCatalogView.js')"), 'public catalog UI must be loaded lazily');
assertContainsInOrder(mainSource, ["import.meta.env.VITE_APP_EDITION === 'public'", "import('./lib/ui/publicCatalogView.js')", '() => Promise.resolve(null)'], 'personal build can tree-shake public catalog data');
assert.ok(!mainSource.includes("from './data/publicCardCatalog.js'"), 'main UI must not eagerly import the large public catalog');
assert.ok(mainSource.includes("...(IS_PUBLIC_EDITION ? [['catalog', '카드목록']] : [])"), 'catalog tab must only appear in the public edition');
assert.ok(mainSource.includes("IS_PUBLIC_EDITION && state.selectedTab === 'catalog'"), 'catalog renderer must be edition-gated');
assert.ok(publicCatalogViewSource.includes("from '../../data/publicCardCatalogIndex.js'"), 'lazy catalog view must load the effective verified catalog data');
assert.ok(publicCatalogViewSource.includes('catalog-verification-progress'), 'catalog UI must display official verification progress');
assert.ok(publicCatalogViewSource.includes('const PAGE_SIZE = 60'), 'catalog UI must cap initial rendered results');
for (const catalogFilterToken of ['data-catalog-query', 'issuer', 'productType', 'network', 'status']) {
  assert.ok(publicCatalogViewSource.includes(catalogFilterToken), `catalog UI must support ${catalogFilterToken} filtering`);
}
assert.ok(publicCatalogViewSource.includes("candidate_index: { label: '공식 검증 전'"), 'candidate catalog records must be labeled as unverified');
assert.ok(publicCatalogViewSource.includes("operational_candidate: { label: '체크카드 운영후보'"), 'check cards must be labeled as operational candidates');
assert.ok(publicCatalogViewSource.includes('공식 상세 검증은 신용카드부터 진행합니다.'), 'catalog UI must explain credit-card-first verification policy');
assert.ok(publicCatalogViewSource.includes('체크카드는 운영후보로만 제공하며 혜택 계산과 추천에는 반영하지 않습니다.'), 'catalog UI must explain check-card calculation exclusion');
for (const forbiddenCatalogMutationToken of ['localStorage', 'saveState(', 'cardOverrides', 'monthlyCardUsage', 'setBenefitUsage']) {
  assert.ok(!publicCatalogViewSource.includes(forbiddenCatalogMutationToken), `catalog view must not mutate user data through ${forbiddenCatalogMutationToken}`);
}
assert.ok(stylesSource.includes('.catalog-grid'), 'public catalog must have a responsive result grid');
assert.ok(stylesSource.includes('.tabs.public-tabs'), 'public edition must support five navigation tabs');
assert.ok(mainSource.includes('ENABLE_CLOUD_SYNC ? renderCloudSyncCard() :'), 'public settings UI must hide cloud sync status card');
assert.ok(mainSource.includes('ENABLE_CLOUD_SYNC ? renderSyncConflicts() :'), 'public settings UI must hide cloud sync conflict UI');
assert.ok(mainSource.includes('IS_PUBLIC_EDITION ? renderPublicDataSafetyCard() :'), 'public settings UI must show a local-only data safety card');
assert.ok(mainSource.includes('function renderPublicDataSafetyCard()'), 'public data safety card renderer must exist');
assert.ok(mainSource.includes('document.querySelectorAll(\'[data-action="export-json"]\')'), 'all JSON export buttons must be bound');
assert.ok(mainSource.includes('function renderSourceStatus(card)'), 'card detail shows structured source status');
assert.ok(mainSource.includes("card.source.status === 'official_verified'"), 'card detail distinguishes official verified source status');
assert.ok(mainSource.includes('공식 재검증 필요'), 'card detail warns when card source needs official recheck');
assert.ok(stylesSource.includes('.public-data-safety'), 'public data safety card has dedicated spacing styles');
assert.ok(stylesSource.includes('.source-status.warn'), 'source recheck badge has warning styling');
assert.ok(lazySyncSource.includes('if (!ENABLE_CLOUD_SYNC || !isFirebaseConfigured())'), 'lazy sync init must stay disabled for public edition');
assert.ok(lazyQueueCloudSaveBody.includes('if (!ENABLE_CLOUD_SYNC) return;'), 'public edition saves must remain browser-local only');
assertContainsInOrder(lazySyncSource, ["import.meta.env.VITE_APP_EDITION === 'public'", "() => Promise.resolve(null)", "import('./syncManager.js')"], 'public build can tree-shake cloud sync runtime import');
assert.ok(cloudflareBuildSource.includes("writeFile(join(distDir, '_redirects')"), 'Cloudflare build must emit SPA redirects');
assert.ok(cloudflareBuildSource.includes("writeFile(join(distDir, '_headers')"), 'Cloudflare build must emit response headers');
assert.ok(cloudflareBuildSource.includes("cp(join(root, 'image', 'clean')"), 'Cloudflare build must copy card image assets');
for (const requiredPublicVerifierToken of ['cardfit.public.v1', 'syncManager', '_redirects', '_headers', "join(distDir, 'image', 'clean')", 'CARDS']) {
  assert.ok(verifyPublicDistSource.includes(requiredPublicVerifierToken), `public dist verifier must check ${requiredPublicVerifierToken}`);
}
assert.ok(readmeSource.includes('docs/PUBLIC_DISTRIBUTION_PLAN.md'), 'README links the public distribution plan');
assert.ok(readmeSource.includes('docs/PUBLIC_PRODUCT_IMPLEMENTATION_PLAN.md'), 'README links the public product implementation plan');
assert.ok(readmeSource.includes('docs/CARD_DATA_RESEARCH_GUIDE.md'), 'README links the card data research guide');
assert.ok(readmeSource.includes('docs/CARD_VERIFICATION_PIPELINE.md'), 'README links the card verification pipeline');
assertContainsInOrder(
  publicProductImplementationPlan,
  ['개인용 서비스는 현재 Firebase Hosting', '공개판은 Cloudflare Pages', '사용자가 최종 입력한 값', 'npm run audit:check'],
  'public product implementation plan keeps core direction and verification policy'
);
assert.ok(publicProductImplementationPlan.includes('cardBenefitManager.v1'), 'public product plan documents personal storage key');
assert.ok(publicProductImplementationPlan.includes('cardfit.public.v1'), 'public product plan documents public storage key');
assert.ok(publicProductImplementationPlan.includes('데이터 원복 방지 체크리스트'), 'public product plan documents data reversion prevention checklist');
assert.ok(publicProductImplementationPlan.includes('npm run verify:public'), 'public product plan documents public dist verification');
assertContainsInOrder(publicDistributionPlan, ['Cloudflare Pages', 'npm run build:public', 'dist'], 'public distribution plan documents Cloudflare public build flow');
assert.ok(publicDistributionPlan.includes('VITE_APP_EDITION=public'), 'public distribution plan documents the public edition env');
assert.ok(publicDistributionPlan.includes('cardfit.public.v1'), 'public distribution plan documents the public storage key');
assert.ok(publicDistributionPlan.includes('syncManager'), 'public distribution plan documents the public bundle sync exclusion');
assert.ok(publicDistributionPlan.includes('npm run verify:public'), 'public distribution plan documents public dist verification');
assert.ok(cardDataResearchGuide.includes('PDF'), 'card research guide requires official PDF checks');
assert.ok(cardDataResearchGuide.includes('VISA'), 'card research guide covers card network differences');
assert.ok(cardDataResearchGuide.includes('Mastercard'), 'card research guide covers Mastercard differences');
assert.ok(cardDataResearchGuide.includes('tools/audit-check.mjs'), 'card research guide requires audit coverage');
assert.ok(cardDataSourceMatrix.includes('공식 출처 진입점'), 'card data source matrix documents official source entrypoints');
assert.ok(cardDataSourceMatrix.includes('npm run source:report'), 'card data source matrix documents source report command');
assert.ok(publicCardCatalogCollection.includes('candidate_index'), 'public catalog collection guide documents candidate status');
assert.ok(publicCardCatalogCollection.includes('official_detail_verified'), 'public catalog collection guide documents official detail promotion');
assert.ok(publicCardCatalogCollection.includes('사용자가 입력한 설정값'), 'public catalog collection guide documents user data precedence');
assertContainsInOrder(cardVerificationPipeline, ['publicCardCatalog.js', 'publicCardVerificationOverlays.js', 'publicCardCatalogIndex.js', 'cards.js'], 'card verification pipeline documents staged data flow');
assert.ok(cardVerificationPipeline.includes('calculationStatus: catalog_only'), 'card verification pipeline separates catalog verification from calculation readiness');
assert.ok(cardVerificationPipeline.includes('cardOverrides'), 'card verification pipeline documents user data isolation');
for (const requiredPriorityPlanToken of ['총 200종', 'pending_official_check', 'officially_listed', 'officially_issuable', '신규 발급 중단', '기존 사용자의 설정·실적을 초기화하지 않는다']) {
  assert.ok(creditCardPriorityBatchPlan.includes(requiredPriorityPlanToken), `priority credit-card plan must include ${requiredPriorityPlanToken}`);
}
assert.ok(cardSourceReportSource.includes('batchLabel(source)'), 'source report includes recheck batch labels');
for (const requiredSourceReportToken of ['Card Source Recheck Queue', 'operationalCandidates', 'Excluded From Recheck Queue', 'byIssuer', 'source.status', 'source.checkedAt', 'source.note']) {
  assert.ok(cardSourceReportSource.includes(requiredSourceReportToken), `card source report must include ${requiredSourceReportToken}`);
}
for (const requiredCatalogReportToken of ['Public Card Catalog', 'By Status', 'By Issuer', 'Official Catalog Seeds', 'Operational Check-card Candidates', 'Candidate Sample']) {
  assert.ok(cardCatalogReportSource.includes(requiredCatalogReportToken), `card catalog report must include ${requiredCatalogReportToken}`);
}
for (const requiredCatalogCollectorToken of ['CardGorilla card search API', 'KB_OFFICIAL_CARDS', 'official_catalog', 'candidate_index']) {
  assert.ok(collectPublicCardCatalogSource.includes(requiredCatalogCollectorToken), `card catalog collector must include ${requiredCatalogCollectorToken}`);
}
for (const item of CARDS) {
  assert.ok(cardDataSourceMatrix.includes(`\`${item.id}\``), `card data source matrix tracks ${item.id}`);
}
assert.ok(!mainSource.includes('./lib/sync/syncManager.js'), 'main entry must not statically import Firebase sync runtime');
assert.ok(lazySyncSource.includes("import('./syncManager.js')"), 'sync runtime must stay dynamically imported');
assertContainsInOrder(lazyInitSyncBody, ['queueMicrotask(() =>', 'prepareCloudSync();'], 'sync runtime starts checking auth immediately after app init');
assert.ok(lazySyncSource.includes("const PENDING_SAVE_KEY = 'cardBenefitManager.pendingCloudSave'"), 'lazy sync layer can persist pending saves before runtime loads');
assertContainsInOrder(lazyQueueCloudSaveBody, ['pendingSave = true;', 'markPendingCloudSave();', 'prepareCloudSync();'], 'save before runtime load wakes cloud sync and records a durable pending save');
assert.ok(syncManagerSource.includes('let authSettled = false'), 'sync manager tracks auth readiness before dropping unauthenticated saves');
assertContainsInOrder(managerQueueCloudSaveBody, ['if (!currentUser)', 'markPendingCloudSave();', 'return;', 'markPendingCloudSave();'], 'save without a current user is retained for later login recovery');
assert.ok(syncManagerSource.includes('function mergeCardOverrides'), 'sync merge preserves card settings with field-level merge logic');
assert.ok(syncManagerSource.includes('function isExplicitMonthlyTarget'), 'sync merge distinguishes explicit monthly targets from catalog defaults');
assert.ok(syncManagerSource.includes('monthlyTargetUpdatedAt'), 'monthly target changes carry a field-level timestamp for cloud merge');
assert.ok(syncManagerSource.includes('monthlyTargetUserSet'), 'monthly target changes carry an explicit user-set flag');
assert.ok(syncManagerSource.includes('CARD_OVERRIDE_FIELDS'), 'card override merge uses shared field-level metadata');
assert.ok(syncManagerSource.includes('annualTargetUpdatedAt'), 'annual target changes carry a field-level timestamp for cloud merge');
assert.ok(syncManagerSource.includes('annualFeeStartMonthUpdatedAt'), 'annual fee start month changes carry a field-level timestamp for cloud merge');
assert.ok(syncManagerSource.includes('mergeTimestampedRecords'), 'monthly and benefit usage records merge by field timestamps when available');
assert.ok(syncManagerSource.includes('mergePointValues'), 'point values merge by point-level timestamps when available');
assert.ok(syncManagerSource.includes('const nextState = mergeStates(localState, incomingState);'), 'remote snapshots always pass through merge logic');
assert.ok(syncManagerSource.includes("import { CARDS } from '../../data/cards.js'"), 'sync manager can compare card override settings against card defaults');
assert.ok(mainSource.includes('nextPatch.monthlyTargetUserSet = true;'), 'monthly target edits mark the target as user-set');
assert.ok(mainSource.includes('nextPatch.monthlyTargetUpdatedAt = now;'), 'monthly target edits record a field-level timestamp');
assert.ok(mainSource.includes('nextPatch.annualTargetUserSet = true;'), 'annual target edits mark the target as user-set');
assert.ok(mainSource.includes('nextPatch.annualFeeStartMonthUpdatedAt = now;'), 'annual fee start month edits record a field-level timestamp');
assert.ok(mainSource.includes('pointValuesUpdatedAt'), 'point value edits record per-point timestamps');
assert.ok(!mainSource.includes('state = { ...state, settings: { ...state.settings, pointValues: { ...state.settings.pointValues, [key]: Number(value || 0) } } };'), 'point value timestamp update is not overwritten by legacy assignment');
assert.ok(firebaseClientSource.includes('const persistenceReady = setPersistence(auth, browserLocalPersistence)'), 'auth persistence setup is tracked instead of being silently ignored');
assertContainsInOrder(managerSignInBody, ['await services.persistenceReady', 'new GoogleAuthProvider()'], 'manual Google sign-in waits for local auth persistence setup');
assert.ok(indexHtml.includes('Content-Security-Policy'), 'index.html must include CSP meta');
console.log('ok - sync runtime is lazy-loaded and CSP meta exists');

assertEqual(monthlyValue('skt-woori-card', 300000), 10000, 'SKT Woori 300k telecom pattern');
assertEqual(monthlyValue('skt-woori-card', 300000, { overrides: { 'skt-woori-card': { prevMonthStatus: 'unmet' } } }), 0, 'SKT Woori unmet blocks pattern');
assertEqual('monthlyLimitCount' in benefit('skt-woori-card', 'skt-woori-telecom-tlight'), false, 'SKT Woori telecom status uses only monthly cap');
assertEqual(monthlyValue('woori-point-main', 300000), 10000, 'Woori Point simplepay 300k cap');
assertEqual(monthlyValue('woori-point-main', 600000), 20000, 'Woori Point simplepay 600k cap');
assertEqual(monthlyValue('kb-talktalk-my-point', 200000), 11000, 'KB TalkTalk KB Pay plus base');
assertEqual(monthlyValue('mg-s-hana', 300000), 15000, 'MG+S simplepay 300k cap');
assertEqual(monthlyValue('shinhan-always-on', 10000), 2000, 'Shinhan Always On two transactions pattern');
assertEqual(monthlyValue('coupang-wow-card', 100000), 4000, 'Coupang WOW 4 percent reference benefit');
assertEqual(monthlyValue('marriott-classic-shinhan', 300000), 3000, 'Marriott Classic base 1P auto-counts monthly spend');
assertEqual(monthlyValue('bc-goat-card', 1200000), 17000, 'BC GOAT domestic Paybook tiered reward');
assertEqual(monthlyValue('all-woori-infinite', 300000), 4186, 'ALL Woori base reward uses official ALL point value');
assertEqual(monthlyValue('lotte-hilton-amex', 300000), 200, 'Hilton Amex base point value reflects monthly spend');
assertEqual(monthlyValue('kb-wesh-all-plus', 1000000), 10000, 'KB WE:SH All+ domestic 1 percent follows monthly spend');
assertEqual(monthlyValue('kb-wesh-all-plus', 1000000, { overrides: { 'kb-wesh-all-plus': { prevMonthStatus: 'unmet' } } }), 0, 'KB WE:SH All+ automatic benefit stops when previous-month spend is unmet');
assertEqual(monthlyValue('kb-all', 1000000, { overrides: { 'kb-all': { prevMonthStatus: 'unmet', monthlyTarget: 0 } } }), 10000, 'KB ALL no-spend-requirement domestic discount remains active');

function benefit(cardId, benefitId) {
  const found = card(cardId).benefits.find((item) => item.id === benefitId);
  assert.ok(found, `Missing benefit: ${cardId}:${benefitId}`);
  return found;
}

function assertBenefitValue(state, cardId, benefitId, expected, label) {
  assertEqual(getMonthlyBenefitValueForBenefit(state, card(cardId), benefit(cardId, benefitId), MONTH), expected, label);
}

function exportedFunctionBody(source, name) {
  const signatures = [`export function ${name}`, `export async function ${name}`];
  const start = Math.max(...signatures.map((signature) => source.indexOf(signature)));
  assert.ok(start >= 0, `Missing exported function: ${name}`);
  const open = source.indexOf('{', start);
  assert.ok(open >= 0, `Missing function body: ${name}`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`Unclosed function body: ${name}`);
}

function assertContainsInOrder(source, parts, label) {
  let cursor = 0;
  for (const part of parts) {
    const index = source.indexOf(part, cursor);
    assert.ok(index >= 0, `${label}: missing ${part}`);
    cursor = index + part.length;
  }
}

assertEqual(card('shinhan-ace-blue').benefits[0].id, 'ace-reward-mile', 'Shinhan The ACE Skypass mileage appears first');
assertBenefitValue(withSpend('marriott-classic-shinhan', 300000), 'marriott-classic-shinhan', 'mb-classic-point-basic', 3000, 'Marriott Classic base row reflects monthly spend');
assertBenefitValue(withSpend('marriott-best-shinhan', 300000), 'marriott-best-shinhan', 'mb-best-point-basic', 3000, 'Marriott Best base row reflects monthly spend');
assert.ok(
  card('marriott-best-shinhan').benefits.findIndex((item) => item.id === 'mb-best-point-basic')
    < card('marriott-best-shinhan').benefits.findIndex((item) => item.id === 'mb-best-point-marriott'),
  'Marriott Best base 1P benefit appears before Marriott 5P benefit'
);
assertBenefitValue(withSpend('hyundai-amex-platinum', 1000000), 'hyundai-amex-platinum', 'hy-amex-mr-base', 15000, 'Hyundai Amex base MR row reflects monthly spend');
assert.deepEqual(
  card('hyundai-amex-platinum').benefits.slice(0, 4).map((item) => item.id),
  ['hy-amex-mr-base', 'hy-amex-mr-2x', 'hy-amex-mr-3x', 'hy-amex-artisee'],
  'Hyundai Amex MR benefits appear first and Artisee is fourth'
);
const hyundaiAmexSpecialState = withSpend('hyundai-amex-platinum', 1000000, {
  usage: { 'hy-amex-mr-2x': { [MONTH]: { usedAmount: 500000 } } }
});
assertEqual(getMonthlyBenefitValue(hyundaiAmexSpecialState, card('hyundai-amex-platinum'), MONTH), 22500, 'Hyundai Amex base plus special incremental MR');
assertBenefitValue(hyundaiAmexSpecialState, 'hyundai-amex-platinum', 'hy-amex-mr-2x', 7500, 'Hyundai Amex special row counts only extra over base');
assertEqual(getBenefitAmountInput(hyundaiAmexSpecialState, card('hyundai-amex-platinum'), benefit('hyundai-amex-platinum', 'hy-amex-mr-base'), MONTH), 1000000, 'base reward amount input falls back to monthly spend');
assertEqual(getBenefitAmountInput(hyundaiAmexSpecialState, card('hyundai-amex-platinum'), benefit('hyundai-amex-platinum', 'hy-amex-mr-2x'), MONTH), 500000, 'special reward amount input uses explicit category spend');
const hyundaiAmexSpecialOnlyState = withSpend('hyundai-amex-platinum', 0, {
  usage: { 'hy-amex-mr-2x': { [MONTH]: { usedAmount: 100000 } } }
});
assertBenefitValue(hyundaiAmexSpecialOnlyState, 'hyundai-amex-platinum', 'hy-amex-mr-2x', 1500, 'explicit special reward amount works even without card monthly spend');

const the1SpecialState = withSpend('samsung-the1-skypass', 1000000, {
  usage: { 'the1-special-mile': { [MONTH]: { usedAmount: 500000 } } }
});
assertEqual(getMonthlyBenefitValue(the1SpecialState, card('samsung-the1-skypass'), MONTH), 22500, 'THE 1 base plus special incremental Skypass miles');
assertBenefitValue(the1SpecialState, 'samsung-the1-skypass', 'the1-basic-mile', 15000, 'THE 1 base row reflects monthly spend');
assertBenefitValue(the1SpecialState, 'samsung-the1-skypass', 'the1-special-mile', 7500, 'THE 1 special row counts only extra over base');
const the1SpecialCapState = withSpend('samsung-the1-skypass', 2000000, {
  usage: { 'the1-special-mile': { [MONTH]: { usedAmount: 2000000 } } }
});
assertEqual(getMonthlyBenefitValue(the1SpecialCapState, card('samsung-the1-skypass'), MONTH), 30000, 'THE 1 special cap is applied before base-difference math');
assertBenefitValue(the1SpecialCapState, 'samsung-the1-skypass', 'the1-special-mile', 0, 'THE 1 capped special row does not double-count base miles');
assert.deepEqual(
  card('samsung-the1-skypass').benefits.slice(4, 7).map((item) => item.id),
  ['the1-starbucks', 'the1-amex-artisee', 'the1-amex-baekmidang'],
  'THE 1 AMEX cafe benefits appear with core coffee benefits'
);
assertEqual(benefit('samsung-the1-skypass', 'the1-amex-airport-dining').type, 'info_check', 'THE 1 variable airport dining discount is tracked as info check');
assert.deepEqual(
  benefit('samsung-the1-skypass', 'the1-amex-airport-dining').categories,
  ['restaurant', 'coffee', 'travel'],
  'THE 1 airport dining discount is discoverable in dining, coffee, and travel contexts'
);

assertBenefitValue(withSpend('samsung-the-o-asiana', 300000), 'samsung-the-o-asiana', 'the-o-reward-asiana', 3000, 'THE O basic mileage row reflects monthly spend');
assertBenefitValue(withSpend('skt-woori-card', 700000), 'skt-woori-card', 'skt-woori-telecom-tlight', 15000, 'SKT Woori telecom row reflects tiered current-month spend');
assertEqual(card('woori-point-main').benefits[0].id, 'woori-monthly-points', 'Woori Point monthly cap appears first');
assertBenefitValue(withSpend('woori-point-main', 300000), 'woori-point-main', 'woori-basic', 2400, 'Woori Point basic row reflects monthly spend');
assertBenefitValue(withSpend('woori-point-main', 300000), 'woori-point-main', 'woori-pay-plus', 7600, 'Woori Point simplepay row fills remaining monthly cap');
assertBenefitValue(withSpend('woori-point-main', 300000), 'woori-point-main', 'woori-monthly-points', 10000, 'Woori Point cap container displays applied total');
const wooriManualBasicState = withSpend('woori-point-main', 1200000, {
  usage: { 'woori-basic': { [MONTH]: { benefitValue: 5000 } } }
});
assertBenefitValue(wooriManualBasicState, 'woori-point-main', 'woori-pay-plus', 36000, 'Woori Point pay-plus subtracts manually applied basic only once');
assertBenefitValue(withSpend('kb-talktalk-my-point', 200000), 'kb-talktalk-my-point', 'kb-base', 1000, 'KB TalkTalk base row reflects monthly spend');
assertBenefitValue(withSpend('kb-talktalk-my-point', 200000), 'kb-talktalk-my-point', 'kb-pay-5', 10000, 'KB TalkTalk KB Pay row reflects monthly spend');
const kbManualPayAmountState = withSpend('kb-talktalk-my-point', 200000, {
  usage: { 'kb-pay-5': { [MONTH]: { usedAmount: 100000, manualAmountOverride: true } } }
});
assertBenefitValue(kbManualPayAmountState, 'kb-talktalk-my-point', 'kb-pay-5', 5000, 'KB TalkTalk manual amount override recalculates auto-derived pay row');
const kbManualBaseZeroState = withSpend('kb-talktalk-my-point', 200000, {
  usage: { 'kb-base': { [MONTH]: { usedAmount: 0, manualAmountOverride: true } } }
});
assertBenefitValue(kbManualBaseZeroState, 'kb-talktalk-my-point', 'kb-base', 0, 'KB TalkTalk manual zero amount suppresses derived base row');

const mgCapState = withSpend('mg-s-hana', 1000000, {
  usage: { 'mg-ott': { [MONTH]: { benefitValue: 10000 } } }
});
assertEqual(getMonthlyBenefitValue(mgCapState, card('mg-s-hana'), MONTH), 60000, 'MG+S simplepay plus explicit OTT stays within unified cap');
assertEqual(card('mg-s-hana').benefits[0].id, 'mg-monthly-discount', 'MG+S monthly cap appears first');
assertBenefitValue(mgCapState, 'mg-s-hana', 'mg-simplepay', 50000, 'MG+S simplepay row fills remaining unified cap');
assertBenefitValue(mgCapState, 'mg-s-hana', 'mg-monthly-discount', 60000, 'MG+S cap container displays applied total');
assertEqual(isCapContainerBenefit(benefit('mg-s-hana', 'mg-monthly-discount')), true, 'MG+S monthly cap is treated as read-only cap container');
assert.ok(getBenefitHomeStatus(mgCapState, card('mg-s-hana'), benefit('mg-s-hana', 'mg-simplepay')).includes('50,000'), 'MG+S simplepay home status shows applied benefit instead of zero');

assertBenefitValue(withSpend('lotte-green-card', 300000), 'lotte-green-card', 'lotte-green-domestic', 600, 'Lotte Green domestic row reflects monthly spend');
assertBenefitValue(withSpend('kb-skypass-platinum', 300000), 'kb-skypass-platinum', 'kb-skypass-mile', 3000, 'KB Skypass mileage row reflects monthly spend');
assertBenefitValue(withSpend('coupang-wow-card', 100000), 'coupang-wow-card', 'coupang-wow-cashback', 4000, 'Coupang WOW detail row reflects 4 percent Coupang spend');

const bcGoatOverseasState = withSpend('bc-goat-card', 0, {
  usage: { 'bc-goat-overseas-paybook': { [MONTH]: { usedAmount: 1200000 } } }
});
assertBenefitValue(bcGoatOverseasState, 'bc-goat-card', 'bc-goat-overseas-paybook', 34000, 'BC GOAT overseas Paybook tiered reward');

const allWooriSpecialState = withSpend('all-woori-infinite', 300000, {
  usage: { 'all-woori-accor-5p': { [MONTH]: { usedAmount: 300000 } } }
});
assertBenefitValue(allWooriSpecialState, 'all-woori-infinite', 'all-woori-basic-reward', 4186, 'ALL Woori base reward row reflects monthly spend');
assertBenefitValue(allWooriSpecialState, 'all-woori-infinite', 'all-woori-accor-5p', 11915, 'ALL Woori Accor special row counts only extra over base');

const hiltonSpecialState = withSpend('lotte-hilton-amex', 300000, {
  usage: { 'hilton-special-point': { [MONTH]: { usedAmount: 150000 } } }
});
assertBenefitValue(hiltonSpecialState, 'lotte-hilton-amex', 'hilton-base-point', 200, 'Hilton base reward row reflects monthly spend');
assertBenefitValue(hiltonSpecialState, 'lotte-hilton-amex', 'hilton-special-point', 100, 'Hilton special row counts only extra over base');

const lotteAmexOverseasState = withSpend('lotte-amex-skypass', 1000000, {
  usage: { 'lotte-amex-overseas-mile': { [MONTH]: { usedAmount: 500000 } } }
});
assertEqual(getMonthlyBenefitValue(lotteAmexOverseasState, card('lotte-amex-skypass'), MONTH), 22500, 'Lotte Amex base plus overseas incremental miles');
assertBenefitValue(lotteAmexOverseasState, 'lotte-amex-skypass', 'lotte-amex-domestic-mile', 15000, 'Lotte Amex base row reflects monthly spend');
assertBenefitValue(lotteAmexOverseasState, 'lotte-amex-skypass', 'lotte-amex-overseas-mile', 7500, 'Lotte Amex overseas row counts only extra over base');

const zeroManualState = withSpend('kb-talktalk-my-point', 200000, {
  usage: {
    'kb-base': {
      [MONTH]: { benefitValue: 0 }
    }
  }
});
assertEqual(getMonthlyBenefitValue(zeroManualState, card('kb-talktalk-my-point'), MONTH), 11000, 'legacy zero without override keeps auto');

const explicitZeroOverrideState = withSpend('kb-talktalk-my-point', 200000, {
  usage: {
    'kb-base': {
      [MONTH]: { benefitValue: 0, manualBenefitOverride: true }
    }
  }
});
assertEqual(getMonthlyBenefitValue(explicitZeroOverrideState, card('kb-talktalk-my-point'), MONTH), 10000, 'explicit manual zero suppresses one auto line');

const manualOverrideState = withSpend('kb-talktalk-my-point', 200000, {
  usage: {
    'kb-base': {
      [MONTH]: { benefitValue: 500 }
    }
  }
});
assertEqual(getMonthlyBenefitValue(manualOverrideState, card('kb-talktalk-my-point'), MONTH), 10500, 'positive manual benefit overrides one auto line');

const theOStarbucksChecked = baseState({
  usage: {
    'the-o-starbucks': {
      [MONTH]: { checked: true }
    }
  }
});
assertEqual(getMonthlyBenefitValue(theOStarbucksChecked, card('samsung-the-o-asiana'), MONTH), 3000, 'THE O Starbucks checked applies fixed benefit');
assertEqual(getAnnualUsageCount(theOStarbucksChecked, card('samsung-the-o-asiana'), card('samsung-the-o-asiana').benefits.find((benefit) => benefit.id === 'the-o-starbucks'), new Date(`${MONTH}-01T00:00:00`)), 1, 'THE O checked count is not doubled');
assertEqual(isCheckOnlyFixedAmountBenefit(card('samsung-the-o-asiana').benefits.find((benefit) => benefit.id === 'the-o-starbucks')), true, 'THE O Starbucks is check-only fixed amount');
assertEqual(isCheckOnlyFixedAmountBenefit(card('samsung-the-o-asiana').benefits.find((benefit) => benefit.id === 'the-o-movie')), false, 'THE O CGV keeps amount input because it is rate-based');
assertEqual(isCheckOnlyFixedAmountBenefit(card('samsung-the1-skypass').benefits.find((benefit) => benefit.id === 'the1-megabox')), false, 'tiered fixed amount benefit keeps amount input');
assertEqual(isCheckOnlyFixedAmountBenefit(card('samsung-the1-skypass').benefits.find((benefit) => benefit.id === 'the1-amex-artisee')), true, 'THE 1 AMEX Artisee is check-only fixed amount');
assertEqual(isCheckOnlyFixedAmountBenefit(card('samsung-the1-skypass').benefits.find((benefit) => benefit.id === 'the1-amex-baekmidang')), true, 'THE 1 AMEX Baekmidang is check-only fixed amount');

const the1AmexCafeChecked = baseState({
  usage: {
    'the1-amex-artisee': {
      [MONTH]: { checked: true }
    },
    'the1-amex-baekmidang': {
      [MONTH]: { checked: true }
    }
  }
});
assertBenefitValue(the1AmexCafeChecked, 'samsung-the1-skypass', 'the1-amex-artisee', 4500, 'THE 1 AMEX Artisee checked applies fixed benefit');
assertBenefitValue(the1AmexCafeChecked, 'samsung-the1-skypass', 'the1-amex-baekmidang', 5000, 'THE 1 AMEX Baekmidang checked applies fixed benefit');

const theOStarbucksStaleBelowMin = baseState({
  usage: {
    'the-o-starbucks': {
      [MONTH]: { checked: true, count: 1, usedAmount: 5000 }
    }
  }
});
assertEqual(getMonthlyBenefitValue(theOStarbucksStaleBelowMin, card('samsung-the-o-asiana'), MONTH), 3000, 'check-only fixed benefit ignores stale below-min used amount');

const theOStarbucksCountAndChecked = baseState({
  usage: {
    'the-o-starbucks': {
      [MONTH]: { count: 1, checked: true }
    }
  }
});
assertEqual(getAnnualUsageCount(theOStarbucksCountAndChecked, card('samsung-the-o-asiana'), card('samsung-the-o-asiana').benefits.find((benefit) => benefit.id === 'the-o-starbucks'), new Date(`${MONTH}-01T00:00:00`)), 1, 'THE O count plus checked remains one use');

const theOOutbackBelowMin = baseState({
  usage: {
    'the-o-outback': {
      [MONTH]: { count: 1, usedAmount: 50000 }
    }
  }
});
assertEqual(getMonthlyBenefitValue(theOOutbackBelowMin, card('samsung-the-o-asiana'), MONTH), 30000, 'THE O Outback check-only fixed benefit ignores stale below-min amount');

const theOOutbackMet = baseState({
  usage: {
    'the-o-outback': {
      [MONTH]: { count: 1, usedAmount: 60000 }
    }
  }
});
assertEqual(getMonthlyBenefitValue(theOOutbackMet, card('samsung-the-o-asiana'), MONTH), 30000, 'THE O Outback met amount applies fixed benefit');

const theOMovieRate = baseState({
  usage: {
    'the-o-movie': {
      [MONTH]: { count: 1, usedAmount: 12000 }
    }
  }
});
assertEqual(getMonthlyBenefitValue(theOMovieRate, card('samsung-the-o-asiana'), MONTH), 6000, 'THE O CGV rate benefit reflects used amount');
const theOMovieBelowMin = baseState({
  usage: {
    'the-o-movie': {
      [MONTH]: { count: 1, usedAmount: 10000 }
    }
  }
});
assertEqual(getMonthlyBenefitValue(theOMovieBelowMin, card('samsung-the-o-asiana'), MONTH), 0, 'rate-based count amount benefit still respects minimum amount');

const prevMonthAutoMet = baseState();
prevMonthAutoMet.selectedMonth = '2026-06';
prevMonthAutoMet.monthlyCardUsage['2026-06'] = {
  'shinhan-ace-blue': { prevMonthStatus: 'manual' }
};
prevMonthAutoMet.monthlyCardUsage['2026-05'] = {
  'shinhan-ace-blue': { currentMonthSpend: 780000 }
};
assertEqual(getCardOverride(prevMonthAutoMet, 'shinhan-ace-blue').prevMonthStatus, 'met', 'prev-month spend auto marks selected month as met');
assertEqual(getCardOverride(prevMonthAutoMet, 'shinhan-ace-blue').prevMonthSpend, 780000, 'prev-month spend is exposed for tier calculations');

const prevMonthAutoUnmet = baseState();
prevMonthAutoUnmet.selectedMonth = '2026-06';
prevMonthAutoUnmet.monthlyCardUsage['2026-06'] = {
  'shinhan-ace-blue': { prevMonthStatus: 'manual' }
};
prevMonthAutoUnmet.monthlyCardUsage['2026-05'] = {
  'shinhan-ace-blue': { currentMonthSpend: 200000 }
};
assertEqual(getCardOverride(prevMonthAutoUnmet, 'shinhan-ace-blue').prevMonthStatus, 'unmet', 'prev-month spend auto marks selected month as unmet');

const explicitPrevStatusOverride = baseState();
explicitPrevStatusOverride.selectedMonth = '2026-06';
explicitPrevStatusOverride.monthlyCardUsage['2026-06'] = {
  'shinhan-ace-blue': { prevMonthStatus: 'manual', prevMonthStatusOverride: true }
};
explicitPrevStatusOverride.monthlyCardUsage['2026-05'] = {
  'shinhan-ace-blue': { currentMonthSpend: 780000 }
};
assertEqual(getCardOverride(explicitPrevStatusOverride, 'shinhan-ace-blue').prevMonthStatus, 'met', 'legacy explicit prev-month override is ignored when spend proves met');
const marriottBestUnmanaged = baseState({
  overrides: {
    'marriott-best-shinhan': { monthlyTarget: 0 }
  }
});
assertEqual(getCardOverride(marriottBestUnmanaged, 'marriott-best-shinhan').monthlyTarget, 0, 'explicit zero monthly target is preserved');
assertEqual(hasPrevMonthRequirement(card('marriott-best-shinhan'), getCardOverride(marriottBestUnmanaged, 'marriott-best-shinhan')), false, 'explicit zero monthly target disables prev-month requirement');
const migratedMarriottBestUnmanaged = migrateState({
  schemaVersion: '2.0.1',
  cardOverrides: {
    'marriott-best-shinhan': {
      monthlyTarget: 0,
      monthlyTargetUpdatedAt: '2026-07-06T12:00:00.000Z'
    }
  },
  monthlyCardUsage: { [MONTH]: {} }
});
assertEqual(migratedMarriottBestUnmanaged.cardOverrides['marriott-best-shinhan'].monthlyTarget, 0, 'migrated Marriott Best unmanaged target remains zero');
assertEqual(migratedMarriottBestUnmanaged.cardOverrides['marriott-best-shinhan'].monthlyTargetUserSet, true, 'migrated Marriott Best unmanaged target is treated as user-set');
assertEqual(migratedMarriottBestUnmanaged.cardOverrides['marriott-best-shinhan'].monthlyTargetUpdatedAt, '2026-07-06T12:00:00.000Z', 'migrated Marriott Best monthly target timestamp is preserved');
const migratedMarriottBestStaleDefault = migrateState({
  schemaVersion: '2.0.1',
  cardOverrides: {
    'marriott-best-shinhan': {
      monthlyTarget: 300000
    }
  },
  monthlyCardUsage: { [MONTH]: {} }
});
assertEqual(migratedMarriottBestStaleDefault.cardOverrides['marriott-best-shinhan'].monthlyTarget, 0, 'legacy Marriott Best stale default is repaired to unmanaged');
assertEqual(migratedMarriottBestStaleDefault.cardOverrides['marriott-best-shinhan'].monthlyTargetUserSet, true, 'legacy Marriott Best repair is treated as user-set');
const migratedAceCatalogDefault = migrateState({
  schemaVersion: '2.0.1',
  cardOverrides: {
    'shinhan-ace-blue': {
      monthlyTarget: 300000
    }
  },
  monthlyCardUsage: { [MONTH]: {} }
});
assertEqual(migratedAceCatalogDefault.cardOverrides['shinhan-ace-blue'].monthlyTargetUserSet, false, 'catalog default monthly target is not treated as a user-set card setting');
const migratedHyundaiAnnualSettings = migrateState({
  schemaVersion: '2.0.1',
  cardOverrides: {
    'hyundai-amex-platinum': {
      annualTarget: 36000000,
      cycle: { type: 'anniversary', annualFeeStartMonth: 7 }
    }
  },
  monthlyCardUsage: { [MONTH]: {} }
});
assertEqual(migratedHyundaiAnnualSettings.cardOverrides['hyundai-amex-platinum'].annualTarget, 36000000, 'migrated Hyundai Amex annual target remains user setting');
assertEqual(migratedHyundaiAnnualSettings.cardOverrides['hyundai-amex-platinum'].annualTargetUserSet, true, 'migrated Hyundai Amex annual target is treated as user-set');
assertEqual(migratedHyundaiAnnualSettings.cardOverrides['hyundai-amex-platinum'].cycle.annualFeeStartMonth, 7, 'migrated Hyundai Amex annual fee start month remains user setting');
assertEqual(migratedHyundaiAnnualSettings.cardOverrides['hyundai-amex-platinum'].annualFeeStartMonthUserSet, true, 'migrated Hyundai Amex annual fee start month is treated as user-set');
const migratedHyundaiAnnualDefaults = migrateState({
  schemaVersion: '2.0.1',
  cardOverrides: {
    'hyundai-amex-platinum': {
      annualTarget: 1000000,
      cycle: { type: 'anniversary', annualFeeStartMonth: 1 }
    }
  },
  monthlyCardUsage: { [MONTH]: {} }
});
assertEqual(migratedHyundaiAnnualDefaults.cardOverrides['hyundai-amex-platinum'].annualTargetUserSet, false, 'catalog default annual target is not treated as a user-set card setting');
assertEqual(migratedHyundaiAnnualDefaults.cardOverrides['hyundai-amex-platinum'].annualFeeStartMonthUserSet, false, 'catalog default annual fee start month is not treated as user-set');
assertEqual(hasPrevMonthRequirement(card('kb-skypass-platinum'), getCardOverride(baseState(), 'kb-skypass-platinum')), false, 'zero-target card is not treated as prev-month achievement managed');
assert.ok(mainSource.includes('전월실적 무관'), 'dashboard has neutral prev-month label for unmanaged cards');
console.log('ok - dashboard has neutral prev-month label for unmanaged cards');
assert.ok(!mainSource.includes('function renderMonthlyCardInputs'), 'card detail monthly input section is removed');
assert.ok(!mainSource.includes('data-monthly-card-field="prevMonthStatus"'), 'manual prev-month status selector is removed');
assert.ok(!mainSource.includes('data-cycle-field="issueMonth"'), 'issue month setting is removed');
console.log('ok - redundant card detail inputs are removed');
assert.ok(stylesSource.includes('appearance: none'), 'native checkbox rendering is removed from benefit check controls');
assert.ok(stylesSource.includes('border-width: 0 2px 2px 0'), 'custom check mark is drawn with centered CSS shape');
assert.ok(stylesSource.includes('rotate(45deg) scale(1)'), 'custom check mark selected state stays centered');
console.log('ok - benefit checkbox controls use custom theme-safe rendering');
assert.ok(mainSource.includes('isCheckOnlyFixedAmountBenefit(benefit)'), 'fixed amount count benefits use check-only UI policy');
assert.ok(mainSource.includes("!isCheckOnlyFixed ? `"), 'amount input is skipped for check-only fixed count benefits');
assert.ok(mainSource.includes('조건 충족 시 혜택'), 'check-only fixed count benefits explain deterministic benefit value');
console.log('ok - check-only fixed amount benefit UI policy is preserved');
assert.ok(mainSource.includes('initialRawValue'), 'auto-rendered usage fields skip no-op blur saves');
assert.ok(mainSource.includes('isCapContainerBenefit(benefit)'), 'cap container benefits render as read-only summaries');
assert.ok(mainSource.includes('isMonetaryBenefit(benefit)'), 'monetary benefits show calculated monthly value in status chips');
assert.ok(mainSource.includes('effectiveMonthlyCap(card, benefit, capBasis)'), 'benefit status chips use unified monthly cap including cap pools');
assert.ok(mainSource.includes('if (cap && !isMonetaryBenefit(benefit))'), 'monetary benefit status avoids duplicate monthly value and cap chips');
console.log('ok - auto-derived usage UI avoids sticky no-op overrides and read-only cap containers');
assert.ok(mainSource.includes('sticky-month-bar'), 'dashboard/card detail month bar stays in a dedicated sticky region');
assert.ok(stylesSource.includes('.sticky-month-bar { position: sticky;'), 'sticky month bar CSS is preserved');
assert.ok(stylesSource.includes('background: var(--bg); backdrop-filter: blur(20px);'), 'app header uses an opaque backdrop to avoid iOS sticky bleed-through');
assert.ok(stylesSource.includes('top: calc(54px + env(safe-area-inset-top));'), 'sticky month bar overlaps directly under compact app header');
assert.ok(stylesSource.includes('margin: -8px 0 8px; padding: 8px 0 4px;'), 'sticky month bar top spacing overlaps the header edge');
assert.ok(stylesSource.includes('.sticky-month-bar::before'), 'sticky month bar has an iOS gap cover pseudo-element');
assert.ok(mainSource.includes('getConfiguredMonthlyTarget(card, override)'), 'card detail monthly metric uses configured monthly target');
assert.ok(mainSource.includes('/ ${won(target)} (${status})'), 'card detail monthly metric shows spend, target, and status together');
console.log('ok - sticky month bar and amount-bearing card detail metrics are preserved');

const the1LargeDepartment = baseState({
  selectedCategory: 'department',
  amount: 2000000
});
const the1Recommendation = findRecommendation(the1LargeDepartment, 'samsung-the1-skypass');
assertBetween(the1Recommendation.value, 30000, 60000, 'THE 1 special mileage recommendation respects monthly point cap');

const allUnmetOverrides = Object.fromEntries(CARDS.map((item) => [item.id, { prevMonthStatus: 'unmet' }]));
const hotelUnmetState = baseState({
  selectedCategory: 'hotel',
  amount: 100000,
  overrides: allUnmetOverrides
});
const hyundaiHotelUnmet = findRecommendation(hotelUnmetState, 'hyundai-amex-platinum');
assertEqual(hyundaiHotelUnmet.value, 1500, 'prev-month unmet blocks conditional reward recommendations');

assert.throws(() => importState('{}'), /복원할 카드\/혜택 데이터/, 'empty backup JSON is rejected');
const imported = importState(JSON.stringify({
  schemaVersion: '2.0.1',
  selectedTab: 'dashboard hacked',
  selectedCategory: 'travel',
  hiddenCardIds: ['kb-talktalk-my-point', 'unknown-card'],
  pointValues: { koreanAir: 17, evil: '<img>' },
  monthlyCardUsage: {
    [MONTH]: {
      'kb-talktalk-my-point': { currentMonthSpend: '200000', prevMonthStatus: 'bad-class' },
      'unknown-card': { currentMonthSpend: 999999 }
    }
  }
}));
assertEqual(imported.selectedTab, 'dashboard', 'import sanitizes selected tab');
assert.deepEqual(imported.hiddenCardIds, ['kb-talktalk-my-point', ...DEFAULT_HIDDEN_CARD_IDS], 'import sanitizes hidden card ids and adds default-hidden optional cards');
assertEqual(imported.settings.pointValues.koreanAir, 17, 'import keeps known point values');
assert.equal(imported.settings.pointValues.evil, undefined, 'import drops unknown point value keys');
assertEqual(imported.monthlyCardUsage[MONTH]['kb-talktalk-my-point'].prevMonthStatus, 'manual', 'import sanitizes monthly status');
assert.equal(imported.monthlyCardUsage[MONTH]['unknown-card'], undefined, 'import drops unknown monthly card ids');

assertEqual(firebaseRc.projects.default, 'cardfit-ee4b5', 'Firebase default project is cardfit-ee4b5');
assertEqual(firebaseJson.firestore.rules, 'firestore.rules', 'Firebase config includes Firestore rules path');
assertEqual(firebaseJson.hosting.site, 'cardfit-ee4b5', 'Firebase Hosting site is explicit');
assertEqual(firebaseJson.hosting.public, 'dist', 'Firebase Hosting serves dist');
assert.ok(firebaseJson.hosting.rewrites.some((item) => item.source === '**' && item.destination === '/index.html'), 'Firebase Hosting rewrites SPA routes to index.html');
assert.ok(
  firebaseJson.hosting.headers.some((item) => item.source === '/sw.js' && item.headers.some((header) => header.key === 'Cache-Control' && header.value.includes('no-cache'))),
  'Firebase Hosting keeps service worker uncached'
);
assert.ok(
  firebaseJson.hosting.headers.some((item) => item.source === '/assets/**' && item.headers.some((header) => header.key === 'Cache-Control' && header.value.includes('immutable'))),
  'Firebase Hosting caches hashed assets immutably'
);
assert.ok(packageJson.scripts['build:hosting']?.includes('tools/prepare-hosting-build.mjs'), 'build:hosting prepares copied card images');
assert.ok(packageJson.scripts['deploy:hosting']?.includes('firebase deploy --only hosting'), 'deploy:hosting targets Firebase Hosting only');
assert.ok(hostingBuildSource.includes("join(root, 'image', 'clean')"), 'hosting build copies normalized card images');
assert.ok(firebaseHostingWorkflow.includes('FirebaseExtended/action-hosting-deploy@v0'), 'Firebase Hosting workflow uses official deploy action');
assert.ok(firebaseHostingWorkflow.includes('FIREBASE_SERVICE_ACCOUNT_CARDFIT_EE4B5'), 'Firebase Hosting workflow expects scoped service account secret');
assert.ok(firebaseHostingWorkflow.includes('npm run audit:check'), 'Firebase Hosting workflow runs audit before deploy');
assert.ok(firebaseHostingWorkflow.includes('npm run build:hosting'), 'Firebase Hosting workflow builds hosting target');
assert.ok(mainSource.includes('Firebase Hosting 주소를 브라우저에서 열어 사용합니다.'), 'settings storage guide references Firebase Hosting');
assert.ok(githubPagesWorkflow.includes('workflow_dispatch:'), 'GitHub Pages workflow remains available manually');
assert.ok(!githubPagesWorkflow.includes('push:'), 'GitHub Pages workflow does not auto-deploy on push');
console.log('ok - Firebase Hosting migration settings are preserved');

console.log('audit-check passed');
