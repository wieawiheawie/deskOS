import { spawnSync } from 'node:child_process';
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const dist = resolve(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// Compile the TypeScript desktop runtime into browser-ready JavaScript.
const tsc = resolve(root, 'node_modules/typescript/bin/tsc');
if (!existsSync(tsc)) throw new Error('TypeScript is missing. Run npm install first.');
const compile = spawnSync(process.execPath, [tsc, '--project', 'tsconfig.json', '--noEmit', 'false', '--outDir', 'dist', '--rootDir', 'src', '--declaration', 'false', '--sourceMap', 'false'], { cwd: root, stdio: 'inherit' });
if (compile.status !== 0) process.exit(compile.status ?? 1);

// Assemble a static PWA folder. No local development server is required.
const html = readFileSync(resolve(root, 'index.html'), 'utf8')
  .replace('./src/main.ts', './main.js');
writeFileSync(resolve(dist, 'index.html'), html);
copyFileSync(resolve(root, 'src/style.css'), resolve(dist, 'style.css'));
copyFileSync(resolve(root, 'manifest.webmanifest'), resolve(dist, 'manifest.webmanifest'));
cpSync(resolve(root, 'public'), dist, { recursive: true });
writeFileSync(resolve(dist, '.nojekyll'), '');
console.log('DeskOS built successfully into dist/.');
