"use server";

import { redirect } from "next/navigation";
import { endSession, requireUser, startSession } from "@/lib/auth";
import { adminNoticeMail, resetMail, trySendMail, verifyMail } from "@/lib/mail";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { allow, isLimited, recordHit } from "@/lib/ratelimit";
import * as repo from "@/lib/repo";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const go = (path: string, key: "fout" | "ok", msg: string): never =>
  redirect(`${path}?${key}=${encodeURIComponent(msg)}`);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOUR = 3_600_000;
const VERIFY_TTL = 24 * HOUR;
const RESET_TTL = HOUR;

async function sendVerification(user: { id: string; email: string; name: string }) {
  const token = repo.createToken(user.id, "verify", VERIFY_TTL);
  return trySendMail(verifyMail(user.email, user.name, token));
}

// ---------- Aanmelden (account start als 'pending') ----------

export async function registerAction(f: FormData) {
  const tenantName = str(f, "rijschool"), name = str(f, "naam"), email = str(f, "email").toLowerCase();
  const password = String(f.get("wachtwoord") ?? "");
  if (!tenantName || !name) go("/registreer", "fout", "Vul alle velden in.");
  if (!EMAIL.test(email)) go("/registreer", "fout", "Ongeldig e-mailadres.");
  const problem = passwordProblem(password);
  if (problem) go("/registreer", "fout", problem);
  if (repo.findUserByEmail(email)) go("/registreer", "fout", "Dit e-mailadres is al in gebruik.");
  const user = repo.createTenantWithOwner({ tenantName, name, email, passwordHash: hashPassword(password) });
  // Geen sessie: het account kan pas gebruikt worden na e-mailverificatie én goedkeuring.
  await sendVerification(user);
  redirect("/aangemeld");
}

// ---------- E-mailverificatie ----------

/** Pas na een klik op de knop verbruiken we het token, zodat mailscanners die links ophalen het niet "opgebruiken". */
export async function confirmEmailAction(f: FormData) {
  const token = str(f, "token");
  const userId = repo.consumeToken(token, "verify");
  if (!userId) go("/verifieer", "fout", "Deze link is ongeldig of verlopen. Vraag hieronder een nieuwe aan.");
  repo.verifyUserEmail(userId!);
  const user = repo.getUserById(userId!)!;
  const tenant = repo.getTenant(user.tenantId)!;
  repo.audit(user.tenantId, user.id, "email.bevestigd", user.email);
  const notify = process.env.ADMIN_NOTIFY_EMAIL;
  if (notify && tenant.status === "pending" && user.role === "eigenaar") {
    await trySendMail(adminNoticeMail(notify, tenant.name, `${user.name} <${user.email}>`));
  }
  redirect(`/inloggen?ok=${encodeURIComponent(
    tenant.status === "approved"
      ? "E-mailadres bevestigd. U kunt nu inloggen."
      : "E-mailadres bevestigd. Uw aanmelding wordt beoordeeld; u ontvangt een e-mail zodra die is goedgekeurd.",
  )}`);
}

const GENERIC_RESEND = "Als dit adres bij ons bekend is en nog niet bevestigd, hebben we een nieuwe link gestuurd.";

export async function resendVerificationAction(f: FormData) {
  const email = str(f, "email").toLowerCase();
  // Maximaal 3 per uur per adres: voorkomt dat iemand andermans inbox volstuurt.
  if (allow(`resend:${email}`, 3, HOUR)) {
    const user = repo.findUserByEmail(email);
    if (user && !user.emailVerified) await sendVerification(user);
  }
  go("/verificatie-opnieuw", "ok", GENERIC_RESEND);
}

// ---------- Inloggen ----------

