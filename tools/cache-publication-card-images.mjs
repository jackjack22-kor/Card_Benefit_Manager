import { mkdir, writeFile } from 'node:fs/promises';
import { PUBLIC_CARD_PUBLICATION_CATALOG } from '../src/data/publicCardCatalogIndex.js';

const OUTPUT_DIRECTORY = new URL('../image/public-catalog/', import.meta.url);
const MANIFEST_URL = new URL('../src/data/publicCardPublicationImages.js', import.meta.url);
const CONCURRENCY = 8;

function extensionFor(contentType, sourceUrl) {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  const match = String(sourceUrl || '').match(/\.(png|webp|jpe?g)(?:\?|$)/i);
  return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
}

async function fetchImage(card) {
  const sourceUrl = card.localImage ? new URL(`../${card.localImage}`, import.meta.url) : card.imageUrl;
  if (!sourceUrl) return null;
  if (sourceUrl instanceof URL && sourceUrl.protocol === 'file:') return { cardId: card.id, path: card.localImage };

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    const extension = extensionFor(contentType, sourceUrl);
    const filename = `${card.id}.${extension}`;
    await writeFile(new URL(filename, OUTPUT_DIRECTORY), Buffer.from(await response.arrayBuffer()));
    return { cardId: card.id, path: `image/public-catalog/${filename}` };
  } catch (error) {
    console.warn(`warn - image fetch failed: ${card.id} ${card.name} (${error.message})`);
    return null;
  }
}

function renderManifest(records) {
  const manifest = Object.fromEntries(records.map((record) => [record.cardId, record.path]));
  return `export const PUBLIC_CARD_PUBLICATION_IMAGES = ${JSON.stringify(manifest, null, 2)};\n`;
}

const creditCards = PUBLIC_CARD_PUBLICATION_CATALOG.filter((card) => card.productType === 'credit');
const results = [];
let cursor = 0;

await mkdir(OUTPUT_DIRECTORY, { recursive: true });

async function worker() {
  while (cursor < creditCards.length) {
    const card = creditCards[cursor];
    cursor += 1;
    const result = await fetchImage(card);
    if (result) results.push(result);
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, creditCards.length) }, () => worker()));
results.sort((left, right) => left.cardId.localeCompare(right.cardId));
await writeFile(MANIFEST_URL, renderManifest(results));

console.log(`Cached publication credit-card images: ${results.length}/${creditCards.length}`);
