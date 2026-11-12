"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCbrClient } from "@/lib/cbr";
import { CbrError } from "@/lib/cbr/client";
import { canCancel } from "@/lib/cbr/rules";

export async function reserveAction(formData: FormData) {
  const candidateId = String(formData.get("candidateId") ?? "");
  const slotId = String(formData.get("slotId") ?? "");
  const back = String(formData.get("back") ?? "/plannen");
  if (!candidateId) redirect(`${back}${back.includes("?") ? "&" : "?"}fout=${encodeURIComponent("Kies eerst een leerling.")}`);
  try {
    await getCbrClient().reserve({ candidateId, slotId });
  } catch (e) {
    const msg = e instanceof CbrError ? e.message : "Onbekende fout bij reserveren.";
    redirect(`${back}${back.includes("?") ? "&" : "?"}fout=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/reserveringen");
  redirect("/reserveringen?ok=gereserveerd");
}

export async function cancelAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const client = getCbrClient();
  const r = (await client.listReservations()).find((x) => x.id === id);
  // Dubbele controle op de server: de knop in de UI is slechts een hint.
  if (!r || !canCancel(r, new Date()).allowed) redirect("/reserveringen?fout=annuleren-niet-toegestaan");
  await client.cancel(id);
  revalidatePath("/reserveringen");
  redirect("/reserveringen?ok=geannuleerd");
}
