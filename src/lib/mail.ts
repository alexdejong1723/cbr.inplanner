import { insertOutbox } from "./repo";

/**
 * E-mail versturen.
 *  - SMTP_URL gezet: via SMTP (gebruik een provider binnen de EER, i.v.m. de CBR-voorwaarden).
 *  - Niet gezet, ontwikkeling: mail komt in de tabel `outbox` en in de serverlog.
 *  - Niet gezet, productie: foutmelding, zodat er nooit stilletjes geen mail verstuurd wordt.
 */
export interface Mail { to: string; subject: string; text: string }

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function sendMail(mail: Mail): Promise<void> {
  const smtp = process.env.SMTP_URL;
  if (smtp) {
    const { createTransport } = await import("nodemailer");
    await createTransport(smtp).sendMail({
      from: process.env.MAIL_FROM ?? "CBR Inplanner <noreply@localhost>",
      to: mail.to, subject: mail.subject, text: mail.text,
    });
    return;
  }
  if (process.env.NODE_ENV === "production") throw new Error("SMTP_URL is niet ingesteld.");
  insertOutbox(mail.to, mail.subject, mail.text);
  console.log(`[mail → ${mail.to}] ${mail.subject}\n${mail.text}\n`);
}

/** Mail versturen zonder de gebruikersactie te laten falen; geeft terug of het gelukt is. */
export async function trySendMail(mail: Mail): Promise<boolean> {
  try { await sendMail(mail); return true; }
  catch (e) { console.error("Mail versturen mislukt:", e instanceof Error ? e.message : e); return false; }
}

const sign = "\n\nMet vriendelijke groet,\nCBR Inplanner";

export const verifyMail = (to: string, name: string, token: string): Mail => ({
  to, subject: "Bevestig uw e-mailadres",
  text: `Hallo ${name},\n\nBevestig uw e-mailadres via deze link (24 uur geldig):\n${appUrl()}/verifieer?token=${token}\n\nHeeft u dit niet aangevraagd? Dan kunt u deze e-mail negeren.${sign}`,
});

export const resetMail = (to: string, name: string, token: string): Mail => ({
  to, subject: "Wachtwoord opnieuw instellen",
  text: `Hallo ${name},\n\nStel via deze link een nieuw wachtwoord in (1 uur geldig, eenmalig te gebruiken):\n${appUrl()}/wachtwoord-resetten?token=${token}\n\nHeeft u dit niet aangevraagd? Dan kunt u deze e-mail negeren; uw wachtwoord blijft ongewijzigd.${sign}`,
});

export const approvedMail = (to: string, name: string, tenant: string): Mail => ({
  to, subject: "Uw aanmelding is goedgekeurd",
  text: `Hallo ${name},\n\nDe aanmelding van ${tenant} is goedgekeurd. U kunt nu inloggen:\n${appUrl()}/inloggen${sign}`,
});

export const rejectedMail = (to: string, name: string, tenant: string, reason: string): Mail => ({
  to, subject: "Uw aanmelding is niet goedgekeurd",
  text: `Hallo ${name},\n\nDe aanmelding van ${tenant} is helaas niet goedgekeurd.${reason ? `\n\nReden: ${reason}` : ""}\n\nHeeft u vragen? Neem dan contact met ons op.${sign}`,
});

export const adminNoticeMail = (to: string, tenant: string, owner: string): Mail => ({
  to, subject: `Nieuwe aanmelding: ${tenant}`,
  text: `${tenant} (${owner}) heeft het e-mailadres bevestigd en wacht op goedkeuring:\n${appUrl()}/admin${sign}`,
});
