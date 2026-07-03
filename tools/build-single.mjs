import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, 'dist');
const indexPath = join(distDir, 'index.html');
const outputPath = join(distDir, 'card-benefit-manager.html');

function findAsset(html, pattern, label) {
  const match = html.match(pattern);
  if (!match?.[1]) {
    throw new Error(`Could not find ${label} asset in dist/index.html`);
  }
  return match[1].replace(/^\//, '');
}

function escapeInlineScript(source) {
  return source.replaceAll('</script', '<\\/script');
}

function escapeInlineStyle(source) {
  return source.replaceAll('</style', '<\\/style');
}

await mkdir(distDir, { recursive: true });

const html = await readFile(indexPath, 'utf8');
const cssAsset = findAsset(html, /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/, 'CSS');
const jsAsset = findAsset(html, /<script[^>]+type="module"[^>]+src="([^"]+)"[^>]*><\/script>/, 'JavaScript');

const css = await readFile(join(distDir, cssAsset), 'utf8');
const js = await readFile(join(distDir, jsAsset), 'utf8');

let single = html
  .replace(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/, `<style>\n${escapeInlineStyle(css)}\n</style>`)
  .replace(/<script[^>]+type="module"[^>]+src="([^"]+)"[^>]*><\/script>/, `<script type="module">\n${escapeInlineScript(js)}\n</script>`);

single = single.replace(
  '</head>',
  `  <meta name="x-build-target" content="single-html-local-app">\n  <meta name="x-offline-note" content="All app CSS and JavaScript are inlined. User data is stored in this browser localStorage.">\n</head>`
);

if (/src="\/?assets\//.test(single) || /href="\/?assets\//.test(single)) {
  throw new Error('Single HTML still references dist assets.');
}

await writeFile(outputPath, single, 'utf8');
console.log(`Created ${outputPath}`);
