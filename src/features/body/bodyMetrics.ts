import type { BodyEntry } from "../../model";
import {
  averageNumber,
  formatDelta,
  numeric,
  positiveNumber,
} from "../../shared/lib";

export const BMI_RANGES = [
  {
    level: "underweight",
    label: "偏瘦",
    text: "<18.5",
    hint: "优先保证恢复和蛋白质，不建议继续激进减脂。",
  },
  {
    level: "normal",
    label: "正常",
    text: "18.5-23.9",
    hint: "继续看体重均值、腰围和训练表现的长期趋势。",
  },
  {
    level: "overweight",
    label: "超重",
    text: "24-27.9",
    hint: "适合稳步减脂，别把训练日前后的碳水砍太狠。",
  },
  {
    level: "obese",
    label: "肥胖",
    text: ">=28",
    hint: "这是需要重点关注的区间，建议以腰围和周均体重一起跟踪。",
  },
] as const;

export function calculateBmi(weightKg?: string, heightCm?: string) {
  const weight = numeric(weightKg);
  const height = numeric(heightCm) / 100;
  if (!weight || !height) return undefined;
  return weight / (height * height);
}

export function getBmiInfo(bmi: number) {
  if (bmi < 18.5) return BMI_RANGES[0];
  if (bmi < 24) return BMI_RANGES[1];
  if (bmi < 28) return BMI_RANGES[2];
  return BMI_RANGES[3];
}

export function buildBodyHistorySummary(entries: Record<string, BodyEntry>) {
  const points = Object.values(entries)
    .map((entry) => ({
      date: entry.date,
      weight: positiveNumber(entry.weightKg),
      waist: positiveNumber(entry.waistCm),
    }))
    .filter((entry) => entry.weight || entry.waist)
    .sort((a, b) => a.date.localeCompare(b.date));
  const weightPoints = points.filter((entry) => entry.weight);
  const waistPoints = points.filter((entry) => entry.waist);

  return {
    latestWeightKg: weightPoints.at(-1)?.weight,
    sevenDayAverageKg: averageNumber(
      weightPoints
        .slice(-7)
        .map((entry) => entry.weight)
        .filter(Boolean) as number[],
    ),
    fourteenDayAverageKg: averageNumber(
      weightPoints
        .slice(-14)
        .map((entry) => entry.weight)
        .filter(Boolean) as number[],
    ),
    latestWaistCm: waistPoints.at(-1)?.waist,
  };
}

export function buildWeightTrendText(entries: Record<string, BodyEntry>) {
  const points = Object.values(entries)
    .map((entry) => ({ date: entry.date, weight: numeric(entry.weightKg) }))
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length < 2) return "数据不足";

  const recent = points.slice(-7);
  const previous = points.slice(-14, -7);
  const recentAvg =
    recent.reduce((sum, entry) => sum + entry.weight, 0) / recent.length;

  if (previous.length === 0) return `${recentAvg.toFixed(1)} kg`;

  const previousAvg =
    previous.reduce((sum, entry) => sum + entry.weight, 0) / previous.length;
  const diff = recentAvg - previousAvg;
  if (Math.abs(diff) < 0.05) return `${recentAvg.toFixed(1)} kg，持平`;
  return `${recentAvg.toFixed(1)} kg，${diff > 0 ? "上升" : "下降"} ${Math.abs(diff).toFixed(1)} kg`;
}

export function buildMonthlyBodyTrend(
  bodyEntries: Record<string, BodyEntry>,
  month: string,
  monthEnd: string,
) {
  const entries = Object.entries(bodyEntries)
    .map(([key, entry]) => ({
      ...entry,
      date: entry.date || key,
    }))
    .filter((entry) => entry.date <= monthEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
  const monthEntries = entries.filter((entry) => entry.date.startsWith(month));
  const monthlyWeightPoints = buildBodyPoints(monthEntries, "weightKg");
  const allWeightPoints = buildBodyPoints(entries, "weightKg");
  const monthlyWaistPoints = buildBodyPoints(monthEntries, "waistCm");
  const parts = [];
  let weightDeltaValue = "-";
  let weightDeltaUnit = "";
  if (monthlyWeightPoints.length >= 2) {
    const first = monthlyWeightPoints[0];
    const last = monthlyWeightPoints.at(-1)!;
    weightDeltaValue = formatDelta(last.value - first.value);
    weightDeltaUnit = "kg";
    parts.push(`本月体重 ${weightDeltaValue}${weightDeltaUnit}`);
  } else if (allWeightPoints.length >= 2) {
    const latestTwo = allWeightPoints.slice(-2);
    weightDeltaValue = formatDelta(latestTwo[1].value - latestTwo[0].value);
    weightDeltaUnit = "kg";
    parts.push(`最近体重 ${weightDeltaValue}${weightDeltaUnit}`);
  } else if (allWeightPoints.length === 1) {
    weightDeltaValue = String(allWeightPoints[0].value);
    weightDeltaUnit = "kg";
    parts.push(`体重 ${weightDeltaValue}${weightDeltaUnit}（仅1条）`);
  } else {
    parts.push("体重暂无记录");
  }
  if (monthlyWaistPoints.length >= 2) {
    const first = monthlyWaistPoints[0];
    const last = monthlyWaistPoints.at(-1)!;
    parts.push(`腰围 ${formatDelta(last.value - first.value)}cm`);
  }
  return {
    text: parts.join(" / "),
    weightDeltaValue,
    weightDeltaUnit,
  };
}

export function buildBodyPoints(
  entries: BodyEntry[],
  key: "weightKg" | "waistCm",
) {
  return entries
    .map((entry) => ({
      date: entry.date,
      value: positiveNumber(entry[key]),
    }))
    .filter((point): point is { date: string; value: number } =>
      Boolean(point.value),
    );
}
