// Fabrique le paquet d'installation Windows de Ndamely : dist/Ndamely-<version>/ et son .zip.
// Le paquet contient Node.js (celui qui exécute ce script), l'application et les scripts d'installation.
// Utilisation :  npm run build:windows
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const name = `Ndamely-${pkg.version}`;
const out = path.join(ROOT, 'dist', name);

if (process.platform !== 'win32') {
  console.error('Ce paquet embarque node.exe : lancez ce script sous Windows.');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, 'app'), { recursive: true });
mkdirSync(path.join(out, 'node'), { recursive: true });

// 1. Application (sans les données ni les outils de développement)
for (const dir of ['server', 'public', 'shared']) cpSync(path.join(ROOT, dir), path.join(out, 'app', dir), { recursive: true });
rmSync(path.join(out, 'app', 'server', 'seed.js'), { force: true }); // données de démonstration : pas dans l'école
writeFileSync(path.join(out, 'app', 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, type: 'module', private: true }, null, 2));

// 2. Node.js : le même que celui qui exécute ce script
copyFileSync(process.execPath, path.join(out, 'node', 'node.exe'));
console.log(`Node.js ${process.version} inclus.`);

// 3. Scripts d'installation. Windows PowerShell 5.1 lit les .ps1 en UTF-8 seulement avec une signature (BOM).
const BOM = '﻿';
const src = path.join(ROOT, 'installer', 'windows');
for (const f of readdirSync(src)) {
  const from = path.join(src, f);
  const to = path.join(out, f);
  if (f.endsWith('.ps1')) writeFileSync(to, BOM + readFileSync(from, 'utf8').replace(/^﻿/, '').replace(/\r?\n/g, '\r\n'));
  else if (f.endsWith('.cmd') || f.endsWith('.txt')) writeFileSync(to, readFileSync(from, 'utf8').replace(/\r?\n/g, '\r\n'));
  else copyFileSync(from, to);
}

// 4. Archive .zip à copier sur une clé USB
const zip = path.join(ROOT, 'dist', `${name}-windows.zip`);
rmSync(zip, { force: true });
execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${out}' -DestinationPath '${zip}' -CompressionLevel Optimal`], { stdio: 'inherit' });
console.log(`Paquet prêt : ${path.relative(ROOT, out)}`);
console.log(`Archive    : ${path.relative(ROOT, zip)} (${(statSync(zip).size / 1048576).toFixed(1)} Mo)`);
