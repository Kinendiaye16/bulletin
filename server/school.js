// Création d'un établissement et de ses données de départ.
import { db, tx } from './db.js';
import { hashPassword } from './auth.js';

export const DEFAULT_SUBJECTS = {
  primaire: [
    ['Lecture', 2], ['Expression écrite', 2], ['Dictée', 1], ['Grammaire et conjugaison', 1],
    ['Calcul et mathématiques', 3], ['Histoire', 1], ['Géographie', 1],
    ["Sciences d'observation", 1], ['Éducation civique', 1], ['Éducation physique', 1],
  ],
  secondaire: [
    ['Français', 3], ['Anglais', 2], ['Espagnol', 1], ['Mathématiques', 3],
    ['Sciences de la vie et de la Terre', 2], ['Sciences physiques', 2], ['Histoire et géographie', 2],
    ['Éducation civique', 1], ['Philosophie', 2], ['Éducation physique et sportive', 1],
  ],
};

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

export function createSchool({ schoolName, city = '', schoolType = 'secondaire', status = 'prive', admin, periodType = 'semestre' }) {
  return tx(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO schools (name, city, status, director_name) VALUES (?, ?, ?, ?)')
      .run(schoolName, city, status, admin.name);
    const schoolId = Number(lastInsertRowid);
    const { lastInsertRowid: userId } = db
      .prepare("INSERT INTO users (school_id, name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, 'admin')")
      .run(schoolId, admin.name, admin.email, admin.phone || '', hashPassword(admin.password));
    createYear(schoolId, currentSchoolYearLabel(), periodType);

    const lists = schoolType === 'mixte'
      ? [...DEFAULT_SUBJECTS.primaire, ...DEFAULT_SUBJECTS.secondaire]
      : DEFAULT_SUBJECTS[schoolType] || DEFAULT_SUBJECTS.secondaire;
    const insert = db.prepare('INSERT OR IGNORE INTO subjects (school_id, name, default_coefficient) VALUES (?, ?, ?)');
    for (const [name, coef] of lists) insert.run(schoolId, name, coef);
    return { schoolId, userId: Number(userId) };
  });
}
