export function averageNumber(values: number[]) {
  if (!values.length) return undefined;
  return Number(
    (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1),
  );
}

export function sumNumbers(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

export function findLastIndex<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
}

export function formatMetric(value?: number) {
  return value === undefined ? "-" : String(Math.round(value));
}

export function formatSignedMetric(value?: number) {
  if (value === undefined) return "-";
  return value > 0 ? `+${Math.round(value)}` : String(Math.round(value));
}

export function positiveNumber(value?: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function trimForAi(value: string | undefined, maxLength: number) {
  const text = value?.trim();
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export function numeric(value?: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
