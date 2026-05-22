import { addDays, dateKey, getWeekDays, todayKey } from "./time";

export function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function getCalendarDays(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const startDay = first.getDay() || 7;
  const start = addDays(first, -(startDay - 1));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function getRecentWeeks(count: number) {
  const currentWeek = getWeekDays(new Date())[0];
  return Array.from({ length: count }, (_, index) => {
    const start = addDays(currentWeek, -(count - 1 - index) * 7);
    return {
      key: dateKey(start),
      label: `${start.getMonth() + 1}/${start.getDate()}`
    };
  });
}

export function getRecentMonths(count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return {
      key: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`,
      label: `${month.getFullYear().toString().slice(2)}/${month.getMonth() + 1}`
    };
  });
}

export function getRecentYears(count: number) {
  const year = new Date().getFullYear();
  return Array.from({ length: count }, (_, index) => {
    const item = String(year - (count - 1 - index));
    return { key: item, label: item };
  });
}

export function periodKey(date: string, dimension: "week" | "month" | "year") {
  if (dimension === "year") return date.slice(0, 4);
  if (dimension === "month") return date.slice(0, 7);
  return dateKey(getWeekDays(new Date(`${date}T00:00:00`))[0]);
}

export function dailyRangeStartFromEntries(dates: string[]) {
  return new Date(`${dates[0] ?? todayKey()}T00:00:00`);
}
