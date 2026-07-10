import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, 'dist');

await mkdir(join(distDir, 'image'), { recursive: true });
await cp(join(root, 'image', 'clean'), join(distDir, 'image', 'clean'), { recursive: true, force: true });
await cp(join(root, 'image', 'public-catalog'), join(distDir, 'image', 'public-catalog'), { recursive: true, force: true });

console.log('Prepared Firebase Hosting build assets');
