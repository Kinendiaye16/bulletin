// Sauvegardes de la base : une copie par jour dans le dossier « sauvegardes », les 30 dernières sont gardées.
import { mkdirSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { db, dbPath } from './db.js';

export const BACKUP_DIR = path.join(path.dirname(dbPath), 'sauvegardes');
const KEEP = 30;
const day = (d = new Date()) => d.toISOString().slice(0, 10);

/** Copie cohérente de la base (même pendant son utilisation) vers le fichier indiqué. */
export function backupTo(file) {
  rmSync(file, { force: true });
  db.prepare('VACUUM INTO ?').run(file);
  return file;
}

export function listBackups() {
  if (!existsSync(BACKUP_DIR)) return [];
  return readdirSync(BACKUP_DIR)
    .filter((f) => /^ndamely-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .map((name) => {
      const st = statSync(path.join(BACKUP_DIR, name));
      return { name, size: st.size, date: st.mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

/** Sauvegarde du jour si elle n'existe pas encore, puis suppression des plus anciennes. */
export function dailyBackup() {
  if (dbPath === ':memory:') return null;
  mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `ndamely-${day()}.db`);
  if (!existsSync(file)) backupTo(file);
  for (const old of listBackups().slice(KEEP)) rmSync(path.join(BACKUP_DIR, old.name), { force: true });
  return file;
}

/** Sauvegarde au démarrage, puis toutes les 6 heures (une seule par jour est conservée). */
export function scheduleBackups() {
  const run = () => {
    try {
      dailyBackup();
    } catch (e) {
      console.error('Sauvegarde impossible :', e.message);
    }
  };
  run();
  setInterval(run, 6 * 3600 * 1000).unref();
}

// Cartes réseau virtuelles (machines virtuelles, WSL, Docker…) : leurs adresses ne servent pas au Wi-Fi de l'école.
const VIRTUAL = /vmware|virtualbox|vbox|vethernet|hyper-v|wsl|docker|loopback|bluetooth|tailscale|zerotier|vpn/i;

/** Adresses IPv4 de l'ordinateur sur le réseau local (Wi-Fi, câble), cartes virtuelles exclues. */
export function localAddresses() {
  return Object.entries(networkInterfaces())
    .filter(([name]) => !VIRTUAL.test(name))
    .flatMap(([, list]) => list ?? [])
    .filter((i) => i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'))
    .map((i) => i.address);
}
