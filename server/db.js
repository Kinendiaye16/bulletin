import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultSubjectCycle } from './defaults.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Emplacement de la base : DB_PATH, sinon le dossier de données NDAMELY_DATA (logiciel installé), sinon ./data.
export const dbPath = process.env.DB_PATH
  || path.join(process.env.NDAMELY_DATA || path.join(ROOT, 'data'), 'bulletin.db');
if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS schools (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  city          TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  motto         TEXT NOT NULL DEFAULT '',
  academy       TEXT NOT NULL DEFAULT '',  -- Inspection d'Académie
  ief           TEXT NOT NULL DEFAULT '',  -- Inspection de l'Éducation et de la Formation
  director_name TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'prive' CHECK (status IN ('public', 'prive')),
  school_type   TEXT NOT NULL DEFAULT 'secondaire', -- primaire, secondaire (collège/lycée) ou mixte
  compo_weight  REAL NOT NULL DEFAULT 1,   -- poids de la composition face à la moyenne des devoirs
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  school_id     INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone         TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'enseignant')),
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS school_years (
  id        INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  label     TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  UNIQUE (school_id, label)
);

CREATE TABLE IF NOT EXISTS periods (
  id       INTEGER PRIMARY KEY,
  year_id  INTEGER NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id                  INTEGER PRIMARY KEY,
  school_id           INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  default_coefficient REAL NOT NULL DEFAULT 1,
  cycle               TEXT NOT NULL DEFAULT 'tous', -- primaire, college, lycee, secondaire (collège et lycée) ou tous
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS classes (
  id              INTEGER PRIMARY KEY,
  year_id         INTEGER NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  level           TEXT NOT NULL DEFAULT '',
  cycle           TEXT NOT NULL CHECK (cycle IN ('primaire', 'moyen', 'secondaire')),
  scale           INTEGER NOT NULL DEFAULT 20 CHECK (scale IN (10, 20)),
  main_teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS class_subjects (
  id          INTEGER PRIMARY KEY,
  class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  coefficient REAL NOT NULL DEFAULT 1,
  teacher_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (class_id, subject_id)
);

-- Matières qu'un professeur enseigne (collège et lycée)
CREATE TABLE IF NOT EXISTS teacher_subjects (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, subject_id)
);

CREATE TABLE IF NOT EXISTS students (
  id             INTEGER PRIMARY KEY,
  school_id      INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  matricule      TEXT NOT NULL DEFAULT '',
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  sex            TEXT NOT NULL DEFAULT 'M' CHECK (sex IN ('M', 'F')),
  birth_date     TEXT NOT NULL DEFAULT '',
  birth_place    TEXT NOT NULL DEFAULT '',
  guardian_name  TEXT NOT NULL DEFAULT '',
  guardian_phone TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS enrollments (
  id         INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  UNIQUE (student_id, class_id)
);

CREATE TABLE IF NOT EXISTS evaluations (
  id               INTEGER PRIMARY KEY,
  class_subject_id INTEGER NOT NULL REFERENCES class_subjects(id) ON DELETE CASCADE,
  period_id        INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('devoir', 'composition')),
  label            TEXT NOT NULL,
  eval_date        TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS grades (
  evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  student_id    INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  value         REAL,
  absent        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (evaluation_id, student_id)
);

-- Appréciation et décision du conseil de classe, par élève et par période
CREATE TABLE IF NOT EXISTS council (
  class_id     INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  period_id    INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  appreciation TEXT NOT NULL DEFAULT '',
  decision     TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (class_id, period_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_cs ON evaluations(class_subject_id, period_id);
CREATE INDEX IF NOT EXISTS idx_classes_year ON classes(year_id);
`);

// Migrations des bases créées avant l'ajout de colonnes
const schoolColumns = db.prepare('PRAGMA table_info(schools)').all().map((c) => c.name);
if (!schoolColumns.includes('school_type')) {
  db.exec("ALTER TABLE schools ADD COLUMN school_type TEXT NOT NULL DEFAULT 'secondaire'");
}
const subjectColumns = db.prepare('PRAGMA table_info(subjects)').all().map((c) => c.name);
if (!subjectColumns.includes('cycle')) {
  db.exec("ALTER TABLE subjects ADD COLUMN cycle TEXT NOT NULL DEFAULT 'tous'");
  const update = db.prepare('UPDATE subjects SET cycle = ? WHERE id = ?');
  for (const s of db.prepare('SELECT id, name FROM subjects').all()) update.run(defaultSubjectCycle(s.name), s.id);
}
// Série des classes du lycée (L1, L2, S1, S2…)
const classColumns = db.prepare('PRAGMA table_info(classes)').all().map((c) => c.name);
if (!classColumns.includes('serie')) {
  db.exec("ALTER TABLE classes ADD COLUMN serie TEXT NOT NULL DEFAULT ''");
}
// Coefficient d'une matière dans une série ; 0 = matière non enseignée dans la série.
db.exec(`CREATE TABLE IF NOT EXISTS serie_coefficients (
  subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  serie       TEXT NOT NULL,
  coefficient REAL NOT NULL,
  PRIMARY KEY (subject_id, serie)
)`);
// Version 1 : les cycles « Collège » et « Lycée » sont séparés ; la philosophie ne s'enseigne qu'au lycée.
if (db.prepare('PRAGMA user_version').get().user_version < 1) {
  db.exec("UPDATE subjects SET cycle = 'lycee' WHERE cycle = 'secondaire' AND name = 'Philosophie'");
  db.exec('PRAGMA user_version = 1');
}

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
