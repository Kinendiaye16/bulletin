// Création d'un établissement et de ses données de départ.
import { db, tx } from './db.js';
import { hashPassword } from './auth.js';
import { DEFAULT_SUBJECTS, defaultSubjectCycle } from './defaults.js';

export const PERIOD_NAMES = {
  semestre: ['Premier semestre', 'Second semestre'],
  trimestre: ['Premier trimestre', 'Deuxième trimestre', 'Troisième trimestre'],
};

export function currentSchoolYearLabel(date = new Date()) {
  // L'année scolaire sénégalaise démarre en octobre ; on bascule à partir d'août.
  const start = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

export function createYear(schoolId, label, periodType = 'semestre', activate = true) {
  const names = PERIOD_NAMES[periodType] || PERIOD_NAMES.semestre;
  if (activate) db.prepare('UPDATE school_years SET is_active = 0 WHERE school_id = ?').run(schoolId);
  const { lastInsertRowid: yearId } = db
    .prepare('INSERT INTO school_years (school_id, label, is_active) VALUES (?, ?, ?)')
    .run(schoolId, label, activate ? 1 : 0);
  const insert = db.prepare('INSERT INTO periods (year_id, name, position) VALUES (?, ?, ?)');
  names.forEach((name, i) => insert.run(yearId, name, i + 1));
  return Number(yearId);
}

// Le compte administrateur peut être celui du directeur ou du secrétariat : le nom du directeur est distinct.
export function createSchool({ schoolName, city = '', schoolType = 'secondaire', status = 'prive', admin, periodType = 'semestre', directorName = '' }) {
  return tx(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO schools (name, city, status, school_type, director_name) VALUES (?, ?, ?, ?, ?)')
      .run(schoolName, city, status, schoolType, directorName || admin.name);
    const schoolId = Number(lastInsertRowid);
    const { lastInsertRowid: userId } = db
      .prepare("INSERT INTO users (school_id, name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, 'admin')")
      .run(schoolId, admin.name, admin.email, admin.phone || '', hashPassword(admin.password));
    createYear(schoolId, currentSchoolYearLabel(), periodType);

    addDefaultSubjects(schoolId, schoolType);
    return { schoolId, userId: Number(userId) };
  });
}

/**
 * Matières de départ des niveaux enseignés. Un niveau qui n'a encore aucune matière reçoit la liste par défaut :
 * c'est le cas d'une école élémentaire qui ouvre un collège ou un lycée. Les matières existantes ne changent pas.
 */
export function addDefaultSubjects(schoolId, schoolType) {
  const groups = schoolType === 'mixte' ? ['primaire', 'secondaire'] : [schoolType === 'primaire' ? 'primaire' : 'secondaire'];
  const has = (cycles) => db.prepare(`SELECT 1 FROM subjects WHERE school_id = ? AND cycle IN (${cycles.map(() => '?').join(', ')})`)
    .get(schoolId, ...cycles);
  const insert = db.prepare('INSERT OR IGNORE INTO subjects (school_id, name, default_coefficient, cycle) VALUES (?, ?, ?, ?)');
  const update = db.prepare("UPDATE subjects SET cycle = 'tous' WHERE school_id = ? AND name = ?");
  let added = 0;
  for (const g of groups) {
    if (has(g === 'primaire' ? ['primaire'] : ['college', 'lycee', 'secondaire'])) continue;
    for (const [name, coef] of DEFAULT_SUBJECTS[g]) {
      const r = insert.run(schoolId, name, coef, defaultSubjectCycle(name));
      // Une matière déjà présente sous le même nom (ex. Éducation civique) devient commune aux deux cycles.
      if (r.changes) added++;
      else if (groups.length > 1) update.run(schoolId, name);
    }
  }
  return added;
}
