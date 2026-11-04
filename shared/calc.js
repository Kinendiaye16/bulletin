// Règles de calcul des moyennes, rangs et appréciations.
// Ce module est partagé entre le serveur et le navigateur : aucune dépendance.

export const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

function mean(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

/**
 * Moyenne d'une matière pour une période :
 * (moyenne des devoirs + w × note de composition) / (1 + w).
 * S'il n'y a que des devoirs ou que la composition, c'est celle-ci qui compte.
 * À l'élémentaire (compositionsOnly), seule la moyenne des compositions compte.
 */
export function subjectAverage(devoirs, compositions, compoWeight = 1, compositionsOnly = false) {
  const md = mean(devoirs);
  const mc = mean(compositions);
  let avg;
  if (compositionsOnly) avg = mc;
  else if (md !== null && mc !== null) avg = (md + compoWeight * mc) / (1 + compoWeight);
  else avg = md ?? mc;
  return {
    devoirs: md === null ? null : round2(md),
    composition: mc === null ? null : round2(mc),
    average: avg === null ? null : round2(avg),
  };
}

/** Classement décroissant avec ex æquo. entries : [{ id, value }] → Map(id → { rank, tie }). */
export function computeRanks(entries) {
  const sorted = entries
    .filter((e) => e.value !== null && e.value !== undefined)
    .sort((a, b) => b.value - a.value);
  const ranks = new Map();
  const counts = new Map();
  sorted.forEach((e, i) => {
    const rank = i > 0 && sorted[i - 1].value === e.value ? ranks.get(sorted[i - 1].id).rank : i + 1;
    ranks.set(e.id, { rank, tie: false });
    counts.set(rank, (counts.get(rank) || 0) + 1);
  });
  for (const r of ranks.values()) r.tie = counts.get(r.rank) > 1;
  return ranks;
}

export function rankLabel(rank, tie, sex) {
  if (!rank) return '';
  const base = rank === 1 ? (sex === 'F' ? '1ère' : '1er') : `${rank}e`;
  return tie ? `${base} ex` : base;
}

const to20 = (value, scale) => (value * 20) / scale;

export function appreciation(value, scale = 20) {
  if (value === null || value === undefined) return '';
  const v = to20(value, scale);
  if (v >= 18) return 'Excellent';
  if (v >= 16) return 'Très bien';
  if (v >= 14) return 'Bien';
  if (v >= 12) return 'Assez bien';
  if (v >= 10) return 'Passable';
  if (v >= 8) return 'Insuffisant';
  if (v >= 5) return 'Faible';
  return 'Très faible';
}

export function distinction(value, scale = 20) {
  if (value === null || value === undefined) return '';
  const v = to20(value, scale);
  if (v >= 16) return 'Félicitations';
  if (v >= 14) return 'Encouragements';
  if (v >= 12) return "Tableau d'honneur";
  if (v < 8) return 'Avertissement';
  return '';
}

/**
 * Résultats d'une classe pour une période.
 * subjects : [{ id, coefficient, ... }] (id = matière de la classe)
 * evaluations : [{ id, class_subject_id, type }]
 * grades : [{ evaluation_id, student_id, value, absent }]
 */
export function computeClassResults({ scale = 20, compoWeight = 1, compositionsOnly = false, subjects, students, evaluations, grades }) {
  const evalById = new Map(evaluations.map((e) => [e.id, e]));
  const cells = new Map();
  for (const g of grades) {
    if (g.value === null || g.value === undefined || g.absent) continue;
    const ev = evalById.get(g.evaluation_id);
    if (!ev) continue;
    const key = `${g.student_id}:${ev.class_subject_id}`;
    let cell = cells.get(key);
    if (!cell) cells.set(key, (cell = { devoirs: [], compositions: [] }));
    (ev.type === 'composition' ? cell.compositions : cell.devoirs).push(g.value);
  }

  const rows = students.map((st) => {
    const bySubject = {};
    let points = 0;
    let coefs = 0;
    for (const sub of subjects) {
      const cell = cells.get(`${st.id}:${sub.id}`);
      const r = cell
        ? subjectAverage(cell.devoirs, cell.compositions, compoWeight, compositionsOnly)
        : { devoirs: null, composition: null, average: null };
      r.weighted = r.average === null ? null : round2(r.average * sub.coefficient);
      r.appreciation = appreciation(r.average, scale);
      bySubject[sub.id] = r;
      if (r.average !== null) {
        points += r.average * sub.coefficient;
        coefs += sub.coefficient;
      }
    }
    const average = coefs > 0 ? round2(points / coefs) : null;
    return {
      ...st,
      subjects: bySubject,
      totalPoints: round2(points),
      totalCoef: coefs,
      average,
      appreciation: appreciation(average, scale),
      distinction: distinction(average, scale),
    };
  });

  const general = computeRanks(rows.map((r) => ({ id: r.id, value: r.average })));
  for (const r of rows) {
    const k = general.get(r.id);
    r.rank = k?.rank ?? null;
    r.tie = k?.tie ?? false;
  }

  const subjectStats = subjects.map((sub) => {
    const ranks = computeRanks(rows.map((r) => ({ id: r.id, value: r.subjects[sub.id].average })));
    const values = [];
    for (const r of rows) {
      const cell = r.subjects[sub.id];
      const k = ranks.get(r.id);
      cell.rank = k?.rank ?? null;
      cell.tie = k?.tie ?? false;
      if (cell.average !== null) values.push(cell.average);
    }
    return {
      ...sub,
      classAverage: values.length ? round2(mean(values)) : null,
      max: values.length ? Math.max(...values) : null,
      min: values.length ? Math.min(...values) : null,
    };
  });

  const averages = rows.map((r) => r.average).filter((v) => v !== null);
  const passCount = averages.filter((v) => v >= scale / 2).length;
  return {
    scale,
    subjects: subjectStats,
    students: rows,
    stats: {
      count: rows.length,
      graded: averages.length,
      average: averages.length ? round2(mean(averages)) : null,
      max: averages.length ? Math.max(...averages) : null,
      min: averages.length ? Math.min(...averages) : null,
      passCount,
      passRate: averages.length ? round2((passCount * 100) / averages.length) : null,
    },
  };
}

/** Moyenne annuelle = moyenne des moyennes de période disponibles, avec rang. */
export function computeAnnual(periodResults) {
  const byStudent = new Map();
  for (const res of periodResults) {
    for (const s of res.students) {
      if (s.average === null) continue;
      if (!byStudent.has(s.id)) byStudent.set(s.id, []);
      byStudent.get(s.id).push(s.average);
    }
  }
  const averages = [...byStudent].map(([id, values]) => ({ id, value: round2(mean(values)) }));
  const ranks = computeRanks(averages);
  return new Map(averages.map(({ id, value }) => [id, { average: value, ...ranks.get(id) }]));
}