export async function loginAction(f: FormData) {
  const email = str(f, "email").toLowerCase();
  const password = String(f.get("wachtwoord") ?? "");
  const LOGIN_WINDOW = 15 * 60_000;
  if (isLimited(`login:${email}`, 5, LOGIN_WINDOW)) go("/inloggen", "fout", "Te veel pogingen. Probeer het over 15 minuten opnieuw.");
  const user = repo.findUserByEmail(email);
  // Altijd een hash-controle doen, zodat de responstijd niets verraadt over bestaande accounts.
  const ok = verifyPassword(password, user?.passwordHash ?? "00:00");
  if (!user || !ok) {
    recordHit(`login:${email}`, LOGIN_WINDOW);
    go("/inloggen", "fout", "E-mailadres of wachtwoord klopt niet.");
  }
  // Pas na een juist wachtwoord noemen we de reden van weigering (geen account-enumeratie).
  if (!user!.emailVerified)
    go("/inloggen", "fout", "Bevestig eerst uw e-mailadres via de link in de e-mail. Geen mail ontvangen? Vraag een nieuwe aan via 'Verificatiemail opnieuw sturen'.");
  switch (user!.tenantStatus) {
    case "pending": go("/inloggen", "fout", "Uw aanmelding wacht nog op goedkeuring. U ontvangt een e-mail zodra die is beoordeeld.");
    case "rejected": go("/inloggen", "fout", "Uw aanmelding is niet goedgekeurd.");
    case "suspended": go("/inloggen", "fout", "Deze rijschool is tijdelijk geschorst. Neem contact met ons op.");
  }
  startSession(user!.id);
  redirect("/");
}

export async function logoutAction() {
  endSession();
  redirect("/inloggen");
}

// ---------- Wachtwoord vergeten / resetten ----------

const GENERIC_FORGOT = "Als dit e-mailadres bij ons bekend is, hebben we een link gestuurd om uw wachtwoord opnieuw in te stellen.";

export async function forgotPasswordAction(f: FormData) {
  const email = str(f, "email").toLowerCase();
  // Het antwoord is altijd hetzelfde, ongeacht of het adres bestaat.
  if (EMAIL.test(email) && allow(`forgot:${email}`, 3, HOUR)) {
    const user = repo.findUserByEmail(email);
    if (user) {
      const token = repo.createToken(user.id, "reset", RESET_TTL);
      await trySendMail(resetMail(user.email, user.name, token));
      repo.audit(user.tenantId, user.id, "wachtwoord.reset-aangevraagd", "");
    }
  }
  go("/wachtwoord-vergeten", "ok", GENERIC_FORGOT);
}

export async function resetPasswordAction(f: FormData) {
  const token = str(f, "token");
  const password = String(f.get("wachtwoord") ?? "");
  const back = `/wachtwoord-resetten?token=${encodeURIComponent(token)}`;
  const problem = passwordProblem(password);
  if (problem) redirect(`${back}&fout=${encodeURIComponent(problem)}`);
  if (password !== String(f.get("herhaal") ?? "")) redirect(`${back}&fout=${encodeURIComponent("De wachtwoorden komen niet overeen.")}`);
  const userId = repo.consumeToken(token, "reset");
  if (!userId) go("/wachtwoord-resetten", "fout", "Deze link is ongeldig, verlopen of al gebruikt. Vraag een nieuwe aan.");
  const user = repo.getUserById(userId!)!;
  repo.setUserPassword(userId!, hashPassword(password));
  // Ontvangst van de resetmail bewijst dat het adres van de gebruiker is.
  repo.verifyUserEmail(userId!);
  // Alle bestaande sessies ongeldig: iemand die het oude wachtwoord had, wordt uitgelogd.
  repo.deleteSessionsForUser(userId!);
  repo.audit(user.tenantId, user.id, "wachtwoord.gewijzigd", "via resetlink");
  go("/inloggen", "ok", "Wachtwoord gewijzigd. U kunt nu inloggen.");
}

// ---------- Team ----------

export async function addTeamMemberAction(f: FormData) {
  const me = requireUser("eigenaar");
  const name = str(f, "naam"), email = str(f, "email").toLowerCase();
  const password = String(f.get("wachtwoord") ?? "");
  const role = f.get("rol") === "eigenaar" ? "eigenaar" : "planner";
  if (!name || !EMAIL.test(email)) go("/team", "fout", "Vul een naam en geldig e-mailadres in.");
  const problem = passwordProblem(password);
  if (problem) go("/team", "fout", problem);
  if (repo.findUserByEmail(email)) go("/team", "fout", "Dit e-mailadres is al in gebruik.");
  const user = repo.addUser(me.tenantId, { name, email, passwordHash: hashPassword(password), role });
  repo.audit(me.tenantId, me.id, "gebruiker.toegevoegd", `${name} (${role})`);
  // Ook teamleden moeten hun e-mailadres bevestigen voordat ze kunnen inloggen.
  await sendVerification(user);
  go("/team", "ok", "toegevoegd; er is een bevestigingsmail verstuurd");
}
