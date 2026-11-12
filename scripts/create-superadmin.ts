/**
 * Maakt een superadmin aan of zet het wachtwoord van een bestaande opnieuw.
 *
 *   ADMIN_PASSWORD='een-lang-wachtwoord' npm run create-admin -- beheer@voorbeeld.nl "Naam"
 *
 * Het wachtwoord gaat bewust via een omgevingsvariabele en niet via een
 * argument, zodat het niet in de shell-historie of proceslijst belandt.
 */
import { hashPassword, passwordProblem } from "../src/lib/password.ts";
import { upsertAdmin } from "../src/lib/repo.ts";

const [email, name = "Beheerder"] = process.argv.slice(2);
const password = process.env.ADMIN_PASSWORD ?? "";

if (!email || !email.includes("@")) {
  console.error("Gebruik: ADMIN_PASSWORD=... npm run create-admin -- <e-mail> [naam]");
  process.exit(1);
}
const problem = passwordProblem(password);
if (problem) {
  console.error(problem.replace("Wachtwoord", "ADMIN_PASSWORD"));
  process.exit(1);
}
const admin = upsertAdmin(email.toLowerCase(), name, hashPassword(password));
console.log(`Superadmin klaar: ${admin.email}. Inloggen via /admin/inloggen`);
