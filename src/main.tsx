import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  Input,
  Switch,
  TabBar,
  TabBarItem,
  Textarea,
} from "tdesign-mobile-react";
import "tdesign-mobile-react/es/style/index.css";
import {
  CalendarCheck,
  CalendarDays,
  Check,
  Download,
  Home,
  Plus,
  RotateCcw,
  Settings,
  Trash2,
  Upload,
  Weight,
} from "lucide-react";
import "./styles.css";
import {
  CheckGrid,
  KindTag,
  Metric,
  StrengthList,
} from "./components/TrainingBits";
import { TrendChart } from "./components/TrendChart";
import { addMonths, getCalendarDays } from "./calendarUtils";
import { registerSW } from "virtual:pwa-register";
import {
  BodyEntry,
  ActivityAnalysis,
  Checkins,
  DEFAULT_SETTINGS,
  DayMemo,
  PlanDay,
  SettingsState,
  TrainingLog,
  TrainingKind,
  TrainingTemplate,
  createBlankTemplate,
  defaultPlanForDate,
  defaultTrainingTemplates,
  getTemplate,
} from "./model";
import {
  requestAiTrainingRecommendation,
  syncIntervalsAnalysis,
} from "./integrations";
import {
  clearAllData,
  exportData,
  importData,
  loadAppData,
  saveAppData,
} from "./storage";
import {
  addDays,
  dateKey,
  formatChineseDate,
  formatMonthDay,
  getWeekDays,
  todayKey,
} from "./time";
import {
  buildNutritionTips,
  formatExercises,
  formatRangePercent,
  labelKind,
  parseExercises,
  parseRangePercent,
  withCurrentPower,
} from "./trainingUtils";

registerSW({ immediate: true });

type Tab = "today" | "plan" | "calendar" | "body" | "settings";

function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [plans, setPlans] = useState<Record<string, PlanDay>>({});
  const [bodyEntries, setBodyEntries] = useState<Record<string, BodyEntry>>({});
  const [checkins, setCheckins] = useState<Record<string, Checkins>>({});
  const [trainingLogs, setTrainingLogs] = useState<Record<string, TrainingLog>>({});
  const [activityAnalyses, setActivityAnalyses] = useState<Record<string, ActivityAnalysis>>({});
  const [dayMemos, setDayMemos] = useState<Record<string, DayMemo>>({});
  const [trainingTemplates, setTrainingTemplates] = useState<
    TrainingTemplate[]
  >(defaultTrainingTemplates);
  const [weekStart, setWeekStart] = useState(() => getWeekDays(new Date())[0]);

  useEffect(() => {
    loadAppData().then((data) => {
      setSettings(data.settings);
      setPlans(data.plans);
      setBodyEntries(data.bodyEntries);
      setCheckins(data.checkins);
      setTrainingLogs(data.trainingLogs);
      setActivityAnalyses(data.activityAnalyses);
      setDayMemos(data.dayMemos);
      setTrainingTemplates(data.trainingTemplates);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveAppData({
      settings,
      plans,
      bodyEntries,
      checkins,
      trainingLogs,
      activityAnalyses,
      dayMemos,
      trainingTemplates,
    });
  }, [
    ready,
    settings,
    plans,
    bodyEntries,
    checkins,
    trainingLogs,
    activityAnalyses,
    dayMemos,
    trainingTemplates,
  ]);

  const today = todayKey();
  const todayPlan = withCurrentPower(
    plans[today] ?? defaultPlanForDate(today, settings.ftp, trainingTemplates),
    settings.ftp,
    trainingTemplates,
  );
  const todayCheckins = checkins[today] ?? {};

  const updatePlan = (date: string, patch: Partial<PlanDay>) => {
    setPlans((current) => {
      const base =
        current[date] ??
        defaultPlanForDate(date, settings.ftp, trainingTemplates);
      return {
        ...current,
        [date]: withCurrentPower(
          { ...base, ...patch },
          settings.ftp,
          trainingTemplates,
        ),
      };
    });
  };

  const applyTemplate = (date: string, id: string) => {
    const template = getTemplate(id, settings.ftp, trainingTemplates);
    setPlans((current) => ({ ...current, [date]: { ...template, date } }));
  };

  const updateCheckin = (date: string, key: keyof Checkins, value: boolean) => {
    setCheckins((current) => ({
      ...current,
      [date]: { ...current[date], [key]: value },
    }));
  };

  const updateTrainingLog = (date: string, patch: Partial<TrainingLog>) => {
    setTrainingLogs((current) => ({
      ...current,
      [date]: { ...current[date], ...patch, date },
    }));
  };

  const handleExport = async (label?: string) => {
    const exportedAt = new Date().toISOString();
    downloadJson(await exportData(), label);
    setSettings((current) => ({ ...current, lastBackupAt: exportedAt }));
  };

  const nav = [
    ["today", Home, "今日"],
    ["plan", CalendarDays, "计划"],
    ["calendar", CalendarCheck, "日历"],
    ["body", Weight, "身体"],
    ["settings", Settings, "设置"],
  ] as const;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>骑行训练</h1>
        </div>
        <div className="ftp-pill">FTP {settings.ftp}W</div>
      </header>

      {!ready ? (
        <section className="panel">正在加载本地数据...</section>
      ) : (
        <>
          {tab === "today" && (
            <TodayPage
              plan={todayPlan}
              memo={dayMemos[today]}
              checkins={todayCheckins}
              plans={plans}
              bodyEntries={bodyEntries}
              allCheckins={checkins}
              trainingLogs={trainingLogs}
              settings={settings}
              templates={trainingTemplates}
              onCheck={(key, value) => updateCheckin(today, key, value)}
            />
          )}
          {tab === "plan" && (
            <PlanPage
              settings={settings}
              plans={plans}
              checkins={checkins}
              templates={trainingTemplates}
              weekStart={weekStart}
              activityAnalyses={activityAnalyses}
              onWeekChange={setWeekStart}
              onPlanChange={updatePlan}
              onTemplate={applyTemplate}
              onTrainingDone={(date, value) =>
                updateCheckin(date, "trainingDone", value)
              }
              trainingLogs={trainingLogs}
              onTrainingLogChange={updateTrainingLog}
            />
          )}
          {tab === "calendar" && (
            <CalendarPage
              settings={settings}
              plans={plans}
              checkins={checkins}
              dayMemos={dayMemos}
              activityAnalyses={activityAnalyses}
              templates={trainingTemplates}
              onAnalysisSave={(date, analysis) =>
                setActivityAnalyses((current) => ({
                  ...current,
                  [date]: analysis,
                }))
              }
              onMemoChange={(date, text) =>
                setDayMemos((current) => ({
                  ...current,
                  [date]: { date, text },
                }))
              }
            />
          )}
          {tab === "body" && (
            <BodyPage
              settings={settings}
              entries={bodyEntries}
              onSave={(entry) =>
                setBodyEntries((current) => ({
                  ...current,
                  [entry.date]: entry,
                }))
              }
            />
          )}
          {tab === "settings" && (
            <SettingsPage
              settings={settings}
              templates={trainingTemplates}
              onSettings={setSettings}
              onTemplates={setTrainingTemplates}
              onExport={() => handleExport()}
              onImport={async (file) => {
                await handleExport("before-import");
                return importJson(file).then((payload) => {
                  const data = payload.data ?? payload;
                  setSettings(data.settings ?? DEFAULT_SETTINGS);
                  setPlans(data.plans ?? {});
                  setBodyEntries(data.bodyEntries ?? {});
                  setCheckins(data.checkins ?? {});
                  setTrainingLogs(data.trainingLogs ?? {});
                  setActivityAnalyses(data.activityAnalyses ?? {});
                  setDayMemos(data.dayMemos ?? {});
                  setTrainingTemplates(
                    data.trainingTemplates ?? defaultTrainingTemplates,
                  );
                  return importData(payload);
                });
              }}
              onClear={async () => {
                if (
                  !window.confirm(
                    "确定清空所有本地训练、身体和设置数据？此操作不能撤销。",
                  )
                )
                  return;
                if (
                  !window.confirm(
                    "再次确认：清空后只能通过之前导出的 JSON 恢复。",
                  )
                )
                  return;
                await clearAllData();
                setSettings(DEFAULT_SETTINGS);
                setPlans({});
                setBodyEntries({});
                setCheckins({});
                setTrainingLogs({});
                setActivityAnalyses({});
                setDayMemos({});
                setTrainingTemplates(defaultTrainingTemplates);
              }}
            />
          )}
        </>
      )}

      <TabBar
        className="bottom-nav"
        value={tab}
        fixed
        safeAreaInsetBottom
        onChange={(value) => setTab(value as Tab)}
      >
        {nav.map(([id, Icon, label]) => (
          <TabBarItem key={id} value={id} icon={<Icon size={20} />}>
            {label}
          </TabBarItem>
        ))}
      </TabBar>
    </main>
  );
}

