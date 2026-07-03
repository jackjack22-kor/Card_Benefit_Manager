import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(rootDir, 'dist');
const singleHtmlPath = join(distDir, 'card-benefit-manager.html');
const pagesIndexPath = join(distDir, 'index.html');

await mkdir(distDir, { recursive: true });
await copyFile(singleHtmlPath, pagesIndexPath);

console.log('Created dist/index.html for GitHub Pages.');
