import type { TrainingHistorySummary } from "../../integrations";
import {
  ActivityAnalysis,
  BodyEntry,
  Checkins,
  type FatigueLoadMetrics,
  PlanDay,
  SettingsState,
  TrainingLog,
  TrainingTemplate,
  defaultPlanForDate,
} from "../../model";
import { addDays, dateKey, getWeekDays } from "../../time";
import { withCurrentPower } from "../../trainingUtils";
import { buildBodyHistorySummary } from "../body";
import {
  averageNumber,
  findLastIndex,
  formatMetric,
  formatSignedMetric,
  positiveNumber,
  sumNumbers,
  trimForAi,
} from "../../shared/lib";

export type ReadinessInsight = {
  level: "green" | "yellow" | "red" | "gray";
  label: string;
  title: string;
  summary: string;
  nextAction: string;
  tomorrowAdvice: string;
  metrics: FatigueLoadMetrics;
  latestAnalysis?: ActivityAnalysis;
};

export type TrainingHistoryDay = TrainingHistorySummary["days"][number];

export function buildTrainingHistorySummary({
  settings,
  plans,
  checkins,
  trainingLogs,
  activityAnalyses,
  bodyEntries,
  templates,
}: {
  settings: SettingsState;
  plans: Record<string, PlanDay>;
  checkins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  activityAnalyses: Record<string, ActivityAnalysis>;
  bodyEntries: Record<string, BodyEntry>;
  templates: TrainingTemplate[];
}): TrainingHistorySummary {
  const days = 42;
  const keys = Array.from({ length: days }, (_, index) =>
    dateKey(addDays(new Date(), index - days + 1)),
  );
  const rows: TrainingHistoryDay[] = keys.map((key) => {
    const plan = withCurrentPower(
      plans[key] ?? defaultPlanForDate(key, settings.ftp, templates),
      settings.ftp,
      templates,
    );
    const log = trainingLogs[key];
    const analysis = activityAnalyses[key];
    const checkin = checkins[key];
    const loggedMinutes = positiveNumber(log?.actualMinutes);
    const loggedPower = positiveNumber(log?.averagePower);
    const rpe = positiveNumber(log?.rpe);
    const actualMinutes = loggedMinutes ?? analysis?.actualMinutes;
    const averagePower = loggedPower ?? analysis?.averagePower;
    const done = Boolean(
      checkin?.trainingDone ||
      actualMinutes ||
      (analysis?.activityCount && analysis.activityCount > 0),
    );

    return {
      date: key,
      plannedTitle: plan.title,
      plannedKind: plan.kind,
      plannedMinutes: plan.durationMinutes,
      done,
      actualMinutes,
      averagePower,
      rpe,
      feeling: log?.feeling,
      trainingLoad: analysis?.trainingLoad,
      differencePercent: analysis?.differencePercent,
      checkins: checkin,
      notes: trimForAi(log?.notes, 180),
      intervalSummary: trimForAi(analysis?.summary, 180),
    };
  });
  const trainingRows = rows.filter((row) => row.done || row.actualMinutes);
  const recent7 = rows.slice(-7);
  const recent14 = rows.slice(-14);
  const weekly = Array.from(groupHistoryByWeek(rows).entries()).map(
    ([weekStart, weekRows]) => ({
      weekStart,
      ...summarizeHistoryRows(weekRows),
    }),
  );
  const loadMetrics = buildFatigueLoadMetrics(rows, weekly);

  return {
    range: {
      days,
      start: keys[0],
      end: keys[keys.length - 1],
    },
    goal: {
      ftp: settings.ftp,
      text: trimForAi(settings.goalText, 480),
      strategy: settings.strategyLevel,
      focus: settings.goalFocus,
    },
    totals: summarizeHistoryRows(trainingRows),
    recent7: summarizeHistoryRows(recent7),
    recent14: summarizeHistoryRows(recent14),
    weekly,
    body: buildBodyHistorySummary(bodyEntries),
    loadMetrics,
    days: rows,
  };
}

export function summarizeHistoryRows(rows: TrainingHistoryDay[]) {
  const trainingRows = rows.filter((row) => row.done || row.actualMinutes);
  const rpeValues = trainingRows
    .map((row) => row.rpe)
    .filter((value): value is number => Boolean(value));
  const loads = trainingRows
    .map((row) => row.trainingLoad)
    .filter((value): value is number => Boolean(value));
  const hardSessions = trainingRows.filter(
    (row) =>
      (row.rpe ?? 0) >= 7 ||
      row.plannedKind === "sweetspot" ||
      row.plannedKind === "threshold",
  ).length;
  const tiredDays = trainingRows.filter(
    (row) =>
      row.feeling === "tired" ||
      row.feeling === "very-tired" ||
      (row.rpe ?? 0) >= 8,
  ).length;
  const trainingLoad = loads.length
    ? Math.round(loads.reduce((sum, value) => sum + value, 0))
    : undefined;

  return {
    trainingDays: trainingRows.length,
    completedDays: trainingRows.filter((row) => row.done).length,
    actualMinutes: Math.round(
      trainingRows.reduce((sum, row) => sum + (row.actualMinutes ?? 0), 0),
    ),
    averageRpe: averageNumber(rpeValues),
    highRpeDays: trainingRows.filter((row) => (row.rpe ?? 0) >= 8).length,
    tiredDays,
    hardSessions,
    totalTrainingLoad: trainingLoad,
    trainingLoad,
  };
}