function TodayPage({
  plan,
  memo,
  checkins,
  plans,
  bodyEntries,
  allCheckins,
  trainingLogs,
  settings,
  templates,
  onCheck,
}: {
  plan: PlanDay;
  memo?: DayMemo;
  checkins: Checkins;
  plans: Record<string, PlanDay>;
  bodyEntries: Record<string, BodyEntry>;
  allCheckins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  settings: SettingsState;
  templates: TrainingTemplate[];
  onCheck: (key: keyof Checkins, value: boolean) => void;
}) {
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
        {plan.rideDetails && <p className="note">{plan.rideDetails}</p>}
        {plan.exercises && <StrengthList plan={plan} />}
        {plan.notes && <p className="note">{plan.notes}</p>}
      </div>

      <NutritionPanel plan={plan} />

      <WeeklyReview
        plans={plans}
        bodyEntries={bodyEntries}
        checkins={allCheckins}
        trainingLogs={trainingLogs}
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

function WeeklyReview({
  plans,
  bodyEntries,
  checkins,
  trainingLogs,
  settings,
  templates,
}: {
  plans: Record<string, PlanDay>;
  bodyEntries: Record<string, BodyEntry>;
  checkins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  settings: SettingsState;
  templates: TrainingTemplate[];
}) {
  const week = getWeekDays(new Date());
  const weekKeys = week.map(dateKey);
  const planned = weekKeys.map((key) =>
    withCurrentPower(
      plans[key] ?? defaultPlanForDate(key, settings.ftp, templates),
      settings.ftp,
      templates,
    ),
  );
  const trainingDays = planned.filter((plan) => plan.kind !== "rest").length;
  const done = weekKeys.filter((key) => checkins[key]?.trainingDone).length;
  const strength = planned.filter((plan, index) => {
    const key = weekKeys[index];
    return Boolean(plan.exercises?.length) && checkins[key]?.trainingDone;
  }).length;
  const actualMinutes = weekKeys.reduce(
    (sum, key) => sum + numeric(trainingLogs[key]?.actualMinutes),
    0,
  );
  const rpeValues = weekKeys
    .map((key) => numeric(trainingLogs[key]?.rpe))
    .filter((value) => value > 0);
  const averageRpe = rpeValues.length
    ? (rpeValues.reduce((sum, value) => sum + value, 0) / rpeValues.length).toFixed(1)
    : "-";
  const habits = weekKeys.flatMap((key) => {
    const item = checkins[key] ?? {};
    return [item.proteinDone, item.dinnerControlled, item.earlySleep];
  });
  const habitRate = habits.length
    ? Math.round((habits.filter(Boolean).length / habits.length) * 100)
    : 0;
  const weightTrend = buildWeightTrendText(bodyEntries);

  return (
    <div className="panel weekly-review">
      <div className="section-head">
        <h3>本周回顾</h3>
        <span>{formatMonthDay(week[0])} - {formatMonthDay(week[6])}</span>
      </div>
      <div className="review-grid">
        <Metric label="训练完成" value={`${done}/${trainingDays}`} />
        <Metric label="实际时长" value={actualMinutes ? `${actualMinutes} 分钟` : "-"} />
        <Metric label="力量次数" value={`${strength} 次`} />
        <Metric label="平均 RPE" value={averageRpe} />
      </div>
      <div className="review-line">
        <span>体重 7 日均值</span>
        <strong>{weightTrend}</strong>
      </div>
      <div className="review-line">
        <span>蛋白 / 晚餐 / 早睡</span>
        <strong>{habitRate}%</strong>
      </div>
    </div>
  );
}

function NutritionPanel({ plan }: { plan: PlanDay }) {
  const tips = buildNutritionTips(plan);

  return (
    <div className="panel nutrition-panel">
      <h3>今日推荐饮食</h3>
      <div className="nutrition-list">
        {tips.map((tip) => (
          <div key={tip.label}>
            <span>{tip.label}</span>
            <strong>{tip.value}</strong>
          </div>
        ))}
      </div>
      <p className="nutrition-note">
        减脂期不要把训练日前后的碳水砍太狠；晚餐尽量简单，30分钟内完成。
      </p>
    </div>
  );
}

function CalendarPage({
  settings,
  plans,
  checkins,
  dayMemos,
  activityAnalyses,
  templates,
  onAnalysisSave,
  onMemoChange,
}: {
  settings: SettingsState;
  plans: Record<string, PlanDay>;
  checkins: Record<string, Checkins>;
  dayMemos: Record<string, DayMemo>;
  activityAnalyses: Record<string, ActivityAnalysis>;
  templates: TrainingTemplate[];
  onAnalysisSave: (date: string, analysis: ActivityAnalysis) => void;
  onMemoChange: (date: string, text: string) => void;
}) {
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
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
        <div className="month-progress" aria-label={`本月完成率 ${completionRate}%`}>
          <span style={{ width: `${completionRate}%` }} />
        </div>
        <em>{completionRate}%</em>
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
            {selectedPlan.exercises?.length ? <span className="mini-strength">力量</span> : null}
          </div>
        </div>
        <div className="sync-panel">
          <Button
            block
            variant="outline"
            loading={syncing}
            onClick={handleSync}
          >
            同步 Intervals.icu 并分析差异
          </Button>
          {syncError && <p className="sync-error">{syncError}</p>}
          {selectedAnalysis && (
            <div className="analysis-card">
              <div>
                <span>差异度</span>
                <strong>{selectedAnalysis.differencePercent}%</strong>
              </div>
              <p>{selectedAnalysis.summary}</p>
              <p>{selectedAnalysis.suggestion}</p>
              <small>
                仅保存摘要分析，不保存 Intervals.icu 原始活动数据。
              </small>
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

function PlanPage({
  settings,
  plans,
  checkins,
  trainingLogs,
  templates,
  weekStart,
  activityAnalyses,
  onWeekChange,
  onPlanChange,
  onTemplate,
  onTrainingDone,
  onTrainingLogChange,
}: {
  settings: SettingsState;
  plans: Record<string, PlanDay>;
  checkins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  templates: TrainingTemplate[];
  weekStart: Date;
  activityAnalyses: Record<string, ActivityAnalysis>;
  onWeekChange: (date: Date) => void;
  onPlanChange: (date: string, patch: Partial<PlanDay>) => void;
  onTemplate: (date: string, id: string) => void;
  onTrainingDone: (date: string, value: boolean) => void;
  onTrainingLogChange: (date: string, patch: Partial<TrainingLog>) => void;
}) {
  const week = getWeekDays(weekStart);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiRecommendation, setAiRecommendation] = useState("");
  const completedCount = week.filter(
    (day) => checkins[dateKey(day)]?.trainingDone,
  ).length;
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const didAutoScroll = useRef(false);

  useEffect(() => {
    if (didAutoScroll.current) return;
    const today = todayKey();
    const target = cardRefs.current[today];
    if (!target) return;
    didAutoScroll.current = true;
    window.setTimeout(
      () => target.scrollIntoView({ block: "start", behavior: "smooth" }),
      80,
    );
  }, [weekStart]);

  const scrollToDate = (date: string) => {
    cardRefs.current[date]?.scrollIntoView({
      block: "start",
      behavior: "smooth",
    });
  };

  const weekPlans = week.map((day) => {
    const key = dateKey(day);
    return withCurrentPower(
      plans[key] ?? defaultPlanForDate(key, settings.ftp, templates),
      settings.ftp,
      templates,
    );
  });

  const handleAiRecommend = async () => {
    setAiError("");
    setAiLoading(true);
    try {
      const recentKeys = Array.from({ length: 28 }, (_, index) =>
        dateKey(addDays(new Date(), -index)),
      );
      const recommendation = await requestAiTrainingRecommendation({
        settings,
        weekPlans,
        analyses: recentKeys
          .map((key) => activityAnalyses[key])
          .filter(Boolean),
        logs: recentKeys.map((key) => trainingLogs[key]).filter(Boolean),
      });
      setAiRecommendation(recommendation);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <section className="stack">
      <div className="week-switch">
        <button
          type="button"
          onClick={() => onWeekChange(addDays(weekStart, -7))}
        >
          上一周
        </button>
        <strong>
          {formatMonthDay(week[0])} - {formatMonthDay(week[6])}
        </strong>
        <button
          type="button"
          onClick={() => onWeekChange(addDays(weekStart, 7))}
        >
          下一周
        </button>
      </div>
      <div
        className="completion-strip sticky-progress"
        aria-label="本周训练完成情况"
      >
        <span>本周完成</span>
        <strong>{completedCount}/7</strong>
        <div>
          {week.map((day) => {
            const key = dateKey(day);
            return (
              <button
                type="button"
                key={key}
                className={checkins[key]?.trainingDone ? "done" : ""}
                title={formatChineseDate(key)}
                onClick={() => scrollToDate(key)}
              />
            );
          })}
        </div>
      </div>

      <div className="panel ai-plan-panel">
        <div className="section-head">
          <h3>AI 训练建议</h3>
          <Button
            size="small"
            shape="round"
            variant="outline"
            loading={aiLoading}
            onClick={handleAiRecommend}
          >
            生成推荐
          </Button>
        </div>
        <p className="muted">
          使用最近 28 天的训练摘要分析和手动完成记录，请求你在设置里配置的 AI 接口生成训练与饮食建议。
        </p>
        {aiError && <p className="sync-error">{aiError}</p>}
        {aiRecommendation && <pre>{aiRecommendation}</pre>}
      </div>

      {week.map((day) => {
        const key = dateKey(day);
        const plan = withCurrentPower(
          plans[key] ?? defaultPlanForDate(key, settings.ftp, templates),
          settings.ftp,
          templates,
        );
        const log = trainingLogs[key] ?? { date: key };
        return (
          <article
            className="panel plan-editor"
            key={key}
            ref={(element) => {
              cardRefs.current[key] = element;
            }}
          >
            <div className="plan-head">
              <div>
                <p className="plan-date">{formatChineseDate(key)}</p>
                <h3 className="plan-title">{plan.title}</h3>
              </div>
              <div className="plan-status">
                <KindTag kind={plan.kind} />
                <Button
                  size="small"
                  shape="round"
                  theme={checkins[key]?.trainingDone ? "primary" : "default"}
                  variant={checkins[key]?.trainingDone ? "base" : "outline"}
                  className={checkins[key]?.trainingDone ? "done" : ""}
                  onClick={() =>
                    onTrainingDone(key, !checkins[key]?.trainingDone)
                  }
                  aria-pressed={Boolean(checkins[key]?.trainingDone)}
                  icon={<Check size={16} />}
                >
                  {checkins[key]?.trainingDone ? "已完成" : "未完成"}
                </Button>
              </div>
            </div>
            <div className="toggle-row">
              <div>
                <strong>力量训练</strong>
                <span>打开后可和恢复、Z2、甜区等类型组合</span>
              </div>
              <Switch
                size="small"
                value={Boolean(plan.exercises?.length)}
                onChange={(value) =>
                  onPlanChange(key, {
                    exercises: Boolean(value)
                      ? plan.exercises?.length
                        ? plan.exercises
                        : defaultStrengthExercises()
                      : undefined,
                    strengthDurationLabel: Boolean(value) ? "20-25分钟" : "",
                  })
                }
              />
            </div>
            <label>
              模板
              <select
                value={plan.templateId ?? ""}
                onChange={(event) => onTemplate(key, event.target.value)}
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              标题
              <Input
                value={plan.title}
                clearable
                onChange={(value) =>
                  onPlanChange(key, { title: String(value) })
                }
              />
            </label>
            {plan.kind !== "rest" && (
              <label>
                时长（分钟）
                <Input
                  type="number"
                  value={plan.durationMinutes ?? ""}
                  onChange={(value) =>
                    onPlanChange(key, { durationMinutes: Number(value) })
                  }
                />
              </label>
            )}
            {plan.kind !== "rest" && plan.powerRange && (
              <div className="inline-summary">
                当前 FTP 下目标功率：{plan.powerRange[0]}-{plan.powerRange[1]}W
              </div>
            )}
            {plan.rideDetails && (
              <div className="inline-summary">{plan.rideDetails}</div>
            )}
            {plan.exercises && <StrengthList plan={plan} />}
            <label>
              备注
              <Textarea
                value={plan.notes ?? ""}
                autosize={{ minRows: 2, maxRows: 5 }}
                onChange={(value) =>
                  onPlanChange(key, { notes: String(value) })
                }
              />
            </label>
            {plan.nutrition && (
              <p className="nutrition-note">{plan.nutrition}</p>
            )}
            <TrainingLogEditor
              log={log}
              onChange={(patch) => onTrainingLogChange(key, patch)}
            />
          </article>
        );
      })}
    </section>
  );
}

function TrainingLogEditor({
  log,
  onChange,
}: {
  log: TrainingLog;
  onChange: (patch: Partial<TrainingLog>) => void;
}) {
  return (
    <div className="actual-log">
      <h4>实际完成记录</h4>
      <div className="form-grid">
        <label>
          实际时长
          <Input
            type="number"
            value={log.actualMinutes ?? ""}
            placeholder="分钟"
            onChange={(value) => onChange({ actualMinutes: String(value) })}
          />
        </label>
        <label>
          平均功率
          <Input
            type="number"
            value={log.averagePower ?? ""}
            placeholder="W，可选"
            onChange={(value) => onChange({ averagePower: String(value) })}
          />
        </label>
        <label>
          RPE
          <select
            value={log.rpe ?? ""}
            onChange={(event) => onChange({ rpe: event.target.value })}
          >
            <option value="">未记录</option>
            {Array.from({ length: 10 }, (_, index) => String(index + 1)).map(
              (value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          体感
          <select
            value={log.feeling ?? ""}
            onChange={(event) =>
              onChange({
                feeling: (event.target.value || undefined) as TrainingLog["feeling"],
              })
            }
          >
            <option value="">未记录</option>
            <option value="easy">轻松</option>
            <option value="normal">正常</option>
            <option value="tired">累</option>
            <option value="very-tired">很累</option>
          </select>
        </label>
      </div>
      <label>
        训练备注
        <Textarea
          value={log.notes ?? ""}
          placeholder="比如：腿有点沉、功率稳定、需要调低明天强度..."
          autosize={{ minRows: 2, maxRows: 4 }}
          onChange={(value) => onChange({ notes: String(value) })}
        />
      </label>
    </div>
  );
}

function BodyPage({
  settings,
  entries,
  onSave,
}: {
  settings: SettingsState;
  entries: Record<string, BodyEntry>;
  onSave: (entry: BodyEntry) => void;
}) {
  const [date, setDate] = useState(todayKey());
  const entry = entries[date] ?? {
    date,
    weightKg: "",
    bodyFat: "",
    waistCm: "",
    chestCm: "",
    notes: "",
  };

  const update = (patch: Partial<BodyEntry>) =>
    onSave({ ...entry, ...patch, date });

  return (
    <section className="stack">
      <div className="panel">
        <h2>身体记录</h2>
        <WeekDatePicker
          selectedDate={date}
          entries={entries}
          onSelect={setDate}
        />
        <div className="form-grid">
          <label>
            体重 kg
            <Input
              type="number"
              value={entry.weightKg}
              clearable
              onChange={(value) => update({ weightKg: String(value) })}
            />
          </label>
          <label>
            体脂 %
            <Input
              type="number"
              value={entry.bodyFat ?? ""}
              clearable
              onChange={(value) => update({ bodyFat: String(value) })}
            />
          </label>
          <label>
            腰围 cm
            <Input
              type="number"
              value={entry.waistCm ?? ""}
              clearable
              onChange={(value) => update({ waistCm: String(value) })}
            />
          </label>
          <label>
            胸围 cm
            <Input
              type="number"
              value={entry.chestCm ?? ""}
              clearable
              onChange={(value) => update({ chestCm: String(value) })}
            />
          </label>
        </div>
        <BmiPanel weightKg={entry.weightKg} heightCm={settings.heightCm} />
        <label>
          备注
          <Textarea
            value={entry.notes ?? ""}
            autosize={{ minRows: 2, maxRows: 5 }}
            onChange={(value) => update({ notes: String(value) })}
          />
        </label>
      </div>
      <BodyStats entries={entries} />
    </section>
  );
}

function BodyStats({ entries }: { entries: Record<string, BodyEntry> }) {
  const points = useMemo(
    () =>
      Object.values(entries)
        .filter(
          (entry) => Number(entry.weightKg) > 0 || Number(entry.waistCm) > 0,
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    [entries],
  );

  return (
    <>
      <div className="panel">
        <h2>体重趋势</h2>
        <TrendChart entries={points} field="weightKg" average />
      </div>
      <div className="panel">
        <h2>腰围趋势</h2>
        <TrendChart entries={points} field="waistCm" />
      </div>
    </>
  );
}

function WeekDatePicker({
  selectedDate,
  entries,
  onSelect,
}: {
  selectedDate: string;
  entries: Record<string, BodyEntry>;
  onSelect: (date: string) => void;
}) {
  const selected = new Date(`${selectedDate}T00:00:00`);
  const week = getWeekDays(selected);

  return (
    <div className="week-date-picker">
      <div className="week-switch compact">
        <button
          type="button"
          onClick={() => onSelect(dateKey(addDays(selected, -7)))}
        >
          上一周
        </button>
        <strong>
          {formatMonthDay(week[0])} - {formatMonthDay(week[6])}
        </strong>
        <button
          type="button"
          onClick={() => onSelect(dateKey(addDays(selected, 7)))}
        >
          下一周
        </button>
      </div>
      <div className="week-date-row">
        {week.map((day) => {
          const key = dateKey(day);
          const entry = entries[key];
          const hasBodyData = Boolean(
            entry &&
            (entry.weightKg || entry.waistCm || entry.bodyFat || entry.chestCm),
          );
          return (
            <button
              key={key}
              type="button"
              className={[
                key === selectedDate ? "active" : "",
                key === todayKey() ? "today" : "",
                hasBodyData ? "has-data" : "",
              ].join(" ")}
              onClick={() => onSelect(key)}
            >
              <span>
                {new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(
                  day,
                )}
              </span>
              <strong>{day.getDate()}</strong>
              <i />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SettingsPage({
  settings,
  templates,
  onSettings,
  onTemplates,
  onExport,
  onImport,
  onClear,
}: {
  settings: SettingsState;
  templates: TrainingTemplate[];
  onSettings: (settings: SettingsState) => void;
  onTemplates: (templates: TrainingTemplate[]) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onClear: () => void;
}) {
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");
  const selected =
    templates.find((template) => template.id === selectedId) ?? templates[0];

  useEffect(() => {
    if (!templates.some((template) => template.id === selectedId)) {
      setSelectedId(templates[0]?.id ?? "");
    }
  }, [selectedId, templates]);

  const updateTemplate = (patch: Partial<TrainingTemplate>) => {
    if (!selected) return;
    onTemplates(
      templates.map((template) =>
        template.id === selected.id
          ? { ...template, ...patch, templateId: template.id }
          : template,
      ),
    );
  };

  const addTemplate = () => {
    const next = createBlankTemplate();
    onTemplates([...templates, next]);
    setSelectedId(next.id);
  };

  const deleteTemplate = () => {
    if (!selected || templates.length <= 1) return;
    if (
      !window.confirm(
        `删除模板“${selected.name}”？已安排到日计划里的内容不会自动删除。`,
      )
    )
      return;
    const next = templates.filter((template) => template.id !== selected.id);
    onTemplates(next);
    setSelectedId(next[0]?.id ?? "");
  };

  const resetTemplates = () => {
    if (
      !window.confirm(
        "恢复默认模板？这会替换当前模板库，但不会删除已经编辑过的周计划。",
      )
    )
      return;
    onTemplates(defaultTrainingTemplates);
    setSelectedId(defaultTrainingTemplates[0].id);
  };

  const applyKindPreset = (kind: TrainingKind) => {
    if (!selected) return;
    const nextKind = kind === "strength" ? "recovery" : kind;
    updateTemplate({
      ...buildTemplatePreset(nextKind, Boolean(selected.exercises?.length)),
      kind: nextKind,
    });
  };

  const toggleStrength = (enabled: boolean) => {
    updateTemplate({
      title: enabled
        ? selected?.title.includes("力量")
          ? selected.title
          : `${selected?.title ?? "训练"} + 力量`
        : selected?.title.replace(/\s*\+\s*力量/g, "") ?? "",
      exercises: enabled ? selected?.exercises?.length ? selected.exercises : defaultStrengthExercises() : undefined,
      strengthDurationLabel: enabled ? selected?.strengthDurationLabel || "20-25分钟" : "",
    });
  };

  return (
    <section className="stack">
      <div className="panel">
        <h2>设置</h2>
        <div className="form-grid">
          <label>
            FTP（瓦）
            <Input
              type="number"
              value={settings.ftp}
              onChange={(value) =>
                onSettings({ ...settings, ftp: Number(value) })
              }
            />
          </label>
          <label>
            身高 cm
            <Input
              type="number"
              value={settings.heightCm ?? ""}
              placeholder="例如 175"
              onChange={(value) =>
                onSettings({ ...settings, heightCm: String(value) })
              }
            />
          </label>
        </div>
        <div className="zones">
          <PowerZone
            name="Z1恢复"
            range={[0, 96 / 175]}
            ftp={settings.ftp}
            prefix="<"
          />
          <PowerZone
            name="Z2耐力"
            range={[98 / 175, 131 / 175]}
            ftp={settings.ftp}
          />
          <PowerZone
            name="Z3节奏"
            range={[132 / 175, 157 / 175]}
            ftp={settings.ftp}
          />
          <PowerZone
            name="甜区"
            range={[154 / 175, 164 / 175]}
            ftp={settings.ftp}
          />
          <PowerZone
            name="阈值"
            range={[166 / 175, 184 / 175]}
            ftp={settings.ftp}
          />
        </div>
      </div>

      <div className="panel integration-panel">
        <h2>外部同步与 AI</h2>
        <p className="muted">
          这些配置只保存在本机浏览器。只有你点击同步或生成推荐时，才会请求对应服务。
        </p>
        <h3>Intervals.icu</h3>
        <div className="form-grid">
          <label>
            API 地址
            <Input
              value={settings.intervalsApiBase ?? ""}
              placeholder="https://intervals.icu/api/v1"
              onChange={(value) =>
                onSettings({ ...settings, intervalsApiBase: String(value) })
              }
            />
          </label>
          <label>
            Athlete ID
            <Input
              value={settings.intervalsAthleteId ?? ""}
              placeholder="例如 i12345"
              onChange={(value) =>
                onSettings({ ...settings, intervalsAthleteId: String(value) })
              }
            />
          </label>
        </div>
        <label>
          Intervals.icu API Key
          <Input
            type="password"
            value={settings.intervalsApiKey ?? ""}
            placeholder="仅保存在本地"
            onChange={(value) =>
              onSettings({ ...settings, intervalsApiKey: String(value) })
            }
          />
        </label>
        <h3>AI 供应商</h3>
        <label>
          请求地址（OpenAI 兼容）
          <Input
            value={settings.aiEndpoint ?? ""}
            placeholder="例如 https://api.openai.com/v1/chat/completions"
            onChange={(value) =>
              onSettings({ ...settings, aiEndpoint: String(value) })
            }
          />
        </label>
        <div className="form-grid">
          <label>
            模型
            <Input
              value={settings.aiModel ?? ""}
              placeholder="例如 gpt-4o-mini"
              onChange={(value) =>
                onSettings({ ...settings, aiModel: String(value) })
              }
            />
          </label>
          <label>
            API Key
            <Input
              type="password"
              value={settings.aiApiKey ?? ""}
              placeholder="仅保存在本地"
              onChange={(value) =>
                onSettings({ ...settings, aiApiKey: String(value) })
              }
            />
          </label>
        </div>
      </div>

      <div className="panel template-panel">
        <div className="section-head">
          <h2>训练模板</h2>
          <Button
            size="small"
            shape="round"
            theme="primary"
            variant="outline"
            icon={<Plus size={17} />}
            onClick={addTemplate}
          >
            新增
          </Button>
        </div>
        {selected && (
          <>
            <label>
              选择模板
              <select
                value={selected.id}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                模板名
                <Input
                  value={selected.name}
                  clearable
                  onChange={(value) => updateTemplate({ name: String(value) })}
                />
              </label>
              <label>
                类型
                <select
                  value={selected.kind === "strength" ? "recovery" : selected.kind}
                  onChange={(event) =>
                    applyKindPreset(event.target.value as TrainingKind)
                  }
                >
                  <option value="recovery">恢复</option>
                  <option value="z2">Z2</option>
                  <option value="aerobic">有氧</option>
                  <option value="sweetspot">甜区</option>
                  <option value="threshold">阈值</option>
                  <option value="rest">休息</option>
                </select>
              </label>
            </div>
            <div className="toggle-row">
              <div>
                <strong>力量训练</strong>
                <span>打开后可和恢复、Z2、甜区等类型组合</span>
              </div>
              <Switch
                size="small"
                value={Boolean(selected.exercises?.length)}
                onChange={(value) => toggleStrength(Boolean(value))}
              />
            </div>
            <label>
              计划标题
              <Input
                value={selected.title}
                clearable
                onChange={(value) => updateTemplate({ title: String(value) })}
              />
            </label>
            {selected.kind !== "rest" && (
              <div className="form-grid">
                <label>
                  时长（分钟）
                  <Input
                    type="number"
                    value={selected.durationMinutes ?? ""}
                    onChange={(value) =>
                      updateTemplate({ durationMinutes: Number(value) })
                    }
                  />
                </label>
                <label>
                  FTP百分比
                  <Input
                    value={formatRangePercent(selected.rangePercent)}
                    placeholder="例如 63-72"
                    onChange={(value) =>
                      updateTemplate({
                        rangePercent: parseRangePercent(String(value)),
                      })
                    }
                  />
                </label>
              </div>
            )}
            {Boolean(selected.exercises?.length) && (
              <label>
                动作清单（每行：动作 | 组数 | 次数）
                <Textarea
                  value={formatExercises(selected.exercises)}
                  autosize={{ minRows: 4, maxRows: 8 }}
                  onChange={(value) =>
                    updateTemplate({ exercises: parseExercises(String(value)) })
                  }
                />
              </label>
            )}
            <label>
              骑行说明
              <Textarea
                value={selected.rideDetails ?? ""}
                autosize={{ minRows: 2, maxRows: 5 }}
                onChange={(value) =>
                  updateTemplate({ rideDetails: String(value) })
                }
              />
            </label>
            <label>
              饮食提示
              <Textarea
                value={selected.nutrition ?? ""}
                autosize={{ minRows: 2, maxRows: 5 }}
                onChange={(value) =>
                  updateTemplate({ nutrition: String(value) })
                }
              />
            </label>
            <label>
              备注
              <Textarea
                value={selected.notes ?? ""}
                autosize={{ minRows: 2, maxRows: 5 }}
                onChange={(value) => updateTemplate({ notes: String(value) })}
              />
            </label>
            <div className="action-row">
              <Button
                variant="outline"
                icon={<RotateCcw size={17} />}
                onClick={resetTemplates}
              >
                恢复默认
              </Button>
              <Button
                theme="danger"
                variant="outline"
                icon={<Trash2 size={17} />}
                onClick={deleteTemplate}
                disabled={templates.length <= 1}
              >
                删除模板
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <h2>数据管理</h2>
        <BackupStatus lastBackupAt={settings.lastBackupAt} />
        <div className="action-list">
          <Button
            block
            variant="outline"
            icon={<Download size={18} />}
            onClick={onExport}
          >
            导出 JSON 备份
          </Button>
          <label className="file-button">
            <Upload size={18} />
            导入 JSON 恢复
            <input
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImport(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <Button
            block
            theme="danger"
            variant="outline"
            icon={<RotateCcw size={18} />}
            onClick={onClear}
          >
            清空本地数据
          </Button>
        </div>
      </div>
    </section>
  );
}

function BmiPanel({
  weightKg,
  heightCm,
}: {
  weightKg?: string;
  heightCm?: string;
}) {
  const bmi = calculateBmi(weightKg, heightCm);
  const info = bmi ? getBmiInfo(bmi) : undefined;

  return (
    <div className={`bmi-panel ${info?.level ?? ""}`}>
      <div>
        <span>BMI</span>
        <strong>{bmi ? bmi.toFixed(1) : "待计算"}</strong>
      </div>
      <p>
        {bmi
          ? `${info?.label}：${info?.hint}`
          : "在设置里录入身高，并在当天记录体重后自动计算。"}
      </p>
      <div className="bmi-ranges" aria-label="BMI 区间">
        {BMI_RANGES.map((range) => (
          <span
            key={range.level}
            className={info?.level === range.level ? "active" : ""}
          >
            {range.label}
            <em>{range.text}</em>
          </span>
        ))}
      </div>
    </div>
  );
}

function BackupStatus({ lastBackupAt }: { lastBackupAt?: string }) {
  const lastBackupDate = lastBackupAt ? new Date(lastBackupAt) : null;
  const daysSince = lastBackupDate
    ? Math.floor((Date.now() - lastBackupDate.getTime()) / 86400000)
    : undefined;
  const needsBackup = daysSince === undefined || daysSince >= 7;

  return (
    <div className={`backup-status ${needsBackup ? "warn" : ""}`}>
      <span>{needsBackup ? "建议备份" : "备份状态"}</span>
      <strong>
        {lastBackupDate
          ? `上次备份：${new Intl.DateTimeFormat("zh-CN", {
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }).format(lastBackupDate)}`
          : "还没有导出过备份"}
      </strong>
      <p>
        {needsBackup
          ? "长期记录建议每周手动导出一次 JSON。导入恢复前会自动先导出当前数据。"
          : "当前本地数据已在最近一周内备份过。"}
      </p>
    </div>
  );
}

function numeric(value?: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function labelPlan(plan: PlanDay) {
  return `${labelKind(plan.kind)}${plan.exercises?.length ? "+力量" : ""}`;
}

function buildWeightTrendText(entries: Record<string, BodyEntry>) {
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

const BMI_RANGES = [
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

function buildTemplatePreset(kind: TrainingKind, hasStrength: boolean): Partial<TrainingTemplate> {
  const strengthPatch = hasStrength
    ? {
        exercises: defaultStrengthExercises(),
        strengthDurationLabel: "20-25分钟",
      }
    : {
        exercises: undefined,
        strengthDurationLabel: "",
      };

  const map: Record<TrainingKind, Partial<TrainingTemplate>> = {
    recovery: {
      title: hasStrength ? "恢复骑 + 力量" : "恢复骑",
      durationMinutes: 45,
      durationLabel: "40-50分钟",
      rangePercent: [85 / 175, 100 / 175],
      rideDetails: "轻松恢复，目标85-100W。",
      nutrition: "恢复/Z2：出门前可少吃，半根到1根香蕉即可。训练后补20-35g蛋白质，加适量主食。",
      notes: "保持能完整说话，不为打卡硬骑。",
    },
    z2: {
      title: hasStrength ? "Z2耐力 + 力量" : "Z2耐力",
      durationMinutes: 60,
      durationLabel: "60分钟",
      rangePercent: [110 / 175, 125 / 175],
      rideDetails: "稳定耐力骑，目标110-125W。",
      nutrition: "Z2 日可以少量碳水启动，训练后补20-35g蛋白质和适量主食。",
      notes: "控制强度，不追速度。",
    },
    aerobic: {
      title: hasStrength ? "有氧骑 + 力量" : "有氧骑",
      durationMinutes: 60,
      durationLabel: "45-60分钟",
      rangePercent: [98 / 175, 131 / 175],
      rideDetails: "以舒适有氧为主，保持稳定踏频。",
      nutrition: "训练前少量碳水即可，训练后补足蛋白质。",
      notes: "重点是稳定完成。",
    },
    sweetspot: {
      title: hasStrength ? "甜区训练 + 力量" : "甜区 3x8分钟",
      durationMinutes: 60,
      durationLabel: "约60分钟",
      rangePercent: [155 / 175, 162 / 175],
      rideDetails: "3x8分钟，目标155-162W，组间4分钟轻松骑。",
      nutrition: "甜区训练前补20-40g碳水，训练后补20-35g蛋白质和适量主食。",
      notes: "不要第一组冲太高，后两组保持稳定。",
    },
    threshold: {
      title: hasStrength ? "阈值训练 + 力量" : "阈值训练",
      durationMinutes: 55,
      durationLabel: "约55分钟",
      rangePercent: [166 / 175, 172 / 175],
      rideDetails: "目标166-172W，作为关键训练使用。",
      nutrition: "阈值训练前补20-40g碳水，训练后及时补蛋白质和主食。",
      notes: "疲劳时不要硬上强度。",
    },
    rest: {
      title: hasStrength ? "休息 + 力量" : "休息",
      durationMinutes: undefined,
      durationLabel: "",
      rangePercent: undefined,
      rideDetails: "",
      nutrition: "休息日也保证蛋白质，晚餐简单清淡即可。",
      notes: "睡眠、拉伸、散步即可。",
    },
    strength: {},
  };

  return { ...map[kind], ...strengthPatch };
}

function defaultStrengthExercises() {
  return [
    { name: "徒手深蹲", sets: 3, reps: "8-12次" },
    { name: "墙壁/桌边俯卧撑", sets: 3, reps: "6-10次" },
    { name: "臀桥", sets: 3, reps: "12-15次" },
    { name: "死虫", sets: 2, reps: "6次/边" },
    { name: "平板支撑", sets: 2, reps: "20-30秒" },
  ];
}

function calculateBmi(weightKg?: string, heightCm?: string) {
  const weight = numeric(weightKg);
  const height = numeric(heightCm) / 100;
  if (!weight || !height) return undefined;
  return weight / (height * height);
}

function getBmiInfo(bmi: number) {
  if (bmi < 18.5) return BMI_RANGES[0];
  if (bmi < 24) return BMI_RANGES[1];
  if (bmi < 28) return BMI_RANGES[2];
  return BMI_RANGES[3];
}

function PowerZone({
  name,
  range,
  ftp,
  prefix,
}: {
  name: string;
  range: [number, number];
  ftp: number;
  prefix?: string;
}) {
  const low = Math.round(ftp * range[0]);
  const high = Math.round(ftp * range[1]);
  return (
    <div>
      <span>{name}</span>
      <strong>{prefix ? `${prefix}${high}W` : `${low}-${high}W`}</strong>
    </div>
  );
}

function downloadJson(data: unknown, label?: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bike-training-backup${label ? `-${label}` : ""}-${todayKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importJson(file: File) {
  return JSON.parse(await file.text());
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
