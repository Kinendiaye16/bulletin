import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  subjectAverage, computeRanks, rankLabel, appreciation, distinction, computeClassResults, computeAnnual,
} from '../shared/calc.js';

test('moyenne matière : (moyenne devoirs + composition) / 2', () => {
  assert.deepEqual(subjectAverage([12, 14], [10]), { devoirs: 13, composition: 10, average: 11.5 });
});

test('moyenne matière : composition pondérée', () => {
  assert.equal(subjectAverage([12], [15], 2).average, 14);
});

test('moyenne matière : devoirs seuls ou composition seule', () => {
  assert.equal(subjectAverage([8, 9], []).average, 8.5);
  assert.equal(subjectAverage([], [16]).average, 16);
  assert.equal(subjectAverage([], []).average, null);
});

test('moyenne matière à l\'élémentaire : seules les compositions comptent', () => {
  assert.equal(subjectAverage([2, 3], [8, 9], 1, true).average, 8.5);
  assert.equal(subjectAverage([7], [], 1, true).average, null);
});

test('rangs avec ex æquo', () => {
  const r = computeRanks([
    { id: 1, value: 12 }, { id: 2, value: 15 }, { id: 3, value: 12 }, { id: 4, value: 9 }, { id: 5, value: null },
  ]);
  assert.deepEqual(r.get(2), { rank: 1, tie: false });
  assert.deepEqual(r.get(1), { rank: 2, tie: true });
  assert.deepEqual(r.get(3), { rank: 2, tie: true });
  assert.deepEqual(r.get(4), { rank: 4, tie: false });
  assert.equal(r.has(5), false);
});

test('libellé de rang', () => {
  assert.equal(rankLabel(1, false, 'F'), '1ère');
  assert.equal(rankLabel(1, false, 'M'), '1er');
  assert.equal(rankLabel(3, true, 'M'), '3e ex');
});

test('appréciations et distinctions selon le barème', () => {
  assert.equal(appreciation(14.5), 'Bien');
  assert.equal(appreciation(7, 10), 'Bien'); // 7/10 = 14/20
  assert.equal(appreciation(9.99), 'Insuffisant');
  assert.equal(distinction(16.2), 'Félicitations');
  assert.equal(distinction(12), "Tableau d'honneur");
  assert.equal(distinction(6), 'Avertissement');
  assert.equal(distinction(10), '');
});

test('résultats de classe : moyenne générale coefficientée et rang', () => {
  const res = computeClassResults({
    scale: 20,
    compoWeight: 1,
    subjects: [{ id: 10, coefficient: 3 }, { id: 11, coefficient: 1 }],
    students: [{ id: 1, sex: 'F' }, { id: 2, sex: 'M' }, { id: 3, sex: 'M' }],
    evaluations: [
      { id: 100, class_subject_id: 10, type: 'devoir' },
      { id: 101, class_subject_id: 10, type: 'composition' },
      { id: 102, class_subject_id: 11, type: 'composition' },
    ],
    grades: [
      { evaluation_id: 100, student_id: 1, value: 16, absent: 0 },
      { evaluation_id: 101, student_id: 1, value: 14, absent: 0 },
      { evaluation_id: 102, student_id: 1, value: 10, absent: 0 },
      { evaluation_id: 100, student_id: 2, value: 8, absent: 0 },
      { evaluation_id: 101, student_id: 2, value: 12, absent: 0 },
      { evaluation_id: 102, student_id: 2, value: null, absent: 1 },
    ],
  });
  const [a, b, c] = res.students;
  // Élève 1 : maths (16+14)/2 = 15 ×3, autre 10 ×1 → 55/4 = 13.75
  assert.equal(a.average, 13.75);
  assert.equal(a.rank, 1);
  // Élève 2 : absent à la composition de la 2e matière → seule la 1re compte
  assert.equal(b.average, 10);
  assert.equal(b.rank, 2);
  assert.equal(c.average, null);
  assert.equal(c.rank, null);
  assert.equal(res.stats.graded, 2);
  assert.equal(res.stats.passRate, 100);
  assert.equal(res.subjects[0].classAverage, 12.5);
});

test('moyenne annuelle et rang annuel', () => {
  const s1 = { students: [{ id: 1, average: 12 }, { id: 2, average: 14 }] };
  const s2 = { students: [{ id: 1, average: 16 }, { id: 2, average: null }] };
  const annual = computeAnnual([s1, s2]);
  assert.deepEqual(annual.get(1), { average: 14, rank: 1, tie: true });
  assert.deepEqual(annual.get(2), { average: 14, rank: 1, tie: true });
});
