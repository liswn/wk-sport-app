import { Fragment, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Button, Popup, Switch } from "tdesign-mobile-react";
import { Metric } from "../../components/TrainingBits";
import { addMonths } from "../../calendarUtils";
import type {
  ActivityAnalysis,
  BodyEntry,
  Checkins,
  PlanDay,
  SettingsState,
  TrainingLog,
  TrainingTemplate,
} from "../../model";
import { defaultPlanForDate } from "../../model";
import {
  addDays,
  dateKey,
  formatMonthDay,
  getWeekDays,
  todayKey,
} from "../../time";
import { labelKind, withCurrentPower } from "../../trainingUtils";
import { buildMonthlyBodyTrend, buildWeightTrendText } from "../body";
import {
  formatDuration,
  formatDurationMetricParts,
  numeric,
  positiveNumber,
} from "../../shared/lib";
import { estimatePlannedTssFromLog } from "../training";

export function WeeklyReview({
  plans,
  bodyEntries,
  checkins,
  trainingLogs,
  activityAnalyses,
  settings,
  templates,
  embedded = false,
}: {
  plans: Record<string, PlanDay>;
  bodyEntries: Record<string, BodyEntry>;
  checkins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  activityAnalyses: Record<string, ActivityAnalysis>;
  settings: SettingsState;
  templates: TrainingTemplate[];
  embedded?: boolean;
}) {
  const week = getWeekDays(new Date());
  const weekKeys = week.map(dateKey);
  const elapsedKeys = weekKeys.filter((key) => key <= todayKey());
  const previousWeekKeys = getWeekDays(addDays(week[0], -7)).map(dateKey);
  const previous = summarizeWeekSlice({
    keys: previousWeekKeys,
    plans,
    checkins,
    trainingLogs,
    activityAnalyses,
    settings,
    templates,
  });
  const current = summarizeWeekSlice({
    keys: elapsedKeys,
    plans,
    checkins,
    trainingLogs,
    activityAnalyses,
    settings,
    templates,
  });
  const weightTrend = buildWeightTrendText(bodyEntries);
  const reviewText = buildWeeklyReviewText({
    current,
    previous,
  });

  return (
    <div className={`${embedded ? "" : "panel"} weekly-review`}>
      <div className="section-head">
        <h3>本周训练对比</h3>
        <span>截至 {formatMonthDay(new Date())}</span>
      </div>
      <p className="weekly-review-summary">{reviewText}</p>
      <div className="review-grid">
        <CompareMetric
          label="训练完成"
          current={`${current.done}/${current.trainingDays}`}
          previous={`${previous.done}/${previous.trainingDays}`}
        />
        <CompareMetric
          label="骑行公里"
          current={`${current.distanceKm.toFixed(1)} km`}
          previous={`${previous.distanceKm.toFixed(1)} km`}
        />
        <CompareMetric
          label="实际时长"
          current={
            current.actualMinutes ? formatDuration(current.actualMinutes) : "-"
          }
          previous={
            previous.actualMinutes
              ? formatDuration(previous.actualMinutes)
              : "-"
          }
        />
        <CompareMetric
          label="平均 RPE"
          current={current.averageRpe}
          previous={previous.averageRpe}
        />
      </div>
      <div className="review-habit-grid">
        <HabitCompare
          label="蛋白"
          current={current.protein}
          previous={previous.protein}
        />
        <HabitCompare
          label="晚餐"
          current={current.dinner}
          previous={previous.dinner}
        />
        <HabitCompare
          label="早睡"
          current={current.sleep}
          previous={previous.sleep}
        />
      </div>
      <div className="review-line">
        <span>体重 7 日均值</span>
        <strong>{weightTrend}</strong>
      </div>
    </div>
  );
}

export type WeekSliceSummary = {
  done: number;
  trainingDays: number;
  actualMinutes: number;
  distanceKm: number;
  strength: number;
  averageRpe: string;
  protein: HabitSummary;
  dinner: HabitSummary;
  sleep: HabitSummary;
};

export type HabitSummary = {
  done: number;
  total: number;
  rate: number;
};

