# Ndamely — gestion des notes et des bulletins scolaires

*Ndamely* s'inspire du wolof *ndam*, « la victoire, la réussite ».

MVP d'une plateforme SaaS de gestion pédagogique pour les établissements sénégalais (élémentaire, moyen, secondaire).

## Démarrer

Prérequis : **Node.js 22.13 ou plus récent** (aucune dépendance à installer : la base SQLite est intégrée à Node).

```bash
npm run seed    # crée un établissement de démonstration (facultatif)
npm start       # http://localhost:3000
npm test        # tests du moteur de calcul
```

### Comptes de démonstration (créés par `npm run seed`)

**École élémentaire Les Filaos** (CI A à CM2, un maître par classe, notes par compositions)

| Rôle | E-mail | Mot de passe |
|---|---|---|
| Administratrice (secrétariat) | `secretariat@filaos.demo.sn` | `demo-filaos` |
| Maîtres (CI A, CI B, CP A, CE1, CE2, CM1, CM2) | `maitre1@filaos.demo.sn` … `maitre7@filaos.demo.sn` | `demo-enseignant` |

**Groupe scolaire Les Baobabs** (élémentaire et collège, un professeur par matière)

| Rôle | E-mail | Mot de passe |
|---|---|---|
| Direction | `directeur@demo.sn` | `demo-bulletin` |
| Enseignants | `ndiaye@demo.sn`, `fall@demo.sn`, `diallo@demo.sn`, `faye@demo.sn` | `demo-enseignant` |

Relancer `npm run seed` réinitialise les établissements de démonstration (les autres établissements ne sont pas touchés).

## Parcours d'une école élémentaire

1. **Inscription** : nom de l'école, nom du directeur, type « École élémentaire », puis le compte **administrateur** (directeur ou secrétaire).
2. **Classes** : l'administrateur indique combien de classes il y a par niveau (CI, CP, CE1…) ; les classes CI A, CI B… sont créées avec toutes les matières de l'élémentaire.
3. **Enseignants** : dans « Équipe », l'administrateur ajoute chaque maître avec sa classe ; le maître enseigne toutes les matières de sa classe.
4. **Élèves** : liste de chaque classe saisie ou importée depuis Excel.
5. **Compositions** : chaque maître se connecte avec son propre compte et saisit une composition en une fois (tous les élèves, toutes les matières) ; total, moyenne et rang se calculent en direct.
6. **Bulletins** : imprimés par le maître ou l'administrateur, signés du maître et du directeur.

## Fonctionnalités du MVP

- **Multi-établissement** : chaque école crée son compte (« Créer un compte ») ; les données sont cloisonnées par établissement.
- **Rôles** : direction/secrétariat (tout gérer) et enseignants (saisie des notes de leurs matières ; résultats et bulletins pour le professeur principal).
- **Années scolaires** en semestres ou trimestres.
- **Classes** avec barème sur 10 (élémentaire) ou sur 20, professeur principal, matières, coefficients et enseignant par matière.
- **Élèves** : ajout manuel ou **import par copier-coller depuis Excel** / fichier CSV.
- **Saisie des notes** en grille (devoirs et compositions), navigation au clavier, « abs » pour les absents, calcul des moyennes en direct.
- **Mode hors ligne** : l'interface fonctionne sans réseau (PWA) ; les notes saisies hors ligne sont gardées sur l'appareil puis envoyées automatiquement.
- **Résultats** : moyennes par matière et générale, rangs (avec ex æquo), appréciations, distinctions (tableau d'honneur, encouragements, félicitations, avertissement), statistiques de classe, export Excel (CSV).
- **Conseil de classe** : appréciation par élève et décision de fin d'année.
- **Bulletins** au format A4 (en-tête République du Sénégal, IA, IEF), un par élève ou toute la classe, à imprimer ou enregistrer en PDF depuis le navigateur. Le bulletin de la dernière période affiche la moyenne et le rang annuels.

## Règles de calcul

Définies dans [`shared/calc.js`](shared/calc.js), utilisé à la fois par le serveur et par le navigateur.

- Moyenne d'une matière = (moyenne des devoirs + w × composition) ÷ (1 + w), avec w = 1 par défaut (réglable dans « Établissement »). S'il n'y a que des devoirs, ou que la composition, celle-ci fait la moyenne.
- Moyenne générale = Σ (moyenne × coefficient) ÷ Σ coefficients des matières notées.
- Moyenne annuelle = moyenne des moyennes de période.
- Appréciations et distinctions selon la note ramenée sur 20 (Passable ≥ 10, Assez bien ≥ 12, Bien ≥ 14, Très bien ≥ 16, Excellent ≥ 18).

## Architecture

```
server/index.js   API JSON + fichiers statiques (node:http)
server/db.js      schéma SQLite (node:sqlite), fichier data/bulletin.db
server/school.js  création d'un établissement et données par défaut
server/seed.js    établissement de démonstration
shared/calc.js    moteur de calcul (moyennes, rangs, appréciations)
public/           application web monopage (JavaScript sans framework) + service worker
test/             tests du moteur de calcul (node:test)
```

Variables d'environnement : `PORT` (3000), `DB_PATH` (chemin de la base), `COOKIE_SECURE=1` en production derrière HTTPS.

## Pistes pour la suite

- Absences et retards, cahier de textes, emplois du temps.
- Espace parents et envoi des résultats par SMS / WhatsApp.
- Paiement de la scolarité (Wave, Orange Money).
- Bulletins PDF générés côté serveur et envoi groupé.
- Export vers les formats du ministère, sauvegardes automatiques, hébergement PostgreSQL.
