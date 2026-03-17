let _dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function setDateKeyTimezone(tz: string | undefined): void {
  if (tz === undefined || tz.length === 0) return;
  try {
    _dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {}
}

export function todayDateKey(): string {
  return dateKeyFromMs(Date.now());
}

export function dateKeyFromMs(ms: number): string {
  const parts = _dateKeyFormatter.formatToParts(new Date(ms));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (year === undefined || month === undefined || day === undefined) {
    throw new Error("Failed to format local date key");
  }

  return `${year}-${month}-${day}`;
}
