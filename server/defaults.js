// Matières proposées à la création d'un établissement : [nom, coefficient par défaut].
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

// Matières enseignées seulement au lycée.
const LYCEE_ONLY = ['Philosophie'];

/** Cycle d'une matière : « primaire », « secondaire » (collège et lycée), « lycee » ou « tous ». */
export function defaultSubjectCycle(name) {
  const inPrimary = DEFAULT_SUBJECTS.primaire.some(([n]) => n === name);
  const inSecondary = DEFAULT_SUBJECTS.secondaire.some(([n]) => n === name);
  if (inPrimary && !inSecondary) return 'primaire';
  if (inSecondary && !inPrimary) return LYCEE_ONLY.includes(name) ? 'lycee' : 'secondaire';
  return 'tous';
}

/** Cycles de matières possibles. */
export const SUBJECT_CYCLES = ['primaire', 'college', 'lycee', 'secondaire', 'tous'];

/** Cycles des matières qui conviennent à une classe, selon son cycle (primaire, moyen = collège, secondaire = lycée). */
export function subjectCyclesForClass(classCycle) {
  if (classCycle === 'primaire') return ['primaire', 'tous'];
  if (classCycle === 'moyen') return ['college', 'secondaire', 'tous'];
  return ['lycee', 'secondaire', 'tous'];
}

/** Séries du lycée au Sénégal (Seconde L et S, puis Première et Terminale). */
export const SERIES = ['L', 'S', 'L1', 'L2', "L'", 'S1', 'S2', 'S3', 'S4', 'S5', 'T1', 'T2', 'G'];
