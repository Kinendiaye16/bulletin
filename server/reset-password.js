// Secours sur l'ordinateur de l'école : donne un mot de passe provisoire à un compte, sans code de secours.
// Il faut avoir accès à l'ordinateur où Ndamely est installé (et à ses données).
//   node server/reset-password.js                 → liste les comptes administrateurs
//   node server/reset-password.js nom@exemple.com → nouveau mot de passe provisoire pour ce compte
import { db } from './db.js';
import { hashPassword, newRecoveryCode } from './auth.js';

const email = String(process.argv[2] ?? '').trim().toLowerCase();

if (!email) {
  const admins = db.prepare(`SELECT u.name, u.email, s.name AS school FROM users u JOIN schools s ON s.id = u.school_id
    WHERE u.role = 'admin' ORDER BY s.name, u.name`).all();
  console.log(admins.length ? 'Comptes administrateurs :' : 'Aucun compte pour le moment.');
  for (const a of admins) console.log(`  ${a.email}   (${a.name} — ${a.school})`);
  process.exit(0);
}

const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email);
if (!user) {
  console.error(`Aucun compte avec l'adresse ${email}.`);
  process.exit(1);
}
const temp = newRecoveryCode().replace(/-/g, '').slice(0, 10).toLowerCase();
db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(temp), user.id);
db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
console.log(`Nouveau mot de passe provisoire pour ${user.name} (${email}) :`);
console.log(`\n    ${temp}\n`);
console.log('Connectez-vous avec ce mot de passe, puis changez-le dans « Mon compte ».');
