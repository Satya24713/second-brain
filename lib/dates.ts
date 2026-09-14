export function dayKey(value: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function formatDue(value: string, timeZone: string, withTime = true) {
  return new Intl.DateTimeFormat("en", {
    timeZone,
    month: "short",
    day: "numeric",
    ...(withTime ? ({ hour: "numeric", minute: "2-digit" } as const) : {}),
  }).format(new Date(value));
}
export function localInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function daysAway(value: string, timeZone: string) {
  const a = dayKey(value, timeZone);
  const b = dayKey(new Date(), timeZone);
  return Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
}
