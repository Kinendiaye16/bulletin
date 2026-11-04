import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { db, tx, ROOT } from './db.js';
import { hashPassword, verifyPassword, newToken } from './auth.js';
import { createSchool, createYear, PERIOD_NAMES } from './school.js';
import { subjectCycleForClass } from './defaults.js';
import { computeClassResults, computeAnnual } from '../shared/calc.js';

const PORT = Number(process.env.PORT) || 3000;
const SESSION_MS = 30 * 24 * 3600 * 1000;
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
const MAX_BODY = 2 * 1024 * 1024;
const SCHOOL_TYPES = ['primaire', 'secondaire', 'mixte'];
const SUBJECT_CYCLES = ['primaire', 'secondaire', 'tous'];

// ---------------------------------------------------------------- outils

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};

const str = (v, max = 200) => (v === null || v === undefined ? '' : String(v).trim().slice(0, max));
function required(v, label, max) {
  const s = str(v, max);
  if (!s) fail(400, `${label} est obligatoire.`);
  return s;
}
function num(v, label, { min = -Infinity, max = Infinity } = {}) {
  const n = Number(String(v ?? '').replace(',', '.'));
  if (String(v ?? '').trim() === '' || !Number.isFinite(n) || n < min || n > max) fail(400, `${label} invalide.`);
  return n;
}
function toId(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) fail(400, 'Identifiant invalide.');
  return n;
}
const optionalId = (v) => (v === null || v === undefined || v === '' ? null : toId(v));
function email(v) {
  const s = required(v, "L'adresse e-mail").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) fail(400, "L'adresse e-mail est invalide.");
  return s;
}
function password(v) {
  const s = String(v ?? '');
  if (s.length < 8) fail(400, 'Le mot de passe doit contenir au moins 8 caractères.');
  return s;
}

const routes = [];
function route(method, pattern, handler, access = 'admin') {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
  routes.push({ method, re, keys, handler, access });
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function startSession(ctx, userId) {
  const token = newToken();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, Date.now() + SESSION_MS);
  ctx.cookies.push(`sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}${COOKIE_SECURE}`);
}

function currentUser(req) {
  const token = parseCookies(req.headers.cookie).sid;
  if (!token) return null;
  const user = db.prepare(`
    SELECT u.id, u.school_id, u.name, u.email, u.phone, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?`).get(token, Date.now());
  return user ? { ...user, token } : null;
}

// ---------------------------------------------------------------- accès aux données

const activeYear = (schoolId) =>
  db.prepare('SELECT * FROM school_years WHERE school_id = ? ORDER BY is_active DESC, label DESC LIMIT 1').get(schoolId);

function loadClass(classId, user) {
  const c = db.prepare(`
    SELECT c.*, y.school_id, y.label AS year_label, u.name AS main_teacher_name
    FROM classes c
    JOIN school_years y ON y.id = c.year_id
    LEFT JOIN users u ON u.id = c.main_teacher_id
    WHERE c.id = ?`).get(toId(classId));
  if (!c || c.school_id !== user.school_id) fail(404, 'Classe introuvable.');
  return c;
}

function loadClassSubject(csId, user) {
  const cs = db.prepare(`
    SELECT cs.*, s.name AS subject_name, u.name AS teacher_name
    FROM class_subjects cs
    JOIN subjects s ON s.id = cs.subject_id
    LEFT JOIN users u ON u.id = cs.teacher_id
    WHERE cs.id = ?`).get(toId(csId));
  if (!cs) fail(404, 'Matière introuvable.');
  const c = loadClass(cs.class_id, user);
  return { cs, c };
}

function loadPeriod(periodId, c) {
  const p = db.prepare('SELECT * FROM periods WHERE id = ?').get(toId(periodId));
  if (!p || p.year_id !== c.year_id) fail(404, 'Période introuvable.');
  return p;
}

const isAdmin = (user) => user.role === 'admin';
const teachesIn = (user, classId) =>
  !!db.prepare('SELECT 1 FROM class_subjects WHERE class_id = ? AND teacher_id = ?').get(classId, user.id);

function assertCanView(user, c) {
  if (isAdmin(user) || c.main_teacher_id === user.id || teachesIn(user, c.id)) return;
  fail(403, "Vous n'avez pas accès à cette classe.");
}
function assertCanManageResults(user, c) {
  if (isAdmin(user) || c.main_teacher_id === user.id) return;
  fail(403, 'Réservé à la direction et au professeur principal.');
}
function assertCanGrade(user, cs) {
  if (isAdmin(user) || cs.teacher_id === user.id) return;
  fail(403, "Vous n'enseignez pas cette matière dans cette classe.");
}

const studentsOf = (classId) => db.prepare(`
  SELECT st.* FROM students st JOIN enrollments e ON e.student_id = st.id
  WHERE e.class_id = ? ORDER BY st.last_name COLLATE NOCASE, st.first_name COLLATE NOCASE`).all(classId);

const classSubjectsOf = (classId) => db.prepare(`
  SELECT cs.id, cs.subject_id, cs.coefficient, cs.teacher_id, cs.position, s.name, u.name AS teacher_name
  FROM class_subjects cs
  JOIN subjects s ON s.id = cs.subject_id
  LEFT JOIN users u ON u.id = cs.teacher_id
  WHERE cs.class_id = ? ORDER BY cs.position, s.name COLLATE NOCASE`).all(classId);

const schoolOf = (schoolId) => db.prepare('SELECT * FROM schools WHERE id = ?').get(schoolId);

