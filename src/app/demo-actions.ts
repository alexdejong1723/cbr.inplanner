"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isMock } from "@/lib/cbr";
import { mockAddAuthorization, mockRemoveAuthorization } from "@/lib/cbr/mock";
import { AUTH_CATEGORY_LABEL, type AuthCategory } from "@/lib/cbr/types";

/** Alleen in demomodus: simuleert wat een leerling in Mijn CBR doet. */
export async function demoAddAuthorizationAction(f: FormData) {
  if (!isMock()) redirect("/");
  const user = requireUser();
  const category = String(f.get("categorie") ?? "") as AuthCategory;
  const name = String(f.get("naam") ?? "").trim();
  const birthDate = String(f.get("geboortedatum") ?? "");
  const validUntil = String(f.get("einddatum") ?? "");
  if (!name || !birthDate || !validUntil || !(category in AUTH_CATEGORY_LABEL)) redirect("/demo-cbr?fout=Vul+alle+velden+in");
  mockAddAuthorization(user.tenantId, {
    name, birthDate, category, validUntil, cbrRef: String(f.get("kandidaatnummer") ?? "").trim() || undefined,
  });
  revalidatePath("/demo-cbr");
  redirect("/demo-cbr?ok=Machtiging+toegevoegd");
}

export async function demoRemoveAuthorizationAction(f: FormData) {
  if (!isMock()) redirect("/");
  const user = requireUser();
  mockRemoveAuthorization(user.tenantId, String(f.get("categorie")), String(f.get("naam")), String(f.get("geboortedatum")));
  revalidatePath("/demo-cbr");
  redirect("/demo-cbr?ok=Machtiging+ingetrokken");
}
