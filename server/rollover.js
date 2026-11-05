// Passage d'une année scolaire à la suivante : classes reprises, élèves admis, redoublants et départs.
import { db, tx } from './db.js';
import { createYear } from './school.js';
import { computeAnnual } from '../shared/calc.js';

// Niveaux dans l'ordre : le niveau suivant est celui où passe un élève admis.
const LEVELS = [
  ['CI', 'CI', 'primaire'], ['CP', 'CP', 'primaire'], ['CE1', 'CE1', 'primaire'], ['CE2', 'CE2', 'primaire'],
  ['CM1', 'CM1', 'primaire'], ['CM2', 'CM2', 'primaire'],
  ['6E', '6e', 'moyen'], ['5E', '5e', 'moyen'], ['4E', '4e', 'moyen'], ['3E', '3e', 'moyen'],
  ['2NDE', '2nde', 'secondaire'], ['1ERE', '1ère', 'secondaire'], ['TLE', 'Tle', 'secondaire'],
];
const ALIASES = { '1RE': '1ERE', '2ND': '2NDE', SECONDE: '2NDE', PREMIERE: '1ERE', TERMINALE: 'TLE', '6EME': '6E', '5EME': '5E', '4EME': '4E', '3EME': '3E' };

/** Clé du niveau d'une classe : « CI », « 6E », « TLE »… (d'après le niveau, sinon le premier mot du nom). */
export function levelKey(c) {
  const k = String(c.level || c.name).trim().split(/\s+/)[0].toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return ALIASES[k] ?? k;
}
/** Niveau suivant : { key, label, cycle }, ou null en fin de cycle scolaire (Terminale) ou pour un niveau inconnu. */
export function nextLevel(key) {
  const i = LEVELS.findIndex(([k]) => k === key);
  if (i === -1 || i === LEVELS.length - 1) return null;
  const [k, label, cycle] = LEVELS[i + 1];
  return { key: k, label, cycle };
}
/** Nom de la classe au niveau suivant : « CI A » → « CP A », « 6e B » → « 5e B ». */
export function promotedName(c, next) {
  const words = String(c.name).trim().split(/\s+/);
  return [next.label, ...words.slice(1)].join(' ');
}

/** « 2026-2027 » → « 2027-2028 ». */
export function nextYearLabel(label) {
  const m = String(label).match(/^(\d{4})-(\d{4})$/);
  return m ? `${Number(m[1]) + 1}-${Number(m[2]) + 1}` : '';
}

/** Décision proposée pour un élève, d'après la décision du conseil de classe puis la moyenne annuelle. */
function suggest(decision, average, scale, hasNext) {
  const d = String(decision || '').toLowerCase();
  if (/exclu|quitt|départ|depart|transf/.test(d)) return 'leave';
  if (/redoubl/.test(d)) return 'repeat';
  if (!hasNext) return 'leave'; // fin de cycle dans l'établissement
  if (/admis|passe|passage/.test(d)) return 'promote';
  if (average !== null && average !== undefined && average < scale / 2) return 'repeat';
  return 'promote';
}

/**
 * Aperçu du passage : pour chaque classe de l'année, ses élèves avec leur moyenne annuelle, la décision du conseil
 * et la décision proposée, ainsi que la classe de l'année suivante où ils iraient.
 */
export function rolloverPreview(schoolId, fromYear, { classResults, councilOf, periodsOf, studentsOf }) {
  const periods = periodsOf(fromYear.id);
  const last = periods.at(-1);
  const classes = db.prepare(`SELECT c.*, y.school_id FROM classes c JOIN school_years y ON y.id = c.year_id
    WHERE c.year_id = ?`).all(fromYear.id);
  const keys = new Set(classes.map(levelKey));
  const label = nextYearLabel(fromYear.label);
  const target = db.prepare('SELECT * FROM school_years WHERE school_id = ? AND label = ?').get(schoolId, label);
  const targetClasses = target ? db.prepare(`SELECT c.id, c.name, c.level, c.cycle,
      (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id) AS students
    FROM classes c WHERE c.year_id = ?`).all(target.id) : [];
  const already = new Set(target ? db.prepare(`SELECT e.student_id FROM enrollments e JOIN classes c ON c.id = e.class_id
    WHERE c.year_id = ?`).all(target.id).map((r) => r.student_id) : []);

  return {
    from: { id: fromYear.id, label: fromYear.label, periods: periods.length },
    nextLabel: label,
    target: target ? { id: target.id, label: target.label, classes: targetClasses } : null,
    classes: classes.map((c) => {
      const key = levelKey(c);
      const next = nextLevel(key);
      // Une Terminale, ou un CM2 dans une école sans collège, termine son cycle dans l'établissement.
      const hasNext = Boolean(next) && (keys.has(next.key) || next.cycle === c.cycle || targetClasses.some((t) => levelKey(t) === next.key));
      const annual = periods.length ? computeAnnual(periods.map((p) => classResults(c, p.id))) : new Map();
      const council = last ? councilOf(c.id, last.id) : {};
      return {
        id: c.id, name: c.name, level: c.level, cycle: c.cycle, serie: c.serie, scale: c.scale, key,
        next: hasNext ? { ...next, name: promotedName(c, next) } : null,
        students: studentsOf(c.id).map((s) => {
          const a = annual.get(s.id);
          const decision = council[s.id]?.decision ?? '';
          return {
            id: s.id, first_name: s.first_name, last_name: s.last_name, sex: s.sex,
            average: a?.average ?? null, rank: a?.rank ?? null, tie: a?.tie ?? false, decision,
            suggested: suggest(decision, a?.average, c.scale, hasNext),
            alreadyMoved: already.has(s.id),
          };
        }),
      };
    }),
  };
}

