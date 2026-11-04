import { subjectAverage, appreciation, rankLabel, computeRanks, round2 } from '/shared/calc.js';
import { readXlsx } from '/xlsx.js';

// =============================================================== utilitaires

class Raw {
  constructor(s) { this.s = s; }
}
const raw = (s) => new Raw(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function piece(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(piece).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
}
/** Gabarit HTML : les valeurs interpolées sont échappées, sauf celles produites par html``/raw(). */
function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += piece(v) + strings[i + 1]; });
  return raw(out);
}
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmt = (n) => (n === null || n === undefined ? '–' : Number(n).toFixed(2).replace('.', ','));
const fmtNum = (n) => String(n).replace('.', ',');
const formData = (form) => Object.fromEntries(new FormData(form));
const today = () => new Date().toLocaleDateString('fr-FR');

// Icônes au trait (24×24), dessinées en ligne pour rester utilisables hors connexion.
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  classes: '<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/>',
  notes: '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
  subjects: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  team: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  school: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
  students: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  teacher: '<path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  evaluations: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  plusCircle: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  circle: '<circle cx="12" cy="12" r="10"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  quote: '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  pin: '<path d="M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
  printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  tick: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  open: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M8 17v-4"/><path d="M13 17V9"/><path d="M18 17v-7"/>',
  checkFill: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="m8.5 12 2.5 2.5 4.5-5" stroke="#fff" stroke-width="2.2"/>',
};
const icon = (name, cls = '') => raw(`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`);
/** Initiales d'un nom : « Aminat Ndiaye » → « AN ». */
const initials = (name) => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

function toast(message, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3000);
}

class ApiError extends Error {
  constructor(message, status, network = false) {
    super(message);
    this.status = status;
    this.network = network;
  }
}

async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('Connexion au serveur impossible. Vérifiez votre réseau.', 0, true);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/auth/')) {
    state.me = null;
    go('#/connexion');
  }
  if (!res.ok) throw new ApiError(data.error || 'Une erreur est survenue.', res.status);
  return data;
}

// Branche un formulaire : désactive le bouton pendant l'envoi et affiche l'erreur.
function bindForm(form, onSubmit) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit], button:not([type])');
    const err = form.querySelector('.form-error');
    if (err) err.hidden = true;
    if (btn) btn.disabled = true;
    try {
      await onSubmit(formData(form), form);
    } catch (ex) {
      if (err) {
        err.textContent = ex.message;
        err.hidden = false;
      } else toast(ex.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

function openDialog({ title, body, submitLabel = 'Enregistrer', onSubmit }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'dialog';
  dlg.innerHTML = html`<form>
    <h2>${title}</h2>
    ${body}
    <p class="form-error" hidden></p>
    <div class="actions">
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <button type="submit" class="btn primary">${submitLabel}</button>
    </div>
  </form>`.s;
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  $('[data-close]', dlg).onclick = () => dlg.close();
  bindForm($('form', dlg), async (data, form) => {
    await onSubmit(data, form);
    dlg.close();
  });
  dlg.showModal();
  return dlg;
}

function field(label, name, { type = 'text', value = '', required = false, placeholder = '', inputmode, min, max, step, autocomplete } = {}) {
  return html`<label class="field"><span>${label}${required ? ' *' : ''}</span>
    <input type="${type}" name="${name}" value="${value ?? ''}" placeholder="${placeholder}"
      ${raw(required ? 'required' : '')} ${raw(inputmode ? `inputmode="${esc(inputmode)}"` : '')}
      ${raw(min !== undefined ? `min="${esc(min)}"` : '')} ${raw(max !== undefined ? `max="${esc(max)}"` : '')}
      ${raw(step !== undefined ? `step="${esc(step)}"` : '')} ${raw(autocomplete ? `autocomplete="${esc(autocomplete)}"` : '')}></label>`;
}

function selectField(label, name, options, selected = '', { required = false } = {}) {
  return html`<label class="field"><span>${label}${required ? ' *' : ''}</span>
    <select name="${name}" ${raw(required ? 'required' : '')}>${options.map(([v, l]) =>
      html`<option value="${v}" ${raw(String(v) === String(selected ?? '') ? 'selected' : '')}>${l}</option>`)}</select></label>`;
}

const teacherOptions = (users, empty = '— Aucun —') => [['', empty], ...users.map((u) => [u.id, u.name])];

// =============================================================== état global

const state = {
  me: null,
  periodId: Number(safeGet('bulletin.period')) || null,
};

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* stockage indisponible */ }
}

async function loadMe() {
  state.me = await api('GET', '/api/me');
  const periods = currentYear()?.periods ?? [];
  if (!periods.some((p) => p.id === state.periodId)) state.periodId = periods[0]?.id ?? null;
}
const isAdmin = () => state.me?.user.role === 'admin';
const currentYear = () => state.me?.years.find((y) => y.id === state.me.activeYearId);
function periodFor(periods, requested) {
  return periods.find((p) => p.id === Number(requested)) || periods.find((p) => p.id === state.periodId) || periods[0];
}

// =============================================================== saisie hors ligne

// File d'attente des envois de notes : { key, url, body, ... } ; une nouvelle saisie remplace celle de même clé.
const QUEUE_KEY = 'bulletin.queue';
function readQueue() {
  try {
    return (JSON.parse(localStorage.getItem(QUEUE_KEY)) || []).map((q) => (q.url ? q : {
      ...q, key: `eval:${q.evaluationId}`, url: `/api/evaluations/${q.evaluationId}/grades`, body: { grades: q.grades },
    }));
  } catch { return []; }
}
function writeQueue(queue) {
  safeSet(QUEUE_KEY, JSON.stringify(queue));
  updateSync();
}

// Envoie un PUT ; sans réseau, le garde sur l'appareil pour l'envoyer plus tard.
async function putOrQueue(key, url, body, extra = {}) {
  try {
    await api('PUT', url, body);
    return 'saved';
  } catch (e) {
    if (!e.network) throw e;
    writeQueue([...readQueue().filter((q) => q.key !== key), { key, url, body, ...extra, at: Date.now() }]);
    return 'queued';
  }
}

const saveGrades = (evaluationId, grades) =>
  putOrQueue(`eval:${evaluationId}`, `/api/evaluations/${evaluationId}/grades`, { grades }, { evaluationId, grades });

async function flushQueue() {
  const queue = readQueue();
  if (!queue.length || !navigator.onLine) return;
  const remaining = [];
  for (const item of queue) {
    try {
      await api('PUT', item.url, item.body);
    } catch (e) {
      if (e.network) remaining.push(item);
      else toast(`Des notes saisies hors ligne n'ont pas pu être enregistrées : ${e.message}`, 'error');
    }
  }
  writeQueue(remaining);
  if (remaining.length < queue.length) toast('Les notes saisies hors ligne ont été synchronisées.');
}

function updateSync() {
  const el = $('#sync');
  if (!el) return;
  const pending = readQueue().length;
  el.className = `sync ${!navigator.onLine ? 'offline' : pending ? 'pending' : ''}`;
  el.textContent = !navigator.onLine
    ? `Hors ligne${pending ? ` · ${pending} saisie(s) en attente` : ''}`
    : pending ? `${pending} saisie(s) à synchroniser` : 'En ligne';
}

window.addEventListener('online', () => { updateSync(); flushQueue(); });
window.addEventListener('offline', updateSync);

// =============================================================== routeur

