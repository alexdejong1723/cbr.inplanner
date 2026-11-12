"use server";

import { redirect } from "next/navigation";
import {
  endSession, hashPassword, loginThrottled, recordFailedLogin, requireUser, startSession, verifyPassword,
} from "@/lib/auth";
import * as repo from "@/lib/repo";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const fout = (path: string, msg: string): never => redirect(`${path}?fout=${encodeURIComponent(msg)}`);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerAction(f: FormData) {
  const tenantName = str(f, "rijschool"), name = str(f, "naam"), email = str(f, "email").toLowerCase();
  const password = String(f.get("wachtwoord") ?? "");
  if (!tenantName || !name) fout("/registreer", "Vul alle velden in.");
  if (!EMAIL.test(email)) fout("/registreer", "Ongeldig e-mailadres.");
  if (password.length < 12) fout("/registreer", "Wachtwoord moet minimaal 12 tekens zijn.");
  if (repo.findUserByEmail(email)) fout("/registreer", "Dit e-mailadres is al in gebruik.");
  const user = repo.createTenantWithOwner({ tenantName, name, email, passwordHash: hashPassword(password) });
  startSession(user.id);
  redirect("/");
}

export async function loginAction(f: FormData) {
  const email = str(f, "email").toLowerCase();
  const password = String(f.get("wachtwoord") ?? "");
  if (loginThrottled(email)) fout("/inloggen", "Te veel pogingen. Probeer het over 15 minuten opnieuw.");
  const user = repo.findUserByEmail(email);
  // Altijd een hash-controle doen, zodat de responstijd niets verraadt over bestaande accounts.
  const ok = verifyPassword(password, user?.passwordHash ?? "00:00");
  if (!user || !ok) {
    recordFailedLogin(email);
    fout("/inloggen", "E-mailadres of wachtwoord klopt niet.");
  }
  startSession(user!.id);
  redirect("/");
}

export async function logoutAction() {
  endSession();
  redirect("/inloggen");
}

export async function addTeamMemberAction(f: FormData) {
  const me = requireUser("eigenaar");
  const name = str(f, "naam"), email = str(f, "email").toLowerCase();
  const password = String(f.get("wachtwoord") ?? "");
  const role = f.get("rol") === "eigenaar" ? "eigenaar" : "planner";
  if (!name || !EMAIL.test(email)) fout("/team", "Vul een naam en geldig e-mailadres in.");
  if (password.length < 12) fout("/team", "Wachtwoord moet minimaal 12 tekens zijn.");
  if (repo.findUserByEmail(email)) fout("/team", "Dit e-mailadres is al in gebruik.");
  repo.addUser(me.tenantId, { name, email, passwordHash: hashPassword(password), role });
  repo.audit(me.tenantId, me.id, "gebruiker.toegevoegd", `${name} (${role})`);
  redirect("/team?ok=toegevoegd");
}