function classResults(c, periodId) {
  const school = schoolOf(c.school_id);
  return computeClassResults({
    scale: c.scale,
    compoWeight: school.compo_weight,
    compositionsOnly: c.cycle === 'primaire', // à l'élémentaire, seules les compositions comptent
    subjects: classSubjectsOf(c.id),
    students: studentsOf(c.id),
    evaluations: db.prepare(`
      SELECT e.id, e.class_subject_id, e.type FROM evaluations e
      JOIN class_subjects cs ON cs.id = e.class_subject_id
      WHERE cs.class_id = ? AND e.period_id = ?`).all(c.id, periodId),
    grades: db.prepare(`
      SELECT g.evaluation_id, g.student_id, g.value, g.absent FROM grades g
      JOIN evaluations e ON e.id = g.evaluation_id
      JOIN class_subjects cs ON cs.id = e.class_subject_id
      WHERE cs.class_id = ? AND e.period_id = ?`).all(c.id, periodId),
  });
}

function councilOf(classId, periodId) {
  const rows = db.prepare('SELECT * FROM council WHERE class_id = ? AND period_id = ?').all(classId, periodId);
  return Object.fromEntries(rows.map((r) => [r.student_id, { appreciation: r.appreciation, decision: r.decision }]));
}

const periodsOf = (yearId) => db.prepare('SELECT * FROM periods WHERE year_id = ? ORDER BY position').all(yearId);

// ---------------------------------------------------------------- authentification

route('POST', '/api/auth/register', ({ body, ...ctx }) => {
  const admin = {
    name: required(body.name, 'Votre nom'),
    email: email(body.email),
    phone: str(body.phone, 40),
    password: password(body.password),
  };
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(admin.email)) fail(409, 'Un compte existe déjà avec cette adresse e-mail.');
  const { userId } = createSchool({
    schoolName: required(body.schoolName, "Le nom de l'établissement"),
    city: str(body.city, 80),
    schoolType: SCHOOL_TYPES.includes(body.schoolType) ? body.schoolType : 'secondaire',
    status: body.status === 'public' ? 'public' : 'prive',
    periodType: body.periodType === 'trimestre' ? 'trimestre' : 'semestre',
    directorName: str(body.directorName, 120),
    admin,
  });
  startSession(ctx, userId);
  return { ok: true };
}, 'public');

route('POST', '/api/auth/login', ({ body, ...ctx }) => {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(str(body.email).toLowerCase());
  if (!user || !verifyPassword(String(body.password ?? ''), user.password_hash)) fail(401, 'E-mail ou mot de passe incorrect.');
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  startSession(ctx, user.id);
  return { ok: true };
}, 'public');

route('POST', '/api/auth/logout', ({ user, cookies }) => {
  if (user) db.prepare('DELETE FROM sessions WHERE token = ?').run(user.token);
  cookies.push(`sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${COOKIE_SECURE}`);
  return { ok: true };
}, 'public');

route('GET', '/api/me', ({ user }) => {
  const years = db.prepare('SELECT * FROM school_years WHERE school_id = ? ORDER BY label DESC').all(user.school_id);
  for (const y of years) y.periods = periodsOf(y.id);
  const { token, ...me } = user;
  return { user: me, school: schoolOf(user.school_id), years, activeYearId: activeYear(user.school_id)?.id ?? null };
}, 'user');

// ---------------------------------------------------------------- établissement et années

route('PUT', '/api/school', ({ user, body }) => {
  const weight = num(body.compo_weight ?? 1, 'Le poids de la composition', { min: 0.5, max: 5 });
  db.prepare(`UPDATE schools SET name = ?, city = ?, address = ?, phone = ?, email = ?, motto = ?,
              academy = ?, ief = ?, director_name = ?, status = ?, compo_weight = ? WHERE id = ?`).run(
    required(body.name, "Le nom de l'établissement"), str(body.city, 80), str(body.address), str(body.phone, 40),
    str(body.email, 120), str(body.motto, 120), str(body.academy, 120), str(body.ief, 120),
    str(body.director_name, 120), body.status === 'public' ? 'public' : 'prive', weight, user.school_id);
  if (SCHOOL_TYPES.includes(body.school_type)) {
    db.prepare('UPDATE schools SET school_type = ? WHERE id = ?').run(body.school_type, user.school_id);
  }
  return schoolOf(user.school_id);
});

route('POST', '/api/years', ({ user, body }) => {
  const label = required(body.label, "L'année scolaire", 20);
  if (!/^\d{4}-\d{4}$/.test(label)) fail(400, "L'année scolaire doit être au format 2026-2027.");
  if (db.prepare('SELECT 1 FROM school_years WHERE school_id = ? AND label = ?').get(user.school_id, label)) fail(409, 'Cette année scolaire existe déjà.');
  const periodType = PERIOD_NAMES[body.periodType] ? body.periodType : 'semestre';
  return { id: tx(() => createYear(user.school_id, label, periodType, true)) };
});

route('POST', '/api/years/:id/activate', ({ user, params }) => {
  const y = db.prepare('SELECT * FROM school_years WHERE id = ? AND school_id = ?').get(toId(params.id), user.school_id);
  if (!y) fail(404, 'Année introuvable.');
  tx(() => {
    db.prepare('UPDATE school_years SET is_active = 0 WHERE school_id = ?').run(user.school_id);
    db.prepare('UPDATE school_years SET is_active = 1 WHERE id = ?').run(y.id);
  });
  return { ok: true };
});

// ---------------------------------------------------------------- tableau de bord

