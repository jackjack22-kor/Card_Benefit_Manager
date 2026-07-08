import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS } from '../src/data/cards.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, 'dist');
const assetsDir = join(distDir, 'assets');
const imageDir = join(distDir, 'image', 'clean');

function distFile(relativePath) {
  return join(distDir, relativePath);
}

function readDist(relativePath) {
  return readFileSync(distFile(relativePath), 'utf8');
}

assert.ok(existsSync(distDir), 'dist must exist; run npm run build:public first');
assert.ok(existsSync(distFile('index.html')), 'dist/index.html must exist');
assert.equal(readDist('_redirects'), '/* /index.html 200\n', 'Cloudflare redirects must keep SPA fallback');

const headers = readDist('_headers');
for (const requiredHeader of [
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy: strict-origin-when-cross-origin',
  'Permissions-Policy: camera=(), microphone=(), geolocation=()',
  '/assets/*',
  'Cache-Control: public, max-age=31536000, immutable',
  '/image/*',
  'Cache-Control: public, max-age=604800'
]) {
  assert.ok(headers.includes(requiredHeader), `missing Cloudflare header rule: ${requiredHeader}`);
}

assert.ok(existsSync(assetsDir), 'dist/assets must exist');
const assets = readdirSync(assetsDir);
const jsAssets = assets.filter((name) => name.endsWith('.js'));
assert.ok(jsAssets.length > 0, 'public dist must include a JS bundle');
assert.ok(assets.some((name) => name.endsWith('.css')), 'public dist must include a CSS bundle');
assert.equal(assets.some((name) => /^syncManager-.*\.js$/.test(name)), false, 'public dist must not emit a syncManager chunk');

const jsText = jsAssets
  .map((name) => readFileSync(join(assetsDir, name), 'utf8'))
  .join('\n');
assert.ok(jsText.includes('cardfit.public.v1'), 'public bundle must include the public storage key');
assert.ok(!jsText.includes('syncManager'), 'public bundle must not reference syncManager');
assert.ok(!jsText.includes('./syncManager.js'), 'public bundle must not dynamically import syncManager');
assert.ok(jsText.includes('JSON'), 'public bundle must keep JSON backup guidance');

assert.ok(existsSync(imageDir), 'dist/image/clean must exist');
const distImages = new Set(readdirSync(imageDir));
for (const card of CARDS) {
  const fileName = card.image.split('/').pop();
  assert.ok(distImages.has(fileName), `public dist must include card image: ${card.id}`);
}

console.log(`ok - public dist verified: ${jsAssets.length} JS bundle(s), ${CARDS.length} card images`);
