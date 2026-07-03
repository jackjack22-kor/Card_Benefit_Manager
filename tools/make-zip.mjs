import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const out = resolve(root, '..', 'card-benefit-manager-codex.zip');
execFileSync('zip', ['-r', out, '.', '-x', 'node_modules/*', 'dist/*'], { cwd: root, stdio: 'inherit' });
console.log(out);
