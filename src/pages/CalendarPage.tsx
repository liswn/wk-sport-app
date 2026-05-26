import { useState } from "react";
import { Button, Textarea } from "tdesign-mobile-react";
import { KindTag } from "../components/TrainingBits";
import { addMonths, getCalendarDays } from "../calendarUtils";
import {
  ActivityAnalysis,
  Checkins,
  DayMemo,
  IgpsportSyncRecord,
  PlanDay,
  SettingsState,
  TrainingTemplate,
  defaultPlanForDate,
} from "../model";
import {
  syncIgpsportDateToIntervals,
  syncIntervalsAnalysis,
  syncIntervalsRangeAnalysis,
} from "../integrations";
import {
  dateKey,
  formatChineseDate,
  todayKey,
} from "../time";
import { withCurrentPower } from "../trainingUtils";
import { labelPlan } from "../features/training";

export function CalendarPage({
  settings,
  plans,
  checkins,
  dayMemos,
  activityAnalyses,
  igpsportSyncRecords,
  templates,
  onSettings,
  onIgpsportSyncRecordsChange,
  onAnalysisSave,
  onMemoChange,
}: {
  settings: SettingsState;
  plans: Record<string, PlanDay>;
  checkins: Record<string, Checkins>;
  dayMemos: Record<string, DayMemo>;
  activityAnalyses: Record<string, ActivityAnalysis>;
  igpsportSyncRecords: Record<string, IgpsportSyncRecord>;
  templates: TrainingTemplate[];
  onSettings: (settings: SettingsState) => void;
  onIgpsportSyncRecordsChange: (
    records: Record<string, IgpsportSyncRecord>,
  ) => void;
  onAnalysisSave: (date: string, analysis: ActivityAnalysis) => void;
  onMemoChange: (date: string, text: string) => void;
}) {
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [syncing, setSyncing] = useState(false);
  const [monthSyncing, setMonthSyncing] = useState(false);
  const [igpsportSyncing, setIgpsportSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
  const [monthSyncStatus, setMonthSyncStatus] = useState("");
  const days = getCalendarDays(monthAnchor);
  const monthLabel = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  }).format(monthAnchor);
  const monthKey = `${monthAnchor.getFullYear()}-${String(monthAnchor.getMonth() + 1).padStart(2, "0")}`;
  const monthDays = days.filter((day) => dateKey(day).startsWith(monthKey));
  const completed = monthDays.filter(
    (day) => checkins[dateKey(day)]?.trainingDone,
  ).length;
  const completionRate = monthDays.length
    ? Math.round((completed / monthDays.length) * 100)
    : 0;
  const selectedPlan = withCurrentPower(
    plans[selectedDate] ??
      defaultPlanForDate(selectedDate, settings.ftp, templates),
    settings.ftp,
    templates,
  );
  const selectedAnalysis = activityAnalyses[selectedDate];

  const handleSync = async () => {
    setSyncError("");
    setSyncStatus("");
    setMonthSyncStatus("");
    setSyncing(true);
    try {
      const analysis = await syncIntervalsAnalysis({
        settings,
        date: selectedDate,
        plan: selectedPlan,
      });
      onAnalysisSave(selectedDate, analysis);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncing(false);
    }
  };

  const handleIgpsportSync = async () => {
    setSyncError("");
    setSyncStatus("");
    setMonthSyncStatus("");
    setIgpsportSyncing(true);
    try {
      const result = await syncIgpsportDateToIntervals({
        settings,
        date: selectedDate,
        plan: selectedPlan,
        syncRecords: igpsportSyncRecords,
      });
      onSettings(result.settings);
      onIgpsportSyncRecordsChange(result.syncRecords);
      onAnalysisSave(selectedDate, result.analysis);
      setSyncStatus(result.message);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : String(error));
    } finally {
      setIgpsportSyncing(false);
    }
  };

  const handleMonthSync = async () => {
    setSyncError("");
    setMonthSyncStatus("");
    setMonthSyncing(true);
    try {
      const today = todayKey();
      const targets = monthDays
        .map((day) => dateKey(day))
        .filter((key) => key <= today)
        .map((key) => ({
          date: key,
          plan: withCurrentPower(
            plans[key] ?? defaultPlanForDate(key, settings.ftp, templates),
            settings.ftp,
            templates,
          ),
        }));

      if (!targets.length) {
        setMonthSyncStatus("这个月份还没有可同步的日期。");
        return;
      }

      const analyses = await syncIntervalsRangeAnalysis({ settings, targets });
      for (const analysis of analyses) {
        onAnalysisSave(analysis.date, analysis);
      }
      const activityDays = analyses.filter(
        (analysis) => analysis.activityCount > 0,
      ).length;
      setMonthSyncStatus(
        `已同步 ${targets[0].date} 至 ${targets[targets.length - 1].date}，更新 ${analyses.length} 天，其中 ${activityDays} 天有训练活动。`,
      );
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : String(error));
    } finally {
      setMonthSyncing(false);
    }
  };

  return (
    <section className="stack">
      <div className="week-switch">
        <button
          type="button"
          onClick={() => setMonthAnchor(addMonths(monthAnchor, -1))}
        >
          上个月
        </button>
        <strong>{monthLabel}</strong>
        <button
          type="button"
          onClick={() => setMonthAnchor(addMonths(monthAnchor, 1))}
        >
          下个月
        </button>
      </div>
      <div className="completion-strip">
        <span>本月训练完成</span>
        <strong>
          {completed}/{monthDays.length}
        </strong>
        <div
          className="month-progress"
          aria-label={`本月完成率 ${completionRate}%`}
        >
          <span style={{ width: `${completionRate}%` }} />
        </div>
        <em>{completionRate}%</em>
      </div>
      <div className="panel month-sync-panel">
        <div className="section-head">
          <h3>Intervals.icu 批量同步</h3>
          <Button
            size="small"
            shape="round"
            variant="outline"
            loading={monthSyncing}
            disabled={syncing}
            onClick={handleMonthSync}
          >
            同步本月
          </Button>
        </div>
        {monthSyncStatus && <p className="sync-success">{monthSyncStatus}</p>}
      </div>
      <div className="panel calendar-panel">
        <div className="calendar-weekdays">
          {["一", "二", "三", "四", "五", "六", "日"].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {days.map((day) => {
            const key = dateKey(day);
            const inMonth = key.startsWith(monthKey);
            const plan = withCurrentPower(
              plans[key] ?? defaultPlanForDate(key, settings.ftp, templates),
              settings.ftp,
              templates,
            );
            const dayCheckins = checkins[key] ?? {};
            const score = [
              dayCheckins.trainingDone,
              dayCheckins.proteinDone,
              dayCheckins.dinnerControlled,
              dayCheckins.earlySleep,
            ].filter(Boolean).length;

            return (
              <button
                type="button"
                key={key}
                className={[
                  "calendar-day",
                  inMonth ? "" : "muted-day",
                  key === todayKey() ? "today" : "",
                  key === selectedDate ? "selected" : "",
                  dayCheckins.trainingDone ? "done" : "",
                ].join(" ")}
                onClick={() => {
                  setSelectedDate(key);
                  if (!inMonth) setMonthAnchor(day);
                }}
              >
                <div className="calendar-day-head">
                  <strong>{day.getDate()}</strong>
                </div>
                <span className={`calendar-kind kind-${plan.kind}`}>
                  {labelPlan(plan)}
                </span>
                <div className="calendar-dots" aria-label={`完成 ${score}/4`}>
                  {[0, 1, 2, 3].map((item) => (
                    <i key={item} className={item < score ? "on" : ""} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="panel memo-editor">
        <div className="plan-head">
          <div>
            <p className="plan-date">{formatChineseDate(selectedDate)}</p>
            <h3>{selectedPlan.title}</h3>
          </div>
          <div className="tag-row">
            <KindTag kind={selectedPlan.kind} />
            {selectedPlan.exercises?.length ? (
              <span className="mini-strength">力量</span>
            ) : null}
          </div>
        </div>
        <div className="sync-panel">
          <Button
            block
            variant="outline"
            loading={igpsportSyncing}
            disabled={syncing || monthSyncing}
            onClick={handleIgpsportSync}
          >
            从 iGPSPORT 同步到 Intervals.icu
          </Button>
          <Button
            block
            variant="outline"
            loading={syncing}
            disabled={monthSyncing || igpsportSyncing}
            onClick={handleSync}
          >
            拉取Intervals.icu数据并分析差异
          </Button>
          {syncError && <p className="sync-error">{syncError}</p>}
          {syncStatus && <p className="sync-success">{syncStatus}</p>}
          {selectedAnalysis && (
            <div className="analysis-card">
              <div>
                <span>差异度</span>
                <strong>{selectedAnalysis.differencePercent}%</strong>
              </div>
              <p>{selectedAnalysis.summary}</p>
              <p>{selectedAnalysis.suggestion}</p>
              <small>仅保存摘要分析，不保存 Intervals.icu 原始活动数据。</small>
            </div>
          )}
        </div>
        <label>
          当天备忘
          <Textarea
            value={dayMemos[selectedDate]?.text ?? ""}
            placeholder="例如：今天状态、临时调整、饮食备注..."
            autosize={{ minRows: 3, maxRows: 6 }}
            onChange={(value) => onMemoChange(selectedDate, String(value))}
          />
        </label>
      </div>
    </section>
  );
}