export function summarizeWeekSlice({
  keys,
  plans,
  checkins,
  trainingLogs,
  activityAnalyses,
  settings,
  templates,
}: {
  keys: string[];
  plans: Record<string, PlanDay>;
  checkins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  activityAnalyses: Record<string, ActivityAnalysis>;
  settings: SettingsState;
  templates: TrainingTemplate[];
}): WeekSliceSummary {
  const planned = keys.map((key) =>
    withCurrentPower(
      plans[key] ?? defaultPlanForDate(key, settings.ftp, templates),
      settings.ftp,
      templates,
    ),
  );
  const trainingDays = planned.filter((plan) => plan.kind !== "rest").length;
  const done = keys.filter((key) => {
    const analysis = activityAnalyses[key];
    return Boolean(
      checkins[key]?.trainingDone ||
      numeric(trainingLogs[key]?.actualMinutes) ||
      analysis?.actualMinutes ||
      (analysis?.activityCount && analysis.activityCount > 0),
    );
  }).length;
  const strength = planned.filter((plan, index) => {
    const key = keys[index];
    return Boolean(plan.exercises?.length) && checkins[key]?.trainingDone;
  }).length;
  const actualMinutes = Math.round(
    keys.reduce((sum, key) => {
      const logged = numeric(trainingLogs[key]?.actualMinutes);
      return sum + (logged || activityAnalyses[key]?.actualMinutes || 0);
    }, 0),
  );
  const distanceKm = Number(
    keys
      .reduce((sum, key) => sum + (activityAnalyses[key]?.distanceKm ?? 0), 0)
      .toFixed(1),
  );
  const rpeValues = keys
    .map((key) => numeric(trainingLogs[key]?.rpe))
    .filter((value) => value > 0);
  const averageRpe = rpeValues.length
    ? (
        rpeValues.reduce((sum, value) => sum + value, 0) / rpeValues.length
      ).toFixed(1)
    : "-";

  return {
    done,
    trainingDays,
    actualMinutes,
    distanceKm,
    strength,
    averageRpe,
    protein: summarizeHabit(keys, checkins, "proteinDone"),
    dinner: summarizeHabit(keys, checkins, "dinnerControlled"),
    sleep: summarizeHabit(keys, checkins, "earlySleep"),
  };
}

export function summarizeHabit(
  keys: string[],
  checkins: Record<string, Checkins>,
  field: keyof Pick<
    Checkins,
    "proteinDone" | "dinnerControlled" | "earlySleep"
  >,
): HabitSummary {
  const done = keys.filter((key) => Boolean(checkins[key]?.[field])).length;
  const total = keys.length;
  return {
    done,
    total,
    rate: total ? Math.round((done / total) * 100) : 0,
  };
}

export function CompareMetric({
  label,
  current,
  previous,
}: {
  label: string;
  current: string;
  previous: string;
}) {
  return (
    <div className="compare-metric">
      <span>{label}</span>
      <strong>{current}</strong>
      <em>上周 {previous}</em>
    </div>
  );
}

export function HabitCompare({
  label,
  current,
  previous,
}: {
  label: string;
  current: HabitSummary;
  previous: HabitSummary;
}) {
  return (
    <div className="habit-compare">
      <span>{label}</span>
      <strong>{current.rate}%</strong>
      <em>
        {current.done}/{current.total} · 上周 {previous.rate}%
      </em>
    </div>
  );
}

