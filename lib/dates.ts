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

export function relativeTaskDate(
  value: string,
  timeZone: string,
  completed = false,
  now: Date = new Date(),
) {
  const distance = Math.round(
    (Date.parse(dayKey(value, timeZone)) - Date.parse(dayKey(now, timeZone))) /
      86400000,
  );
  const day =
    distance === 0
      ? "Today"
      : distance === 1
        ? "Tomorrow"
        : distance === -1
          ? "Yesterday"
          : distance > 0
            ? `In ${distance} days`
            : `${Math.abs(distance)} days ago`;
  const time = new Intl.DateTimeFormat("en", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
  return `${completed ? `Completed ${day.toLowerCase()}` : day} · ${time}`;
}
