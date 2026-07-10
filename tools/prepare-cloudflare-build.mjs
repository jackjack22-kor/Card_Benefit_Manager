import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, 'dist');

await mkdir(join(distDir, 'image'), { recursive: true });
await cp(join(root, 'image', 'clean'), join(distDir, 'image', 'clean'), { recursive: true, force: true });
await cp(join(root, 'image', 'public-catalog'), join(distDir, 'image', 'public-catalog'), { recursive: true, force: true });

await writeFile(join(distDir, '_redirects'), '/* /index.html 200\n');
await writeFile(join(distDir, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
  '',
  '/assets/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
  '/image/*',
  '  Cache-Control: public, max-age=604800',
  ''
].join('\n'));

console.log('Prepared Cloudflare Pages build assets');
