// Crée (ou recrée) un établissement de démonstration avec classes, élèves et notes.
// Usage : npm run seed
import { db, tx } from './db.js';
import { hashPassword } from './auth.js';
import { createSchool } from './school.js';

export const DEMO = {
  admin: { name: 'Mariama Sall', email: 'directeur@demo.sn', password: 'demo-bulletin' },
  teachers: [
    { name: 'Ibrahima Ndiaye', email: 'ndiaye@demo.sn' },
    { name: 'Aminata Fall', email: 'fall@demo.sn' },
    { name: 'Ousmane Diallo', email: 'diallo@demo.sn' },
  ],
  teacherPassword: 'demo-enseignant',
};

// Générateur pseudo-aléatoire reproductible
let seed = 20262027;
function rand() { // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (list) => list[Math.floor(rand() * list.length)];

const BOYS = ['Moussa', 'Ibrahima', 'Cheikh', 'Mamadou', 'Abdoulaye', 'Ousmane', 'Modou', 'Serigne', 'Pape', 'Babacar', 'Aliou', 'Lamine', 'Malick', 'Omar', 'Souleymane'];
const GIRLS = ['Awa', 'Fatou', 'Aminata', 'Mariama', 'Khady', 'Ndeye', 'Aïssatou', 'Coumba', 'Astou', 'Bineta', 'Sokhna', 'Rokhaya', 'Dieynaba', 'Adja', 'Seynabou'];
const LAST = ['Diop', 'Ndiaye', 'Fall', 'Sow', 'Ba', 'Gueye', 'Faye', 'Sarr', 'Diallo', 'Mbaye', 'Cissé', 'Thiam', 'Seck', 'Diouf', 'Niang', 'Kane', 'Sy', 'Camara', 'Touré', 'Diagne'];
const PLACES = ['Dakar', 'Pikine', 'Guédiawaye', 'Rufisque', 'Thiès', 'Mbour', 'Kaolack'];

const existing = db.prepare('SELECT school_id FROM users WHERE email = ?').get(DEMO.admin.email);
if (existing) db.prepare('DELETE FROM schools WHERE id = ?').run(existing.school_id);

const { schoolId } = createSchool({
  schoolName: 'Groupe scolaire Les Baobabs (démo)',
  city: 'Dakar',
  schoolType: 'mixte',
  status: 'prive',
  admin: DEMO.admin,
});

tx(() => {
  db.prepare(`UPDATE schools SET address = 'Sacré-Cœur 3, villa 120', phone = '33 800 00 00', email = 'contact@demo.sn',
    motto = 'Travail – Discipline – Réussite', academy = 'Dakar', ief = 'Dakar Plateau' WHERE id = ?`).run(schoolId);

  const teacherIds = DEMO.teachers.map((t) => Number(db.prepare(
    "INSERT INTO users (school_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'enseignant')",
  ).run(schoolId, t.name, t.email, hashPassword(DEMO.teacherPassword)).lastInsertRowid));

  const year = db.prepare('SELECT * FROM school_years WHERE school_id = ? AND is_active = 1').get(schoolId);
  const periods = db.prepare('SELECT * FROM periods WHERE year_id = ? ORDER BY position').all(year.id);
  const subjectId = (name) => db.prepare('SELECT id FROM subjects WHERE school_id = ? AND name = ?').get(schoolId, name).id;

  const classes = [
    { name: '6e A', level: '6e', cycle: 'moyen', scale: 20, size: 28, main: 0,
      subjects: [['Français', 4, 1], ['Anglais', 2, 1], ['Mathématiques', 4, 0], ['Sciences de la vie et de la Terre', 2, 2],
        ['Sciences physiques', 2, 0], ['Histoire et géographie', 3, 2], ['Éducation civique', 1, 2], ['Éducation physique et sportive', 1, null]] },
    { name: '3e B', level: '3e', cycle: 'moyen', scale: 20, size: 24, main: 1,
      subjects: [['Français', 4, 1], ['Anglais', 2, 1], ['Espagnol', 2, null], ['Mathématiques', 4, 0], ['Sciences de la vie et de la Terre', 2, 2],
        ['Sciences physiques', 2, 0], ['Histoire et géographie', 3, 2], ['Éducation physique et sportive', 1, null]] },
    { name: 'CM2 A', level: 'CM2', cycle: 'primaire', scale: 10, size: 30, main: 2,
      subjects: [['Lecture', 2, 2], ['Expression écrite', 2, 2], ['Dictée', 1, 2], ['Grammaire et conjugaison', 1, 2], ['Calcul et mathématiques', 3, 2],
        ['Histoire', 1, 2], ['Géographie', 1, 2], ["Sciences d'observation", 1, 2], ['Éducation civique', 1, 2]] },
  ];

  let matricule = 1;
  for (const def of classes) {
    const classId = Number(db.prepare('INSERT INTO classes (year_id, name, level, cycle, scale, main_teacher_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(year.id, def.name, def.level, def.cycle, def.scale, teacherIds[def.main]).lastInsertRowid);

    const css = def.subjects.map(([name, coef, teacher], i) => Number(db.prepare(
      'INSERT INTO class_subjects (class_id, subject_id, coefficient, teacher_id, position) VALUES (?, ?, ?, ?, ?)',
    ).run(classId, subjectId(name), coef, teacher === null ? null : teacherIds[teacher], i + 1).lastInsertRowid));

    const students = [];
    for (let i = 0; i < def.size; i++) {
      const sex = rand() < 0.5 ? 'F' : 'M';
      const last = pick(LAST);
      const birthYear = (def.level === 'CM2' ? 2015 : def.level === '6e' ? 2014 : 2011) - Math.floor(rand() * 2);
      const r = db.prepare(`INSERT INTO students (school_id, matricule, first_name, last_name, sex, birth_date, birth_place, guardian_name, guardian_phone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(schoolId, `26${String(matricule++).padStart(4, '0')}`, pick(sex === 'F' ? GIRLS : BOYS), last, sex,
        `${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}/${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}/${birthYear}`,
        pick(PLACES), `${pick(BOYS)} ${last}`, `77 ${Math.floor(100 + rand() * 900)} ${Math.floor(10 + rand() * 90)} ${Math.floor(10 + rand() * 90)}`);
      const id = Number(r.lastInsertRowid);
      db.prepare('INSERT INTO enrollments (student_id, class_id) VALUES (?, ?)').run(id, classId);
      students.push({ id, level: 0.3 + rand() * 0.55 }); // niveau propre à chaque élève
    }

    // Premier semestre complet (2 devoirs + composition), second semestre commencé (1 devoir).
    const plan = [[periods[0], ['Devoir 1', 'Devoir 2', 'Composition']], [periods[1], ['Devoir 1']]];
    const step = def.scale === 10 ? 0.5 : 0.25;
    for (const csId of css) {
      for (const [period, labels] of plan) {
        if (!period) continue;
        for (const label of labels) {
          const evId = Number(db.prepare('INSERT INTO evaluations (class_subject_id, period_id, type, label) VALUES (?, ?, ?, ?)')
            .run(csId, period.id, label.startsWith('Compo') ? 'composition' : 'devoir', label).lastInsertRowid);
          for (const s of students) {
            if (rand() < 0.02) {
              db.prepare('INSERT INTO grades (evaluation_id, student_id, value, absent) VALUES (?, ?, NULL, 1)').run(evId, s.id);
              continue;
            }
            const ratio = Math.min(1, Math.max(0.05, s.level + (rand() - 0.5) * 0.35));
            const value = Math.round((ratio * def.scale) / step) * step;
            db.prepare('INSERT INTO grades (evaluation_id, student_id, value) VALUES (?, ?, ?)').run(evId, s.id, value);
          }
        }
      }
    }
  }
});

console.log('Établissement de démonstration créé.');
console.log(`  Direction   : ${DEMO.admin.email} / ${DEMO.admin.password}`);
console.log(`  Enseignants : ${DEMO.teachers.map((t) => t.email).join(', ')} / ${DEMO.teacherPassword}`);