route('GET', '/api/dashboard', ({ user }) => {
  const year = activeYear(user.school_id);
  if (!year) return { classes: [], counts: {} };
  const classes = sortClasses(db.prepare(`
    SELECT c.id, c.name, c.level, c.cycle, c.scale, c.main_teacher_id, u.name AS main_teacher_name,
      (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id) AS students,
      (SELECT COUNT(*) FROM class_subjects cs WHERE cs.class_id = c.id) AS subjects,
      (SELECT COUNT(*) FROM evaluations ev JOIN class_subjects cs ON cs.id = ev.class_subject_id WHERE cs.class_id = c.id) AS evaluations
    FROM classes c LEFT JOIN users u ON u.id = c.main_teacher_id
    WHERE c.year_id = ?`).all(year.id)
    .filter((c) => isAdmin(user) || c.main_teacher_id === user.id || teachesIn(user, c.id)));
  const school = schoolOf(user.school_id);
  const counts = {
    classes: classes.length,
    students: classes.reduce((s, c) => s + c.students, 0),
    teachers: db.prepare("SELECT COUNT(*) AS n FROM users WHERE school_id = ? AND role = 'enseignant'").get(user.school_id).n,
    evaluations: classes.reduce((s, c) => s + c.evaluations, 0),
  };
  const checklist = {
    school: !!(school.academy || school.address || school.phone),
    classes: counts.classes > 0,
    students: counts.students > 0,
    subjects: classes.some((c) => c.subjects > 0),
    teachers: counts.teachers > 0,
    grades: counts.evaluations > 0,
  };
  return { year, classes, counts, checklist };
}, 'user');

// ---------------------------------------------------------------- matières

route('GET', '/api/subjects', ({ user }) => db.prepare(`
  SELECT s.*, (SELECT COUNT(*) FROM class_subjects cs WHERE cs.subject_id = s.id) AS used
  FROM subjects s WHERE s.school_id = ? ORDER BY s.name COLLATE NOCASE`).all(user.school_id), 'user');

route('POST', '/api/subjects', ({ user, body }) => {
  const name = required(body.name, 'Le nom de la matière', 80);
  const coef = num(body.default_coefficient ?? 1, 'Le coefficient', { min: 0.5, max: 20 });
  if (db.prepare('SELECT 1 FROM subjects WHERE school_id = ? AND name = ?').get(user.school_id, name)) fail(409, 'Cette matière existe déjà.');
  const r = db.prepare('INSERT INTO subjects (school_id, name, default_coefficient, cycle) VALUES (?, ?, ?, ?)')
    .run(user.school_id, name, coef, SUBJECT_CYCLES.includes(body.cycle) ? body.cycle : 'tous');
  return { id: Number(r.lastInsertRowid) };
});

route('PUT', '/api/subjects/:id', ({ user, params, body }) => {
  const id = toId(params.id);
  const r = db.prepare('UPDATE subjects SET name = ?, default_coefficient = ? WHERE id = ? AND school_id = ?').run(
    required(body.name, 'Le nom de la matière', 80), num(body.default_coefficient ?? 1, 'Le coefficient', { min: 0.5, max: 20 }),
    id, user.school_id);
  if (!r.changes) fail(404, 'Matière introuvable.');
  if (SUBJECT_CYCLES.includes(body.cycle)) db.prepare('UPDATE subjects SET cycle = ? WHERE id = ?').run(body.cycle, id);
  return { ok: true };
});

route('DELETE', '/api/subjects/:id', ({ user, params }) => {
  const s = db.prepare('SELECT id FROM subjects WHERE id = ? AND school_id = ?').get(toId(params.id), user.school_id);
  if (!s) fail(404, 'Matière introuvable.');
  if (db.prepare('SELECT 1 FROM class_subjects WHERE subject_id = ?').get(s.id)) {
    fail(409, 'Cette matière est enseignée dans au moins une classe. Retirez-la des classes avant de la supprimer.');
  }
  db.prepare('DELETE FROM subjects WHERE id = ?').run(s.id);
  return { ok: true };
});

// ---------------------------------------------------------------- utilisateurs

route('GET', '/api/users', ({ user }) => db.prepare(`
  SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at,
    (SELECT GROUP_CONCAT(subject_id) FROM teacher_subjects WHERE user_id = u.id) AS subject_ids,
    (SELECT GROUP_CONCAT(DISTINCT c.name) FROM class_subjects cs
      JOIN classes c ON c.id = cs.class_id JOIN school_years y ON y.id = c.year_id
      WHERE cs.teacher_id = u.id AND y.is_active = 1) AS classes_taught,
    (SELECT GROUP_CONCAT(c.name) FROM classes c JOIN school_years y ON y.id = c.year_id
      WHERE c.main_teacher_id = u.id AND y.is_active = 1) AS main_of
  FROM users u WHERE u.school_id = ?
  ORDER BY u.role, u.name COLLATE NOCASE`).all(user.school_id)
  .map((u) => ({ ...u, subject_ids: u.subject_ids ? String(u.subject_ids).split(',').map(Number) : [] })), 'user');

// Matières enseignées par un professeur : proposées en priorité lors de l'affectation aux classes.
function setTeacherSubjects(userId, subjectIds, schoolId) {
  if (!Array.isArray(subjectIds)) return;
  const valid = db.prepare('SELECT id FROM subjects WHERE school_id = ?').all(schoolId).map((s) => s.id);
  db.prepare('DELETE FROM teacher_subjects WHERE user_id = ?').run(userId);
  const insert = db.prepare('INSERT OR IGNORE INTO teacher_subjects (user_id, subject_id) VALUES (?, ?)');
  for (const id of subjectIds.map(Number)) if (valid.includes(id)) insert.run(userId, id);
}

