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

/** Cycle d'une matière : « primaire », « secondaire » (collège et lycée) ou « tous ». */
export function defaultSubjectCycle(name) {
  const inPrimary = DEFAULT_SUBJECTS.primaire.some(([n]) => n === name);
  const inSecondary = DEFAULT_SUBJECTS.secondaire.some(([n]) => n === name);
  if (inPrimary && !inSecondary) return 'primaire';
  if (inSecondary && !inPrimary) return 'secondaire';
  return 'tous';
}

/** Cycle des matières qui conviennent à une classe (le moyen et le secondaire partagent les leurs). */
export const subjectCycleForClass = (classCycle) => (classCycle === 'primaire' ? 'primaire' : 'secondaire');