export function buildWeeklyReviewText({
  current,
  previous,
}: {
  current: WeekSliceSummary;
  previous: WeekSliceSummary;
}) {
  if (!current.trainingDays)
    return "本周以恢复为主，继续保持体重和执行记录，别为了打卡硬凑训练。";
  if (!current.done && !current.actualMinutes) {
    return "本周还没有记录到训练完成，建议先补齐实际训练、RPE 和体感，再看负荷趋势。";
  }
  const completion = Math.round((current.done / current.trainingDays) * 100);
  const previousCompletion = previous.trainingDays
    ? Math.round((previous.done / previous.trainingDays) * 100)
    : 0;
  const distanceDiff = current.distanceKm - previous.distanceKm;
  const distanceText =
    distanceDiff === 0
      ? "骑行距离与上周接近"
      : `骑行距离比上周${distanceDiff > 0 ? "多" : "少"} ${Math.abs(distanceDiff).toFixed(1)} km`;
  const rpeHint =
    current.averageRpe !== "-" && Number(current.averageRpe) >= 7
      ? "主观强度偏高，接下来优先保证恢复。"
      : "整体强度可控，继续看长期趋势。";
  const strengthHint = current.strength
    ? `力量完成 ${current.strength} 次，`
    : "";
  return `本周截至今天完成率 ${completion}%（上周 ${previousCompletion}%），${strengthHint}${distanceText}，累计 ${current.actualMinutes || 0} 分钟。${rpeHint}`;
}

export type MonthlyReportStats = {
  month: string;
  monthLabel: string;
  trainingCount: number;
  rideCount: number;
  distanceKm: number;
  actualMinutes: number;
  totalTss: number;
  completionRate: number;
  longestDistanceKm: number;
  longestMinutes: number;
  strengthCount: number;
  trainingKinds: Array<{ label: string; count: number }>;
  calendarDays: Array<{
    date: string;
    day: number;
    trained: boolean;
    hard: boolean;
  }>;
  bodyTrend: string;
  weightDeltaValue: string;
  weightDeltaUnit: string;
  summary: string;
};

export function MonthlyReport({
  plans,
  bodyEntries,
  checkins,
  trainingLogs,
  activityAnalyses,
  settings,
  templates,
}: {
  plans: Record<string, PlanDay>;
  bodyEntries: Record<string, BodyEntry>;
  checkins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  activityAnalyses: Record<string, ActivityAnalysis>;
  settings: SettingsState;
  templates: TrainingTemplate[];
}) {
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [open, setOpen] = useState(false);
  const [includeBody, setIncludeBody] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const cardRef = useRef<HTMLDivElement>(null);
  const stats = useMemo(
    () =>
      buildMonthlyReportStats({
        monthAnchor,
        plans,
        bodyEntries,
        checkins,
        trainingLogs,
        activityAnalyses,
        settings,
        templates,
      }),
    [
      activityAnalyses,
      bodyEntries,
      checkins,
      monthAnchor,
      plans,
      settings,
      templates,
      trainingLogs,
    ],
  );

  const saveShareCard = async () => {
    if (!cardRef.current) return;
    setSaveError("");
    setSaving(true);
    try {
      const image = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: "#f4f7f3",
      });
      const link = document.createElement("a");
      link.href = image;
      link.download = `cycling-monthly-report-${stats.month}.png`;
      link.click();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "生成图片失败，请重试。",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="panel monthly-report monthly-report-entry">
        <div className="section-head">
          <h3>训练月报</h3>
          <span>{stats.monthLabel}</span>
        </div>
        <p className="monthly-summary">{stats.summary}</p>
        <div className="monthly-metrics">
          <Metric label="训练次数" value={`${stats.trainingCount} 次`} />
          <Metric
            label="骑行公里"
            value={`${stats.distanceKm.toFixed(1)} km`}
          />
          <Metric label="总时长" value={formatDuration(stats.actualMinutes)} />
          <Metric label="本月 TSS" value={String(stats.totalTss)} />
        </div>
        <Button
          className="monthly-generate"
          shape="round"
          variant="outline"
          onClick={() => setOpen(true)}
        >
          生成分享卡片
        </Button>
      </div>
      <Popup
        visible={open}
        placement="bottom"
        onClose={() => setOpen(false)}
        closeOnOverlayClick
      >
        <div className="monthly-share-sheet">
          <div className="monthly-share-toolbar">
            <Button
              size="small"
              variant="outline"
              shape="round"
              onClick={() =>
                setMonthAnchor((current) => addMonths(current, -1))
              }
            >
              上月
            </Button>
            <strong>{stats.monthLabel}</strong>
            <Button
              size="small"
              variant="outline"
              shape="round"
              onClick={() => setMonthAnchor((current) => addMonths(current, 1))}
            >
              下月
            </Button>
            <Button
              size="small"
              variant="text"
              shape="round"
              onClick={() => setOpen(false)}
            >
              关闭
            </Button>
          </div>
          <label className="monthly-body-switch">
            <span>在图片中显示身体趋势</span>
            <Switch
              size="small"
              value={includeBody}
              onChange={(value) => setIncludeBody(Boolean(value))}
            />
          </label>
          <div className="monthly-card-stage">
            <div className="monthly-share-card" ref={cardRef}>
              <h2>{stats.monthLabel} 骑行训练月报</h2>
              <p className="monthly-card-goal">
                减脂 + 提升功率 · FTP {settings.ftp}W
              </p>
              <div className="monthly-card-hero">
                <strong>
                  {stats.distanceKm.toFixed(1)}
                  <small>公里</small>
                </strong>
                <span>本月骑行</span>
              </div>
              <div className="monthly-card-grid">
                <ReportMetricValue
                  value={stats.trainingCount}
                  unit="次"
                  label="训练次数"
                />
                <ReportMetricValue
                  parts={formatDurationMetricParts(stats.actualMinutes)}
                  label="训练时长"
                  wide
                />
                <ReportMetricValue
                  value={stats.totalTss}
                  label="训练负荷 TSS"
                />
                <ReportMetricValue
                  value={stats.completionRate}
                  unit="%"
                  label="计划完成率"
                />
                {includeBody && (
                  <ReportMetricValue
                    value={stats.weightDeltaValue}
                    unit={stats.weightDeltaUnit}
                    label="体重变化"
                  />
                )}
              </div>
              <div className="monthly-calendar">
                {stats.calendarDays.map((day) => (
                  <span
                    key={day.date}
                    className={day.trained ? (day.hard ? "hard" : "done") : ""}
                  >
                    {day.day}
                  </span>
                ))}
              </div>
              <footer>Generated by wk-sport-app </footer>
            </div>
          </div>
          {saveError && <p className="sync-error">{saveError}</p>}
          <Button
            block
            shape="round"
            theme="primary"
            loading={saving}
            onClick={saveShareCard}
          >
            保存 9:16 图片
          </Button>
        </div>
      </Popup>
    </>
  );
}

