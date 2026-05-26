export function formatDuration(minutes: number) {
  if (!minutes) return "0 分钟";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} 分钟`;
  return rest ? `${hours}小时${rest}分` : `${hours}小时`;
}

export function formatDurationParts(minutes: number) {
  if (!minutes) return { value: "0", unit: "分钟" };
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return { value: String(rest), unit: "分钟" };
  if (!rest) return { value: String(hours), unit: "小时" };
  return { value: `${hours}:${String(rest).padStart(2, "0")}`, unit: "小时" };
}

export function formatDurationMetricParts(minutes: number) {
  if (!minutes) return [{ value: "0", unit: "分钟" }];
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts: Array<{ value: string; unit: string }> = [];
  if (hours) parts.push({ value: String(hours), unit: "小时" });
  if (rest) parts.push({ value: String(rest), unit: "分钟" });
  return parts.length ? parts : [{ value: "0", unit: "分钟" }];
}

export function formatDelta(value: number) {
  const rounded = Number(value.toFixed(1));
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

export function countRecord(record: Record<string, unknown>) {
  return Object.values(record).filter((item) => {
    if (!item) return false;
    if (typeof item !== "object") return true;
    return Object.values(item).some((value) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null && value !== "";
    });
  }).length;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function formatReportTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
