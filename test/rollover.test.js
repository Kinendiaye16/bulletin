// Passage à l'année suivante, sur une base en mémoire.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { db } = await import('../server/db.js');
const { levelKey, nextLevel, promotedName, nextYearLabel, runRollover } = await import('../server/rollover.js');

test('niveaux : clé, niveau suivant, nom de la classe suivante', () => {
  assert.equal(levelKey({ level: 'CI', name: 'CI A' }), 'CI');
  assert.equal(levelKey({ level: '', name: '1ère S2' }), '1ERE');
  assert.equal(nextLevel('CI').label, 'CP');
  assert.equal(nextLevel('CM2').label, '6e');
  assert.equal(nextLevel('3E').label, '2nde');
  assert.equal(nextLevel('TLE'), null);
  assert.equal(promotedName({ name: 'CI A' }, nextLevel('CI')), 'CP A');
  assert.equal(promotedName({ name: '6e B' }, nextLevel('6E')), '5e B');
  assert.equal(nextYearLabel('2026-2027'), '2027-2028');
});

test('passage : admis, redoublant, départ ; classes et matières reprises', () => {
  const school = Number(db.prepare("INSERT INTO schools (name) VALUES ('École test')").run().lastInsertRowid);
  const year = Number(db.prepare("INSERT INTO school_years (school_id, label, is_active) VALUES (?, '2026-2027', 1)").run(school).lastInsertRowid);
  const subject = Number(db.prepare("INSERT INTO subjects (school_id, name, default_coefficient, cycle) VALUES (?, 'Lecture', 2, 'primaire')").run(school).lastInsertRowid);
  const mkClass = (name, level) => Number(db.prepare("INSERT INTO classes (year_id, name, level, cycle, scale) VALUES (?, ?, ?, 'primaire', 10)")
    .run(year, name, level).lastInsertRowid);
  const ci = mkClass('CI A', 'CI');
  const cp = mkClass('CP A', 'CP');
  db.prepare('INSERT INTO class_subjects (class_id, subject_id, coefficient, position) VALUES (?, ?, 3, 1)').run(ci, subject);
  const mkStudent = (first, cls) => {
    const id = Number(db.prepare("INSERT INTO students (school_id, first_name, last_name) VALUES (?, ?, 'Test')").run(school, first).lastInsertRowid);
    db.prepare('INSERT INTO enrollments (student_id, class_id) VALUES (?, ?)').run(id, cls);
    return id;
  };
  const awa = mkStudent('Awa', ci);
  const moussa = mkStudent('Moussa', ci);
  const fatou = mkStudent('Fatou', cp);

  const r = runRollover(school, { id: year, label: '2026-2027' }, {
    label: '2027-2028', periodType: 'trimestre', copyClasses: true,
    moves: [
      { student_id: awa, from_class_id: ci, action: 'promote', target: 'CP A' },
      { student_id: moussa, from_class_id: ci, action: 'repeat' },
      { student_id: fatou, from_class_id: cp, action: 'leave' },
    ],
  }, { addAllSubjects: () => 0 });

  assert.deepEqual([r.promote, r.repeat, r.leave, r.classesCreated], [1, 1, 1, 2]);
  const newYear = db.prepare("SELECT * FROM school_years WHERE school_id = ? AND label = '2027-2028'").get(school);
  assert.equal(newYear.is_active, 1);
  assert.equal(db.prepare('SELECT is_active FROM school_years WHERE id = ?').get(year).is_active, 0);
  const classOf = (sid) => db.prepare(`SELECT c.name FROM enrollments e JOIN classes c ON c.id = e.class_id
    WHERE e.student_id = ? AND c.year_id = ?`).get(sid, newYear.id)?.name;
  assert.equal(classOf(awa), 'CP A');
  assert.equal(classOf(moussa), 'CI A');
  assert.equal(classOf(fatou), undefined);
  // L'année écoulée garde ses élèves ; la classe reprise garde ses matières et coefficients.
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM enrollments WHERE class_id IN (?, ?)').get(ci, cp).n, 3);
  const newCi = db.prepare("SELECT id FROM classes WHERE year_id = ? AND name = 'CI A'").get(newYear.id).id;
  assert.equal(db.prepare('SELECT coefficient FROM class_subjects WHERE class_id = ?').get(newCi).coefficient, 3);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM periods WHERE year_id = ?").get(newYear.id).n, 3);

  // Relancer le passage corrige les choix sans créer de doublons.
  const again = runRollover(school, { id: year, label: '2026-2027' }, {
    label: '2027-2028', periodType: 'trimestre', copyClasses: true,
    moves: [{ student_id: moussa, from_class_id: ci, action: 'promote', target: 'CP A' }],
  }, { addAllSubjects: () => 0 });
  assert.equal(again.classesCreated, 0);
  assert.equal(classOf(moussa), 'CP A');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM enrollments WHERE student_id = ?').get(moussa).n, 2);
});