const routes = [
  [/^#\/connexion$/, viewLogin, { public: true }],
  [/^#\/inscription$/, viewRegister, { public: true }],
  [/^#\/$/, viewDashboard, { title: 'Tableau de bord', nav: '#/' }],
  [/^#\/classes$/, viewClasses, { title: 'Classes', nav: '#/classes' }],
  [/^#\/classes\/(\d+)$/, viewClass, { title: 'Classe', nav: '#/classes' }],
  [/^#\/notes$/, viewNotesIndex, { title: 'Saisie des notes', nav: '#/notes' }],
  [/^#\/notes\/(\d+)$/, viewGradeEntry, { title: 'Saisie des notes', nav: '#/notes' }],
  [/^#\/composition\/(\d+)$/, viewComposition, { title: 'Composition', nav: '#/notes' }],
  [/^#\/resultats\/(\d+)$/, viewResults, { title: 'Résultats', nav: '#/classes' }],
  [/^#\/bulletins\/(\d+)$/, viewBulletins, { bare: true }],
  [/^#\/matieres$/, viewSubjects, { title: 'Matières', nav: '#/matieres', admin: true }],
  [/^#\/enseignants$/, viewTeachers, { title: 'Équipe', nav: '#/enseignants', admin: true }],
  [/^#\/etablissement$/, viewSchool, { title: 'Établissement', nav: '#/etablissement', admin: true }],
];

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

let leaveGuard = null; // fonction renvoyant true s'il reste des modifications non enregistrées

async function render() {
  const [path, qs] = (location.hash || '#/').split('?');
  const query = new URLSearchParams(qs || '');
  const found = routes.map(([re, fn, opts]) => ({ m: path.match(re), fn, opts })).find((r) => r.m);
  if (!found) return go('#/');
  const { m, fn, opts } = found;
  leaveGuard = null;

  if (!opts.public && !state.me) {
    try {
      await loadMe();
    } catch {
      return go('#/connexion');
    }
  }
  if (opts.public && state.me) return go('#/');
  if (opts.admin && !isAdmin()) return go('#/');

  const root = $('#root');
  let view;
  if (opts.public) {
    root.innerHTML = '<div class="auth" id="view"></div>';
    view = $('#view');
  } else if (opts.bare) {
    root.innerHTML = '<div id="view"></div>';
    view = $('#view');
  } else {
    root.innerHTML = shell(opts).s;
    bindShell();
    view = $('#view');
  }
  view.innerHTML = '<p class="muted">Chargement…</p>';
  try {
    await fn(view, m.slice(1), query);
  } catch (e) {
    if (e.status === 401) return;
    view.innerHTML = html`<div class="alert error">${e.message}</div>`.s;
  }
  window.scrollTo(0, 0);
}

function shell(opts) {
  const { user, school } = state.me;
  const year = currentYear();
  const admin = isAdmin();
  const links = [
    ['#/', 'Tableau de bord', 'dashboard'],
    ...(admin ? [
      ['#/etablissement', 'Établissement', 'school'],
      ['#/enseignants', 'Équipe', 'team'],
    ] : []),
    ['#/classes', 'Classes', 'classes'],
    ...(admin ? [['#/matieres', 'Matières', 'subjects']] : []),
    ['#/notes', 'Saisie des notes', 'notes'],
  ];
  return html`<div class="app ${opts.nav === '#/' ? 'on-dashboard' : ''}">
    <aside class="sidebar">
      <a class="brand" href="#/"><span class="brand-logo"><img src="/icon.svg" alt=""></span><span>Ndamely<small title="${school.name}">${school.name}</small></span></a>
      <nav class="nav">${links.map(([href, label, ic]) => html`<a href="${href}" class="${opts.nav === href ? 'active' : ''}">${icon(ic)}<span>${label}</span></a>`)}</nav>
      <div class="me">
        <span class="avatar">${initials(user.name)}</span>
        <span class="me-text"><strong>${user.name}</strong><span>${user.role === 'admin' ? 'Administrateur' : 'Enseignant'}</span></span>
        <button class="icon-btn" id="logout" title="Se déconnecter" aria-label="Se déconnecter">${icon('logout')}</button>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn menu-btn" id="menu" aria-label="Menu">${icon('menu')}</button>
        <nav class="crumbs grow" aria-label="Fil d'Ariane"><a href="#/">Accueil</a>${icon('chevron')}<strong>${opts.title}</strong></nav>
        ${year ? html`<div class="period-picker"><span>${year.label}</span>
          <select id="period" data-period aria-label="Période">${year.periods.map((p) =>
            html`<option value="${p.id}" ${raw(p.id === state.periodId ? 'selected' : '')}>${p.name}</option>`)}</select></div>` : ''}
        <span id="sync" class="sync"></span>
      </header>
      <main id="view"></main>
    </div>
  </div>`;
}

/** Les sélecteurs de période (barre du haut, bandeau du tableau de bord) rechargent la page sur la période choisie. */
function bindPeriodSelects(root) {
  $$('select[data-period]', root).forEach((sel) => sel.addEventListener('change', (e) => {
    state.periodId = Number(e.target.value);
    safeSet('bulletin.period', state.periodId);
    const [path] = location.hash.split('?');
    go(path);
  }));
}

function bindShell() {
  $('#logout').onclick = async () => {
    await api('POST', '/api/auth/logout').catch(() => {});
    state.me = null;
    go('#/connexion');
  };
  $('#menu').onclick = () => $('.app').classList.toggle('menu-open');
  bindPeriodSelects(document);
  updateSync();
}

window.addEventListener('hashchange', render);
window.addEventListener('beforeunload', (e) => {
  if (leaveGuard?.()) e.preventDefault();
});

// =============================================================== connexion et inscription

async function viewLogin(view) {
  view.innerHTML = html`<div class="card">
    <div class="brand"><img src="/icon.svg" alt=""><span>Ndamely</span></div>
    <p class="muted center">Notes, moyennes et bulletins de votre établissement.</p>
    <form class="stack" id="f">
      ${field('Adresse e-mail', 'email', { type: 'email', required: true, autocomplete: 'username' })}
      ${field('Mot de passe', 'password', { type: 'password', required: true, autocomplete: 'current-password' })}
      <p class="form-error" hidden></p>
      <button class="btn primary" type="submit">Se connecter</button>
    </form>
    <p class="center small" style="margin-top:16px">Nouvel établissement ? <a href="#/inscription">Créer un compte</a></p>
  </div>`.s;
  bindForm($('#f'), async (data) => {
    await api('POST', '/api/auth/login', data);
    await loadMe();
    go('#/');
  });
}

async function viewRegister(view) {
  view.innerHTML = html`<div class="card">
    <div class="brand"><img src="/icon.svg" alt=""><span>Créer votre établissement</span></div>
    <form class="stack" id="f">
      <h3>L'établissement</h3>
      ${field("Nom de l'établissement", 'schoolName', { required: true, placeholder: 'Ex. : École élémentaire Les Pionniers' })}
      <div class="form-grid">
        ${field('Nom du directeur / de la directrice', 'directorName', { required: true, autocomplete: 'off' })}
        ${field('Ville', 'city', { placeholder: 'Ex. : Thiès' })}
        ${selectField("Type d'établissement", 'schoolType', [['primaire', 'École élémentaire (CI – CM2)'], ['secondaire', 'Collège et lycée'], ['mixte', 'Élémentaire, collège et lycée']])}
        ${selectField('Statut', 'status', [['prive', 'Privé'], ['public', 'Public']])}
        ${selectField("Découpage de l'année", 'periodType', [['semestre', 'Semestres'], ['trimestre', 'Trimestres']])}
      </div>
      <h3>Compte administrateur</h3>
      <p class="small muted" style="margin:-4px 0 0">L'administrateur gère l'établissement : classes, enseignants, élèves et bulletins.
        Ce peut être le directeur ou le secrétaire de l'école. Chaque enseignant recevra ensuite son propre accès.</p>
      ${field("Prénom et nom de l'administrateur", 'name', { required: true, autocomplete: 'name' })}
      <div class="form-grid">
        ${field('Adresse e-mail (identifiant)', 'email', { type: 'email', required: true, autocomplete: 'username' })}
        ${field('Téléphone', 'phone', { type: 'tel', inputmode: 'tel' })}
      </div>
      ${field('Mot de passe (8 caractères minimum)', 'password', { type: 'password', required: true, autocomplete: 'new-password' })}
      <p class="form-error" hidden></p>
      <button class="btn primary" type="submit">Créer mon établissement</button>
    </form>
    <p class="center small" style="margin-top:16px">Déjà inscrit ? <a href="#/connexion">Se connecter</a></p>
  </div>`.s;
  bindForm($('#f'), async (data) => {
    await api('POST', '/api/auth/register', data);
    await loadMe();
    go('#/');
  });
}

// =============================================================== tableau de bord

const isPrimarySchool = () => state.me.school.school_type === 'primaire';
const hasPrimary = () => state.me.school.school_type !== 'secondaire';

async function viewDashboard(view) {
  const [dash, mySubjects] = await Promise.all([api('GET', '/api/dashboard'), api('GET', '/api/my-subjects')]);
  const { user } = state.me;
  const period = state.periodId;
  const steps = isPrimarySchool()
    ? [
      ['school', "Compléter les informations de l'école", '#/etablissement'],
      ['classes', 'Créer les classes (CI A, CI B, CP A…)', '#/classes'],
      ['teachers', 'Ajouter les enseignants et leur classe', '#/enseignants'],
      ['students', "Inscrire ou importer les élèves de chaque classe", '#/classes'],
      ['grades', 'Saisir la première composition', '#/notes'],
    ]
    : [
      ['school', "Compléter les informations de l'établissement", '#/etablissement'],
      ['teachers', 'Ajouter les enseignants', '#/enseignants'],
      ['classes', 'Créer les classes', '#/classes'],
      ['subjects', 'Définir les matières et coefficients des classes', '#/classes'],
      ['students', 'Inscrire ou importer les élèves', '#/classes'],
      ['grades', 'Saisir les premières notes', '#/notes'],
    ];
  const showChecklist = isAdmin() && steps.some(([k]) => !dash.checklist?.[k]);
  // Classes dont l'enseignant est le maître (élémentaire) : il y saisit les compositions.
  const myPrimary = isAdmin() ? [] : dash.classes.filter((c) => c.cycle === 'primaire' && c.main_teacher_id === user.id);
  const otherSubjects = mySubjects.filter((s) => !myPrimary.some((c) => c.id === s.class_id));
  const canBulletins = (c) => isAdmin() || c.main_teacher_id === user.id;

  const year = currentYear();
  const periodName = year?.periods.find((p) => p.id === period)?.name;
  const doneCount = steps.filter(([k]) => dash.checklist?.[k]).length;
  const pct = Math.round((doneCount * 100) / steps.length);
  const nextStep = steps.find(([k]) => !dash.checklist?.[k])?.[0];
  const cta = myPrimary.length === 1
    ? ['Saisir une composition', `#/composition/${myPrimary[0].id}`]
    : [isPrimarySchool() ? 'Saisir une composition' : 'Saisir des notes', '#/notes'];
  return renderDashboard(view, { dash, user, period, year, periodName, steps, showChecklist, doneCount, pct, nextStep, cta, myPrimary, otherSubjects, canBulletins });
}

// Libellés courts des étapes (« Mise en route »).
const STEP_SHORT = {
  school: "Informations de l'école",
  classes: 'Création des classes',
  teachers: 'Enseignants et leur classe',
  subjects: 'Matières et coefficients',
  students: 'Inscription des élèves',
};

/** Phrase d'accueil du bandeau selon l'avancement. */
function dashboardMessage({ dash, steps, nextStep, periodName }) {
  if (!dash.year) return 'Aucune année scolaire active.';
  if (!nextStep || !isAdmin()) return `Voici un aperçu de l'année scolaire ${dash.year.label}${periodName ? ` · ${periodName}` : ''}.`;
  const left = steps.filter(([k]) => !dash.checklist?.[k]);
  if (left.length === 1 && nextStep === 'grades') {
    return `Votre école est presque prête. Il ne reste qu'à ${isPrimarySchool() ? 'saisir la première composition' : 'saisir les premières notes'}.`;
  }
  const label = steps.find(([k]) => k === nextStep)[1];
  return `Prochaine étape : ${label.charAt(0).toLowerCase()}${label.slice(1)}.`;
}

function renderDashboard(view, ctx) {
  const { dash, user, period, year, steps, showChecklist, doneCount, pct, nextStep, cta, myPrimary, otherSubjects, canBulletins } = ctx;
  const admin = isAdmin();
  const shownClasses = myPrimary.length ? myPrimary : dash.classes;
  const firstBulletin = shownClasses.find(canBulletins);
  const quick = admin
    ? [
      ['userPlus', 'Inscrire un élève', '#/classes'],
      ['teacher', 'Ajouter un enseignant', '#/enseignants'],
      ['classes', 'Nouvelle classe', '#/classes'],
      ['file', 'Imprimer les bulletins', firstBulletin ? `#/bulletins/${firstBulletin.id}?periode=${period}` : '#/classes'],
    ]
    : [
      ['notes', 'Saisir des notes', '#/notes'],
      ['file', 'Imprimer les bulletins', firstBulletin ? `#/bulletins/${firstBulletin.id}?periode=${period}` : '#/classes'],
    ];
  const stat = (label, value) => html`<div class="hero-stat"><span>${label}</span><strong>${value ?? 0}</strong></div>`;

  view.innerHTML = html`
    <section class="hero">
      <div class="hero-top">
        <div>
          <p class="hero-status"><span id="hero-sync">En ligne</span>${dash.year ? ` · ${dash.year.label}` : ''}</p>
          <h1>Bonjour ${user.name.split(' ')[0]}</h1>
          <p class="hero-sub">${dashboardMessage(ctx)}</p>
        </div>
        <div class="hero-actions">
          ${year ? html`<select data-period aria-label="Période">${year.periods.map((p) =>
            html`<option value="${p.id}" ${raw(p.id === period ? 'selected' : '')}>${p.name}</option>`)}</select>` : ''}
          <a class="btn hero-cta" href="${cta[1]}">${icon('plus')}${cta[0]}</a>
        </div>
      </div>
      <div class="hero-stats">
        ${stat(myPrimary.length ? 'Ma classe' : 'Classes', myPrimary.length ? myPrimary.map((c) => c.name).join(', ') : dash.counts.classes)}
        ${stat('Élèves', myPrimary.length ? myPrimary.reduce((n, c) => n + c.students, 0) : dash.counts.students)}
        ${admin ? stat('Enseignants', dash.counts.teachers) : ''}
        ${stat('Évaluations saisies', dash.counts.evaluations)}
      </div>
    </section>

    <div class="dash-grid">
      <div class="dash-main">
        <div class="card">
          <div class="card-head"><h2>${myPrimary.length ? 'Ma classe' : 'Classes'}</h2>
            <a class="link-arrow" href="#/classes">Voir toutes les classes ${icon('arrow')}</a></div>
          ${shownClasses.length ? html`${dash.classes.length > 4 && !myPrimary.length
            ? html`<label class="search" style="margin-bottom:12px">${icon('search')}<input type="search" id="class-search" placeholder="Rechercher une classe" aria-label="Rechercher une classe"></label>` : ''}
            <div class="class-list">${shownClasses.map((c) => html`<div class="class-row" data-search="${`${c.name} ${c.level} ${c.main_teacher_name ?? ''}`.toLowerCase()}">
              <a class="class-badge" href="#/classes/${c.id}">${c.name}</a>
              <div class="class-info"><a href="#/classes/${c.id}"><strong>${c.name}</strong></a>
                <span>${[c.main_teacher_name, `${c.students} élève${c.students > 1 ? 's' : ''}`, `${c.subjects} matière${c.subjects > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}</span></div>
              <div class="class-actions">
                ${c.cycle === 'primaire' && canBulletins(c) ? html`<a class="btn sm" href="#/composition/${c.id}">${icon('notes')}Composition</a>` : ''}
                <a class="btn sm" href="#/resultats/${c.id}">${icon('chart')}Résultats</a>
                ${canBulletins(c) ? html`<a class="btn sm" href="#/bulletins/${c.id}?periode=${period}">${icon('file')}Bulletins</a>` : ''}
              </div>
            </div>`)}</div>
            <p class="empty" id="no-match" hidden>Aucune classe ne correspond à cette recherche.</p>`
            : html`<p class="empty">Aucune classe pour le moment. ${admin ? html`<a href="#/classes">Créer les classes</a>` : ''}</p>`}
        </div>
        ${otherSubjects.length && !admin ? html`<div class="card"><h2>Mes matières</h2><div class="grid">
          ${otherSubjects.map((s) => html`<a class="btn" href="#/notes/${s.id}">${s.class_name} · ${s.subject_name}</a>`)}
        </div></div>` : ''}
      </div>

      <aside class="dash-side">
        ${showChecklist ? html`<div class="card">
          <div class="card-head"><h2>Mise en route</h2><span class="pill">${doneCount} / ${steps.length}</span></div>
          <div class="progress-line"><i style="width:${pct}%"></i></div>
          <ul class="todo">${steps.map(([k, label, href]) => dash.checklist[k]
            ? html`<li class="done">${icon('checkFill')}<span>${STEP_SHORT[k] ?? label}</span></li>`
            : html`<li class="${k === nextStep ? 'next' : ''}"><span class="dashed"></span><a href="${href}">${k === 'grades' ? label : STEP_SHORT[k] ?? label}</a></li>`)}</ul>
        </div>` : ''}
        <div class="card">
          <h2>Actions rapides</h2>
          <div class="quick">${quick.map(([ic, label, href]) => html`<a class="quick-tile" href="${href}">${icon(ic)}<span>${label}</span></a>`)}</div>
        </div>
      </aside>
    </div>`.s;

  bindPeriodSelects(view);
  const heroSync = $('#hero-sync', view);
  const sync = $('#sync');
  if (heroSync && sync) {
    heroSync.textContent = sync.textContent;
    heroSync.className = sync.className.replace('sync', 'dot');
  }
  $('#class-search', view)?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    let shown = 0;
    $$('[data-search]', view).forEach((row) => {
      const ok = !q || row.dataset.search.includes(q);
      row.hidden = !ok;
      shown += ok;
    });
    $('#no-match', view).hidden = shown > 0;
  });
}

// =============================================================== classes

const SUBJECT_CYCLES = [['primaire', 'Élémentaire'], ['secondaire', 'Collège et lycée'], ['tous', 'Tous les cycles']];
const CYCLES = [['moyen', 'Moyen (6e – 3e)'], ['secondaire', 'Secondaire (2nde – Tle)'], ['primaire', 'Élémentaire (CI – CM2)']];
const PRIMARY_LEVELS = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];

// Noms des classes d'un niveau : « CI » s'il n'y en a qu'une, sinon « CI A », « CI B »…
const sectionNames = (level, count) =>
  count === 1 ? [level] : Array.from({ length: count }, (_, i) => `${level} ${String.fromCharCode(65 + i)}`);

// Noms complets des niveaux, pour regrouper les classes.
const LEVEL_NAMES = {
  CI: "Cours d'initiation", CP: 'Cours préparatoire', CE1: 'Cours élémentaire 1', CE2: 'Cours élémentaire 2',
  CM1: 'Cours moyen 1', CM2: 'Cours moyen 2', '6E': 'Sixième', '5E': 'Cinquième', '4E': 'Quatrième', '3E': 'Troisième',
  '2NDE': 'Seconde', '1ERE': 'Première', '1RE': 'Première', TLE: 'Terminale',
};
const levelWord = (c) => String(c.level || c.name).trim().split(/\s+/)[0];
const levelKey = (c) => levelWord(c).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

async function viewClasses(view) {
  const [classes, users] = await Promise.all([api('GET', '/api/classes'), api('GET', '/api/users')]);
  const admin = isAdmin();
  const bulk = admin && hasPrimary();
  const teachers = users.filter((u) => u.role === 'enseignant');
  const year = currentYear();

  // Regroupement par niveau, dans l'ordre déjà trié par le serveur.
  const groups = [];
  for (const c of classes) {
    const key = levelKey(c);
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, code: levelWord(c), name: LEVEL_NAMES[key] ?? (c.level || c.name), classes: [] }));
    g.classes.push(c);
  }
  const withTeacher = classes.filter((c) => c.main_teacher_id).length;
  const withStudents = classes.filter((c) => c.students > 0).length;
  const sizes = [...new Set(groups.map((g) => g.classes.length))];
  const levelsNote = groups.length
    ? `${plural(groups.length, 'niveau')}${sizes.length === 1 ? ` · ${plural(sizes[0], 'classe')} par niveau` : ''}`
    : 'Aucune classe pour le moment';
  const scales = [...new Set(classes.map((c) => c.scale))];
  const subtitle = [
    year ? `Année scolaire ${year.label}` : '',
    { primaire: 'Élémentaire', secondaire: 'Collège et lycée', mixte: 'Élémentaire, collège et lycée' }[state.me.school.school_type],
    scales.length === 1 ? `notes sur ${scales[0]}` : '',
  ].filter(Boolean).join(' · ');
  const meter = (n, total, tone) => html`<div class="meter ${tone}"><i style="width:${total ? (n * 100) / total : 0}%"></i></div>`;
  const teacherLabel = (c) => (c.cycle === 'primaire' ? 'Maître' : 'Professeur principal');

  view.innerHTML = html`
    <div class="page-head">
      <div class="title-with-icon"><span class="title-icon">${icon('classes')}</span>
        <div><h1>Classes</h1><p class="muted">${subtitle}</p></div></div>
      ${admin ? html`<div class="row">
        ${bulk ? html`<button class="btn lg" type="button" id="bulk-open">${icon('dashboard')}Créer les classes de l'élémentaire</button>` : ''}
        <button class="btn primary lg" type="button" id="new-class">${icon('plus')}Nouvelle classe</button>
      </div>` : ''}
    </div>

    <div class="stat-cards">
      <div class="stat-card"><span class="label">Classes</span><strong>${classes.length}</strong><span class="note">${levelsNote}</span></div>
      <div class="stat-card"><span class="label">Classes avec un ${hasPrimary() && !hasSecondaryCycle() ? 'maître' : 'maître ou prof. principal'}</span>
        <strong>${withTeacher} <small>/ ${classes.length}</small></strong>${meter(withTeacher, classes.length, withTeacher === classes.length ? 'ok' : 'warn')}</div>
      <div class="stat-card"><span class="label">Classes avec des élèves</span>
        <strong>${withStudents} <small>/ ${classes.length}</small></strong>${meter(withStudents, classes.length, 'ok')}</div>
    </div>

    ${classes.length ? html`
    <div class="list-toolbar">
      <div class="seg" role="tablist">
        ${[['all', 'Toutes', classes.length], ['noteacher', hasPrimary() && !hasSecondaryCycle() ? 'Sans maître' : 'Sans titulaire', classes.length - withTeacher], ['nostudents', 'Sans élèves', classes.length - withStudents]].map(([k, label, n], i) =>
          html`<button type="button" role="tab" data-filter="${k}" class="${i === 0 ? 'on' : ''}" aria-selected="${i === 0}">${label} · ${n}</button>`)}
      </div>
      <label class="search">${icon('search')}<input type="search" id="class-search" placeholder="Rechercher une classe" aria-label="Rechercher une classe"></label>
    </div>
    <div class="level-grid">${groups.map((g) => html`<section class="card level-card">
      <header><span class="level-code">${g.code}</span><h2>${g.name}</h2><span class="muted small">${plural(g.classes.length, 'classe')}</span></header>
      ${g.classes.map((c) => html`<div class="class-item" data-class="${c.id}" data-teacher="${c.main_teacher_id ? 1 : 0}" data-students="${c.students}" data-search="${`${c.name} ${c.level} ${c.main_teacher_name ?? ''}`.toLowerCase()}">
        <div class="class-item-top"><a class="class-name" href="#/classes/${c.id}">${c.name}</a>
          <div class="row">
            <a class="btn sm" href="#/classes/${c.id}">${icon('open')}Ouvrir</a>
            <a class="btn sm" href="#/resultats/${c.id}">${icon('chart')}Résultats</a>
          </div></div>
        <div class="class-item-mid">
          ${admin ? html`<select name="main_teacher_id" class="${c.main_teacher_id ? '' : 'todo-select'}" aria-label="${teacherLabel(c)} de ${c.name}">${teacherOptions(users, '— À désigner —').map(([v, l]) =>
            html`<option value="${v}" ${raw(String(v) === String(c.main_teacher_id ?? '') ? 'selected' : '')}>${l}</option>`)}</select>`
            : html`<span>${c.main_teacher_name || html`<span class="muted">${teacherLabel(c)} à désigner</span>`}</span>`}
          ${c.students
            ? html`<span class="count">${icon('students')}${plural(c.students, 'élève')}</span>`
            : admin ? html`<a class="add-link" href="#/classes/${c.id}?onglet=eleves">${icon('plus')}Inscrire des élèves</a>` : html`<span class="muted small">Aucun élève</span>`}
        </div>
        <a class="class-item-foot" href="#/classes/${c.id}?onglet=matieres">${icon('subjects')}${plural(c.subjects, 'matière')}</a>
      </div>`)}
    </section>`)}</div>
    <p class="empty" id="no-class" hidden>Aucune classe ne correspond.</p>
    ${admin && !teachers.length ? html`<p class="small muted">Pour désigner les maîtres, ajoutez d'abord les enseignants dans <a href="#/enseignants">Équipe</a>.</p>` : ''}`
    : html`<div class="card"><p class="empty">Aucune classe pour cette année.${admin ? ` Utilisez ${bulk ? '« Créer les classes de l\'élémentaire » ou ' : ''}« Nouvelle classe » ci-dessus.` : ''}</p></div>`}`.s;

  // Filtres et recherche
  let filter = 'all';
  const apply = () => {
    const q = $('#class-search', view)?.value.trim().toLowerCase() ?? '';
    let shown = 0;
    $$('.class-item', view).forEach((el) => {
      const ok = (filter === 'all' || (filter === 'noteacher' && el.dataset.teacher === '0') || (filter === 'nostudents' && el.dataset.students === '0'))
        && (!q || el.dataset.search.includes(q));
      el.hidden = !ok;
      shown += ok;
    });
    $$('.level-card', view).forEach((card) => { card.hidden = !$$('.class-item', card).some((el) => !el.hidden); });
    const none = $('#no-class', view);
    if (none) none.hidden = shown > 0;
  };
  $$('[data-filter]', view).forEach((b) => (b.onclick = () => {
    filter = b.dataset.filter;
    $$('[data-filter]', view).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
    apply();
  }));
  $('#class-search', view)?.addEventListener('input', apply);
  if (!admin) return;

  $('#new-class', view).onclick = () => openDialog({
    title: 'Nouvelle classe',
    submitLabel: 'Créer la classe',
    body: html`<div class="form-grid">
        ${field('Nom de la classe', 'name', { required: true, placeholder: isPrimarySchool() ? 'Ex. : CE1 B' : 'Ex. : 6e A' })}
        ${field('Niveau', 'level', { placeholder: 'Ex. : 6e, CM2, Tle S2' })}
        ${selectField('Cycle', 'cycle', CYCLES, isPrimarySchool() ? 'primaire' : 'moyen')}
        ${selectField('Barème', 'scale', [['', 'Automatique (sur 10 à l\'élémentaire, sur 20 sinon)'], ['20', 'Notes sur 20'], ['10', 'Notes sur 10']])}
        ${selectField('Maître / professeur principal', 'main_teacher_id', teacherOptions(users))}
      </div>`,
    onSubmit: async (data) => {
      const { id } = await api('POST', '/api/classes', data);
      toast('Classe créée.');
      go(`#/classes/${id}?onglet=${data.cycle === 'primaire' ? 'eleves' : 'matieres'}`);
    },
  });

  if (bulk) {
    const existing = new Set(classes.map((c) => c.name));
    $('#bulk-open', view).onclick = () => {
      openDialog({
        title: "Créer les classes de l'élémentaire",
        submitLabel: 'Créer les classes',
        body: html`<p class="small muted" style="margin:0">Indiquez combien de classes vous avez à chaque niveau. Les matières de l'élémentaire sont ajoutées automatiquement à chaque classe ; les classes qui existent déjà sont ignorées.</p>
          <div class="form-grid">${PRIMARY_LEVELS.map((l) => field(`Classes de ${l}`, l, { type: 'number', value: '0', min: 0, max: 8, inputmode: 'numeric' }))}</div>
          <p class="small" id="bulk-preview"></p>`,
        onSubmit: async (data) => {
          const list = planned(data);
          if (!list.length) throw new Error('Indiquez au moins une classe.');
          const r = await api('POST', '/api/classes/bulk', { classes: list });
          toast(`${r.created} classe(s) créée(s).${r.skipped.length ? ` Déjà existantes : ${r.skipped.join(', ')}.` : ''}`);
          render();
        },
      });
      const dlg = $('dialog.dialog:last-of-type');
      const form = $('form', dlg);
      const refresh = () => {
        const list = planned(formData(form));
        const fresh = list.filter((c) => !existing.has(c.name));
        $('#bulk-preview', dlg).textContent = list.length
          ? `Seront créées : ${fresh.map((c) => c.name).join(', ') || 'aucune (elles existent déjà)'}` : '';
      };
      form.addEventListener('input', refresh);
    };
    const planned = (data) => PRIMARY_LEVELS.flatMap((l) => sectionNames(l, Math.max(0, Math.min(8, Number(data[l]) || 0)))
      .map((name) => ({ name, level: l, cycle: 'primaire' })));
  }

  $$('.class-item select[name=main_teacher_id]', view).forEach((sel) => sel.addEventListener('change', async () => {
    try {
      await api('PUT', `/api/classes/${sel.closest('.class-item').dataset.class}/teacher`, { main_teacher_id: sel.value });
      toast('Enseignant affecté.');
      render();
    } catch (e) {
      toast(e.message, 'error');
    }
  }));
}

/** L'établissement a-t-il des classes de collège ou de lycée ? */
const hasSecondaryCycle = () => state.me.school.school_type !== 'primaire';

async function viewClass(view, [id], query) {
  const tab = query.get('onglet') || 'eleves';
  const needUsers = isAdmin();
  const [c, users, subjects] = await Promise.all([
    api('GET', `/api/classes/${id}`),
    needUsers ? api('GET', '/api/users') : [],
    needUsers ? api('GET', '/api/subjects') : [],
  ]);
  const tabs = [['eleves', `Élèves (${c.students.length})`], ['matieres', `Matières (${c.subjects.length})`], ...(isAdmin() ? [['parametres', 'Paramètres']] : [])];
  const canBulletins = isAdmin() || c.main_teacher_id === state.me.user.id;
  view.innerHTML = html`
    <div class="page-head">
      <div><h1>${c.name}</h1><p class="muted">${c.level} · ${c.year_label} · notes sur ${c.scale}${c.main_teacher_name ? ` · ${c.cycle === 'primaire' ? 'Maître' : 'Prof. principal'} : ${c.main_teacher_name}` : ''}</p></div>
      <div class="row">
        <a class="btn" href="#/resultats/${c.id}">Résultats</a>
        ${canBulletins ? html`<a class="btn primary" href="#/bulletins/${c.id}?periode=${state.periodId}">Bulletins</a>` : ''}
      </div>
    </div>
    <nav class="tabs">${tabs.map(([k, l]) => html`<a href="#/classes/${c.id}?onglet=${k}" class="${k === tab ? 'active' : ''}">${l}</a>`)}</nav>
    <div id="tab"></div>`.s;
  const el = $('#tab');
  if (tab === 'matieres') renderClassSubjects(el, c, users, subjects);
  else if (tab === 'parametres' && isAdmin()) renderClassSettings(el, c, users);
  else renderStudents(el, c);
}

function studentFields(s = {}) {
  return html`<div class="form-grid">
    ${field('Prénom(s)', 'first_name', { required: true, value: s.first_name })}
    ${field('Nom', 'last_name', { required: true, value: s.last_name })}
    ${selectField('Sexe', 'sex', [['M', 'Garçon'], ['F', 'Fille']], s.sex)}
    ${field('Date de naissance', 'birth_date', { value: s.birth_date, placeholder: 'JJ/MM/AAAA' })}
    ${field('Lieu de naissance', 'birth_place', { value: s.birth_place })}
    ${field('Parent / tuteur', 'guardian_name', { value: s.guardian_name })}
    ${field('Téléphone du parent', 'guardian_phone', { type: 'tel', value: s.guardian_phone, inputmode: 'tel' })}
  </div>`;
}

/** Date de naissance affichée en JJ/MM/AAAA (les anciennes saisies AAAA-MM-JJ sont converties). */
const fmtBirth = (d) => String(d ?? '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');

/** Lit un fichier d'élèves (.xlsx, .csv, .txt) et le renvoie en texte séparé par des tabulations. */
async function readStudentFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls')) {
    throw new Error('Ce fichier est au format Excel ancien (.xls). Dans Excel, faites « Fichier › Enregistrer sous » et choisissez « Classeur Excel (.xlsx) », puis réessayez.');
  }
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (name.endsWith('.xlsx') || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    let rows;
    try {
      rows = await readXlsx(buf);
    } catch {
      throw new Error('Impossible de lire ce fichier Excel. Enregistrez-le de nouveau au format .xlsx, ou copiez-collez les colonnes dans la zone ci-dessus.');
    }
    if (!rows.length) throw new Error('La première feuille de ce fichier Excel est vide.');
    return rows.map((r) => r.map((x) => x.replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
  }
  // CSV : UTF-8, ou Windows-1252 (encodage par défaut d'Excel sous Windows).
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

function renderStudents(el, c) {
  const admin = isAdmin();
  el.innerHTML = html`
    ${admin ? html`<details class="panel" ${raw(c.students.length ? '' : 'open')}><summary>+ Ajouter un élève</summary>
      <form id="add" class="stack">${studentFields()}<p class="form-error" hidden></p>
        <div><button class="btn primary" type="submit">Ajouter</button></div></form></details>
    <details class="panel"><summary>Importer une liste (Excel ou CSV)</summary>
      <form id="imp" class="stack">
        <p class="small muted">Choisissez votre fichier Excel, ou copiez-collez les lignes ici. Les colonnes doivent être dans cet ordre :<br>
          <strong>Prénom(s) · Nom · Sexe (M/F) · Date de naissance · Lieu de naissance · Parent/tuteur · Téléphone</strong><br>
          Seuls le prénom et le nom sont obligatoires. Une ligne d'en-tête est ignorée automatiquement.</p>
        <textarea name="text" placeholder="Awa&#9;Diop&#9;F&#9;12/03/2014&#9;Dakar&#9;Moussa Diop&#9;77 000 00 00"></textarea>
        <label class="field"><span>… ou choisissez un fichier Excel (.xlsx) ou CSV</span>
          <input type="file" accept=".xlsx,.xls,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" id="csv"></label>
        <p class="small" id="file-info" hidden></p>
        <p class="form-error" hidden></p>
        <div><button class="btn primary" type="submit">Importer</button></div>
      </form></details>` : ''}
    ${c.students.length ? html`<div class="table-wrap"><table class="data">
      <thead><tr><th>N°</th><th>Nom</th><th>Prénom(s)</th><th>Sexe</th><th>Date de naissance</th><th>Lieu de naissance</th><th>Parent / tuteur</th><th>Téléphone</th>${admin ? html`<th></th>` : ''}</tr></thead>
      <tbody>${c.students.map((s, i) => html`<tr>
        <td>${i + 1}</td><td><strong>${s.last_name}</strong></td><td>${s.first_name}</td>
        <td>${s.sex}</td><td class="nowrap">${fmtBirth(s.birth_date)}</td><td>${s.birth_place}</td>
        <td>${s.guardian_name}</td><td class="nowrap">${s.guardian_phone}</td>
        ${admin ? html`<td class="actions"><button class="btn sm" data-edit="${s.id}">Modifier</button>
          <button class="btn sm danger" data-del="${s.id}">Retirer</button></td>` : ''}
      </tr>`)}</tbody></table></div>` : html`<p class="empty">Aucun élève inscrit dans cette classe.</p>`}`.s;
  if (!admin) return;

  bindForm($('#add', el), async (data, form) => {
    await api('POST', `/api/classes/${c.id}/students`, data);
    toast('Élève ajouté.');
    form.reset();
    sessionStorage.setItem('bulletin.reopenAdd', '1');
    render();
  });
  if (sessionStorage.getItem('bulletin.reopenAdd')) {
    sessionStorage.removeItem('bulletin.reopenAdd');
    const d = $('details', el);
    d.open = true;
    $('input[name=first_name]', d).focus();
  }
  $('#csv', el).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const info = $('#file-info', el);
    const area = $('#imp textarea', el);
    if (!file) return;
    info.hidden = false;
    info.className = 'small';
    try {
      const text = await readStudentFile(file);
      area.value = text;
      const n = text.split('\n').filter((l) => l.trim()).length;
      info.textContent = `« ${file.name} » : ${n} ligne(s) chargée(s). Vérifiez la liste ci-dessus puis cliquez sur « Importer ».`;
      area.focus();
    } catch (err) {
      info.className = 'small form-error';
      info.textContent = err.message;
      e.target.value = '';
    }
  });
  bindForm($('#imp', el), async (data) => {
    const r = await api('POST', `/api/classes/${c.id}/students/import`, { text: data.text });
    toast(`${r.imported} élève(s) importé(s).`);
    if (r.errors.length) toast(`${r.errors.length} ligne(s) ignorée(s) : ${r.errors.slice(0, 3).join(' ; ')}`, 'error');
    render();
  });
  $$('[data-edit]', el).forEach((b) => (b.onclick = () => {
    const s = c.students.find((x) => x.id === Number(b.dataset.edit));
    openDialog({
      title: `${s.first_name} ${s.last_name}`,
      body: studentFields(s),
      onSubmit: async (data) => {
        await api('PUT', `/api/students/${s.id}`, data);
        toast('Élève modifié.');
        render();
      },
    });
  }));
  $$('[data-del]', el).forEach((b) => (b.onclick = async () => {
    const s = c.students.find((x) => x.id === Number(b.dataset.del));
    if (!confirm(`Retirer ${s.first_name} ${s.last_name} de la classe ? Ses notes dans cette classe seront supprimées.`)) return;
    await api('DELETE', `/api/classes/${c.id}/students/${s.id}`);
    toast('Élève retiré.');
    render();
  }));
}

// Liste des enseignants pour une matière : ceux qui l'enseignent d'abord, puis le reste de l'équipe.
function subjectTeacherOptions(users, subjectId, selected) {
  const specialists = users.filter((u) => u.subject_ids.includes(Number(subjectId)));
  const others = users.filter((u) => !specialists.includes(u));
  const opt = (u) => html`<option value="${u.id}" ${raw(String(u.id) === String(selected ?? '') ? 'selected' : '')}>${u.name}</option>`;
  return html`<option value="">— Aucun —</option>
    ${specialists.length ? html`<optgroup label="Enseignent cette matière">${specialists.map(opt)}</optgroup>` : ''}
    ${others.length ? html`<optgroup label="${specialists.length ? 'Autres membres' : 'Équipe'}">${others.map(opt)}</optgroup>` : ''}`;
}

function renderClassSubjects(el, c, users, subjects) {
  const admin = isAdmin();
  const primary = c.cycle === 'primaire';
  const available = subjects.filter((s) => !c.subjects.some((cs) => cs.subject_id === s.id)
    && (s.cycle === 'tous' || s.cycle === (primary ? 'primaire' : 'secondaire')));
  const totalCoef = c.subjects.reduce((s, x) => s + x.coefficient, 0);
  const missing = c.subjects.filter((s) => !s.teacher_id).length;
  const settingsLink = html`<a href="#/classes/${c.id}?onglet=parametres">paramètres de la classe</a>`;
  el.innerHTML = html`
    ${primary ? html`<div class="alert">${c.main_teacher_name
      ? html`À l'élémentaire, un seul maître enseigne toutes les matières : <strong>${c.main_teacher_name}</strong> saisit les notes de toute la classe. Pour changer de maître, passez par les ${settingsLink}.`
      : html`À l'élémentaire, un seul maître enseigne toutes les matières. ${admin ? html`Désignez-le dans les ${settingsLink}.` : ''}`}</div>`
      : admin && c.subjects.length && missing ? html`<div class="alert">${missing} matière(s) sans professeur : choisissez l'enseignant de chaque matière ci-dessous.</div>` : ''}
    ${admin ? html`<details class="panel" ${raw(c.subjects.length ? '' : 'open')}><summary>+ Ajouter une matière</summary>
      <form id="add" class="stack">
        <div class="form-grid">
          ${selectField('Matière', 'subject_id', [
            ...available.map((s) => [s.id, `${s.name} (coef. ${fmtNum(s.default_coefficient)})`]),
            ['new', '+ Nouvelle matière…'],
          ], available.length ? '' : 'new', { required: true })}
          <label class="field" id="new-name"><span>Nom de la nouvelle matière</span><input name="new_name" maxlength="80" placeholder="Ex. : Éducation religieuse"></label>
          ${field('Coefficient', 'coefficient', { inputmode: 'decimal', placeholder: 'Par défaut : 1' })}
          ${primary ? '' : html`<label class="field"><span>Professeur</span><select name="teacher_id" id="add-teacher"></select></label>`}
        </div>
        <p class="form-error" hidden></p>
        <div class="row"><button class="btn primary" type="submit">Ajouter</button>
          ${available.length ? html`<button class="btn" type="button" id="all">Ajouter toutes les matières (${available.length})</button>` : ''}</div>
      </form></details>` : ''}
    ${c.subjects.length ? html`<div class="table-wrap"><table class="data">
      <thead><tr><th>Matière</th><th>Coefficient</th><th>${primary ? 'Maître' : 'Professeur'}</th>${admin ? html`<th></th>` : ''}</tr></thead>
      <tbody>${c.subjects.map((s) => html`<tr data-cs="${s.id}">
        <td><strong>${s.name}</strong></td>
        <td style="width:120px">${admin ? html`<input name="coefficient" value="${fmtNum(s.coefficient)}" inputmode="decimal" aria-label="Coefficient">` : fmtNum(s.coefficient)}</td>
        <td>${admin && !primary
          ? html`<select name="teacher_id" aria-label="Professeur de ${s.name}">${subjectTeacherOptions(users, s.subject_id, s.teacher_id)}</select>`
          : s.teacher_name || html`<span class="muted">—</span>`}</td>
        ${admin ? html`<td class="actions"><button class="btn sm danger" data-del="${s.id}">Retirer</button></td>` : ''}
      </tr>`)}</tbody>
      <tfoot><tr><td><strong>Total des coefficients</strong></td><td><strong>${fmtNum(totalCoef)}</strong></td><td colspan="2"></td></tr></tfoot>
      </table></div>` : html`<p class="empty">Aucune matière dans cette classe. Ajoutez-en pour pouvoir saisir des notes.</p>`}`.s;
  if (!admin) return;

  const addForm = $('#add', el);
  if (addForm) {
    // Le choix du professeur suit la matière sélectionnée ; s'il est seul à l'enseigner, il est présélectionné.
    const teacherSelect = $('#add-teacher', el);
    const subjectSelect = $('[name=subject_id]', addForm);
    const refreshTeachers = () => {
      if (!teacherSelect) return;
      const specialists = users.filter((u) => u.subject_ids.includes(Number(subjectSelect.value)));
      teacherSelect.innerHTML = subjectTeacherOptions(users, subjectSelect.value, specialists.length === 1 ? specialists[0].id : '').s;
    };
    const newName = $('#new-name', addForm);
    const refreshNew = () => {
      const isNew = subjectSelect.value === 'new';
      newName.hidden = !isNew;
      $('input', newName).required = isNew;
    };
    subjectSelect.addEventListener('change', () => { refreshNew(); refreshTeachers(); });
    refreshNew();
    refreshTeachers();
    bindForm(addForm, async (data) => {
      if (data.subject_id === 'new') {
        const name = data.new_name.trim();
        // Une matière du même nom existe peut-être déjà dans l'établissement (autre cycle) : on la réutilise.
        const existing = subjects.find((s) => s.name.toLowerCase() === name.toLowerCase());
        if (existing && c.subjects.some((cs) => cs.subject_id === existing.id)) throw new Error('Cette matière est déjà dans la classe.');
        data.subject_id = existing ? existing.id : (await api('POST', '/api/subjects', {
          name,
          default_coefficient: data.coefficient || 1,
          cycle: primary ? 'primaire' : 'secondaire',
        })).id;
      }
      delete data.new_name;
      await api('POST', `/api/classes/${c.id}/subjects`, data);
      toast('Matière ajoutée.');
      render();
    });
    if ($('#all', el)) $('#all', el).onclick = async () => {
      const r = await api('POST', `/api/classes/${c.id}/subjects/all`);
      toast(`${r.added} matière(s) ajoutée(s).`);
      render();
    };
  }
  $$('tr[data-cs]', el).forEach((tr) => {
    const save = async () => {
      try {
        await api('PUT', `/api/class-subjects/${tr.dataset.cs}`, {
          coefficient: $('[name=coefficient]', tr).value,
          teacher_id: $('[name=teacher_id]', tr)?.value ?? '',
        });
        toast('Enregistré.');
      } catch (e) {
        toast(e.message, 'error');
      }
    };
    $('[name=coefficient]', tr).addEventListener('change', save);
    $('[name=teacher_id]', tr)?.addEventListener('change', save);
  });
  $$('[data-del]', el).forEach((b) => (b.onclick = async () => {
    if (!confirm('Retirer cette matière de la classe ? Toutes les notes de cette matière seront supprimées.')) return;
    await api('DELETE', `/api/class-subjects/${b.dataset.del}`);
    render();
  }));
}

function renderClassSettings(el, c, users) {
  el.innerHTML = html`<div class="card"><form id="f" class="stack">
      <div class="form-grid">
        ${field('Nom de la classe', 'name', { required: true, value: c.name })}
        ${field('Niveau', 'level', { value: c.level })}
        ${selectField('Cycle', 'cycle', CYCLES, c.cycle)}
        ${selectField('Barème', 'scale', [['20', 'Notes sur 20'], ['10', 'Notes sur 10']], c.scale)}
        ${selectField('Professeur principal / maître', 'main_teacher_id', teacherOptions(users), c.main_teacher_id)}
      </div>
      <p class="form-error" hidden></p>
      <div><button class="btn primary" type="submit">Enregistrer</button></div>
    </form></div>
    <div class="card"><h2>Zone sensible</h2>
      <p class="muted">Supprimer la classe efface ses matières, ses évaluations et ses notes, ainsi que les élèves qui n'appartiennent à aucune autre classe.</p>
      <button class="btn danger" id="del">Supprimer la classe</button></div>`.s;
  bindForm($('#f', el), async (data) => {
    await api('PUT', `/api/classes/${c.id}`, data);
    toast('Classe mise à jour.');
    render();
  });
  $('#del', el).onclick = async () => {
    if (prompt(`Tapez le nom de la classe (${c.name}) pour confirmer la suppression :`) !== c.name) return;
    await api('DELETE', `/api/classes/${c.id}`);
    toast('Classe supprimée.');
    go('#/classes');
  };
}

// =============================================================== saisie des notes

async function viewNotesIndex(view) {
  const [list, overview] = await Promise.all([
    api('GET', '/api/my-subjects'),
    api('GET', `/api/grading-overview?period=${state.periodId}`),
  ]);
  const admin = isAdmin();
  const graded = new Set(overview.graded);
  const itemsByClass = new Map();
  for (const s of list) {
    if (!itemsByClass.has(s.class_id)) itemsByClass.set(s.class_id, []);
    itemsByClass.get(s.class_id).push(s);
  }
  const canCompose = (c) => c.cycle === 'primaire' && (admin || c.main_teacher_id === state.me.user.id);
  const anyCompose = overview.classes.some(canCompose);
  let mode = anyCompose && safeGet('ndamely.gradeMode') !== 'matiere' ? 'composition' : 'matiere';
  const ready = overview.classes.filter((c) => c.students > 0 && c.subjects > 0);
  const waiting = overview.classes.filter((c) => !(c.students > 0 && c.subjects > 0));
  const year = currentYear();
  const periodName = overview.period?.name ?? '';

  const progress = (c) => {
    const items = itemsByClass.get(c.id) ?? [];
    const done = items.filter((s) => graded.has(s.id)).length;
    const total = items.length;
    const status = !done ? ['todo', 'Aucune note saisie'] : done < total ? ['partial', 'Saisie en cours'] : ['done', 'Saisie terminée'];
    return html`<div class="grade-progress ${status[0]}">
      <div class="gp-top"><span>${icon(status[0] === 'done' ? 'check' : 'clock')}${status[1]}</span><strong>${done} / ${total} matière${total > 1 ? 's' : ''}</strong></div>
      <div class="meter ${status[0] === 'done' ? 'ok' : 'warn'}"><i style="width:${total ? (done * 100) / total : 0}%"></i></div>
    </div>`;
  };
  const subjectList = (c) => html`<div class="subject-picks">${(itemsByClass.get(c.id) ?? []).map((s) => html`<a class="subject-pick ${graded.has(s.id) ? 'done' : ''}" href="#/notes/${s.id}">
    ${icon(graded.has(s.id) ? 'check' : 'circle')}<span>${s.subject_name}</span><small>coef. ${fmtNum(s.coefficient)}${s.teacher_name && c.cycle !== 'primaire' ? ` · ${s.teacher_name}` : ''}</small></a>`)}</div>`;
  const actions = (c) => {
    const compose = canCompose(c);
    const subjectsBtn = html`<button class="btn ${!compose || mode === 'matiere' ? 'primary' : ''}" type="button" data-subjects="${c.id}">${icon('subjects')}Matière par matière</button>`;
    const composeBtn = compose ? html`<a class="btn ${mode === 'composition' ? 'primary' : ''}" href="#/composition/${c.id}">${icon('dashboard')}Saisir une composition${mode === 'composition' ? icon('arrow') : ''}</a>` : '';
    return mode === 'composition' ? html`${subjectsBtn}${composeBtn}` : html`${composeBtn}${subjectsBtn}`;
  };

  const render2 = () => {
    view.innerHTML = html`
      <div class="page-head">
        <div class="title-with-icon"><span class="title-icon">${icon('notes')}</span>
          <div><h1>Saisie des notes</h1><p class="muted">Choisissez une classe, puis la façon de saisir.</p></div></div>
        ${periodName ? html`<span class="period-chip">${icon('calendar')}${periodName}${year ? ` · ${year.label}` : ''}</span>` : ''}
      </div>

      ${anyCompose ? html`<div class="mode-cards" role="radiogroup" aria-label="Façon de saisir">
        <button type="button" class="mode-card ${mode === 'composition' ? 'on' : ''}" data-mode="composition" role="radio" aria-checked="${mode === 'composition'}">
          <span class="mode-icon">${icon('dashboard')}</span>
          <span><strong>Composition complète <span class="pill">Recommandé</span></strong>
            <span>Tous les élèves et toutes les matières en une seule fois, dans un même tableau.</span></span></button>
        <button type="button" class="mode-card ${mode === 'matiere' ? 'on' : ''}" data-mode="matiere" role="radio" aria-checked="${mode === 'matiere'}">
          <span class="mode-icon">${icon('subjects')}</span>
          <span><strong>Matière par matière</strong>
            <span>Une matière à la fois, pour les devoirs ou les compositions.</span></span></button>
      </div>` : ''}

      ${overview.classes.length ? html`
      ${ready.length ? html`<h2 class="section-title">Prête${ready.length > 1 ? 's' : ''} pour la saisie <span class="count-dot">${ready.length}</span></h2>
      <div class="ready-list">${ready.map((c) => html`<section class="card ready-card">
        <div class="ready-row">
          <span class="class-badge big">${c.name}</span>
          <div class="ready-info"><strong>${c.name}</strong>
            <div class="meta">
              <span>${icon('user')}${c.main_teacher_name || (c.cycle === 'primaire' ? 'Maître à désigner' : 'Sans prof. principal')}</span>
              <span>${icon('students')}${plural(c.students, 'élève')}</span>
              <span>${icon('subjects')}${plural(c.subjects, 'matière')}</span>
            </div></div>
          ${progress(c)}
          <div class="ready-actions">${actions(c)}</div>
        </div>
        <div class="subjects-panel" id="subjects-${c.id}" hidden>${subjectList(c)}</div>
      </section>`)}</div>` : ''}

      ${waiting.length ? html`<div class="section-head"><h2 class="section-title">En attente <span class="count-dot muted">${waiting.length}</span></h2>
        <p class="muted small">Une classe est prête quand elle a des élèves inscrits et des matières.</p></div>
      <div class="waiting-grid">${waiting.map((c) => html`<div class="card waiting-card">
        <div class="wc-top"><strong>${c.name}</strong><span class="badge">En attente</span></div>
        <ul>
          ${!c.students ? html`<li class="warn">${icon('students')}0 élève inscrit</li>` : html`<li>${icon('students')}${plural(c.students, 'élève')}</li>`}
          ${!c.subjects ? html`<li class="warn">${icon('subjects')}Aucune matière</li>` : ''}
          ${c.main_teacher_name ? html`<li>${icon('user')}${c.main_teacher_name}</li>`
            : html`<li class="warn">${icon('user')}${c.cycle === 'primaire' ? 'Maître à désigner' : 'Prof. principal à désigner'}</li>`}
        </ul>
        ${admin ? (!c.students
          ? html`<a class="add-link" href="#/classes/${c.id}?onglet=eleves">${icon('plus')}Inscrire des élèves</a>`
          : html`<a class="add-link" href="#/classes/${c.id}?onglet=matieres">${icon('plus')}Ajouter des matières</a>`) : ''}
      </div>`)}</div>` : ''}`
      : html`<div class="card"><p class="empty">${admin
        ? 'Aucune classe pour cette année. Créez vos classes dans « Classes ».'
        : "Aucune classe ni matière ne vous est attribuée. Demandez à l'administrateur de vous affecter à votre classe."}</p></div>`}`.s;

    $$('[data-mode]', view).forEach((b) => (b.onclick = () => {
      mode = b.dataset.mode;
      safeSet('ndamely.gradeMode', mode);
      render2();
    }));
    $$('[data-subjects]', view).forEach((b) => (b.onclick = () => {
      const panel = $(`#subjects-${b.dataset.subjects}`, view);
      panel.hidden = !panel.hidden;
      b.setAttribute('aria-expanded', !panel.hidden);
    }));
  };
  render2();
}

function parseGrade(text, scale) {
  const t = String(text).trim().toLowerCase();
  if (!t) return { empty: true };
  if (t.startsWith('abs')) return { absent: true };
  const v = Number(t.replace(',', '.'));
  if (!Number.isFinite(v) || v < 0 || v > scale) return { invalid: true };
  return { value: v };
}

// En-têtes courts : sigle pour les intitulés de plusieurs mots (SVT, HG, EPS…).
function shortSubject(name) {
  if (name.length <= 12) return name;
  const words = name.split(/[\s'’-]+/).filter((w) => w.length > 2 && !['et', 'des', 'les', 'la', 'de', 'du'].includes(w.toLowerCase()));
  return words.length > 1 ? words.map((w) => w[0].toUpperCase()).join('') : `${name.slice(0, 9)}.`;
}

// Saisie d'une composition : une grille élèves × matières, enregistrée en une fois.
async function viewComposition(view, [classId], query) {
  const d = await api('GET', `/api/classes/${classId}/composition?period=${state.periodId}`);
  const { subjects, students, labels } = d;
  const scale = d.class.scale;
  const label = query.get('intitule') || labels.at(-1) || 'Composition 1';
  const isNew = !labels.includes(label);
  const key = `compo:${classId}:${d.period.id}:${label}`;
  const go2 = (l) => go(`#/composition/${classId}?intitule=${encodeURIComponent(l)}`);

  // Notes déjà enregistrées pour cette composition, puis saisies hors ligne en attente.
  const evalSubject = new Map(d.evaluations.filter((e) => e.label === label).map((e) => [e.id, e.class_subject_id]));
  const values = new Map();
  for (const g of d.grades) {
    const cs = evalSubject.get(g.evaluation_id);
    if (cs) values.set(`${cs}:${g.student_id}`, g.absent ? 'abs' : fmtNum(g.value));
  }
  const pending = readQueue().find((q) => q.key === key);
  for (const g of pending?.body.grades ?? []) {
    values.set(`${g.class_subject_id}:${g.student_id}`, g.absent ? 'abs' : g.value === null ? '' : fmtNum(g.value));
  }
  let changed = false;
  leaveGuard = () => changed;

  const labelOptions = [...new Set([...labels, label])];
  view.innerHTML = html`
    <div class="page-head">
      <div><h1>${label} — ${d.class.name}</h1>
        <p class="muted">${d.period.name} · notes sur ${scale} · ${subjects.length} matière(s)</p></div>
      <div class="row">
        ${labelOptions.length > 1 ? html`<select id="label" aria-label="Composition" style="width:auto">${labelOptions.map((l) =>
          html`<option ${raw(l === label ? 'selected' : '')}>${l}</option>`)}</select>` : ''}
        <button class="btn" id="new">+ Nouvelle composition</button>
      </div>
    </div>
    ${pending ? html`<div class="alert">Cette composition a été saisie hors ligne : elle sera envoyée automatiquement au retour de la connexion.</div>` : ''}
    ${isNew && students.length ? html`<div class="alert">Nouvelle composition : saisissez les notes de chaque matière puis cliquez sur « Enregistrer la composition ».</div>` : ''}
    ${!students.length ? html`<p class="empty">Aucun élève dans cette classe. ${isAdmin() ? html`<a href="#/classes/${classId}">Ajouter les élèves</a>` : "Demandez à l'administrateur d'ajouter la liste des élèves."}</p>`
      : html`<div class="table-wrap"><table class="data grades">
        <thead><tr><th>N°</th><th>Élève</th>
          ${subjects.map((s) => html`<th class="center subject-head" title="${s.name} — coef. ${fmtNum(s.coefficient)}">${s.name}<br><span class="small" style="text-transform:none">coef. ${fmtNum(s.coefficient)}</span></th>`)}
          <th class="num">Total</th><th class="num">Moyenne</th><th class="num">Rang</th></tr></thead>
        <tbody>${students.map((st, i) => html`<tr data-student="${st.id}" data-sex="${st.sex}">
          <td>${i + 1}</td><td class="nowrap"><strong>${st.last_name}</strong> ${st.first_name}</td>
          ${subjects.map((s, col) => html`<td class="cell center"><input class="grade" data-cs="${s.id}" data-col="${col}" data-row="${i}"
            value="${values.get(`${s.id}:${st.id}`) ?? ''}" inputmode="decimal" autocomplete="off" aria-label="${s.name} — ${st.first_name} ${st.last_name}"></td>`)}
          <td class="num computed" data-out="total"></td><td class="num computed" data-out="average"></td><td class="num computed" data-out="rank"></td>
        </tr>`)}</tbody></table></div>
      <p class="small muted" style="margin-top:8px">« abs » pour un élève absent. Entrée ou ↓ : élève suivant ; Tab : matière suivante.
        Total = somme des notes × coefficients ; moyenne sur ${scale}.</p>
      <div class="savebar"><span id="status" class="muted small"></span><button class="btn primary" id="save">Enregistrer la composition</button></div>`}`.s;

  const rows = $$('tr[data-student]', view);
  const recompute = () => {
    const entries = rows.map((tr) => {
      let points = 0;
      let coefs = 0;
      for (const s of subjects) {
        const g = parseGrade($(`input[data-cs="${s.id}"]`, tr).value, scale);
        if (g.value === undefined) continue;
        points += g.value * s.coefficient;
        coefs += s.coefficient;
      }
      const average = coefs ? round2(points / coefs) : null;
      $('[data-out=total]', tr).textContent = coefs ? fmt(points) : '–';
      $('[data-out=average]', tr).textContent = fmt(average);
      return { id: tr.dataset.student, value: average, tr };
    });
    const ranks = computeRanks(entries);
    for (const e of entries) {
      const r = ranks.get(e.id);
      $('[data-out=rank]', e.tr).textContent = r ? rankLabel(r.rank, r.tie, e.tr.dataset.sex) : '–';
    }
  };
  const status = () => {
    const el = $('#status');
    if (el) el.textContent = changed ? 'Modifications non enregistrées' : isNew ? '' : 'Tout est enregistré.';
  };

  $$('input.grade', view).forEach((input) => {
    const mark = () => {
      const g = parseGrade(input.value, scale);
      input.classList.toggle('invalid', !!g.invalid);
      input.classList.toggle('absent', !!g.absent);
    };
    mark();
    input.addEventListener('input', () => {
      mark();
      input.classList.add('dirty');
      changed = true;
      recompute();
      status();
    });
    input.addEventListener('focus', () => input.select());
    input.addEventListener('keydown', (e) => {
      const move = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      if (!move) return;
      e.preventDefault();
      $(`input.grade[data-col="${input.dataset.col}"][data-row="${Number(input.dataset.row) + move}"]`, view)?.focus();
    });
  });
  recompute();
  status();

  $('#save', view)?.addEventListener('click', async () => {
    const invalid = $$('input.grade.invalid', view);
    if (invalid.length) {
      invalid[0].focus();
      return toast(`${invalid.length} note(s) invalide(s) : les notes vont de 0 à ${scale}.`, 'error');
    }
    const grades = rows.flatMap((tr) => subjects.map((s) => {
      const g = parseGrade($(`input[data-cs="${s.id}"]`, tr).value, scale);
      return { student_id: Number(tr.dataset.student), class_subject_id: s.id, value: g.value ?? null, absent: !!g.absent };
    }));
    const btn = $('#save', view);
    btn.disabled = true;
    try {
      const result = await putOrQueue(key, `/api/classes/${classId}/composition`, { period_id: d.period.id, label, grades });
      changed = false;
      toast(result === 'queued'
        ? 'Hors ligne : composition conservée sur cet appareil, envoi automatique au retour du réseau.'
        : 'Composition enregistrée.');
      if (result === 'saved') go2(label);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btn.disabled = false;
      status();
    }
  });

  $('#label', view)?.addEventListener('change', (e) => {
    if (changed && !confirm('Des notes ne sont pas enregistrées et seront perdues. Continuer ?')) {
      e.target.value = label;
      return;
    }
    changed = false;
    go2(e.target.value);
  });
  $('#new', view).onclick = () => openDialog({
    title: 'Nouvelle composition',
    submitLabel: 'Commencer la saisie',
    body: field('Intitulé', 'label', { required: true, value: `Composition ${labelOptions.length + (isNew ? 0 : 1)}` }),
    onSubmit: async (data) => {
      if (changed && !confirm('Des notes ne sont pas enregistrées et seront perdues. Continuer ?')) return;
      changed = false;
      go2(data.label.trim());
    },
  });
}

async function viewGradeEntry(view, [csId]) {
  const periodId = state.periodId;
  const d = await api('GET', `/api/class-subjects/${csId}/grades?period=${periodId}`);
  const { classSubject: cs, students, evaluations, compoWeight } = d;
  const scale = d.class.scale;

  // Valeurs : serveur, puis saisies hors ligne encore en attente.
  const values = new Map(); // `${evalId}:${studentId}` → texte affiché
  for (const g of d.grades) values.set(`${g.evaluation_id}:${g.student_id}`, g.absent ? 'abs' : fmtNum(g.value));
  const queued = new Set();
  for (const q of readQueue()) {
    if (!evaluations.some((e) => e.id === q.evaluationId)) continue;
    queued.add(q.evaluationId);
    for (const g of q.grades) values.set(`${q.evaluationId}:${g.student_id}`, g.absent ? 'abs' : g.value === null ? '' : fmtNum(g.value));
  }

  const dirty = new Set(queued);
  leaveGuard = () => [...dirty].some((id) => !queued.has(id));

  const devoirs = evaluations.filter((e) => e.type === 'devoir');
  const compos = evaluations.filter((e) => e.type === 'composition');
  const ordered = [...devoirs, ...compos];
  const compositionsOnly = d.class.cycle === 'primaire'; // à l'élémentaire, seules les compositions comptent
  const formula = compositionsOnly ? 'moyenne des compositions'
    : compoWeight === 1 ? '(moy. devoirs + compo.) ÷ 2' : `(moy. devoirs + ${fmtNum(compoWeight)} × compo.) ÷ ${fmtNum(1 + compoWeight)}`;

  view.innerHTML = html`
    <div class="page-head">
      <div><h1>${cs.subject_name} — ${d.class.name}</h1>
        <p class="muted">${d.period.name} · notes sur ${scale} · coef. ${fmtNum(cs.coefficient)}${cs.teacher_name ? ` · ${cs.teacher_name}` : ''}</p></div>
      <div class="row">
        ${compositionsOnly ? '' : html`<button class="btn" data-new="devoir">+ Devoir</button>`}
        <button class="btn" data-new="composition">+ Composition</button>
      </div>
    </div>
    ${queued.size ? html`<div class="alert">Des notes saisies hors ligne sont en attente d'envoi. Elles seront synchronisées au retour de la connexion.</div>` : ''}
    ${!students.length ? html`<p class="empty">Aucun élève dans cette classe.</p>`
      : !ordered.length ? html`<p class="empty">Aucune évaluation pour cette période. Créez un devoir ou une composition pour commencer la saisie.</p>`
      : html`<div class="table-wrap"><table class="data grades">
        <thead><tr><th>N°</th><th>Élève</th>
          ${ordered.map((e) => html`<th class="center ${e.type === 'composition' ? 'compo' : ''}"><div class="eval-head">
            <span title="${e.eval_date}">${e.label}</span>
            <button class="btn ghost sm" data-del-eval="${e.id}" title="Supprimer cette évaluation" aria-label="Supprimer ${e.label}">×</button></div></th>`)}
          <th class="num">Moy. devoirs</th><th class="num">Compo.</th><th class="num">Moyenne</th><th>Appréciation</th></tr></thead>
        <tbody>${students.map((s, i) => html`<tr data-student="${s.id}">
          <td>${i + 1}</td><td class="nowrap"><strong>${s.last_name}</strong> ${s.first_name}</td>
          ${ordered.map((e, col) => html`<td class="cell center"><input class="grade" data-eval="${e.id}" data-col="${col}" data-row="${i}"
            value="${values.get(`${e.id}:${s.id}`) ?? ''}" inputmode="decimal" autocomplete="off" aria-label="${e.label} — ${s.first_name} ${s.last_name}"></td>`)}
          <td class="num computed" data-out="devoirs"></td><td class="num computed" data-out="composition"></td>
          <td class="num computed" data-out="average"></td><td class="small" data-out="appreciation"></td>
        </tr>`)}</tbody></table></div>
      <p class="small muted" style="margin-top:8px">Saisissez « abs » pour un élève absent. Moyenne de la matière = ${formula}. Entrée ou ↓ : élève suivant.</p>
      <div class="savebar"><span id="status" class="muted small"></span><button class="btn primary" id="save">Enregistrer les notes</button></div>`}`.s;

  const recompute = (tr) => {
    const collect = (list) => list.map((e) => parseGrade($(`input[data-eval="${e.id}"]`, tr).value, scale))
      .filter((g) => g.value !== undefined).map((g) => g.value);
    const r = subjectAverage(collect(devoirs), collect(compos), compoWeight, compositionsOnly);
    $('[data-out=devoirs]', tr).textContent = fmt(r.devoirs);
    $('[data-out=composition]', tr).textContent = fmt(r.composition);
    $('[data-out=average]', tr).textContent = fmt(r.average);
    $('[data-out=appreciation]', tr).textContent = appreciation(r.average, scale);
  };
  const status = () => {
    const el = $('#status');
    if (el) el.textContent = dirty.size ? `${dirty.size} évaluation(s) modifiée(s), non enregistrée(s)` : 'Tout est enregistré.';
  };

  $$('tr[data-student]', view).forEach(recompute);
  $$('input.grade', view).forEach((input) => {
    const mark = () => {
      const g = parseGrade(input.value, scale);
      input.classList.toggle('invalid', !!g.invalid);
      input.classList.toggle('absent', !!g.absent);
    };
    mark();
    input.addEventListener('input', () => {
      mark();
      input.classList.add('dirty');
      dirty.add(Number(input.dataset.eval));
      recompute(input.closest('tr'));
      status();
    });
    input.addEventListener('focus', () => input.select());
    input.addEventListener('keydown', (e) => {
      const move = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      if (!move) return;
      e.preventDefault();
      $(`input.grade[data-col="${input.dataset.col}"][data-row="${Number(input.dataset.row) + move}"]`, view)?.focus();
    });
  });
  status();

  $('#save', view)?.addEventListener('click', async () => {
    const invalid = $$('input.grade.invalid', view);
    if (invalid.length) {
      invalid[0].focus();
      return toast(`${invalid.length} note(s) invalide(s) : les notes vont de 0 à ${scale}.`, 'error');
    }
    const btn = $('#save', view);
    btn.disabled = true;
    let queuedNow = 0;
    try {
      for (const evalId of [...dirty]) {
        const grades = students.map((s) => {
          const g = parseGrade($(`tr[data-student="${s.id}"] input[data-eval="${evalId}"]`, view).value, scale);
          return { student_id: s.id, value: g.value ?? null, absent: !!g.absent };
        });
        if ((await saveGrades(evalId, grades)) === 'queued') queuedNow++;
        else queued.delete(evalId);
        dirty.delete(evalId);
      }
      $$('input.grade.dirty', view).forEach((i) => i.classList.remove('dirty'));
      toast(queuedNow ? 'Hors ligne : notes conservées sur cet appareil, envoi automatique au retour du réseau.' : 'Notes enregistrées.');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btn.disabled = false;
      status();
    }
  });

  $$('[data-new]', view).forEach((b) => (b.onclick = () => {
    const type = b.dataset.new;
    const n = (type === 'devoir' ? devoirs : compos).length + 1;
    openDialog({
      title: type === 'devoir' ? 'Nouveau devoir' : 'Nouvelle composition',
      submitLabel: 'Créer',
      body: html`${field('Intitulé', 'label', { required: true, value: type === 'devoir' ? `Devoir ${n}` : n > 1 ? `Composition ${n}` : 'Composition' })}
        ${field('Date', 'eval_date', { type: 'date' })}`,
      onSubmit: async (data) => {
        if (leaveGuard() && !confirm('Des notes ne sont pas enregistrées et seront perdues. Continuer ?')) return;
        await api('POST', `/api/class-subjects/${cs.id}/evaluations`, { ...data, type, period_id: periodId });
        render();
      },
    });
  }));
  $$('[data-del-eval]', view).forEach((b) => (b.onclick = async () => {
    const ev = evaluations.find((e) => e.id === Number(b.dataset.delEval));
    if (!confirm(`Supprimer « ${ev.label} » et toutes ses notes ?`)) return;
    await api('DELETE', `/api/evaluations/${ev.id}`);
    writeQueue(readQueue().filter((q) => q.evaluationId !== ev.id));
    render();
  }));
}

// =============================================================== résultats

const DECISIONS = ['Admis(e) en classe supérieure', 'Redouble', 'Admis(e) sous réserve', 'Exclu(e)'];

async function viewResults(view, [classId]) {
  const d = await api('GET', `/api/classes/${classId}/results?period=${state.periodId}`);
  const { results, council } = d;
  const { stats, subjects } = results;
  const scale = d.class.scale;
  const rows = [...results.students].sort((a, b) =>
    (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.last_name.localeCompare(b.last_name, 'fr'));
  const short = shortSubject;

  view.innerHTML = html`
    <div class="page-head">
      <div><h1>Résultats — ${d.class.name}</h1><p class="muted">${d.period.name} · ${d.class.year_label} · moyennes sur ${scale}</p></div>
      <div class="row">
        <button class="btn" id="csv">Exporter (Excel)</button>
        ${d.canEditCouncil ? html`<a class="btn primary" href="#/bulletins/${d.class.id}?periode=${d.period.id}">Imprimer les bulletins</a>` : ''}
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="label">Effectif</div><div class="value">${stats.count}</div></div>
      <div class="kpi"><div class="label">Moyenne de la classe</div><div class="value">${fmt(stats.average)}</div></div>
      <div class="kpi"><div class="label">Plus forte moyenne</div><div class="value">${fmt(stats.max)}</div></div>
      <div class="kpi"><div class="label">Plus faible moyenne</div><div class="value">${fmt(stats.min)}</div></div>
      <div class="kpi"><div class="label">Taux de réussite (≥ ${scale / 2})</div><div class="value">${stats.passRate === null ? '–' : `${fmtNum(stats.passRate)} %`}</div></div>
    </div>
    ${!subjects.length ? html`<p class="empty">Aucune matière dans cette classe.</p>` : html`<div class="table-wrap"><table class="data">
      <thead><tr><th>Rang</th><th>Élève</th>
        ${subjects.map((s) => html`<th class="num" title="${s.name} (coef. ${fmtNum(s.coefficient)})">${short(s.name)}</th>`)}
        <th class="num">Moyenne</th><th>Appréciation</th><th>Distinction</th>
        <th>Appréciation du conseil</th>${d.isLast ? html`<th>Décision</th>` : ''}<th></th></tr></thead>
      <tbody>${rows.map((s) => {
        const cn = council[s.id] ?? { appreciation: '', decision: '' };
        return html`<tr data-student="${s.id}">
          <td class="nowrap"><strong>${rankLabel(s.rank, s.tie, s.sex) || '–'}</strong></td>
          <td class="nowrap"><strong>${s.last_name}</strong> ${s.first_name}</td>
          ${subjects.map((sub) => html`<td class="num">${fmt(s.subjects[sub.id].average)}</td>`)}
          <td class="num"><strong>${fmt(s.average)}</strong></td>
          <td class="small">${s.appreciation}</td>
          <td>${s.distinction ? html`<span class="badge ${s.distinction === 'Avertissement' ? '' : 'green'}">${s.distinction}</span>` : ''}</td>
          <td style="min-width:200px">${d.canEditCouncil ? html`<input name="appreciation" value="${cn.appreciation}" placeholder="Ex. : Bon travail, continuez" aria-label="Appréciation du conseil">` : cn.appreciation}</td>
          ${d.isLast ? html`<td style="min-width:180px">${d.canEditCouncil ? html`<input name="decision" list="decisions" value="${cn.decision}" aria-label="Décision">` : cn.decision}</td>` : ''}
          <td class="actions">${d.canEditCouncil ? html`<a class="btn sm" href="#/bulletins/${d.class.id}?periode=${d.period.id}&eleve=${s.id}">Bulletin</a>` : ''}</td>
        </tr>`;
      })}</tbody>
      <tfoot><tr><td></td><td><strong>Moyenne de la classe</strong></td>
        ${subjects.map((s) => html`<td class="num"><strong>${fmt(s.classAverage)}</strong></td>`)}
        <td class="num"><strong>${fmt(stats.average)}</strong></td><td colspan="${d.isLast ? 5 : 4}"></td></tr></tfoot>
    </table></div>
    <datalist id="decisions">${DECISIONS.map((x) => html`<option value="${x}">`)}</datalist>`}`.s;

  $$('tr[data-student]', view).forEach((tr) => {
    const inputs = $$('input', tr);
    inputs.forEach((input) => input.addEventListener('change', async () => {
      try {
        await api('PUT', `/api/classes/${d.class.id}/council`, {
          period_id: d.period.id,
          student_id: tr.dataset.student,
          appreciation: $('[name=appreciation]', tr)?.value ?? '',
          decision: $('[name=decision]', tr)?.value ?? '',
        });
        toast('Enregistré.');
      } catch (e) {
        toast(e.message, 'error');
      }
    }));
  });

  $('#csv', view).onclick = () => {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['Rang', 'Nom', 'Prénom(s)', ...subjects.map((s) => `${s.name} (coef. ${fmtNum(s.coefficient)})`), 'Moyenne', 'Appréciation', 'Distinction', 'Appréciation du conseil', 'Décision'],
      ...rows.map((s) => [rankLabel(s.rank, s.tie, s.sex), s.last_name, s.first_name,
        ...subjects.map((sub) => fmt(s.subjects[sub.id].average)), fmt(s.average), s.appreciation, s.distinction,
        council[s.id]?.appreciation, council[s.id]?.decision]),
    ];
    const blob = new Blob([`﻿${lines.map((l) => l.map(cell).join(';')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `resultats-${d.class.name}-${d.period.name}.csv`.replace(/\s+/g, '-');
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

// =============================================================== bulletins

async function viewBulletins(view, [classId], query) {
  const qs = new URLSearchParams({ period: query.get('periode') || state.periodId });
  if (query.get('eleve')) qs.set('student', query.get('eleve'));
  const d = await api('GET', `/api/classes/${classId}/bulletins?${qs}`);
  document.title = `Bulletins ${d.class.name} — ${d.period.name}`;
  view.innerHTML = html`
    <div class="print-toolbar">
      <a class="btn" href="#/resultats/${d.class.id}">← Retour</a>
      <span class="grow"><strong>${d.class.name}</strong> · ${d.period.name} · ${d.bulletins.length} bulletin(s)</span>
      <button class="btn primary" id="print">Imprimer / Enregistrer en PDF</button>
    </div>
    <div class="bulletins">${d.bulletins.length ? d.bulletins.map((b) => bulletinPage(d, b)) : html`<p class="empty">Aucun élève.</p>`}</div>`.s;
  $('#print').onclick = () => window.print();
  window.addEventListener('hashchange', () => { document.title = 'Ndamely — Gestion scolaire'; }, { once: true });
}

/** En-tête officiel des bulletins (aussi affiché en aperçu dans la page Établissement). */
function bulletinHeader(school, yearLabel, className) {
  return html`<header class="b-head">
    <div class="rep">
      <strong>RÉPUBLIQUE DU SÉNÉGAL</strong><br>Un Peuple – Un But – Une Foi
      <div class="flag"><i style="background:#00853f"></i><i style="background:#fdef42"></i><i style="background:#e31b23"></i></div>
      Ministère de l'Éducation nationale<br>
      ${school.academy ? html`Inspection d'Académie de ${school.academy}<br>` : ''}
      ${school.ief ? html`IEF de ${school.ief}` : ''}
    </div>
    <div class="school">
      <strong>${school.name}</strong>
      ${school.motto ? html`<em>${school.motto}</em><br>` : ''}
      ${school.address}${school.city ? ` — ${school.city}` : ''}<br>
      ${school.phone ? `Tél. : ${school.phone}` : ''}${school.email ? ` · ${school.email}` : ''}
    </div>
    <div class="meta">Année scolaire<br><strong>${yearLabel}</strong><br><br>Classe : <strong>${className}</strong></div>
  </header>`;
}

function bulletinPage(d, b) {
  const { school, class: c, period, subjects, stats } = d;
  const s = b.student;
  const scale = c.scale;
  const primary = c.cycle === 'primaire'; // un seul maître : pas de colonne « Professeur »
  // Élémentaire (seules les compositions comptent) ou classe sans devoirs : pas de colonnes devoirs / compo.
  const withDevoirs = !primary && (d.hasDevoirs ??= d.bulletins.some((x) => Object.values(x.student.subjects).some((r) => r.devoirs !== null)));
  const tick = (on) => html`<span class="box">${on ? '✓' : ''}</span>`;
  const distinctions = ["Tableau d'honneur", 'Encouragements', 'Félicitations', 'Avertissement'];
  return html`<section class="bulletin">
    ${bulletinHeader(school, c.year_label, c.name)}

    <div class="b-title"><h1>Bulletin de notes — ${period.name}</h1></div>

    <div class="b-info">
      <div><span>Prénom(s) et nom :</span><strong>${s.first_name} ${s.last_name}</strong></div>
      <div><span>Né(e) le :</span>${fmtBirth(s.birth_date) || '—'}${s.birth_place ? ` à ${s.birth_place}` : ''}</div>
      <div><span>Sexe :</span>${s.sex === 'F' ? 'Féminin' : 'Masculin'}</div>
      <div><span>Effectif de la classe :</span>${stats.count}</div>
      <div><span>${primary ? 'Maître / maîtresse :' : 'Professeur principal :'}</span>${c.main_teacher_name || '—'}</div>
    </div>

    <table class="b-grades">
      <thead><tr>
        <th style="text-align:left">Matières</th><th>Coef.</th>${withDevoirs ? html`<th>Moy. devoirs</th><th>Compo.</th>` : ''}
        <th>Moy. /${scale}</th><th>Moy. × coef.</th><th>Rang</th><th style="text-align:left">Appréciation</th>${primary ? '' : html`<th style="text-align:left">Professeur</th>`}
      </tr></thead>
      <tbody>${subjects.map((sub) => {
        const r = s.subjects[sub.id];
        return html`<tr>
          <td>${sub.name}</td><td class="n">${fmtNum(sub.coefficient)}</td>
          ${withDevoirs ? html`<td class="n">${fmt(r.devoirs)}</td><td class="n">${fmt(r.composition)}</td>` : ''}
          <td class="n"><strong>${fmt(r.average)}</strong></td><td class="n">${fmt(r.weighted)}</td>
          <td class="n">${rankLabel(r.rank, r.tie, s.sex)}</td><td>${r.appreciation}</td>${primary ? '' : html`<td>${sub.teacher_name || ''}</td>`}
        </tr>`;
      })}</tbody>
      <tfoot><tr><td>Totaux</td><td class="n">${fmtNum(s.totalCoef)}</td>${withDevoirs ? html`<td></td><td></td>` : ''}<td></td>
        <td class="n">${fmt(s.totalPoints)}</td><td colspan="${primary ? 2 : 3}"></td></tr></tfoot>
    </table>

    <div class="b-summary">
      <div class="b-box">
        <h3>Résultats de l'élève</h3>
        <div>Moyenne générale : <span class="big">${fmt(s.average)}</span> / ${scale}</div>
        <div>Rang : <strong>${rankLabel(s.rank, s.tie, s.sex) || '–'}</strong> sur ${stats.count}</div>
        <div>Appréciation : <strong>${s.appreciation || '–'}</strong></div>
      </div>
      <div class="b-box">
        <h3>Résultats de la classe</h3>
        <table>
          <tr><td>Moyenne de la classe</td><td>${fmt(stats.average)}</td></tr>
          <tr><td>Plus forte moyenne</td><td>${fmt(stats.max)}</td></tr>
          <tr><td>Plus faible moyenne</td><td>${fmt(stats.min)}</td></tr>
        </table>
      </div>
      <div class="b-box">
        <h3>Récapitulatif</h3>
        <table>
          ${b.history.map((h) => html`<tr><td>${h.name}</td><td>${fmt(h.average)}${h.rank ? ` (${rankLabel(h.rank, h.tie, s.sex)})` : ''}</td></tr>`)}
          ${b.annual ? html`<tr><td><strong>Moyenne annuelle</strong></td><td>${fmt(b.annual.average)} (${rankLabel(b.annual.rank, b.annual.tie, s.sex)})</td></tr>` : ''}
        </table>
      </div>
    </div>

    <div class="b-distinctions">${distinctions.map((x) => html`<span>${tick(s.distinction === x)}${x}</span>`)}</div>

    <div class="b-council">
      <strong>Appréciation du conseil de classe :</strong> ${b.council.appreciation}
      ${d.isLast ? html`<br><strong>Décision de fin d'année :</strong> ${b.council.decision}` : ''}
    </div>

    <div class="b-sign">
      <div>${primary ? 'Le maître / La maîtresse' : 'Le professeur principal'}<br><small>${c.main_teacher_name || ''}</small></div>
      <div>Le chef d'établissement<br><small>${school.director_name}</small></div>
      <div>Signature du parent</div>
    </div>
    <div class="b-foot">Bulletin édité le ${today()} avec Ndamely · Toute rature ou surcharge rend ce document nul.</div>
  </section>`;
}

// =============================================================== matières

/** Abréviation d'une matière : « Calcul et mathématiques » → « Cm », « Dictée » → « Di ». */
function subjectAbbr(name) {
  const words = String(name).replace(/[^\p{L}\s'’-]/gu, ' ').split(/[\s'’-]+/)
    .filter((w) => w.length > 2 && !['et', 'des', 'les', 'la', 'de', 'du'].includes(w.toLowerCase()));
  if (words.length > 1) return words[0][0].toUpperCase() + words[1][0].toLowerCase();
  const w = words[0] ?? String(name);
  return w.slice(0, 1).toUpperCase() + w.slice(1, 2).toLowerCase();
}

/** Champ coefficient avec boutons − et +. */
function coefStepper(name, value = 1) {
  return html`<div class="stepper" data-stepper>
    <button type="button" class="btn" data-step="-1" aria-label="Diminuer le coefficient">−</button>
    <input name="${name}" value="${fmtNum(value)}" inputmode="decimal" required aria-label="Coefficient">
    <button type="button" class="btn" data-step="1" aria-label="Augmenter le coefficient">+</button>
  </div>`;
}
function bindSteppers(root) {
  $$('[data-stepper]', root).forEach((st) => {
    const input = $('input', st);
    $$('[data-step]', st).forEach((b) => (b.onclick = () => {
      const v = Number(String(input.value).replace(',', '.')) || 1;
      input.value = fmtNum(Math.min(20, Math.max(1, Math.round(v) + Number(b.dataset.step))));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }));
  });
}

async function viewSubjects(view) {
  const [subjects, classes] = await Promise.all([api('GET', '/api/subjects'), api('GET', '/api/classes')]);
  // Les cycles ne servent qu'aux établissements qui ont à la fois l'élémentaire et le collège-lycée.
  const mixed = state.me.school.school_type === 'mixte';
  const cycleField = (value = 'tous') => (mixed ? selectField('Cycle', 'cycle', SUBJECT_CYCLES, value) : '');
  const order = { primaire: 0, secondaire: 1, tous: 2 };
  const rows = mixed ? [...subjects].sort((a, b) => order[a.cycle] - order[b.cycle] || a.name.localeCompare(b.name, 'fr')) : subjects;
  const segments = Math.min(6, Math.max(3, Math.ceil(Math.max(0, ...subjects.map((s) => s.default_coefficient)))));
  const coefView = (c) => html`<span class="coef"><span class="coef-num">${fmtNum(c)}</span>
    <span class="coef-bar" aria-hidden="true">${Array.from({ length: segments }, (_, i) => html`<i class="${i < Math.round(c) ? 'on' : ''}"></i>`)}</span></span>`;

  view.innerHTML = html`
    <div class="page-head">
      <div class="title-with-icon"><span class="title-icon">${icon('subjects')}</span>
        <div><h1>Matières</h1><p class="muted">${plural(subjects.length, 'matière')}${classes.length ? ` · enseignées dans ${classes.length > 1 ? `les ${classes.length} classes` : 'la classe'}` : ''}</p></div></div>
      <button class="btn primary lg" type="button" id="go-add">${icon('plus')}Nouvelle matière</button>
    </div>

    <div class="notice info wide"><span class="notice-icon">${icon('info')}</span><div>
      <strong>Comment fonctionne le coefficient ?</strong>
      <p>Le coefficient par défaut est proposé quand on ajoute la matière à une classe. Il reste modifiable classe par classe.${mixed ? ' Le cycle indique à quelles classes la matière est proposée : élémentaire, collège et lycée, ou tous.' : ''}</p>
    </div></div>

    <div>
      <section class="card team-list">
        <div class="team-toolbar"><h2 style="margin:0">Toutes les matières</h2>
          <label class="search">${icon('search')}<input type="search" id="subject-search" placeholder="Rechercher une matière" aria-label="Rechercher une matière"></label></div>
        ${rows.length ? html`<div class="table-wrap flat"><table class="data subjects-table">
          <thead><tr><th>Matière</th>${mixed ? html`<th>Cycle</th>` : ''}<th>Coef. par défaut</th><th>Utilisée dans</th><th class="actions">Actions</th></tr></thead>
          <tbody>${rows.map((s) => html`<tr data-search="${s.name.toLowerCase()}">
            <td><span class="subject-name"><span class="abbr">${subjectAbbr(s.name)}</span><strong>${s.name}</strong></span></td>
            ${mixed ? html`<td><span class="badge ${s.cycle === 'tous' ? '' : 'green'}">${SUBJECT_CYCLES.find(([k]) => k === s.cycle)?.[1]}</span></td>` : ''}
            <td>${coefView(s.default_coefficient)}</td>
            <td><span class="used">${icon('classes')}${s.used ? plural(s.used, 'classe') : 'Aucune classe'}</span></td>
            <td class="actions"><button class="btn sm" data-edit="${s.id}">${icon('notes')}Modifier</button>
              <button class="btn sm icon-only danger" data-del="${s.id}" ${raw(s.used ? 'disabled' : '')}
                title="${s.used ? 'Retirez d\'abord la matière des classes qui l\'utilisent' : 'Supprimer'}" aria-label="Supprimer ${s.name}">${icon('trash')}</button></td>
          </tr>`)}</tbody></table></div>
          <p class="empty" id="no-subject" hidden>Aucune matière ne correspond.</p>`
          : html`<p class="empty">Aucune matière pour le moment.</p>`}
      </section>

    </div>`.s;

  bindSteppers(view);
  $('#subject-search', view)?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    let shown = 0;
    $$('tr[data-search]', view).forEach((tr) => { const ok = !q || tr.dataset.search.includes(q); tr.hidden = !ok; shown += ok; });
    $('#no-subject', view).hidden = shown > 0;
  });
  $('#go-add', view).onclick = () => {
    openDialog({
      title: 'Nouvelle matière',
      submitLabel: 'Ajouter la matière',
      body: html`<p class="small muted" style="margin:0">Elle pourra ensuite être ajoutée aux classes.</p>
        ${field('Nom de la matière', 'name', { required: true, placeholder: "Ex. : Sciences d'observation" })}
        <div class="field"><span>Coefficient par défaut</span>${coefStepper('default_coefficient', 1)}</div>
        ${cycleField()}`,
      onSubmit: async (data) => {
        await api('POST', '/api/subjects', data);
        toast('Matière ajoutée.');
        render();
      },
    });
    const dlg = $('dialog.dialog:last-of-type');
    bindSteppers(dlg);
    $('[name=name]', dlg).focus();
  };
  $$('[data-edit]', view).forEach((b) => (b.onclick = () => {
    const s = subjects.find((x) => x.id === Number(b.dataset.edit));
    openDialog({
      title: 'Modifier la matière',
      body: html`${field('Nom de la matière', 'name', { required: true, value: s.name })}
        <div class="field"><span>Coefficient par défaut</span>${coefStepper('default_coefficient', s.default_coefficient)}</div>
        ${cycleField(s.cycle)}
        <p class="small muted">Changer le coefficient par défaut ne modifie pas les classes où la matière est déjà enseignée.</p>`,
      onSubmit: async (data) => {
        await api('PUT', `/api/subjects/${s.id}`, data);
        toast('Matière modifiée.');
        render();
      },
    });
    bindSteppers($('dialog.dialog:last-of-type'));
  }));
  $$('[data-del]', view).forEach((b) => (b.onclick = async () => {
    if (!confirm('Supprimer cette matière ?')) return;
    await api('DELETE', `/api/subjects/${b.dataset.del}`).catch((e) => toast(e.message, 'error'));
    render();
  }));
}

// =============================================================== équipe

function tempPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}

function subjectChecks(subjects, selected = []) {
  return html`<fieldset class="checks"><legend>Matière(s) enseignée(s)</legend>
    ${subjects.map((s) => html`<label><input type="checkbox" name="subject_ids" value="${s.id}" ${raw(selected.includes(s.id) ? 'checked' : '')}>${s.name}</label>`)}
  </fieldset>`;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

async function viewTeachers(view, _params, query) {
  // Au collège et au lycée, chaque professeur a sa ou ses matières ; à l'élémentaire, un maître par classe.
  const hasSecondary = state.me.school.school_type !== 'primaire';
  const [users, allSubjects, classes] = await Promise.all([
    api('GET', '/api/users'),
    hasSecondary ? api('GET', '/api/subjects') : [],
    hasPrimary() ? api('GET', '/api/classes') : [],
  ]);
  const subjects = allSubjects.filter((s) => s.cycle !== 'primaire'); // les maîtres enseignent tout
  const primaryClasses = classes.filter((c) => c.cycle === 'primaire');
  const withoutTeacher = primaryClasses.filter((c) => !c.main_teacher_id);
  const classOptions = [
    ['', !primaryClasses.length ? '— Aucune classe créée —' : withoutTeacher.length ? 'Choisir une classe sans maître' : '— Aucune —'],
    ...withoutTeacher.map((c) => [c.id, c.name]),
    ...primaryClasses.filter((c) => c.main_teacher_id).map((c) => [c.id, `${c.name} (actuellement : ${c.main_teacher_name})`]),
  ];
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const withSubjects = (data, form) => ({ ...data, subject_ids: new FormData(form).getAll('subject_ids') });
  const admins = users.filter((u) => u.role === 'admin').length;
  const teachers = users.length - admins;
  const tab = ['enseignant', 'admin'].includes(query.get?.('role')) ? query.get('role') : 'tous';

  const roleBadge = (u) => (u.role === 'admin'
    ? html`<span class="role-badge admin">${icon('shield')}Administrateur</span>`
    : html`<span class="role-badge">${icon('teacher')}Enseignant</span>`);
  const classesCell = (u) => {
    if (u.role === 'admin' && !u.main_of && !u.classes_taught) {
      return html`<span class="cell-label">Classes</span><span class="muted">Toutes les classes</span>`;
    }
    const main = u.main_of ? u.main_of.split(',') : [];
    // Un maître enseigne déjà toutes les matières de sa classe : inutile de la répéter.
    const others = (u.classes_taught ? u.classes_taught.split(',') : []).filter((n) => !main.includes(n));
    const subjectsTaught = u.subject_ids.map((id) => subjectName.get(id)).filter(Boolean);
    return html`
      ${main.length ? html`<span class="cell-label">${hasSecondary ? 'Maître / prof. principal' : 'Maître de la classe'}</span>
        <span class="class-chips">${main.map((n) => html`<span class="class-chip">${icon('classes')}${n}</span>`)}</span>` : ''}
      ${others.length ? html`<span class="cell-label">Enseigne en</span><span class="class-chips">${others.map((n) => html`<span class="class-chip">${icon('classes')}${n}</span>`)}</span>` : ''}
      ${hasSecondary && subjectsTaught.length ? html`<span class="cell-label">Matières</span><span class="small">${subjectsTaught.join(', ')}</span>` : ''}
      ${!main.length && !others.length && !(hasSecondary && subjectsTaught.length)
        ? html`<span class="cell-label">Classe</span><span class="muted">Aucune classe pour l'instant</span>` : ''}`;
  };

  view.innerHTML = html`
    <div class="page-head">
      <div class="title-with-icon"><span class="title-icon">${icon('team')}</span>
        <div><h1>Équipe</h1><p class="muted">${plural(users.length, 'membre')} · ${plural(admins, 'administrateur')} · ${plural(teachers, 'enseignant')}</p></div></div>
      <button class="btn primary lg" type="button" id="go-add">${icon('userPlus')}Ajouter un membre</button>
    </div>

    <div>
      <section class="card team-list">
        <div class="team-toolbar">
          <div class="seg" role="tablist">
            ${[['tous', 'Tous', users.length], ['enseignant', 'Enseignants', teachers], ['admin', 'Administrateurs', admins]].map(([k, label, n]) =>
              html`<button type="button" role="tab" data-tab="${k}" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}">${label} · ${n}</button>`)}
          </div>
          <label class="search">${icon('search')}<input type="search" id="member-search" placeholder="Rechercher un membre" aria-label="Rechercher un membre"></label>
        </div>
        <div class="members">${users.map((u) => html`<div class="member" data-role="${u.role}" data-search="${`${u.name} ${u.email} ${u.phone} ${u.main_of ?? ''}`.toLowerCase()}">
          <div class="member-id">
            <span class="avatar lg ${u.role === 'admin' ? 'dark' : ''}">${initials(u.name)}</span>
            <div><strong>${u.name}${u.id === state.me.user.id ? html` <span class="muted small">(vous)</span>` : ''}</strong>${roleBadge(u)}</div>
          </div>
          <div class="member-classes">${classesCell(u)}</div>
          <div class="member-contact">
            <span>${icon('mail')}${u.email}</span>
            ${u.phone ? html`<span>${icon('phone')}${u.phone}</span>` : ''}
          </div>
          <div class="member-actions">
            <button class="btn" data-edit="${u.id}">${icon('notes')}Modifier</button>
            ${u.id !== state.me.user.id ? html`<button class="btn icon-only danger" data-del="${u.id}" title="Supprimer" aria-label="Supprimer ${u.name}">${icon('trash')}</button>` : ''}
          </div>
        </div>`)}</div>
        <p class="empty" id="no-member" hidden>Aucun membre ne correspond.</p>
      </section>

    </div>`.s;

  // Filtre par onglet et recherche
  let current = tab;
  const applyFilter = () => {
    const q = $('#member-search', view).value.trim().toLowerCase();
    let shown = 0;
    $$('.member', view).forEach((m) => {
      const ok = (current === 'tous' || m.dataset.role === current) && (!q || m.dataset.search.includes(q));
      m.hidden = !ok;
      shown += ok;
    });
    $('#no-member', view).hidden = shown > 0;
  };
  $$('[data-tab]', view).forEach((b) => (b.onclick = () => {
    current = b.dataset.tab;
    $$('[data-tab]', view).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
    applyFilter();
  }));
  $('#member-search', view).addEventListener('input', applyFilter);
  applyFilter();

  // « Ajouter un membre » : formulaire dans une fenêtre.
  $('#go-add', view).onclick = () => {
    openDialog({
      title: 'Ajouter un membre',
      submitLabel: "Ajouter à l'équipe",
      body: html`<p class="small muted" style="margin:0">Communiquez-lui son e-mail et son mot de passe provisoire.</p>
        <div class="field"><span>Rôle</span>
          <div class="role-pick">
            <label><input type="radio" name="role" value="enseignant" checked><span>Enseignant</span></label>
            <label><input type="radio" name="role" value="admin"><span>Administrateur</span></label>
          </div>
        </div>
        ${field('Prénom et nom', 'name', { required: true, placeholder: 'Ex. : Fatou Sarr' })}
        ${field('E-mail de connexion', 'email', { type: 'email', required: true, placeholder: 'nom@exemple.com' })}
        ${iconField('Téléphone', 'phone', { prefix: '+221', type: 'tel', inputmode: 'tel', placeholder: '77 000 00 00' })}
        <div class="teacher-only">
          ${hasPrimary() ? selectField(hasSecondary ? 'Classe dont il est le maître (élémentaire)' : 'Classe dont il est le maître', 'class_id', classOptions) : ''}
          ${hasSecondary ? subjectChecks(subjects) : ''}
        </div>
        ${field('Mot de passe provisoire', 'password', { required: true, value: tempPassword() })}`,
      onSubmit: async (data, f) => {
        if (data.role === 'admin') delete data.class_id;
        await api('POST', '/api/users', data.role === 'admin' ? data : withSubjects(data, f));
        toast('Membre ajouté.');
        render();
      },
    });
    const form = $('dialog.dialog:last-of-type form');
    // Les champs propres aux enseignants (classe, matières) disparaissent pour un administrateur.
    const syncRole = () => {
      const teacher = form.elements.role.value === 'enseignant';
      $('.teacher-only', form).hidden = !teacher;
      $$('.role-pick label', form).forEach((l) => l.classList.toggle('on', $('input', l).checked));
    };
    $$('input[name=role]', form).forEach((r) => r.addEventListener('change', syncRole));
    syncRole();
    $('[name=name]', form).focus();
  };
  $$('[data-edit]', view).forEach((b) => (b.onclick = () => {
    const u = users.find((x) => x.id === Number(b.dataset.edit));
    openDialog({
      title: u.name,
      body: html`${field('Prénom et nom', 'name', { required: true, value: u.name })}
        ${iconField('Téléphone', 'phone', { prefix: '+221', type: 'tel', value: u.phone })}
        ${hasSecondary && u.role === 'enseignant' ? subjectChecks(subjects, u.subject_ids) : ''}
        ${field('Nouveau mot de passe (laisser vide pour ne pas changer)', 'password', { autocomplete: 'new-password' })}`,
      onSubmit: async (data, f) => {
        await api('PUT', `/api/users/${u.id}`, hasSecondary && u.role === 'enseignant' ? withSubjects(data, f) : data);
        toast('Enregistré.');
        render();
      },
    });
  }));
  $$('[data-del]', view).forEach((b) => (b.onclick = async () => {
    const u = users.find((x) => x.id === Number(b.dataset.del));
    if (!confirm(`Supprimer le compte de ${u.name} ? Ses notes saisies sont conservées.`)) return;
    await api('DELETE', `/api/users/${u.id}`);
    render();
  }));
}

// =============================================================== établissement

let schoolSavedAt = null; // heure du dernier enregistrement, affichée à côté du bouton

/** Champ de saisie précédé d'une icône (ou d'un préfixe comme « +221 »). */
function iconField(label, name, { ic, prefix, ...opts }) {
  const f = field(label, name, opts).s;
  const lead = prefix ? `<span class="prefix">${esc(prefix)}</span>` : icon(ic).s;
  return raw(f.replace(/<input /, `<span class="input-deco">${lead}<input `).replace(/<\/label>$/, '</span></label>'));
}

function schoolPreview(school, yearLabel, periodName, className) {
  return html`<div class="paper">
    ${bulletinHeader(school, yearLabel, className)}
    <div class="paper-title">Bulletin de notes${periodName ? ` · ${periodName}` : ''}</div>
    <div class="paper-lines"><i></i><i></i><i></i></div>
  </div>`;
}

async function viewSchool(view) {
  const { school, years } = state.me;
  const savedAt = schoolSavedAt;
  schoolSavedAt = null;
  const classes = await api('GET', '/api/classes').catch(() => []);
  const activeYear = years.find((y) => y.id === state.me.activeYearId);
  const periodName = activeYear?.periods.find((p) => p.id === state.periodId)?.name ?? activeYear?.periods[0]?.name ?? '';
  const sampleClass = classes[0]?.name ?? (isPrimarySchool() ? 'CI A' : '6e A');
  const preview = (s) => schoolPreview(s, activeYear?.label ?? '', periodName, sampleClass);

  view.innerHTML = html`
    <div class="page-head school-head">
      <div class="title-with-icon"><span class="title-icon">${icon('school')}</span>
        <div><h1>Établissement</h1><p class="muted">Ces informations apparaissent en en-tête de tous les bulletins.</p></div></div>
      <div class="row">
        ${savedAt ? html`<span class="saved-note">${icon('tick')}Enregistré à ${savedAt}</span>` : ''}
        <button class="btn lg" type="button" id="cancel">Annuler</button>
        <button class="btn primary lg" type="submit" form="f">${icon('tick')}Enregistrer</button>
      </div>
    </div>

    <div class="school-grid">
      <form id="f" class="school-form">
        <section class="card form-card">
          <header><h2>Identité de l'école</h2><p>Nom, statut et devise affichés sur les bulletins.</p></header>
          <div class="form-card-body">
            ${field("Nom de l'établissement", 'name', { required: true, value: school.name })}
            <div class="two">
              ${selectField('Statut', 'status', [['prive', 'Privé'], ['public', 'Public']], school.status)}
              ${selectField("Niveaux d'enseignement", 'school_type', [['primaire', 'Élémentaire (CI – CM2)'], ['secondaire', 'Collège et lycée'], ['mixte', 'Élémentaire, collège et lycée']], school.school_type)}
            </div>
            <div class="motto">${iconField('Devise', 'motto', { ic: 'quote', value: school.motto, placeholder: 'Ex. : Travail – Discipline – Réussite' })}</div>
          </div>
        </section>

        <section class="card form-card">
          <header><h2>Direction et rattachement</h2><p>Chef d'établissement et autorités académiques.</p></header>
          <div class="form-card-body">
            ${iconField("Nom du chef d'établissement", 'director_name', { ic: 'user', value: school.director_name })}
            <div class="two">
              ${field("Inspection d'Académie (IA)", 'academy', { value: school.academy, placeholder: 'Ex. : Dakar' })}
              ${field("Inspection de l'Éducation et de la Formation (IEF)", 'ief', { value: school.ief, placeholder: 'Ex. : Dakar Plateau' })}
            </div>
          </div>
        </section>

        <section class="card form-card">
          <header><h2>Coordonnées</h2><p>Pour que les parents puissent joindre l'école.</p></header>
          <div class="form-card-body">
            <div class="two">
              ${iconField('Adresse', 'address', { ic: 'pin', value: school.address, placeholder: 'Ex. : Tivaouane Peul, APIX' })}
              ${field('Ville', 'city', { value: school.city, placeholder: 'Ex. : Dakar' })}
            </div>
            <div class="two">
              ${iconField('Téléphone', 'phone', { prefix: '+221', type: 'tel', value: school.phone, placeholder: '33 800 00 00' })}
              ${iconField('E-mail', 'email', { ic: 'mail', type: 'email', value: school.email, placeholder: 'contact@ecole.sn' })}
            </div>
          </div>
        </section>

        ${isPrimarySchool() ? html`<input type="hidden" name="compo_weight" value="${school.compo_weight}">`
          : html`<section class="card form-card">
          <header><h2>Règle de calcul</h2><p>Poids de la composition dans la moyenne de chaque matière.</p></header>
          <div class="form-card-body">${selectField(hasPrimary() ? 'Moyenne de chaque matière au collège et au lycée' : 'Moyenne de chaque matière', 'compo_weight', [
            ['1', '(Moyenne des devoirs + Composition) ÷ 2'],
            ['2', '(Moyenne des devoirs + 2 × Composition) ÷ 3'],
            ['3', '(Moyenne des devoirs + 3 × Composition) ÷ 4'],
          ], school.compo_weight)}</div>
        </section>`}
        <p class="form-error" hidden></p>
      </form>

      <aside class="preview-col">
        <div class="preview-head"><h2>Aperçu du bulletin</h2><span class="pill live">Mis à jour en direct</span></div>
        <div class="preview-frame" id="preview">${preview(school)}</div>
        ${classes[0] ? html`<a class="btn block" href="#/bulletins/${classes[0].id}?periode=${state.periodId}">${icon('printer')}Voir un bulletin exemple</a>` : ''}
      </aside>
    </div>

    <section class="card form-card years-card">
      <header class="with-action"><div><h2>Années scolaires</h2><p>L'année active est celle utilisée pour la saisie des notes.</p></div>
        <button class="btn outline-primary" type="button" id="new-year">${icon('plus')}Nouvelle année scolaire</button></header>
      <div class="form-card-body">${years.map((y) => {
        const active = y.id === state.me.activeYearId;
        return html`<div class="year-row ${active ? 'active' : ''}">
          <span class="year-icon">${icon('calendar')}</span>
          <div class="year-label"><strong>${y.label}</strong>${active ? html`<span class="badge solid">Active</span>` : ''}</div>
          <div class="chips">${y.periods.map((p) => html`<span class="chip ${active && p.id === state.periodId ? 'current' : ''}">${p.name}${active && p.id === state.periodId ? ' · en cours' : ''}</span>`)}</div>
          <div class="row">
            ${active ? '' : html`<button class="btn sm" data-activate="${y.id}">Activer</button>`}
            <button class="btn" data-edit-year="${y.id}">${icon('notes')}Modifier</button>
          </div>
        </div>`;
      })}</div>
    </section>`.s;

  const form = $('#f', view);
  // Aperçu mis à jour à chaque frappe, à partir des valeurs du formulaire.
  const refresh = () => { $('#preview', view).innerHTML = preview({ ...school, ...formData(form) }).s; };
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  $('#cancel', view).onclick = () => { form.reset(); refresh(); $('.form-error', form).hidden = true; };

  bindForm(form, async (data) => {
    await api('PUT', '/api/school', data);
    await loadMe();
    toast('Informations enregistrées.');
    schoolSavedAt = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    render();
  });
  $('#new-year', view).onclick = () => openDialog({
    title: 'Nouvelle année scolaire',
    submitLabel: 'Créer',
    body: html`<div class="form-grid">
        ${field('Année', 'label', { required: true, placeholder: 'Ex. : 2027-2028' })}
        ${selectField('Découpage', 'periodType', [['trimestre', 'Trimestres'], ['semestre', 'Semestres']], activeYear?.periods.length === 2 ? 'semestre' : 'trimestre')}
      </div>
      <p class="small muted">La nouvelle année devient l'année active. Les classes se créent ensuite pour cette année.</p>`,
    onSubmit: async (data) => {
      await api('POST', '/api/years', data);
      await loadMe();
      toast('Année scolaire créée.');
      render();
    },
  });
  $$('[data-activate]', view).forEach((b) => (b.onclick = async () => {
    await api('POST', `/api/years/${b.dataset.activate}/activate`);
    await loadMe();
    render();
  }));
  $$('[data-edit-year]', view).forEach((b) => (b.onclick = () => {
    const y = years.find((x) => x.id === Number(b.dataset.editYear));
    const currentType = y.periods.length === 3 ? 'trimestre' : 'semestre';
    openDialog({
      title: `Année scolaire ${y.label}`,
      body: html`<div class="form-grid">
          ${field('Année', 'label', { required: true, value: y.label, placeholder: 'Ex. : 2026-2027' })}
          ${selectField('Découpage', 'periodType', [['semestre', 'Semestres'], ['trimestre', 'Trimestres']], currentType)}
        </div>
        <div class="stack" id="period-names">
          ${y.periods.map((p) => field(`Nom de la période ${p.position}`, `period_${p.id}`, { required: true, value: p.name }))}
        </div>
        <p class="small muted" id="type-note" hidden>Les périodes seront renommées automatiquement.
          Passer de trimestres à semestres n'est possible que si le troisième trimestre ne contient encore aucune note.</p>`,
      onSubmit: async (data) => {
        const typeChanged = data.periodType !== currentType;
        await api('PUT', `/api/years/${y.id}`, typeChanged
          ? { label: data.label, periodType: data.periodType }
          : { label: data.label, periods: y.periods.map((p) => ({ id: p.id, name: data[`period_${p.id}`] })) });
        await loadMe();
        toast('Année scolaire modifiée.');
        render();
      },
    });
    // Changer le découpage remplace les noms des périodes : on masque leur saisie.
    const dlg = $('dialog.dialog:last-of-type');
    $('[name=periodType]', dlg).addEventListener('change', (e) => {
      const changed = e.target.value !== currentType;
      $('#period-names', dlg).hidden = changed;
      $$('#period-names input', dlg).forEach((i) => { i.required = !changed; });
      $('#type-note', dlg).hidden = !changed;
    });
  }));
}

// =============================================================== démarrage

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
render().then(flushQueue);
