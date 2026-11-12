"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCbrClient } from "@/lib/cbr";
import { CbrError } from "@/lib/cbr/client";
import { canCancel } from "@/lib/cbr/rules";
import * as repo from "@/lib/repo";

/** Alleen interne paden toestaan als terugverwijzing (voorkomt open redirects). */
const safeBack = (b: string) => (b.startsWith("/") && !b.startsWith("//") ? b : "/plannen");
const withParam = (path: string, k: string, v: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(v)}`;

export async function reserveAction(formData: FormData) {
  const user = requireUser();
  const candidateId = String(formData.get("candidateId") ?? "");
  const slotId = String(formData.get("slotId") ?? "");
  const back = safeBack(String(formData.get("back") ?? "/plannen"));

  // Leerling moet bij DEZE rijschool horen en gemachtigd zijn.
  const candidate = repo.getCandidate(user.tenantId, candidateId);
  if (!candidate) redirect(withParam(back, "fout", "Kies eerst een leerling."));
  if (!candidate!.authorized) redirect(withParam(back, "fout", "Deze leerling heeft de rijschool niet gemachtigd."));

  try {
    const r = await getCbrClient(user.tenantId).reserve({ candidateId: candidate!.id, slotId });
    repo.insertReservation(user.tenantId, user.id, r);
    repo.audit(user.tenantId, user.id, "reservering.aangemaakt", `${candidate!.name}: ${r.product} ${r.startsAt}`);
  } catch (e) {
    const msg = e instanceof CbrError ? e.message : "Onbekende fout bij reserveren.";
    redirect(withParam(back, "fout", msg));
  }
  revalidatePath("/reserveringen");
  redirect("/reserveringen?ok=gereserveerd");
}

export async function cancelAction(formData: FormData) {
  const user = requireUser();
  const id = String(formData.get("id") ?? "");
  // getReservation filtert op tenant: andermans id geeft gewoon "niet gevonden".
  const r = repo.getReservation(user.tenantId, id);
  if (!r || !canCancel(r, new Date()).allowed) redirect("/reserveringen?fout=annuleren-niet-toegestaan");
  await getCbrClient(user.tenantId).cancel(r!.cbrReservationId);
  repo.markCancelled(user.tenantId, id);
  repo.audit(user.tenantId, user.id, "reservering.geannuleerd", `${r!.product} ${r!.startsAt}`);
  revalidatePath("/reserveringen");
  redirect("/reserveringen?ok=geannuleerd");
}

export async function addCandidateAction(formData: FormData) {
  const user = requireUser();
  const name = String(formData.get("naam") ?? "").trim();
  if (!name) redirect("/leerlingen?fout=Vul+een+naam+in");
  const authorized = formData.get("gemachtigd") === "on";
  repo.addCandidate(user.tenantId, name, authorized);
  repo.audit(user.tenantId, user.id, "leerling.toegevoegd", name);
  revalidatePath("/leerlingen");
  redirect("/leerlingen");
}

export async function setAuthorizedAction(formData: FormData) {
  const user = requireUser();
  const id = String(formData.get("id") ?? "");
  const authorized = formData.get("gemachtigd") === "1";
  repo.setCandidateAuthorized(user.tenantId, id, authorized);
  repo.audit(user.tenantId, user.id, "leerling.machtiging", `${id}: ${authorized ? "ja" : "nee"}`);
  revalidatePath("/leerlingen");
  redirect("/leerlingen");
}