/**
 * Passage effectif, en une transaction :
 * 1. l'année suivante est créée (ou reprise) et devient active ;
 * 2. les classes sont reprises (mêmes noms, maîtres, matières, coefficients et professeurs) si demandé ;
 * 3. chaque élève est inscrit dans sa nouvelle classe (admis ou redoublant), ou n'est pas réinscrit (départ).
 * Les élèves, leurs notes et leurs bulletins de l'année écoulée restent consultables.
 */
export function runRollover(schoolId, fromYear, { label, periodType, copyClasses, moves }, { addAllSubjects }) {
  return tx(() => {
    let target = db.prepare('SELECT * FROM school_years WHERE school_id = ? AND label = ?').get(schoolId, label);
    if (!target) target = { id: createYear(schoolId, label, periodType, true) };
    else {
      db.prepare('UPDATE school_years SET is_active = 0 WHERE school_id = ?').run(schoolId);
      db.prepare('UPDATE school_years SET is_active = 1 WHERE id = ?').run(target.id);
    }

    const sourceClasses = db.prepare('SELECT * FROM classes WHERE year_id = ?').all(fromYear.id);
    const byName = new Map(db.prepare('SELECT * FROM classes WHERE year_id = ?').all(target.id).map((c) => [c.name, c]));
    let classesCreated = 0;

    const insertClass = db.prepare(`INSERT INTO classes (year_id, name, level, cycle, serie, scale, main_teacher_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const copySubjects = db.prepare(`INSERT INTO class_subjects (class_id, subject_id, coefficient, teacher_id, position)
      SELECT ?, subject_id, coefficient, teacher_id, position FROM class_subjects WHERE class_id = ?`);

    // Reprise des classes de l'année écoulée, avec leurs matières.
    if (copyClasses) {
      for (const c of sourceClasses) {
        if (byName.has(c.name)) continue;
        const id = Number(insertClass.run(target.id, c.name, c.level, c.cycle, c.serie, c.scale, c.main_teacher_id).lastInsertRowid);
        copySubjects.run(id, c.id);
        byName.set(c.name, { id, name: c.name, cycle: c.cycle });
        classesCreated++;
      }
    }

    /** Classe de l'année suivante, créée au besoin à partir d'un modèle (niveau, cycle, barème). */
    const ensureClass = (name, model) => {
      if (byName.has(name)) return byName.get(name);
      const cycle = model.cycle;
      const id = Number(insertClass.run(target.id, name, model.level, cycle, cycle === 'secondaire' ? (model.serie ?? '') : '',
        model.scale ?? (cycle === 'primaire' ? 10 : 20), null).lastInsertRowid);
      addAllSubjects({ id, cycle, serie: model.serie ?? '', main_teacher_id: null }, schoolId);
      const c = { id, name, cycle };
      byName.set(name, c);
      classesCreated++;
      return c;
    };

    const sources = new Map(sourceClasses.map((c) => [c.id, c]));
    const enroll = db.prepare('INSERT OR IGNORE INTO enrollments (student_id, class_id) VALUES (?, ?)');
    const unenrollTarget = db.prepare(`DELETE FROM enrollments WHERE student_id = ? AND class_id IN
      (SELECT id FROM classes WHERE year_id = ?)`);
    const counts = { promote: 0, repeat: 0, leave: 0 };

    for (const m of moves) {
      const from = sources.get(Number(m.from_class_id));
      if (!from) continue;
      const inFrom = db.prepare('SELECT 1 FROM enrollments WHERE student_id = ? AND class_id = ?').get(Number(m.student_id), from.id);
      if (!inFrom) continue;
      unenrollTarget.run(Number(m.student_id), target.id); // relancer le passage corrige un premier choix
      if (m.action === 'leave') {
        counts.leave++;
        continue;
      }
      let dest;
      if (m.action === 'repeat') {
        dest = ensureClass(from.name, from);
        counts.repeat++;
      } else {
        const next = nextLevel(levelKey(from));
        const name = String(m.target || (next ? promotedName(from, next) : '')).trim().slice(0, 40);
        if (!name) continue;
        dest = ensureClass(name, next ? { level: next.label, cycle: next.cycle, serie: from.serie, scale: next.cycle === from.cycle ? from.scale : undefined } : from);
        counts.promote++;
      }
      enroll.run(Number(m.student_id), dest.id);
    }
    return { yearId: target.id, label, classesCreated, ...counts };
  });
}
