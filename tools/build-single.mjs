import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, 'dist');
const indexPath = join(distDir, 'index.html');
const outputPath = join(distDir, 'card-benefit-manager.html');

function findAssetTag(html, tagPattern, attrName, label) {
  const tag = html.match(tagPattern)?.[0] || '';
  const match = tag.match(new RegExp(`${attrName}="([^"]+)"`));
  if (!match?.[1]) {
    throw new Error(`Could not find ${label} asset in dist/index.html`);
  }
  return { tag, asset: match[1].replace(/^\//, '') };
}

function escapeInlineScript(source) {
  return source.replaceAll('</script', '<\\/script');
}

function escapeInlineStyle(source) {
  return source.replaceAll('</style', '<\\/style');
}

function rewriteInlinedDynamicImports(source) {
  return source.replace(/import\("\.\/([^"]+\.js)"\)/g, 'import("./assets/$1")');
}

await mkdir(distDir, { recursive: true });
await cp(join(root, 'image', 'clean'), join(distDir, 'image', 'clean'), { recursive: true, force: true });
await cp(join(root, 'image', 'public-catalog'), join(distDir, 'image', 'public-catalog'), { recursive: true, force: true });

const html = await readFile(indexPath, 'utf8');
const cssTagPattern = /<link\b(?=[^>]*rel="stylesheet")[^>]*>/;
const jsTagPattern = /<script\b(?=[^>]*type="module")(?=[^>]*src=")[^>]*><\/script>/;
const cssAsset = findAssetTag(html, cssTagPattern, 'href', 'CSS');
const jsAsset = findAssetTag(html, jsTagPattern, 'src', 'JavaScript');

const css = await readFile(join(distDir, cssAsset.asset), 'utf8');
const js = rewriteInlinedDynamicImports(await readFile(join(distDir, jsAsset.asset), 'utf8'));

let single = html
  .replace(cssAsset.tag, () => `<style>\n${escapeInlineStyle(css)}\n</style>`)
  .replace(jsAsset.tag, () => `<script type="module">\n${escapeInlineScript(js)}\n</script>`);

single = single.replace(
  '</head>',
  `  <meta name="x-build-target" content="single-html-local-app">\n  <meta name="x-offline-note" content="All app CSS and JavaScript are inlined. User data is stored in this browser localStorage.">\n</head>`
);

if (/src="\/?assets\//.test(single) || /href="\/?assets\//.test(single)) {
  throw new Error('Single HTML still references dist assets.');
}

await writeFile(outputPath, single, 'utf8');
console.log(`Created ${outputPath}`);