export function ReportMetricValue({
  value,
  unit,
  parts,
  label,
  wide = false,
}: {
  value?: string | number;
  unit?: string;
  parts?: Array<{ value: string | number; unit?: string }>;
  label: string;
  wide?: boolean;
}) {
  return (
    <div className={`report-metric-value${wide ? " wide" : ""}`}>
      <strong>
        {parts?.length
          ? parts.map((part, index) => (
              <Fragment key={`${part.value}-${part.unit ?? ""}-${index}`}>
                {part.value}
                {part.unit && <small>{part.unit}</small>}
              </Fragment>
            ))
          : value}
        {!parts?.length && unit && <small>{unit}</small>}
      </strong>
      <span>{label}</span>
    </div>
  );
}

export function buildMonthlyReportStats({
  monthAnchor,
  plans,
  bodyEntries,
  checkins,
  trainingLogs,
  activityAnalyses,
  settings,
  templates,
}: {
  monthAnchor: Date;
  plans: Record<string, PlanDay>;
  bodyEntries: Record<string, BodyEntry>;
  checkins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  activityAnalyses: Record<string, ActivityAnalysis>;
  settings: SettingsState;
  templates: TrainingTemplate[];
}): MonthlyReportStats {
  const start = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
  const end = new Date(
    monthAnchor.getFullYear(),
    monthAnchor.getMonth() + 1,
    0,
  );
  const month = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  const keys = Array.from({ length: end.getDate() }, (_, index) =>
    dateKey(new Date(start.getFullYear(), start.getMonth(), index + 1)),
  );
  const rows = keys.map((key) => {
    const plan = withCurrentPower(
      plans[key] ?? defaultPlanForDate(key, settings.ftp, templates),
      settings.ftp,
      templates,
    );
    const log = trainingLogs[key];
    const analysis = activityAnalyses[key];
    const actualMinutes =
      positiveNumber(log?.actualMinutes) ?? analysis?.actualMinutes ?? 0;
    const distanceKm = analysis?.distanceKm ?? 0;
    const trainingLoad =
      analysis?.trainingLoad ?? estimatePlannedTssFromLog(plan, actualMinutes);
    const trained = Boolean(
      checkins[key]?.trainingDone ||
      actualMinutes ||
      (analysis?.activityCount ?? 0) > 0,
    );
    return {
      date: key,
      plan,
      trained,
      actualMinutes,
      distanceKm,
      trainingLoad,
      activityCount: analysis?.activityCount ?? 0,
      hard: trained && (plan.kind === "sweetspot" || plan.kind === "threshold"),
    };
  });
  const plannedTrainingDays = rows.filter(
    (row) => row.plan.kind !== "rest",
  ).length;
  const trainedRows = rows.filter((row) => row.trained);
  const trainingCount = trainedRows.length;
  const rideCount = rows.reduce(
    (sum, row) =>
      sum +
      (row.activityCount ||
        (row.trained && row.plan.kind !== "rest" && row.plan.kind !== "strength"
          ? 1
          : 0)),
    0,
  );
  const actualMinutes = Math.round(
    rows.reduce((sum, row) => sum + row.actualMinutes, 0),
  );
  const distanceKm = Number(
    rows.reduce((sum, row) => sum + row.distanceKm, 0).toFixed(1),
  );
  const totalTss = Math.round(
    rows.reduce((sum, row) => sum + row.trainingLoad, 0),
  );
  const longestDistanceKm = Math.max(0, ...rows.map((row) => row.distanceKm));
  const longestMinutes = Math.max(0, ...rows.map((row) => row.actualMinutes));
  const strengthCount = rows.filter(
    (row) => row.trained && Boolean(row.plan.exercises?.length),
  ).length;
  const kindCounts = new Map<string, number>();
  for (const row of trainedRows) {
    const label = labelKind(row.plan.kind);
    kindCounts.set(label, (kindCounts.get(label) ?? 0) + 1);
  }
  const completionRate = plannedTrainingDays
    ? Math.round((trainingCount / plannedTrainingDays) * 100)
    : 0;
  const bodyTrend = buildMonthlyBodyTrend(bodyEntries, month, dateKey(end));

  return {
    month,
    monthLabel: new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
    }).format(start),
    trainingCount,
    rideCount,
    distanceKm,
    actualMinutes,
    totalTss,
    completionRate,
    longestDistanceKm,
    longestMinutes,
    strengthCount,
    trainingKinds: Array.from(kindCounts.entries()).map(([label, count]) => ({
      label,
      count,
    })),
    calendarDays: rows.map((row) => ({
      date: row.date,
      day: Number(row.date.slice(-2)),
      trained: row.trained,
      hard: row.hard,
    })),
    bodyTrend: bodyTrend.text,
    weightDeltaValue: bodyTrend.weightDeltaValue,
    weightDeltaUnit: bodyTrend.weightDeltaUnit,
    summary: buildMonthlySummary({
      trainingCount,
      rideCount,
      distanceKm,
      actualMinutes,
      totalTss,
      completionRate,
    }),
  };
}

export function buildMonthlySummary({
  trainingCount,
  rideCount,
  distanceKm,
  totalTss,
  completionRate,
}: {
  trainingCount: number;
  rideCount: number;
  distanceKm: number;
  actualMinutes: number;
  totalTss: number;
  completionRate: number;
}) {
  if (!trainingCount) {
    return "这个月还没有可统计的训练记录，先完成几次训练再生成更有内容的月报。";
  }
  const distanceText =
    distanceKm > 0 ? `骑行 ${distanceKm.toFixed(1)} km，` : "";
  const loadText = totalTss ? `累计 TSS ${totalTss}，` : "";
  return `这个月完成 ${trainingCount} 天训练，${rideCount} 次骑行，${distanceText}${loadText}计划完成率 ${completionRate}%。稳住节奏，比单次爆发更重要。`;
}
