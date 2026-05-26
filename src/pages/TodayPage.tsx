import { useMemo, useState } from "react";
import { Button } from "tdesign-mobile-react";
import {
  CheckGrid,
  KindTag,
  Metric,
  StrengthList,
} from "../components/TrainingBits";
import {
  ActivityAnalysis,
  BodyEntry,
  Checkins,
  DayMemo,
  type FatigueAnalysisReport,
  PlanDay,
  SettingsState,
  TrainingLog,
  TrainingTemplate,
  defaultPlanForDate,
} from "../model";
import { requestAiFatigueAnalysis } from "../integrations";
import {
  addDays,
  dateKey,
  formatChineseDate,
  todayKey,
} from "../time";
import { withCurrentPower } from "../trainingUtils";
import { formatReportTime } from "../shared/lib";
import {
  FatigueMetricsGrid,
  NutritionPanel,
  PowerDistribution,
  ReadinessPanel,
  buildReadinessInsight,
  buildTrainingHistorySummary,
} from "../features/training";
import { MonthlyReport, WeeklyReview } from "../features/reports";

export function TodayPage({
  plan,
  memo,
  checkins,
  plans,
  bodyEntries,
  allCheckins,
  trainingLogs,
  activityAnalyses,
  lastFatigueReport,
  settings,
  templates,
  onFatigueReport,
  onCheck,
}: {
  plan: PlanDay;
  memo?: DayMemo;
  checkins: Checkins;
  plans: Record<string, PlanDay>;
  bodyEntries: Record<string, BodyEntry>;
  allCheckins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  activityAnalyses: Record<string, ActivityAnalysis>;
  lastFatigueReport?: FatigueAnalysisReport;
  settings: SettingsState;
  templates: TrainingTemplate[];
  onFatigueReport: (report: FatigueAnalysisReport) => void;
  onCheck: (key: keyof Checkins, value: boolean) => void;
}) {
  const [fatigueLoading, setFatigueLoading] = useState(false);
  const [fatigueError, setFatigueError] = useState("");
  const history = useMemo(
    () =>
      buildTrainingHistorySummary({
        settings,
        plans,
        checkins: allCheckins,
        trainingLogs,
        activityAnalyses,
        bodyEntries,
        templates,
      }),
    [
      activityAnalyses,
      allCheckins,
      bodyEntries,
      plans,
      settings,
      templates,
      trainingLogs,
    ],
  );
  const readiness = useMemo(
    () =>
      buildReadinessInsight({
        history,
        todayPlan: plan,
        tomorrowPlan: withCurrentPower(
          plans[dateKey(addDays(new Date(), 1))] ??
            defaultPlanForDate(
              dateKey(addDays(new Date(), 1)),
              settings.ftp,
              templates,
            ),
          settings.ftp,
          templates,
        ),
        todayCheckins: checkins,
        activityAnalyses,
      }),
    [activityAnalyses, checkins, history, plan, plans, settings.ftp, templates],
  );
  const autoSyncVisible =
    settings.lastAutoDailySyncDate === todayKey() &&
    Boolean(settings.lastAutoDailySyncMessage);

  const handleFatigueAnalysis = async () => {
    setFatigueError("");
    setFatigueLoading(true);
    try {
      const result = await requestAiFatigueAnalysis({ settings, history });
      onFatigueReport({
        date: todayKey(),
        generatedAt: new Date().toISOString(),
        rangeStart: history.range.start,
        rangeEnd: history.range.end,
        metrics: history.loadMetrics,
        content: result,
      });
    } catch (error) {
      setFatigueError(error instanceof Error ? error.message : String(error));
    } finally {
      setFatigueLoading(false);
    }
  };

  return (
    <section className="stack today-page">
      {memo?.text.trim() && (
        <div className="panel memo-panel memo-alert">
          <h3>今日备忘</h3>
          <p>{memo?.text}</p>
        </div>
      )}

      <div className="today-card">
        <div className="type-row">
          <KindTag kind={plan.kind} />
          <span>{formatChineseDate(plan.date)}</span>
        </div>
        <h2>{plan.title}</h2>
        {plan.kind === "rest" ? (
          <p className="muted">今天安排休息。恢复也是训练的一部分。</p>
        ) : plan.powerRange || plan.durationMinutes || plan.rideDetails ? (
          <div className="ride-metrics">
            <Metric
              label="时长"
              value={plan.durationLabel ?? `${plan.durationMinutes ?? 0} 分钟`}
            />
            <Metric
              label="功率"
              value={
                plan.powerRange
                  ? `${plan.powerRange[0]}-${plan.powerRange[1]}W`
                  : "按体感"
              }
            />
          </div>
        ) : null}
        {plan.segments?.length ? (
          <PowerDistribution segments={plan.segments} ftp={settings.ftp} />
        ) : null}
        {plan.rideDetails && <p className="note">{plan.rideDetails}</p>}
        {plan.exercises && <StrengthList plan={plan} />}
        {plan.notes && <p className="note">{plan.notes}</p>}
        <NutritionPanel plan={plan} embedded />
      </div>

      <div className="panel training-status-panel">
        <div className="section-head">
          <h3>训练状态</h3>
          <Button
            size="small"
            shape="round"
            variant="outline"
            loading={fatigueLoading}
            onClick={handleFatigueAnalysis}
          >
            AI分析
          </Button>
        </div>
        {autoSyncVisible && (
          <p
            className={`muted-note auto-sync-note auto-sync-${settings.lastAutoDailySyncStatus ?? "success"}`}
          >
            今日自动同步：{labelAutoSyncStatus(settings.lastAutoDailySyncStatus)}
            {settings.lastAutoDailySyncAt
              ? ` · ${formatReportTime(settings.lastAutoDailySyncAt)}`
              : ""}
            <br />
            {settings.lastAutoDailySyncMessage}
          </p>
        )}
        <ReadinessPanel insight={readiness} embedded />

        <div className="status-ai-section fatigue-panel">
          <div className="section-head">
            <h3>疲劳分析</h3>
          </div>
          <p className="muted">
            汇总最近 42 天的实际完成、RPE、体感、Intervals.icu
            摘要和身体趋势，再交给你配置的 AI 分析疲劳和恢复建议。
          </p>
          {fatigueError && <p className="sync-error">{fatigueError}</p>}
          {lastFatigueReport && (
            <>
              <p className="muted-note">
                最近分析：{formatReportTime(lastFatigueReport.generatedAt)}
                <br></br>数据范围：{lastFatigueReport.rangeStart} 至{" "}
                {lastFatigueReport.rangeEnd}
              </p>
              {lastFatigueReport.metrics && (
                <FatigueMetricsGrid metrics={lastFatigueReport.metrics} />
              )}
              {lastFatigueReport.content && (
                <pre>{lastFatigueReport.content}</pre>
              )}
            </>
          )}
        </div>

        <WeeklyReview
          plans={plans}
          bodyEntries={bodyEntries}
          checkins={allCheckins}
          trainingLogs={trainingLogs}
          activityAnalyses={activityAnalyses}
          settings={settings}
          templates={templates}
          embedded
        />
      </div>

      <MonthlyReport
        plans={plans}
        bodyEntries={bodyEntries}
        checkins={allCheckins}
        trainingLogs={trainingLogs}
        activityAnalyses={activityAnalyses}
        settings={settings}
        templates={templates}
      />

      {false && memo?.text.trim() && (
        <div className="panel memo-panel">
          <h3>今日备忘</h3>
          <p>{memo?.text}</p>
        </div>
      )}

      <div className="floating-checkin" aria-label="今日执行">
        <CheckGrid checkins={checkins} onCheck={onCheck} compact />
      </div>
    </section>
  );
}

function labelAutoSyncStatus(status: SettingsState["lastAutoDailySyncStatus"]) {
  switch (status) {
    case "running":
      return "进行中";
    case "success":
      return "已完成";
    case "partial":
      return "部分完成";
    case "failed":
      return "失败";
    default:
      return "已记录";
  }
}
