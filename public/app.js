import { subjectAverage, appreciation, rankLabel } from '/shared/calc.js';

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

const QUEUE_KEY = 'bulletin.queue';
function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch { return []; }
}
function writeQueue(queue) {
  safeSet(QUEUE_KEY, JSON.stringify(queue));
  updateSync();
}

async function saveGrades(evaluationId, grades) {
  try {
    await api('PUT', `/api/evaluations/${evaluationId}/grades`, { grades });
    return 'saved';
  } catch (e) {
    if (!e.network) throw e;
    writeQueue([...readQueue().filter((q) => q.evaluationId !== evaluationId), { evaluationId, grades, at: Date.now() }]);
    return 'queued';
  }
}

async function flushQueue() {
  const queue = readQueue();
  if (!queue.length || !navigator.onLine) return;
  const remaining = [];
  for (const item of queue) {
    try {
      await api('PUT', `/api/evaluations/${item.evaluationId}/grades`, { grades: item.grades });
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
  const links = [
    ['#/', 'Tableau de bord'],
    ['#/classes', 'Classes'],
    ['#/notes', 'Saisie des notes'],
    ...(isAdmin() ? [['#/matieres', 'Matières'], ['#/enseignants', 'Équipe'], ['#/etablissement', 'Établissement']] : []),
  ];
  return html`<div class="app">
    <aside class="sidebar">
      <a class="brand" href="#/"><img src="/icon.svg" alt=""><span>Ndamely<small>${school.name}</small></span></a>
      <nav class="nav">${links.map(([href, label]) => html`<a href="${href}" class="${opts.nav === href ? 'active' : ''}">${label}</a>`)}</nav>
      <div class="me">
        <strong>${user.name}</strong>
        <span class="muted">${user.role === 'admin' ? 'Direction' : 'Enseignant'}</span><br>
        <button class="btn ghost sm" id="logout" style="padding-left:0">Se déconnecter</button>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="btn sm menu-btn" id="menu" aria-label="Menu">☰</button>
        <strong class="grow">${opts.title}</strong>
        ${year ? html`<span class="muted small">${year.label}</span>
          <select id="period" aria-label="Période">${year.periods.map((p) =>
            html`<option value="${p.id}" ${raw(p.id === state.periodId ? 'selected' : '')}>${p.name}</option>`)}</select>` : ''}
        <span id="sync" class="sync"></span>
      </header>
      <main id="view"></main>
    </div>
  </div>`;
}

function bindShell() {
  $('#logout').onclick = async () => {
    await api('POST', '/api/auth/logout').catch(() => {});
    state.me = null;
    go('#/connexion');
  };
  $('#menu').onclick = () => $('.app').classList.toggle('menu-open');
  $('#period')?.addEventListener('change', (e) => {
    state.periodId = Number(e.target.value);
    safeSet('bulletin.period', state.periodId);
    // Les pages liées à une période se rechargent sur la nouvelle période.
    const [path] = location.hash.split('?');
    go(path);
  });
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
      ${field("Nom de l'établissement", 'schoolName', { required: true, placeholder: 'Ex. : Collège Les Pionniers' })}
      <div class="form-grid">
        ${field('Ville', 'city', { placeholder: 'Ex. : Thiès' })}
        ${selectField('Statut', 'status', [['prive', 'Privé'], ['public', 'Public']])}
        ${selectField("Niveaux d'enseignement", 'schoolType', [['secondaire', 'Collège et lycée'], ['primaire', 'Élémentaire (CI – CM2)'], ['mixte', 'Élémentaire, collège et lycée']])}
        ${selectField("Découpage de l'année", 'periodType', [['semestre', 'Semestres'], ['trimestre', 'Trimestres']])}
      </div>
      <h3>Votre compte (direction)</h3>
      ${field('Prénom et nom', 'name', { required: true, autocomplete: 'name' })}
      <div class="form-grid">
        ${field('Adresse e-mail', 'email', { type: 'email', required: true, autocomplete: 'username' })}
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

async function viewDashboard(view) {
  const [dash, mySubjects] = await Promise.all([api('GET', '/api/dashboard'), api('GET', '/api/my-subjects')]);
  const { user } = state.me;
  const period = state.periodId;
  const steps = [
    ['school', "Compléter les informations de l'établissement", '#/etablissement'],
    ['teachers', 'Ajouter les enseignants', '#/enseignants'],
    ['classes', 'Créer les classes', '#/classes'],
    ['subjects', 'Définir les matières et coefficients des classes', '#/classes'],
    ['students', 'Inscrire ou importer les élèves', '#/classes'],
    ['grades', 'Saisir les premières notes', '#/notes'],
  ];
  const showChecklist = isAdmin() && Object.values(dash.checklist ?? {}).some((v) => !v);

  view.innerHTML = html`
    <div class="page-head"><div><h1>Bonjour ${user.name.split(' ')[0]}</h1>
      <p class="muted">${dash.year ? `Année scolaire ${dash.year.label}` : 'Aucune année scolaire active'}</p></div></div>
    <div class="kpis">
      <div class="kpi"><div class="label">Classes</div><div class="value">${dash.counts.classes ?? 0}</div></div>
      <div class="kpi"><div class="label">Élèves</div><div class="value">${dash.counts.students ?? 0}</div></div>
      ${isAdmin() ? html`<div class="kpi"><div class="label">Enseignants</div><div class="value">${dash.counts.teachers ?? 0}</div></div>` : ''}
      <div class="kpi"><div class="label">Évaluations saisies</div><div class="value">${dash.counts.evaluations ?? 0}</div></div>
    </div>
    ${showChecklist ? html`<div class="card"><h2>Pour bien démarrer</h2><ul class="checklist">
      ${steps.map(([k, label, href]) => html`<li class="${dash.checklist[k] ? 'done' : ''}"><span class="tick">${dash.checklist[k] ? '✓' : ''}</span><a href="${href}">${label}</a></li>`)}
    </ul></div>` : ''}
    ${mySubjects.length && !isAdmin() ? html`<div class="card"><h2>Mes matières</h2><div class="grid">
      ${mySubjects.map((s) => html`<a class="btn" href="#/notes/${s.id}">${s.class_name} · ${s.subject_name}</a>`)}
    </div></div>` : ''}
    <div class="card"><h2>Classes</h2>
      ${dash.classes.length ? html`<div class="table-wrap"><table class="data">
        <thead><tr><th>Classe</th><th>Professeur principal</th><th class="num">Élèves</th><th class="num">Matières</th><th></th></tr></thead>
        <tbody>${dash.classes.map((c) => html`<tr>
          <td><a href="#/classes/${c.id}"><strong>${c.name}</strong></a> <span class="muted small">${c.level}</span></td>
          <td>${c.main_teacher_name || html`<span class="muted">—</span>`}</td>
          <td class="num">${c.students}</td><td class="num">${c.subjects}</td>
          <td class="actions">
            <a class="btn sm" href="#/resultats/${c.id}">Résultats</a>
            ${isAdmin() || c.main_teacher_id === user.id ? html`<a class="btn sm" href="#/bulletins/${c.id}?periode=${period}">Bulletins</a>` : ''}
          </td></tr>`)}</tbody></table></div>`
        : html`<p class="empty">Aucune classe pour le moment. ${isAdmin() ? html`<a href="#/classes">Créer une classe</a>` : ''}</p>`}
    </div>`.s;
}

// =============================================================== classes

const SUBJECT_CYCLES = [['primaire', 'Élémentaire'], ['secondaire', 'Collège et lycée'], ['tous', 'Tous les cycles']];
const CYCLES = [['moyen', 'Moyen (6e – 3e)'], ['secondaire', 'Secondaire (2nde – Tle)'], ['primaire', 'Élémentaire (CI – CM2)']];

async function viewClasses(view) {
  const [classes, users] = await Promise.all([api('GET', '/api/classes'), api('GET', '/api/users')]);
  view.innerHTML = html`
    <div class="page-head"><div><h1>Classes</h1><p class="muted">${currentYear()?.label ?? ''}</p></div></div>
    ${isAdmin() ? html`<details class="panel" ${raw(classes.length ? '' : 'open')}><summary>+ Nouvelle classe</summary>
      <form id="f" class="stack">
        <div class="form-grid">
          ${field('Nom de la classe', 'name', { required: true, placeholder: 'Ex. : 6e A' })}
          ${field('Niveau', 'level', { placeholder: 'Ex. : 6e, CM2, Tle S2' })}
          ${selectField('Cycle', 'cycle', CYCLES, state.me.school.school_type === 'primaire' ? 'primaire' : 'moyen')}
          ${selectField('Barème', 'scale', [['', 'Automatique (sur 10 à l\'élémentaire, sur 20 sinon)'], ['20', 'Notes sur 20'], ['10', 'Notes sur 10']])}
          ${selectField('Professeur principal / maître', 'main_teacher_id', teacherOptions(users))}
        </div>
        <p class="form-error" hidden></p>
        <div><button class="btn primary" type="submit">Créer la classe</button></div>
      </form></details>` : ''}
    ${classes.length ? html`<div class="table-wrap"><table class="data">
      <thead><tr><th>Classe</th><th>Cycle</th><th>Barème</th><th>Prof. principal / maître</th><th class="num">Élèves</th><th></th></tr></thead>
      <tbody>${classes.map((c) => html`<tr>
        <td><a href="#/classes/${c.id}"><strong>${c.name}</strong></a> <span class="muted small">${c.level}</span></td>
        <td>${CYCLES.find(([k]) => k === c.cycle)?.[1].split(' (')[0]}</td>
        <td>/${c.scale}</td>
        <td>${c.main_teacher_name || '—'}</td>
        <td class="num">${c.students}</td>
        <td class="actions"><a class="btn sm" href="#/classes/${c.id}">Ouvrir</a> <a class="btn sm" href="#/resultats/${c.id}">Résultats</a></td>
      </tr>`)}</tbody></table></div>` : html`<p class="empty">Aucune classe.</p>`}`.s;
  if (isAdmin()) {
    bindForm($('#f'), async (data) => {
      const { id } = await api('POST', '/api/classes', data);
      toast('Classe créée.');
      go(`#/classes/${id}?onglet=matieres`);
    });
  }
}

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
    ${field('Matricule', 'matricule', { value: s.matricule })}
    ${field('Date de naissance', 'birth_date', { value: s.birth_date, placeholder: 'JJ/MM/AAAA' })}
    ${field('Lieu de naissance', 'birth_place', { value: s.birth_place })}
    ${field('Parent / tuteur', 'guardian_name', { value: s.guardian_name })}
    ${field('Téléphone du parent', 'guardian_phone', { type: 'tel', value: s.guardian_phone, inputmode: 'tel' })}
  </div>`;
}

function renderStudents(el, c) {
  const admin = isAdmin();
  el.innerHTML = html`
    ${admin ? html`<details class="panel" ${raw(c.students.length ? '' : 'open')}><summary>+ Ajouter un élève</summary>
      <form id="add" class="stack">${studentFields()}<p class="form-error" hidden></p>
        <div><button class="btn primary" type="submit">Ajouter</button></div></form></details>
    <details class="panel"><summary>Importer une liste (Excel ou CSV)</summary>
      <form id="imp" class="stack">
        <p class="small muted">Dans Excel, sélectionnez les colonnes dans cet ordre puis copiez-collez ici :<br>
          <strong>Matricule · Prénom(s) · Nom · Sexe (M/F) · Date de naissance · Lieu de naissance · Parent/tuteur · Téléphone</strong><br>
          Seuls le prénom et le nom sont obligatoires. Une ligne d'en-tête est ignorée automatiquement.</p>
        <textarea name="text" placeholder="2026001&#9;Awa&#9;Diop&#9;F&#9;12/03/2014&#9;Dakar&#9;Moussa Diop&#9;77 000 00 00"></textarea>
        <label class="field"><span>… ou choisissez un fichier CSV</span><input type="file" accept=".csv,.txt" id="csv"></label>
        <p class="form-error" hidden></p>
        <div><button class="btn primary" type="submit">Importer</button></div>
      </form></details>` : ''}
    ${c.students.length ? html`<div class="table-wrap"><table class="data">
      <thead><tr><th>N°</th><th>Matricule</th><th>Nom</th><th>Prénom(s)</th><th>Sexe</th><th>Né(e) le</th><th>Parent / tuteur</th><th>Téléphone</th>${admin ? html`<th></th>` : ''}</tr></thead>
      <tbody>${c.students.map((s, i) => html`<tr>
        <td>${i + 1}</td><td>${s.matricule}</td><td><strong>${s.last_name}</strong></td><td>${s.first_name}</td>
        <td>${s.sex}</td><td class="nowrap">${s.birth_date}${s.birth_place ? ` à ${s.birth_place}` : ''}</td>
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
    if (file) $('#imp textarea', el).value = await file.text();
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
    ${admin && available.length ? html`<details class="panel" ${raw(c.subjects.length ? '' : 'open')}><summary>+ Ajouter une matière</summary>
      <form id="add" class="stack">
        <div class="form-grid">
          ${selectField('Matière', 'subject_id', available.map((s) => [s.id, `${s.name} (coef. ${fmtNum(s.default_coefficient)})`]), '', { required: true })}
          ${field('Coefficient', 'coefficient', { inputmode: 'decimal', placeholder: 'Par défaut' })}
          ${primary ? '' : html`<label class="field"><span>Professeur</span><select name="teacher_id" id="add-teacher"></select></label>`}
        </div>
        <p class="form-error" hidden></p>
        <div class="row"><button class="btn primary" type="submit">Ajouter</button>
          <button class="btn" type="button" id="all">Ajouter toutes les matières (${available.length})</button></div>
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
    subjectSelect.addEventListener('change', refreshTeachers);
    refreshTeachers();
    bindForm(addForm, async (data) => {
      await api('POST', `/api/classes/${c.id}/subjects`, data);
      toast('Matière ajoutée.');
      render();
    });
    $('#all', el).onclick = async () => {
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
  const list = await api('GET', '/api/my-subjects');
  const byClass = new Map();
  for (const s of list) {
    if (!byClass.has(s.class_id)) byClass.set(s.class_id, { name: s.class_name, items: [] });
    byClass.get(s.class_id).items.push(s);
  }
  view.innerHTML = html`
    <div class="page-head"><div><h1>Saisie des notes</h1>
      <p class="muted">Choisissez une matière. La période se change en haut de l'écran.</p></div></div>
    ${byClass.size ? [...byClass.values()].map((c) => html`<div class="card"><h2>${c.name}</h2><div class="grid">
      ${c.items.map((s) => html`<a class="btn" href="#/notes/${s.id}" style="justify-content:space-between">
        <span>${s.subject_name}</span><span class="muted small">coef. ${fmtNum(s.coefficient)}</span></a>`)}
    </div></div>`) : html`<p class="empty">${isAdmin()
      ? 'Aucune matière à noter. Ajoutez des matières à vos classes.'
      : "Aucune matière ne vous est attribuée. Demandez à la direction de vous affecter à vos classes."}</p>`}`.s;
}

function parseGrade(text, scale) {
  const t = String(text).trim().toLowerCase();
  if (!t) return { empty: true };
  if (t.startsWith('abs')) return { absent: true };
  const v = Number(t.replace(',', '.'));
  if (!Number.isFinite(v) || v < 0 || v > scale) return { invalid: true };
  return { value: v };
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
  const formula = compoWeight === 1 ? '(moy. devoirs + compo.) ÷ 2' : `(moy. devoirs + ${fmtNum(compoWeight)} × compo.) ÷ ${fmtNum(1 + compoWeight)}`;

  view.innerHTML = html`
    <div class="page-head">
      <div><h1>${cs.subject_name} — ${d.class.name}</h1>
        <p class="muted">${d.period.name} · notes sur ${scale} · coef. ${fmtNum(cs.coefficient)}${cs.teacher_name ? ` · ${cs.teacher_name}` : ''}</p></div>
      <div class="row">
        <button class="btn" data-new="devoir">+ Devoir</button>
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
    const r = subjectAverage(collect(devoirs), collect(compos), compoWeight);
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
  // En-têtes courts : sigle pour les intitulés de plusieurs mots (SVT, HG, EPS…).
  const short = (name) => {
    if (name.length <= 12) return name;
    const words = name.split(/[\s'’-]+/).filter((w) => w.length > 2 && !['et', 'des', 'les', 'la', 'de', 'du'].includes(w.toLowerCase()));
    return words.length > 1 ? words.map((w) => w[0].toUpperCase()).join('') : `${name.slice(0, 9)}.`;
  };

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
      ['Rang', 'Matricule', 'Nom', 'Prénom(s)', ...subjects.map((s) => `${s.name} (coef. ${fmtNum(s.coefficient)})`), 'Moyenne', 'Appréciation', 'Distinction', 'Appréciation du conseil', 'Décision'],
      ...rows.map((s) => [rankLabel(s.rank, s.tie, s.sex), s.matricule, s.last_name, s.first_name,
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

function bulletinPage(d, b) {
  const { school, class: c, period, subjects, stats } = d;
  const s = b.student;
  const scale = c.scale;
  const primary = c.cycle === 'primaire'; // un seul maître : pas de colonne « Professeur »
  const tick = (on) => html`<span class="box">${on ? '✓' : ''}</span>`;
  const distinctions = ["Tableau d'honneur", 'Encouragements', 'Félicitations', 'Avertissement'];
  return html`<section class="bulletin">
    <header class="b-head">
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
      <div class="meta">Année scolaire<br><strong>${c.year_label}</strong><br><br>Classe : <strong>${c.name}</strong></div>
    </header>

    <div class="b-title"><h1>Bulletin de notes — ${period.name}</h1></div>

    <div class="b-info">
      <div><span>Prénom(s) et nom :</span><strong>${s.first_name} ${s.last_name}</strong></div>
      <div><span>Matricule :</span>${s.matricule || '—'}</div>
      <div><span>Né(e) le :</span>${s.birth_date || '—'}${s.birth_place ? ` à ${s.birth_place}` : ''}</div>
      <div><span>Sexe :</span>${s.sex === 'F' ? 'Féminin' : 'Masculin'}</div>
      <div><span>Effectif de la classe :</span>${stats.count}</div>
      <div><span>${primary ? 'Maître / maîtresse :' : 'Professeur principal :'}</span>${c.main_teacher_name || '—'}</div>
    </div>

    <table class="b-grades">
      <thead><tr>
        <th style="text-align:left">Matières</th><th>Coef.</th><th>Moy. devoirs</th><th>Compo.</th>
        <th>Moy. /${scale}</th><th>Moy. × coef.</th><th>Rang</th><th style="text-align:left">Appréciation</th>${primary ? '' : html`<th style="text-align:left">Professeur</th>`}
      </tr></thead>
      <tbody>${subjects.map((sub) => {
        const r = s.subjects[sub.id];
        return html`<tr>
          <td>${sub.name}</td><td class="n">${fmtNum(sub.coefficient)}</td>
          <td class="n">${fmt(r.devoirs)}</td><td class="n">${fmt(r.composition)}</td>
          <td class="n"><strong>${fmt(r.average)}</strong></td><td class="n">${fmt(r.weighted)}</td>
          <td class="n">${rankLabel(r.rank, r.tie, s.sex)}</td><td>${r.appreciation}</td>${primary ? '' : html`<td>${sub.teacher_name || ''}</td>`}
        </tr>`;
      })}</tbody>
      <tfoot><tr><td>Totaux</td><td class="n">${fmtNum(s.totalCoef)}</td><td></td><td></td><td></td>
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

async function viewSubjects(view) {
  const subjects = await api('GET', '/api/subjects');
  // Les cycles ne servent qu'aux établissements qui ont à la fois l'élémentaire et le collège-lycée.
  const mixed = state.me.school.school_type === 'mixte';
  const cycleField = (value = 'tous') => (mixed ? selectField('Cycle', 'cycle', SUBJECT_CYCLES, value) : '');
  const order = { primaire: 0, secondaire: 1, tous: 2 };
  const rows = mixed ? [...subjects].sort((a, b) => order[a.cycle] - order[b.cycle] || a.name.localeCompare(b.name, 'fr')) : subjects;
  view.innerHTML = html`
    <div class="page-head"><div><h1>Matières</h1>
      <p class="muted">Liste des matières de l'établissement. Le coefficient par défaut est proposé à l'ajout dans une classe, et reste modifiable classe par classe.
      ${mixed ? " Le cycle indique à quelles classes la matière est proposée : élémentaire, collège et lycée, ou tous." : ''}</p></div></div>
    <details class="panel"><summary>+ Nouvelle matière</summary>
      <form id="f" class="stack"><div class="form-grid">
        ${field('Nom', 'name', { required: true, placeholder: 'Ex. : Arabe' })}
        ${field('Coefficient par défaut', 'default_coefficient', { value: '1', inputmode: 'decimal', required: true })}
        ${cycleField()}
      </div><p class="form-error" hidden></p><div><button class="btn primary" type="submit">Ajouter</button></div></form>
    </details>
    <div class="table-wrap"><table class="data">
      <thead><tr><th>Matière</th>${mixed ? html`<th>Cycle</th>` : ''}<th class="num">Coef. par défaut</th><th class="num">Classes</th><th></th></tr></thead>
      <tbody>${rows.map((s) => html`<tr>
        <td><strong>${s.name}</strong></td>
        ${mixed ? html`<td><span class="badge ${s.cycle === 'tous' ? '' : 'green'}">${SUBJECT_CYCLES.find(([k]) => k === s.cycle)?.[1]}</span></td>` : ''}
        <td class="num">${fmtNum(s.default_coefficient)}</td><td class="num">${s.used}</td>
        <td class="actions"><button class="btn sm" data-edit="${s.id}">Modifier</button>
          <button class="btn sm danger" data-del="${s.id}" ${raw(s.used ? 'disabled title="Utilisée dans des classes"' : '')}>Supprimer</button></td>
      </tr>`)}</tbody></table></div>`.s;
  bindForm($('#f'), async (data) => {
    await api('POST', '/api/subjects', data);
    toast('Matière ajoutée.');
    render();
  });
  $$('[data-edit]', view).forEach((b) => (b.onclick = () => {
    const s = subjects.find((x) => x.id === Number(b.dataset.edit));
    openDialog({
      title: 'Modifier la matière',
      body: html`${field('Nom', 'name', { required: true, value: s.name })}
        ${field('Coefficient par défaut', 'default_coefficient', { value: fmtNum(s.default_coefficient), inputmode: 'decimal', required: true })}
        ${cycleField(s.cycle)}`,
      onSubmit: async (data) => {
        await api('PUT', `/api/subjects/${s.id}`, data);
        render();
      },
    });
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

async function viewTeachers(view) {
  // Au collège et au lycée, chaque professeur a sa ou ses matières ; à l'élémentaire, un maître par classe.
  const hasSecondary = state.me.school.school_type !== 'primaire';
  const [users, allSubjects] = await Promise.all([api('GET', '/api/users'), hasSecondary ? api('GET', '/api/subjects') : []]);
  const subjects = allSubjects.filter((s) => s.cycle !== 'primaire'); // les maîtres enseignent tout
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const withSubjects = (data, form) => ({ ...data, subject_ids: new FormData(form).getAll('subject_ids') });

  view.innerHTML = html`
    <div class="page-head"><div><h1>Équipe</h1>
      <p class="muted">${hasSecondary
        ? "Au collège et au lycée, indiquez la ou les matières de chaque professeur : ils seront proposés en priorité quand vous affecterez un professeur à chaque matière d'une classe."
        : "À l'élémentaire, chaque classe a un seul maître, qui enseigne toutes les matières. Ajoutez les maîtres ici, puis affectez-les à leur classe dans les paramètres de la classe."}
      ${state.me.school.school_type === 'mixte' ? " À l'élémentaire, le maître de la classe enseigne toutes les matières." : ''}</p></div></div>
    <details class="panel" ${raw(users.length < 2 ? 'open' : '')}><summary>+ Ajouter un membre</summary>
      <form id="f" class="stack"><div class="form-grid">
        ${field('Prénom et nom', 'name', { required: true })}
        ${field('Adresse e-mail (identifiant)', 'email', { type: 'email', required: true })}
        ${field('Téléphone', 'phone', { type: 'tel', inputmode: 'tel' })}
        ${selectField('Rôle', 'role', [['enseignant', hasSecondary ? 'Enseignant / professeur' : 'Maître / maîtresse'], ['admin', 'Direction / secrétariat']])}
        ${field('Mot de passe provisoire', 'password', { required: true, value: tempPassword() })}
      </div>
      ${hasSecondary ? subjectChecks(subjects) : ''}
      <p class="small muted">Communiquez ce mot de passe à la personne ; vous pourrez le réinitialiser à tout moment.</p>
      <p class="form-error" hidden></p><div><button class="btn primary" type="submit">Ajouter</button></div></form>
    </details>
    <div class="table-wrap"><table class="data">
      <thead><tr><th>Nom</th>${hasSecondary ? html`<th>Matière(s)</th>` : ''}<th>Classes</th><th>Contact</th><th>Rôle</th><th></th></tr></thead>
      <tbody>${users.map((u) => html`<tr>
        <td><strong>${u.name}</strong></td>
        ${hasSecondary ? html`<td class="small">${u.subject_ids.map((id) => subjectName.get(id)).filter(Boolean).join(', ') || html`<span class="muted">—</span>`}</td>` : ''}
        <td class="small">${u.main_of ? html`<div>Prof. principal / maître : <strong>${u.main_of.split(',').join(', ')}</strong></div>` : ''}
          ${u.classes_taught ? html`<div>Enseigne en : ${u.classes_taught.split(',').join(', ')}</div>` : ''}
          ${!u.main_of && !u.classes_taught ? html`<span class="muted">—</span>` : ''}</td>
        <td class="small">${u.email}<br>${u.phone}</td>
        <td><span class="badge ${u.role === 'admin' ? 'green' : ''}">${u.role === 'admin' ? 'Direction' : 'Enseignant'}</span></td>
        <td class="actions"><button class="btn sm" data-edit="${u.id}">Modifier</button>
          ${u.id !== state.me.user.id ? html`<button class="btn sm danger" data-del="${u.id}">Supprimer</button>` : ''}</td>
      </tr>`)}</tbody></table></div>`.s;
  bindForm($('#f'), async (data, form) => {
    await api('POST', '/api/users', withSubjects(data, form));
    toast('Membre ajouté.');
    render();
  });
  $$('[data-edit]', view).forEach((b) => (b.onclick = () => {
    const u = users.find((x) => x.id === Number(b.dataset.edit));
    openDialog({
      title: u.name,
      body: html`${field('Prénom et nom', 'name', { required: true, value: u.name })}
        ${field('Téléphone', 'phone', { type: 'tel', value: u.phone })}
        ${hasSecondary ? subjectChecks(subjects, u.subject_ids) : ''}
        ${field('Nouveau mot de passe (laisser vide pour ne pas changer)', 'password', { autocomplete: 'new-password' })}`,
      onSubmit: async (data, form) => {
        await api('PUT', `/api/users/${u.id}`, hasSecondary ? withSubjects(data, form) : data);
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

async function viewSchool(view) {
  const { school, years } = state.me;
  view.innerHTML = html`
    <div class="page-head"><div><h1>Établissement</h1><p class="muted">Ces informations apparaissent en en-tête des bulletins.</p></div></div>
    <div class="card"><form id="f" class="stack">
      <div class="form-grid">
        ${field("Nom de l'établissement", 'name', { required: true, value: school.name })}
        ${selectField('Statut', 'status', [['prive', 'Privé'], ['public', 'Public']], school.status)}
        ${selectField("Niveaux d'enseignement", 'school_type', [['secondaire', 'Collège et lycée'], ['primaire', 'Élémentaire (CI – CM2)'], ['mixte', 'Élémentaire, collège et lycée']], school.school_type)}
        ${field('Devise', 'motto', { value: school.motto, placeholder: 'Ex. : Travail – Discipline – Réussite' })}
        ${field("Nom du chef d'établissement", 'director_name', { value: school.director_name })}
        ${field("Inspection d'Académie (IA)", 'academy', { value: school.academy, placeholder: 'Ex. : Dakar' })}
        ${field("Inspection de l'Éducation et de la Formation (IEF)", 'ief', { value: school.ief, placeholder: 'Ex. : Dakar Plateau' })}
        ${field('Adresse', 'address', { value: school.address })}
        ${field('Ville', 'city', { value: school.city })}
        ${field('Téléphone', 'phone', { type: 'tel', value: school.phone })}
        ${field('E-mail', 'email', { type: 'email', value: school.email })}
      </div>
      <h3>Règle de calcul</h3>
      ${selectField('Moyenne de chaque matière', 'compo_weight', [
        ['1', '(Moyenne des devoirs + Composition) ÷ 2'],
        ['2', '(Moyenne des devoirs + 2 × Composition) ÷ 3'],
        ['3', '(Moyenne des devoirs + 3 × Composition) ÷ 4'],
      ], school.compo_weight)}
      <p class="form-error" hidden></p>
      <div><button class="btn primary" type="submit">Enregistrer</button></div>
    </form></div>

    <div class="card"><h2>Années scolaires</h2>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Année</th><th>Périodes</th><th></th></tr></thead>
        <tbody>${years.map((y) => html`<tr>
          <td><strong>${y.label}</strong> ${y.id === state.me.activeYearId ? html`<span class="badge green">Active</span>` : ''}</td>
          <td>${y.periods.map((p) => p.name).join(' · ')}</td>
          <td class="actions">${y.id !== state.me.activeYearId ? html`<button class="btn sm" data-activate="${y.id}">Activer</button>` : ''}</td>
        </tr>`)}</tbody></table></div>
      <details class="panel" style="margin-top:14px"><summary>+ Nouvelle année scolaire</summary>
        <form id="y" class="stack"><div class="form-grid">
          ${field('Année', 'label', { required: true, placeholder: 'Ex. : 2027-2028' })}
          ${selectField('Découpage', 'periodType', [['semestre', 'Semestres'], ['trimestre', 'Trimestres']])}
        </div><p class="small muted">La nouvelle année devient l'année active. Les classes se créent ensuite pour cette année.</p>
        <p class="form-error" hidden></p><div><button class="btn primary" type="submit">Créer</button></div></form>
      </details>
    </div>`.s;
  bindForm($('#f'), async (data) => {
    await api('PUT', '/api/school', data);
    await loadMe();
    toast('Informations enregistrées.');
    render();
  });
  bindForm($('#y'), async (data) => {
    await api('POST', '/api/years', data);
    await loadMe();
    toast('Année scolaire créée.');
    render();
  });
  $$('[data-activate]', view).forEach((b) => (b.onclick = async () => {
    await api('POST', `/api/years/${b.dataset.activate}/activate`);
    await loadMe();
    render();
  }));
}

// =============================================================== démarrage

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
render().then(flushQueue);
