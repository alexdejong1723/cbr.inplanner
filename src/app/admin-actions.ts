"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { endAdminSession, requireAdmin, startAdminSession } from "@/lib/admin-auth";
import { approvedMail, rejectedMail, trySendMail } from "@/lib/mail";
import { verifyPassword } from "@/lib/password";
import { isLimited, recordHit } from "@/lib/ratelimit";
import * as repo from "@/lib/repo";

export async function adminLoginAction(f: FormData) {
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const password = String(f.get("wachtwoord") ?? "");
  const W = 15 * 60_000;
  const fail = (m: string): never => redirect(`/admin/inloggen?fout=${encodeURIComponent(m)}`);
  if (isLimited(`admin:${email}`, 5, W)) fail("Te veel pogingen. Probeer het later opnieuw.");
  const admin = repo.findAdminByEmail(email);
  const ok = verifyPassword(password, admin?.passwordHash ?? "00:00");
  if (!admin || !ok) { recordHit(`admin:${email}`, W); fail("E-mailadres of wachtwoord klopt niet."); }
  startAdminSession(admin!.id);
  redirect("/admin");
}

export async function adminLogoutAction() {
  endAdminSession();
  redirect("/admin/inloggen");
}

const back = (msg: string, key: "ok" | "fout" = "ok", status = "pending") =>
  redirect(`/admin?status=${status}&${key}=${encodeURIComponent(msg)}`);

export async function approveTenantAction(f: FormData) {
  const admin = requireAdmin();
  const id = String(f.get("id") ?? "");
  const tenant = repo.getTenant(id);
  const owner = repo.getTenantOwner(id);
  if (!tenant || !owner) back("Rijschool niet gevonden.", "fout");
  // Goedkeuren kan pas als de eigenaar zijn e-mailadres heeft bevestigd.
  if (!owner!.emailVerified) back("De eigenaar heeft het e-mailadres nog niet bevestigd.", "fout");
  if (!repo.setTenantStatus(id, "approved")) back("Deze statuswijziging is niet toegestaan.", "fout");
  repo.audit(id, null, "rijschool.goedgekeurd", `door beheerder ${admin.email}`);
  await trySendMail(approvedMail(owner!.email, owner!.name, tenant!.name));
  revalidatePath("/admin");
  back(`${tenant!.name} is goedgekeurd.`);
}

export async function rejectTenantAction(f: FormData) {
  const admin = requireAdmin();
  const id = String(f.get("id") ?? "");
  const reason = String(f.get("reden") ?? "").trim().slice(0, 500);
  const tenant = repo.getTenant(id);
  const owner = repo.getTenantOwner(id);
  if (!tenant || !owner) back("Rijschool niet gevonden.", "fout");
  if (!repo.setTenantStatus(id, "rejected")) back("Deze statuswijziging is niet toegestaan.", "fout");
  repo.deleteSessionsForTenant(id);
  repo.audit(id, null, "rijschool.afgewezen", `door beheerder ${admin.email}${reason ? `: ${reason}` : ""}`);
  await trySendMail(rejectedMail(owner!.email, owner!.name, tenant!.name, reason));
  revalidatePath("/admin");
  back(`${tenant!.name} is afgewezen.`);
}

export async function suspendTenantAction(f: FormData) {
  const admin = requireAdmin();
  const id = String(f.get("id") ?? "");
  const tenant = repo.getTenant(id);
  if (!tenant || !repo.setTenantStatus(id, "suspended")) back("Deze statuswijziging is niet toegestaan.", "fout", "approved");
  // Bestaande sessies direct intrekken; na heractivering moet iedereen opnieuw inloggen.
  repo.deleteSessionsForTenant(id);
  repo.audit(id, null, "rijschool.geschorst", `door beheerder ${admin.email}`);
  revalidatePath("/admin");
  redirect(`/admin?status=approved&ok=${encodeURIComponent(`${tenant!.name} is geschorst.`)}`);
}

export async function reactivateTenantAction(f: FormData) {
  const admin = requireAdmin();
  const id = String(f.get("id") ?? "");
  const tenant = repo.getTenant(id);
  if (!tenant || !repo.setTenantStatus(id, "approved")) back("Deze statuswijziging is niet toegestaan.", "fout", "suspended");
  repo.audit(id, null, "rijschool.heractiveerd", `door beheerder ${admin.email}`);
  revalidatePath("/admin");
  redirect(`/admin?status=approved&ok=${encodeURIComponent(`${tenant!.name} is weer actief.`)}`);
}