route('POST', '/api/users', ({ user, body }) => {
  const e = email(body.email);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(e)) fail(409, 'Un compte existe déjà avec cette adresse e-mail.');
  return tx(() => {
    const r = db.prepare('INSERT INTO users (school_id, name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)').run(
      user.school_id, required(body.name, 'Le nom', 120), e, str(body.phone, 40), hashPassword(password(body.password)),
      body.role === 'admin' ? 'admin' : 'enseignant');
    const id = Number(r.lastInsertRowid);
    setTeacherSubjects(id, body.subject_ids, user.school_id);
    // À l'élémentaire, le maître est affecté à sa classe dès son ajout.
    if (body.class_id) {
      const c = loadClass(body.class_id, user);
      db.prepare('UPDATE classes SET main_teacher_id = ? WHERE id = ?').run(id, c.id);
      syncPrimaryTeacher(c.id);
    }
    return { id };
  });
});

route('PUT', '/api/users/:id', ({ user, params, body }) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ? AND school_id = ?').get(toId(params.id), user.school_id);
  if (!target) fail(404, 'Utilisateur introuvable.');
  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(required(body.name, 'Le nom', 120), str(body.phone, 40), target.id);
  setTeacherSubjects(target.id, body.subject_ids, user.school_id);
  if (body.password) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password(body.password)), target.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?').run(target.id, user.token);
  }
  return { ok: true };
});

route('DELETE', '/api/users/:id', ({ user, params }) => {
  const id = toId(params.id);
  if (id === user.id) fail(400, 'Vous ne pouvez pas supprimer votre propre compte.');
  const r = db.prepare('DELETE FROM users WHERE id = ? AND school_id = ?').run(id, user.school_id);
  if (!r.changes) fail(404, 'Utilisateur introuvable.');
  return { ok: true };
});

// ---------------------------------------------------------------- classes

function classInput(body, user) {
  const cycle = ['primaire', 'moyen', 'secondaire'].includes(body.cycle) ? body.cycle : 'moyen';
  const mainTeacher = optionalId(body.main_teacher_id);
  if (mainTeacher && !db.prepare('SELECT 1 FROM users WHERE id = ? AND school_id = ?').get(mainTeacher, user.school_id)) {
    fail(400, 'Professeur principal invalide.');
  }
  return {
    name: required(body.name, 'Le nom de la classe', 40),
    level: str(body.level, 40),
    cycle,
    scale: Number(body.scale) === 10 ? 10 : Number(body.scale) === 20 ? 20 : cycle === 'primaire' ? 10 : 20,
    mainTeacher,
  };
}

route('GET', '/api/classes', ({ user, query }) => {
  const yearId = query.year ? toId(query.year) : activeYear(user.school_id)?.id;
  return sortClasses(db.prepare(`
    SELECT c.*, u.name AS main_teacher_name,
      (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id) AS students,
      (SELECT COUNT(*) FROM class_subjects cs WHERE cs.class_id = c.id) AS subjects
    FROM classes c JOIN school_years y ON y.id = c.year_id
    LEFT JOIN users u ON u.id = c.main_teacher_id
    WHERE y.school_id = ? AND c.year_id = ?`).all(user.school_id, yearId ?? 0)
    .filter((c) => isAdmin(user) || c.main_teacher_id === user.id || teachesIn(user, c.id)));
}, 'user');

// Les classes se suivent dans l'ordre scolaire (CI, CP, CE1… puis 6e… Tle), pas par ordre alphabétique.
const LEVEL_ORDER = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2', '6E', '5E', '4E', '3E', '2NDE', '1ERE', '1ÈRE', 'TLE'];
function sortClasses(classes) {
  const rank = (c) => {
    const key = String(c.level || c.name.split(' ')[0]).toUpperCase().replace(/\s+/g, '');
    const i = LEVEL_ORDER.indexOf(key);
    return i === -1 ? LEVEL_ORDER.length : i;
  };
  return classes.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'fr'));
}

route('POST', '/api/classes', ({ user, body }) => {
  const year = body.year_id
    ? db.prepare('SELECT * FROM school_years WHERE id = ? AND school_id = ?').get(toId(body.year_id), user.school_id)
    : activeYear(user.school_id);
  if (!year) fail(400, "Créez d'abord une année scolaire.");
  const c = classInput(body, user);
  if (db.prepare('SELECT 1 FROM classes WHERE year_id = ? AND name = ?').get(year.id, c.name)) fail(409, `La classe ${c.name} existe déjà.`);
  return { id: tx(() => insertClass(year.id, c, user.school_id)) };
});

