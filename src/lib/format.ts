const tz = "Europe/Amsterdam";
export const fmtDateTime = (iso: string | Date) =>
  new Intl.DateTimeFormat("nl-NL", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: tz,
  }).format(new Date(iso));
export const fmtDate = (iso: string | Date) =>
  new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: tz }).format(new Date(iso));
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
