"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { syncAuthorizations } from "@/lib/authorization-sync";
import { getCbrClient } from "@/lib/cbr";
import { REASON_TEXT, usability, type UsabilityReason } from "@/lib/cbr/authorizations";
import { CbrError } from "@/lib/cbr/client";
import { canCancel } from "@/lib/cbr/rules";
import { AUTH_CATEGORY_LABEL, PRODUCT_LABEL, categoryForProduct, type AuthCategory, type Product } from "@/lib/cbr/types";
import { normalizeOpleidernummer, opleidernummerProblem } from "@/lib/opleidernummer";
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
  const fail = (m: string): never => redirect(withParam(back, "fout", m));

  const candidate = repo.getCandidate(user.tenantId, candidateId);
  if (!candidate) fail("Kies eerst een leerling.");

  const [product, , startsAt] = slotId.split("|");
  if (!(product in PRODUCT_LABEL) || Number.isNaN(Date.parse(startsAt ?? ""))) fail("Ongeldige examenplek.");
  const category = categoryForProduct(product as Product);

  // Eigen controle vooraf, zodat we meteen een duidelijke reden kunnen geven. Het CBR blijft leidend.
  const client = getCbrClient(user.tenantId);
  const auth = repo.getAuthorization(user.tenantId, candidate!.id, category);
  const check = auth
    ? usability(auth, { listMode: client.supportsAuthorizationList, today: new Date(), examStartsAt: startsAt })
    : ({ ok: false, reason: "geen" } as const);
  if (!check.ok) fail(REASON_TEXT[(check as { reason: UsabilityReason }).reason]);

  let reservation;
  try {
    reservation = await client.reserve({
      candidateId: candidate!.id,
      candidate: { cbrRef: candidate!.cbrRef, name: candidate!.name, birthDate: candidate!.birthDate },
      slotId,
    });
  } catch (e) {
    if (e instanceof CbrError && e.code === "NOT_AUTHORIZED") {
      // Het CBR kent de machtiging niet: een handmatige invoer was dus onjuist of is ingetrokken.
      if (auth!.source === "handmatig") repo.setAuthorizationStatus(user.tenantId, auth!.id, "geweigerd");
      else await syncAuthorizations(user.tenantId, { force: true });
      repo.audit(user.tenantId, user.id, "reservering.geweigerd", `${candidate!.name}: geen machtiging volgens het CBR`);
      fail(`Het CBR heeft de reservering geweigerd: machtiging ontbreekt of is ingetrokken (${AUTH_CATEGORY_LABEL[category]}). Laat de leerling opnieuw machtigen via Mijn CBR.`);
    }
    fail(e instanceof CbrError ? e.message : "Onbekende fout bij reserveren.");
  }
  repo.insertReservation(user.tenantId, user.id, reservation!);
  repo.audit(user.tenantId, user.id, "reservering.aangemaakt", `${candidate!.name}: ${reservation!.product} ${reservation!.startsAt}`);
  // Bij een overzicht van het CBR verdwijnt de leerling daar mogelijk; direct bijwerken (best effort).
  if (client.supportsAuthorizationList) await syncAuthorizations(user.tenantId, { force: true });
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

// ---------- Machtigingen ----------

export async function refreshAuthorizationsAction() {
  const user = requireUser();
  const res = await syncAuthorizations(user.tenantId, { force: true });
  revalidatePath("/leerlingen");
  const msg = {
    ok: ["ok", "Machtigingen bijgewerkt vanuit het CBR."],
    "te-vers": ["ok", "Zojuist al bijgewerkt. Probeer het over een paar seconden opnieuw."],
    "niet-ondersteund": ["fout", "Het CBR levert geen overzicht van machtigingen; voer ze handmatig in."],
    fout: ["fout", "Het CBR is nu niet bereikbaar (de API is 's nachts en op zondagochtend niet beschikbaar). We tonen het laatst bekende overzicht."],
  }[res.status] as ["ok" | "fout", string];
  redirect(withParam("/leerlingen", msg[0], msg[1]));
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => DATE.test(s) && !Number.isNaN(Date.parse(s));

/** Terugvaloptie: alleen als het CBR geen overzicht van machtigingen levert. */
export async function addManualAuthorizationAction(f: FormData) {
  const user = requireUser();
  const client = getCbrClient(user.tenantId);
  const fail = (m: string): never => redirect(withParam("/leerlingen", "fout", m));
  if (client.supportsAuthorizationList) fail("Machtigingen komen automatisch van het CBR; handmatig invoeren is niet nodig.");

  const name = String(f.get("naam") ?? "").trim();
  const birthDate = String(f.get("geboortedatum") ?? "");
  const cbrRef = String(f.get("kandidaatnummer") ?? "").trim() || undefined;
  const category = String(f.get("categorie") ?? "") as AuthCategory;
  const validUntil = String(f.get("einddatum") ?? "");
  if (!name) fail("Vul de naam van de leerling in.");
  if (!validDate(birthDate) || birthDate > new Date().toISOString().slice(0, 10)) fail("Vul een geldige geboortedatum in.");
  if (!(category in AUTH_CATEGORY_LABEL)) fail("Kies een categorie.");
  if (!validDate(validUntil)) fail("Vul de einddatum van de machtiging in.");
  if (f.get("bevestiging") !== "on") fail("Bevestig dat u de machtiging heeft gecontroleerd.");

  const res = repo.upsertManualAuthorization(user.tenantId, { name, birthDate, cbrRef, category, validUntil });
  if (!res.ok) fail("Deze machtiging is al door het CBR bevestigd.");
  repo.audit(user.tenantId, user.id, "machtiging.handmatig", `${name}: ${AUTH_CATEGORY_LABEL[category]} t/m ${validUntil}`);
  revalidatePath("/leerlingen");
  redirect(withParam("/leerlingen", "ok", `Machtiging voor ${name} opgeslagen (niet geverifieerd).`));
}

/** Alleen handmatig ingevoerde machtigingen kan de rijschool zelf intrekken; die van het CBR beheert de leerling. */
export async function revokeManualAuthorizationAction(f: FormData) {
  const user = requireUser();
  const a = repo.getAuthorizationById(user.tenantId, String(f.get("id") ?? ""));
  if (a && a.source === "handmatig" && a.status === "actief") {
    repo.setAuthorizationStatus(user.tenantId, a.id, "ingetrokken");
    repo.audit(user.tenantId, user.id, "machtiging.ingetrokken", a.id);
  }
  revalidatePath("/leerlingen");
  redirect("/leerlingen");
}

// ---------- Instellingen ----------

export async function saveOpleidernummerAction(f: FormData) {
  const user = requireUser();
  const raw = String(f.get("opleidernummer") ?? "");
  // Leeg laten mag: dan wordt het nummer gewist.
  if (raw.trim() === "") {
    repo.setOpleidernummer(user.tenantId, null);
    repo.audit(user.tenantId, user.id, "instelling.opleidernummer", "gewist");
    revalidatePath("/", "layout");
    redirect("/instellingen?ok=Opleidernummer+gewist");
  }
  const value = normalizeOpleidernummer(raw);
  const problem = opleidernummerProblem(value);
  if (problem) redirect(withParam("/instellingen", "fout", problem));
  repo.setOpleidernummer(user.tenantId, value);
  repo.audit(user.tenantId, user.id, "instelling.opleidernummer", value);
  revalidatePath("/", "layout");
  redirect(withParam("/instellingen", "ok", "Opleidernummer opgeslagen."));
}
