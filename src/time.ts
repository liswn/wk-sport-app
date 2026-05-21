export function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayKey() {
  return dateKey(new Date());
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getWeekDays(anchor: Date) {
  const start = new Date(anchor);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function formatChineseDate(input: string | Date) {
  const date = typeof input === "string" ? new Date(`${input}T00:00:00`) : input;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(date);
}

export function formatMonthDay(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric"
  }).format(date);
}