// À l'élémentaire, la classe reçoit d'office toutes les matières du cycle, enseignées par son maître.
function insertClass(yearId, c, schoolId) {
  const r = db.prepare('INSERT INTO classes (year_id, name, level, cycle, scale, main_teacher_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(yearId, c.name, c.level, c.cycle, c.scale, c.mainTeacher);
  const id = Number(r.lastInsertRowid);
  if (c.cycle === 'primaire') addAllSubjects({ id, cycle: c.cycle, main_teacher_id: c.mainTeacher }, schoolId);
  return id;
}

// Affectation rapide du maître ou du professeur principal depuis la liste des classes
route('PUT', '/api/classes/:id/teacher', ({ user, params, body }) => {
  const c = loadClass(params.id, user);
  db.prepare('UPDATE classes SET main_teacher_id = ? WHERE id = ?').run(teacherOfSchool(body.main_teacher_id, user), c.id);
  syncPrimaryTeacher(c.id);
  return { ok: true };
});

// Création en une fois de plusieurs classes, par exemple CI A, CI B, CP A…
route('POST', '/api/classes/bulk', ({ user, body }) => {
  const year = activeYear(user.school_id);
  if (!year) fail(400, "Créez d'abord une année scolaire.");
  if (!Array.isArray(body.classes) || !body.classes.length) fail(400, 'Aucune classe à créer.');
  const exists = db.prepare('SELECT 1 FROM classes WHERE year_id = ? AND name = ?');
  let created = 0;
  const skipped = [];
  tx(() => {
    for (const raw of body.classes.slice(0, 100)) {
      const c = classInput({ ...raw, cycle: raw.cycle ?? body.cycle }, user);
      if (exists.get(year.id, c.name)) {
        skipped.push(c.name);
        continue;
      }
      insertClass(year.id, c, user.school_id);
      created++;
    }
  });
  return { created, skipped };
});

route('GET', '/api/classes/:id', ({ user, params }) => {
  const c = loadClass(params.id, user);
  assertCanView(user, c);
  return { ...c, subjects: classSubjectsOf(c.id), students: studentsOf(c.id), periods: periodsOf(c.year_id) };
}, 'user');

route('PUT', '/api/classes/:id', ({ user, params, body }) => {
  const existing = loadClass(params.id, user);
  const c = classInput(body, user);
  db.prepare('UPDATE classes SET name = ?, level = ?, cycle = ?, scale = ?, main_teacher_id = ? WHERE id = ?')
    .run(c.name, c.level, c.cycle, c.scale, c.mainTeacher, existing.id);
  syncPrimaryTeacher(existing.id);
  return { ok: true };
});

route('DELETE', '/api/classes/:id', ({ user, params }) => {
  const c = loadClass(params.id, user);
  tx(() => {
    // Les élèves inscrits uniquement dans cette classe sont supprimés avec elle.
    db.prepare(`DELETE FROM students WHERE id IN (
      SELECT student_id FROM enrollments WHERE class_id = ?
    ) AND id NOT IN (SELECT student_id FROM enrollments WHERE class_id <> ?)`).run(c.id, c.id);
    db.prepare('DELETE FROM classes WHERE id = ?').run(c.id);
  });
  return { ok: true };
});

// Matières enseignées dans une classe

function subjectOfSchool(subjectId, user) {
  const s = db.prepare('SELECT * FROM subjects WHERE id = ? AND school_id = ?').get(toId(subjectId), user.school_id);
  if (!s) fail(400, 'Matière invalide.');
  return s;
}
function teacherOfSchool(teacherId, user) {
  const id = optionalId(teacherId);
  if (id && !db.prepare('SELECT 1 FROM users WHERE id = ? AND school_id = ?').get(id, user.school_id)) fail(400, 'Enseignant invalide.');
  return id;
}
const nextPosition = (classId) =>
  db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM class_subjects WHERE class_id = ?').get(classId).p;

// À l'élémentaire, le maître de la classe enseigne toutes les matières.
function syncPrimaryTeacher(classId) {
  db.prepare(`UPDATE class_subjects SET teacher_id = (SELECT main_teacher_id FROM classes WHERE id = ?)
    WHERE class_id = ? AND (SELECT cycle FROM classes WHERE id = ?) = 'primaire'`).run(classId, classId, classId);
}

// Au collège et au lycée, un professeur déclaré seul pour une matière y est affecté d'office.
function onlySpecialist(subjectId, schoolId) {
  const rows = db.prepare(`SELECT ts.user_id FROM teacher_subjects ts JOIN users u ON u.id = ts.user_id
    WHERE ts.subject_id = ? AND u.school_id = ?`).all(subjectId, schoolId);
  return rows.length === 1 ? rows[0].user_id : null;
}

route('POST', '/api/classes/:id/subjects', ({ user, params, body }) => {
  const c = loadClass(params.id, user);
  const s = subjectOfSchool(body.subject_id, user);
  if (db.prepare('SELECT 1 FROM class_subjects WHERE class_id = ? AND subject_id = ?').get(c.id, s.id)) fail(409, 'Cette matière est déjà dans la classe.');
  const coef = body.coefficient === undefined || body.coefficient === ''
    ? s.default_coefficient : num(body.coefficient, 'Le coefficient', { min: 0.5, max: 20 });
  const teacher = c.cycle === 'primaire' ? c.main_teacher_id : teacherOfSchool(body.teacher_id, user);
  const r = db.prepare('INSERT INTO class_subjects (class_id, subject_id, coefficient, teacher_id, position) VALUES (?, ?, ?, ?, ?)')
    .run(c.id, s.id, coef, teacher, nextPosition(c.id));
  return { id: Number(r.lastInsertRowid) };
});

// Ajoute à une classe toutes les matières de son cycle (ou communes à tous les cycles) qu'elle n'a pas encore,
// dans l'ordre où l'établissement les a créées. À appeler dans une transaction.
function addAllSubjects(c, schoolId) {
  const subjects = db.prepare(`SELECT * FROM subjects WHERE school_id = ? AND cycle IN ('tous', ?) AND id NOT IN
    (SELECT subject_id FROM class_subjects WHERE class_id = ?) ORDER BY id`)
    .all(schoolId, subjectCycleForClass(c.cycle), c.id);
  const insert = db.prepare('INSERT INTO class_subjects (class_id, subject_id, coefficient, teacher_id, position) VALUES (?, ?, ?, ?, ?)');
  let pos = nextPosition(c.id);
  for (const s of subjects) {
    const teacher = c.cycle === 'primaire' ? c.main_teacher_id : onlySpecialist(s.id, schoolId);
    insert.run(c.id, s.id, s.default_coefficient, teacher, pos++);
  }
  return subjects.length;
}

route('POST', '/api/classes/:id/subjects/all', ({ user, params }) => {
  const c = loadClass(params.id, user);
  return { added: tx(() => addAllSubjects(c, user.school_id)) };
});

route('PUT', '/api/class-subjects/:id', ({ user, params, body }) => {
  const { cs, c } = loadClassSubject(params.id, user);
  const teacher = c.cycle === 'primaire' ? c.main_teacher_id : teacherOfSchool(body.teacher_id, user);
  db.prepare('UPDATE class_subjects SET coefficient = ?, teacher_id = ? WHERE id = ?').run(
    num(body.coefficient, 'Le coefficient', { min: 0.5, max: 20 }), teacher, cs.id);
  return { ok: true };
});

route('DELETE', '/api/class-subjects/:id', ({ user, params }) => {
  const { cs } = loadClassSubject(params.id, user);
  db.prepare('DELETE FROM class_subjects WHERE id = ?').run(cs.id);
  return { ok: true };
});

// ---------------------------------------------------------------- élèves

function studentInput(raw) {
  const sex = String(raw.sex ?? '').trim().toUpperCase();
  return {
    matricule: str(raw.matricule, 40),
    first_name: required(raw.first_name, 'Le prénom', 80),
    last_name: required(raw.last_name, 'Le nom', 80),
    sex: sex.startsWith('F') ? 'F' : 'M',
    birth_date: str(raw.birth_date, 20),
    birth_place: str(raw.birth_place, 80),
    guardian_name: str(raw.guardian_name, 120),
    guardian_phone: str(raw.guardian_phone, 40),
  };
}

function insertStudent(schoolId, classId, s) {
  const r = db.prepare(`INSERT INTO students (school_id, matricule, first_name, last_name, sex, birth_date, birth_place, guardian_name, guardian_phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(schoolId, s.matricule, s.first_name, s.last_name, s.sex, s.birth_date, s.birth_place, s.guardian_name, s.guardian_phone);
  const id = Number(r.lastInsertRowid);
  db.prepare('INSERT INTO enrollments (student_id, class_id) VALUES (?, ?)').run(id, classId);
  return id;
}

route('POST', '/api/classes/:id/students', ({ user, params, body }) => {
  const c = loadClass(params.id, user);
  return { id: tx(() => insertStudent(user.school_id, c.id, studentInput(body))) };
});

// Import depuis un copier-coller Excel ou un fichier CSV.
// Colonnes : Matricule | Prénom | Nom | Sexe | Date de naissance | Lieu de naissance | Tuteur | Téléphone
route('POST', '/api/classes/:id/students/import', ({ user, params, body }) => {
  const c = loadClass(params.id, user);
  const lines = String(body.text ?? '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) fail(400, 'Aucune ligne à importer.');
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const fields = ['matricule', 'first_name', 'last_name', 'sex', 'birth_date', 'birth_place', 'guardian_name', 'guardian_phone'];
  const errors = [];
  let imported = 0;
  tx(() => {
    lines.forEach((line, i) => {
      const cells = line.split(sep).map((v) => v.trim().replace(/^"(.*)"$/, '$1'));
      if (i === 0 && /matricule|pr[ée]nom|\bnom\b/i.test(line)) return; // ligne d'en-tête
      const raw = Object.fromEntries(fields.map((f, k) => [f, cells[k] ?? '']));
      try {
        insertStudent(user.school_id, c.id, studentInput(raw));
        imported++;
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
        errors.push(`Ligne ${i + 1} : ${err.message}`);
      }
    });
  });
  return { imported, errors };
});

route('PUT', '/api/students/:id', ({ user, params, body }) => {
  const s = studentInput(body);
  const r = db.prepare(`UPDATE students SET matricule = ?, first_name = ?, last_name = ?, sex = ?, birth_date = ?,
      birth_place = ?, guardian_name = ?, guardian_phone = ? WHERE id = ? AND school_id = ?`).run(
    s.matricule, s.first_name, s.last_name, s.sex, s.birth_date, s.birth_place, s.guardian_name, s.guardian_phone,
    toId(params.id), user.school_id);
  if (!r.changes) fail(404, 'Élève introuvable.');
  return { ok: true };
});

route('DELETE', '/api/classes/:id/students/:sid', ({ user, params }) => {
  const c = loadClass(params.id, user);
  const sid = toId(params.sid);
  tx(() => {
    db.prepare('DELETE FROM enrollments WHERE class_id = ? AND student_id = ?').run(c.id, sid);
    db.prepare(`DELETE FROM students WHERE id = ? AND school_id = ?
      AND NOT EXISTS (SELECT 1 FROM enrollments WHERE student_id = ?)`).run(sid, user.school_id, sid);
  });
  return { ok: true };
});

// ---------------------------------------------------------------- saisie des notes

route('GET', '/api/my-subjects', ({ user }) => {
  const year = activeYear(user.school_id);
  if (!year) return [];
  return db.prepare(`
    SELECT cs.id, cs.coefficient, cs.teacher_id, s.name AS subject_name, u.name AS teacher_name,
           c.id AS class_id, c.name AS class_name, c.scale, c.cycle, c.main_teacher_id
    FROM class_subjects cs
    JOIN classes c ON c.id = cs.class_id
    JOIN subjects s ON s.id = cs.subject_id
    LEFT JOIN users u ON u.id = cs.teacher_id
    WHERE c.year_id = ? AND (? = 'admin' OR cs.teacher_id = ?)
    ORDER BY c.name COLLATE NOCASE, cs.position, s.name COLLATE NOCASE`).all(year.id, user.role, user.id);
}, 'user');

route('GET', '/api/class-subjects/:id/grades', ({ user, params, query }) => {
  const { cs, c } = loadClassSubject(params.id, user);
  assertCanGrade(user, cs);
  const period = loadPeriod(query.period, c);
  const evaluations = db.prepare(`SELECT * FROM evaluations WHERE class_subject_id = ? AND period_id = ?
    ORDER BY type = 'composition', created_at, id`).all(cs.id, period.id);
  const grades = db.prepare(`SELECT g.* FROM grades g JOIN evaluations e ON e.id = g.evaluation_id
    WHERE e.class_subject_id = ? AND e.period_id = ?`).all(cs.id, period.id);
  return {
    classSubject: cs,
    class: { id: c.id, name: c.name, scale: c.scale, cycle: c.cycle, year_label: c.year_label },
    period,
    periods: periodsOf(c.year_id),
    compoWeight: schoolOf(c.school_id).compo_weight,
    students: studentsOf(c.id),
    evaluations,
    grades,
  };
}, 'user');

route('POST', '/api/class-subjects/:id/evaluations', ({ user, params, body }) => {
  const { cs, c } = loadClassSubject(params.id, user);
  assertCanGrade(user, cs);
  const period = loadPeriod(body.period_id, c);
  const type = body.type === 'composition' ? 'composition' : 'devoir';
  const r = db.prepare('INSERT INTO evaluations (class_subject_id, period_id, type, label, eval_date) VALUES (?, ?, ?, ?, ?)')
    .run(cs.id, period.id, type, required(body.label, "Le nom de l'évaluation", 60), str(body.eval_date, 20));
  return { id: Number(r.lastInsertRowid) };
}, 'user');

function loadEvaluation(evalId, user) {
  const ev = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(toId(evalId));
  if (!ev) fail(404, 'Évaluation introuvable.');
  const { cs, c } = loadClassSubject(ev.class_subject_id, user);
  assertCanGrade(user, cs);
  return { ev, cs, c };
}

route('DELETE', '/api/evaluations/:id', ({ user, params }) => {
  const { ev } = loadEvaluation(params.id, user);
  db.prepare('DELETE FROM evaluations WHERE id = ?').run(ev.id);
  return { ok: true };
}, 'user');

route('PUT', '/api/evaluations/:id/grades', ({ user, params, body }) => {
  const { ev, c } = loadEvaluation(params.id, user);
  if (!Array.isArray(body.grades)) fail(400, 'Notes manquantes.');
  const enrolled = new Set(studentsOf(c.id).map((s) => s.id));
  tx(() => {
    for (const g of body.grades) writeGrade(ev.id, g, c.scale, enrolled);
  });
  return { ok: true };
}, 'user');

// Enregistre (ou efface, si vide) la note d'un élève inscrit. À appeler dans une transaction.
function writeGrade(evaluationId, g, scale, enrolled) {
  const sid = toId(g.student_id);
  if (!enrolled.has(sid)) return;
  const absent = g.absent ? 1 : 0;
  const empty = g.value === null || g.value === undefined || String(g.value).trim() === '';
  if (empty && !absent) {
    db.prepare('DELETE FROM grades WHERE evaluation_id = ? AND student_id = ?').run(evaluationId, sid);
    return;
  }
  const value = absent ? null : num(g.value, `Note (de 0 à ${scale})`, { min: 0, max: scale });
  db.prepare(`INSERT INTO grades (evaluation_id, student_id, value, absent) VALUES (?, ?, ?, ?)
    ON CONFLICT (evaluation_id, student_id) DO UPDATE SET value = excluded.value, absent = excluded.absent`)
    .run(evaluationId, sid, value, absent);
}

// ---------------------------------------------------------------- saisie d'une composition (toutes les matières)
// Une composition regroupe, pour une période, une évaluation de type « composition » par matière portant le même intitulé.

route('GET', '/api/classes/:id/composition', ({ user, params, query }) => {
  const c = loadClass(params.id, user);
  const period = loadPeriod(query.period, c);
  const subjects = classSubjectsOf(c.id).filter((cs) => isAdmin(user) || cs.teacher_id === user.id);
  if (!subjects.length) fail(403, "Vous n'avez aucune matière à noter dans cette classe.");
  const evaluations = db.prepare(`SELECT e.* FROM evaluations e JOIN class_subjects cs ON cs.id = e.class_subject_id
    WHERE cs.class_id = ? AND e.period_id = ? AND e.type = 'composition' ORDER BY e.id`).all(c.id, period.id);
  const grades = db.prepare(`SELECT g.* FROM grades g JOIN evaluations e ON e.id = g.evaluation_id
    JOIN class_subjects cs ON cs.id = e.class_subject_id
    WHERE cs.class_id = ? AND e.period_id = ? AND e.type = 'composition'`).all(c.id, period.id);
  return {
    class: { id: c.id, name: c.name, scale: c.scale, cycle: c.cycle, year_label: c.year_label, main_teacher_name: c.main_teacher_name },
    period,
    periods: periodsOf(c.year_id),
    subjects,
    students: studentsOf(c.id),
    labels: [...new Set(evaluations.map((e) => e.label))],
    evaluations,
    grades,
  };
}, 'user');

route('PUT', '/api/classes/:id/composition', ({ user, params, body }) => {
  const c = loadClass(params.id, user);
  const period = loadPeriod(body.period_id, c);
  const label = required(body.label, "L'intitulé de la composition", 60);
  if (!Array.isArray(body.grades)) fail(400, 'Notes manquantes.');
  const subjects = new Map(classSubjectsOf(c.id).map((cs) => [cs.id, cs]));
  if (!isAdmin(user) && ![...subjects.values()].some((cs) => cs.teacher_id === user.id)) {
    fail(403, "Vous n'avez aucune matière à noter dans cette classe.");
  }
  const enrolled = new Set(studentsOf(c.id).map((s) => s.id));
  const findEval = db.prepare(`SELECT id FROM evaluations
    WHERE class_subject_id = ? AND period_id = ? AND type = 'composition' AND label = ?`);
  const createEval = db.prepare(`INSERT INTO evaluations (class_subject_id, period_id, type, label, eval_date)
    VALUES (?, ?, 'composition', ?, ?)`);
  const evalIds = new Map();
  tx(() => {
    for (const g of body.grades) {
      const cs = subjects.get(Number(g.class_subject_id));
      if (!cs) fail(400, 'Matière invalide.');
      assertCanGrade(user, cs);
      if (!evalIds.has(cs.id)) {
        evalIds.set(cs.id, findEval.get(cs.id, period.id, label)?.id
          ?? Number(createEval.run(cs.id, period.id, label, str(body.eval_date, 20)).lastInsertRowid));
      }
      writeGrade(evalIds.get(cs.id), g, c.scale, enrolled);
    }
  });
  return { ok: true };
}, 'user');

// ---------------------------------------------------------------- résultats et bulletins

route('GET', '/api/classes/:id/results', ({ user, params, query }) => {
  const c = loadClass(params.id, user);
  assertCanView(user, c);
  const period = loadPeriod(query.period, c);
  const periods = periodsOf(c.year_id);
  return {
    class: c,
    period,
    periods,
    isLast: period.position === periods.at(-1).position,
    canEditCouncil: isAdmin(user) || c.main_teacher_id === user.id,
    results: classResults(c, period.id),
    council: councilOf(c.id, period.id),
  };
}, 'user');

route('PUT', '/api/classes/:id/council', ({ user, params, body }) => {
  const c = loadClass(params.id, user);
  assertCanManageResults(user, c);
  const period = loadPeriod(body.period_id, c);
  const sid = toId(body.student_id);
  if (!db.prepare('SELECT 1 FROM enrollments WHERE class_id = ? AND student_id = ?').get(c.id, sid)) fail(404, 'Élève introuvable.');
  db.prepare(`INSERT INTO council (class_id, period_id, student_id, appreciation, decision) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (class_id, period_id, student_id) DO UPDATE SET appreciation = excluded.appreciation, decision = excluded.decision`)
    .run(c.id, period.id, sid, str(body.appreciation, 300), str(body.decision, 80));
  return { ok: true };
}, 'user');

route('GET', '/api/classes/:id/bulletins', ({ user, params, query }) => {
  const c = loadClass(params.id, user);
  assertCanManageResults(user, c);
  const period = loadPeriod(query.period, c);
  const periods = periodsOf(c.year_id);
  const history = periods
    .filter((p) => p.position <= period.position)
    .map((p) => ({ period: p, results: classResults(c, p.id) }));
  const current = history.at(-1).results;
  const isLast = period.position === periods.at(-1).position;
  const annual = isLast ? computeAnnual(history.map((h) => h.results)) : null;
  const council = councilOf(c.id, period.id);
  const only = query.student ? toId(query.student) : null;

  const bulletins = current.students
    .filter((s) => !only || s.id === only)
    .map((s) => ({
      student: s,
      history: history.map((h) => {
        const row = h.results.students.find((r) => r.id === s.id);
        return { name: h.period.name, average: row?.average ?? null, rank: row?.rank ?? null, tie: row?.tie ?? false };
      }),
      annual: annual?.get(s.id) ?? null,
      council: council[s.id] ?? { appreciation: '', decision: '' },
    }));

  return {
    school: schoolOf(c.school_id),
    class: c,
    period,
    isLast,
    subjects: current.subjects,
    stats: current.stats,
    bulletins,
  };
}, 'user');

// ---------------------------------------------------------------- serveur HTTP

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function serveStatic(req, res, pathname) {
  // /shared/ contient le code commun au serveur et au navigateur.
  const [base, rel] = pathname.startsWith('/shared/')
    ? [path.join(ROOT, 'shared'), pathname.slice('/shared/'.length)]
    : [path.join(ROOT, 'public'), pathname];
  let file = path.normalize(path.join(base, decodeURIComponent(rel)));
  if (!file.startsWith(base + path.sep)) return send(res, 403, 'Interdit', 'text/plain; charset=utf-8');
  let ext = path.extname(file);
  if (!ext) {
    file = path.join(ROOT, 'public', 'index.html'); // application monopage
    ext = '.html';
  }
  try {
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(content);
  } catch {
    send(res, 404, 'Introuvable', 'text/plain; charset=utf-8');
  }
}

function send(res, status, body, type = 'application/json; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, ...headers });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Requête trop volumineuse.'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'JSON invalide.'));
      }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  const match = routes
    .map((r) => ({ r, m: r.method === req.method && url.pathname.match(r.re) }))
    .find((x) => x.m);
  if (!match) return send(res, 404, { error: 'Ressource introuvable.' });
  const { r, m } = match;
  const ctx = {
    params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])),
    query: Object.fromEntries(url.searchParams),
    body: ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {},
    user: currentUser(req),
    cookies: [],
  };
  if (r.access !== 'public' && !ctx.user) fail(401, 'Veuillez vous connecter.');
  if (r.access === 'admin' && !isAdmin(ctx.user)) fail(403, 'Action réservée à la direction.');
  const result = r.handler(ctx);
  send(res, 200, result ?? { ok: true }, undefined, ctx.cookies.length ? { 'Set-Cookie': ctx.cookies } : {});
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await serveStatic(req, res, url.pathname);
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.message });
    console.error(err);
    send(res, 500, { error: 'Erreur interne du serveur.' });
  }
});

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'server', 'index.js')) {
  server.listen(PORT, () => console.log(`Ndamely est disponible sur http://localhost:${PORT}`));
}