export function groupHistoryByWeek(rows: TrainingHistoryDay[]) {
  const groups = new Map<string, TrainingHistoryDay[]>();
  for (const row of rows) {
    const weekStart = dateKey(getWeekDays(new Date(`${row.date}T00:00:00`))[0]);
    groups.set(weekStart, [...(groups.get(weekStart) ?? []), row]);
  }
  return groups;
}

export function buildFatigueLoadMetrics(
  rows: TrainingHistoryDay[],
  weekly: Array<{ weekStart: string; trainingLoad?: number }>,
): FatigueLoadMetrics {
  const dailyLoads = rows.map((row) => estimateDailyTss(row));
  const latestIndex = findLastIndex(dailyLoads, (value) => value > 0);
  const latestTss = latestIndex >= 0 ? dailyLoads[latestIndex] : undefined;
  const latestTssDate = latestIndex >= 0 ? rows[latestIndex].date : undefined;
  const last7Tss = Math.round(sumNumbers(dailyLoads.slice(-7)));
  const currentWeekStart = dateKey(getWeekDays(new Date())[0]);
  const currentWeekTss =
    weekly.find((item) => item.weekStart === currentWeekStart)?.trainingLoad ??
    0;
  const previousWeekStart = dateKey(
    addDays(new Date(`${currentWeekStart}T00:00:00`), -7),
  );
  const previousWeekTss =
    weekly.find((item) => item.weekStart === previousWeekStart)?.trainingLoad ??
    0;
  const ctl = exponentialAverage(dailyLoads, 42);
  const atl = exponentialAverage(dailyLoads, 7);
  const tsb =
    ctl !== undefined && atl !== undefined ? Math.round(ctl - atl) : undefined;
  const status = labelLoadStatus(
    tsb,
    atl,
    ctl,
    dailyLoads.filter((value) => value > 0).length,
  );

  return {
    latestTss,
    latestTssDate,
    last7Tss,
    currentWeekTss,
    previousWeekTss,
    weeklyTss: weekly.map((item) => ({
      weekStart: item.weekStart,
      tss: item.trainingLoad ?? 0,
    })),
    ctl,
    atl,
    tsb,
    status,
    nextTraining: suggestNextTraining(tsb, atl, ctl, latestTss),
    dataDays: rows.length,
    loadDays: dailyLoads.filter((value) => value > 0).length,
  };
}

export function buildReadinessInsight({
  history,
  todayPlan,
  tomorrowPlan,
  todayCheckins,
  activityAnalyses,
}: {
  history: TrainingHistorySummary;
  todayPlan: PlanDay;
  tomorrowPlan: PlanDay;
  todayCheckins: Checkins;
  activityAnalyses: Record<string, ActivityAnalysis>;
}): ReadinessInsight {
  const metrics = history.loadMetrics;
  const recentRows = history.days.slice(-7);
  const recentTired = recentRows.filter(
    (row) =>
      row.feeling === "tired" ||
      row.feeling === "very-tired" ||
      (row.rpe ?? 0) >= 8,
  ).length;
  const highRpe = recentRows.filter((row) => (row.rpe ?? 0) >= 8).length;
  const latestAnalysis = Object.values(activityAnalyses)
    .filter((analysis) => analysis.activityCount > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  const isHardToday =
    todayPlan.kind === "sweetspot" || todayPlan.kind === "threshold";
  const isHardTomorrow =
    tomorrowPlan.kind === "sweetspot" || tomorrowPlan.kind === "threshold";
  const isDone = Boolean(todayCheckins.trainingDone);
  let level: ReadinessInsight["level"] = "gray";
  let label = "无";
  let title = "先补齐训练记录";
  let summary =
    "最近有效训练数据还不够，建议继续同步 Intervals.icu 或记录实际时长、RPE 和体感。";
  let nextAction = metrics.nextTraining;

  if (metrics.loadDays >= 5) {
    if (
      metrics.status === "需要降载" ||
      (metrics.tsb ?? 0) <= -18 ||
      recentTired >= 3 ||
      highRpe >= 2
    ) {
      level = "red";
      label = "红灯";
      title = "今天优先恢复";
      summary = `近7天 TSS ${formatMetric(metrics.last7Tss)}，TSB ${formatSignedMetric(metrics.tsb)}，疲劳信号偏高。`;
      nextAction = isHardToday
        ? "把今天强度降为恢复骑或休息"
        : "按恢复/Z2执行，避免加量";
    } else if (
      metrics.status === "偏疲劳" ||
      (metrics.tsb ?? 0) <= -8 ||
      recentTired >= 2
    ) {
      level = "yellow";
      label = "黄灯";
      title = "可以练，但别硬顶";
      summary = `负荷处在可训练但需要克制的区间，TSB ${formatSignedMetric(metrics.tsb)}，近7天疲劳天数 ${recentTired}。`;
      nextAction = isHardToday
        ? "强度保守执行，状态差就改 Z2"
        : "按计划执行，RPE 控制在 6 以内";
    } else {
      level = "green";
      label = "绿灯";
      title = "状态允许按计划推进";
      summary = `近7天 TSS ${formatMetric(metrics.last7Tss)}，CTL ${formatMetric(metrics.ctl)}，负荷结构比较平稳。`;
      nextAction = metrics.nextTraining;
    }
  }

  const tomorrowAdvice = buildTomorrowAdjustment({
    level,
    isDone,
    tomorrowPlan,
    isHardTomorrow,
  });

  return {
    level,
    label,
    title,
    summary,
    nextAction,
    tomorrowAdvice,
    metrics,
    latestAnalysis,
  };
}

export function buildTomorrowAdjustment({
  level,
  isDone,
  tomorrowPlan,
  isHardTomorrow,
}: {
  level: ReadinessInsight["level"];
  isDone: boolean;
  tomorrowPlan: PlanDay;
  isHardTomorrow: boolean;
}) {
  if (level === "gray") return "先记录今天实际训练，再判断是否调整。";
  if (level === "red") {
    return isHardTomorrow
      ? "建议把明天改为休息或恢复骑。"
      : "明天保持低强度，不补今天的量。";
  }
  if (level === "yellow") {
    return isHardTomorrow
      ? "明天强度日先降一级，优先 Z2。"
      : "明天按计划，但不要追加时长。";
  }
  if (!isDone && tomorrowPlan.kind !== "rest") {
    return "今天若没完成，明天也不要盲目补课，按原计划观察。";
  }
  return isHardTomorrow
    ? "明天可以做强度，热身后再决定是否完整执行。"
    : "明天按计划执行即可。";
}

export function estimatePlannedTssFromLog(plan: PlanDay, actualMinutes: number) {
  if (!actualMinutes) return 0;
  const intensity =
    plan.kind === "threshold"
      ? 0.95
      : plan.kind === "sweetspot"
        ? 0.9
        : plan.kind === "z2" || plan.kind === "aerobic"
          ? 0.68
          : plan.kind === "recovery"
            ? 0.55
            : 0.45;
  return Math.round((actualMinutes / 60) * intensity * intensity * 100);
}

export function estimateDailyTss(row: TrainingHistoryDay) {
  if (row.trainingLoad && row.trainingLoad > 0)
    return Math.round(row.trainingLoad);
  if (!row.actualMinutes) return 0;
  const intensity =
    row.plannedKind === "threshold"
      ? 0.95
      : row.plannedKind === "sweetspot"
        ? 0.9
        : row.plannedKind === "z2" || row.plannedKind === "aerobic"
          ? 0.68
          : row.plannedKind === "recovery"
            ? 0.55
            : row.rpe
              ? Math.min(1, Math.max(0.45, row.rpe / 10))
              : 0.5;
  return Math.round((row.actualMinutes / 60) * intensity * intensity * 100);
}

export function exponentialAverage(values: number[], days: number) {
  if (!values.length) return undefined;
  const alpha = 2 / (days + 1);
  let value = values[0] ?? 0;
  for (const next of values.slice(1)) {
    value = value + alpha * (next - value);
  }
  return Math.round(value);
}

export function labelLoadStatus(
  tsb: number | undefined,
  atl: number | undefined,
  ctl: number | undefined,
  loadDays: number,
) {
  if (loadDays < 5) return "数据不足";
  if (tsb === undefined || atl === undefined || ctl === undefined)
    return "数据不足";
  if (tsb <= -18) return "需要降载";
  if (tsb <= -8) return "偏疲劳";
  if (tsb >= 12) return "恢复良好";
  return "正常负荷";
}

export function suggestNextTraining(
  tsb: number | undefined,
  atl: number | undefined,
  ctl: number | undefined,
  latestTss: number | undefined,
) {
  if (tsb === undefined || atl === undefined || ctl === undefined)
    return "先补充同步数据";
  if (tsb <= -18 || (latestTss ?? 0) >= 100) return "休息或恢复骑";
  if (tsb <= -8) return "恢复骑或轻松 Z2";
  if (tsb >= 10 && atl <= ctl + 5) return "可以安排甜区";
  return "Z2 有氧为主";
}
