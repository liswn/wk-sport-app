import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { toPng } from "html-to-image";
import {
  ComposedChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  Button,
  Dialog,
  Input,
  Picker,
  Popup,
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
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  BookOpenText,
  ClipboardList,
  Download,
  Home,
  KeyRound,
  Plus,
  RotateCcw,
  Settings,
  Smartphone,
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
import { PickerField, type PickerOption } from "./components/PickerField";
import { TrendChart } from "./components/TrendChart";
import { addMonths, getCalendarDays } from "./calendarUtils";
import { registerSW } from "virtual:pwa-register";
import {
  ActivityAnalysis,
  AiCoachSession,
  AiChatMessage,
  AiPlanPatch,
  BodyEntry,
  Checkins,
  DEFAULT_AI_MODEL,
  DEFAULT_SETTINGS,
  DayMemo,
  type FatigueAnalysisReport,
  type FatigueLoadMetrics,
  type PlanSegment,
  PlanDay,
  SettingsState,
  SUPPORTED_CHATGPT_MODELS,
  TrainingLog,
  TrainingKind,
  TrainingTemplate,
  buildDefaultSegmentsForPlan,
  createBlankTemplate,
  defaultPlanForDate,
  defaultTrainingTemplates,
  getTemplate,
} from "./model";
import type {
  AiTrainingRecommendation,
  TrainingHistorySummary,
} from "./integrations";
import {
  requestAiCoachChat,
  requestAiFatigueAnalysis,
  requestAiTrainingRecommendation,
  pushIntervalsWeekPlan,
  syncIntervalsAnalysis,
  syncIntervalsRangeAnalysis,
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
  buildTemplatePreset,
  defaultStrengthExercises,
  formatExercises,
  formatSegmentSummary,
  labelKind,
  parseExercises,
  withCurrentPower,
} from "./trainingUtils";

registerSW({ immediate: true });

type Tab = "today" | "plan" | "calendar" | "body" | "settings";
type SettingsView = "main" | "integrations" | "templates" | "guide";
type LocalDataClearKey =
  | "plans"
  | "bodyEntries"
  | "checkins"
  | "trainingLogs"
  | "dayMemos"
  | "activityAnalyses"
  | "lastFatigueReport"
  | "aiCoachSession"
  | "trainingTemplates";
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const TRAINING_KIND_OPTIONS: PickerOption[] = [
  { label: "恢复", value: "recovery" },
  { label: "Z2", value: "z2" },
  { label: "有氧", value: "aerobic" },
  { label: "甜区", value: "sweetspot" },
  { label: "阈值", value: "threshold" },
  { label: "休息", value: "rest" },
];

const FEELING_OPTIONS: PickerOption[] = [
  { label: "未记录", value: "" },
  { label: "轻松", value: "easy" },
  { label: "正常", value: "normal" },
  { label: "累", value: "tired" },
  { label: "很累", value: "very-tired" },
];

const RPE_OPTIONS: PickerOption[] = [
  { label: "未记录", value: "" },
  { label: "1 极轻松，几乎无压力", value: "1" },
  { label: "2 很轻松，热身感", value: "2" },
  { label: "3 轻松，可长时间维持", value: "3" },
  { label: "4 稍轻松，呼吸稳定", value: "4" },
  { label: "5 中等，有训练感", value: "5" },
  { label: "6 稍吃力，但可控", value: "6" },
  { label: "7 吃力，需要专注", value: "7" },
  { label: "8 很吃力，难以久撑", value: "8" },
  { label: "9 接近极限", value: "9" },
  { label: "10 极限，全力输出", value: "10" },
];

const STRATEGY_OPTIONS: PickerOption[] = [
  { label: "保守", value: "conservative" },
  { label: "平衡", value: "balanced" },
  { label: "积极", value: "active" },
  { label: "激进", value: "aggressive" },
];

const GOAL_FOCUS_OPTIONS: PickerOption[] = [
  { label: "减脂优先", value: "fat-loss" },
  { label: "功率提升优先", value: "power" },
  { label: "均衡推进", value: "balanced" },
  { label: "恢复调整", value: "recovery" },
];

const CHATGPT_MODEL_OPTIONS: PickerOption[] = [
  { label: "GPT-5.5", value: "gpt-5.5" },
  { label: "GPT-5.4", value: "gpt-5.4" },
  { label: "GPT-5.4 Mini", value: "gpt-5.4-mini" },
  { label: "GPT-4o", value: "gpt-4o" },
  { label: "GPT-4o Mini", value: "gpt-4o-mini" },
].filter((option) =>
  SUPPORTED_CHATGPT_MODELS.includes(
    option.value as (typeof SUPPORTED_CHATGPT_MODELS)[number],
  ),
);

const DATA_CLEAR_LABELS: Record<LocalDataClearKey, string> = {
  plans: "计划",
  bodyEntries: "身体",
  checkins: "打卡",
  trainingLogs: "训练记录",
  dayMemos: "备忘",
  activityAnalyses: "训练分析",
  lastFatigueReport: "疲劳分析",
  aiCoachSession: "AI咨询",
  trainingTemplates: "模板",
};

const POWER_WATT_OPTIONS: PickerOption[] = Array.from(
  { length: 401 },
  (_, index) => ({
    label: `${index}W`,
    value: String(index),
  }),
);

const FTP_PERCENT_OPTIONS: PickerOption[] = Array.from(
  { length: 181 },
  (_, index) => ({
    label: `${index + 20}%`,
    value: String(index + 20),
  }),
);

function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [plans, setPlans] = useState<Record<string, PlanDay>>({});
  const [bodyEntries, setBodyEntries] = useState<Record<string, BodyEntry>>({});
  const [checkins, setCheckins] = useState<Record<string, Checkins>>({});
  const [trainingLogs, setTrainingLogs] = useState<Record<string, TrainingLog>>(
    {},
  );
  const [activityAnalyses, setActivityAnalyses] = useState<
    Record<string, ActivityAnalysis>
  >({});
  const [dayMemos, setDayMemos] = useState<Record<string, DayMemo>>({});
  const [lastFatigueReport, setLastFatigueReport] = useState<
    FatigueAnalysisReport | undefined
  >();
  const [aiCoachSession, setAiCoachSession] = useState<
    AiCoachSession | undefined
  >();
  const [trainingTemplates, setTrainingTemplates] = useState<
    TrainingTemplate[]
  >(defaultTrainingTemplates);
  const [weekStart, setWeekStart] = useState(() => getWeekDays(new Date())[0]);
  const scrollPositions = useRef<Partial<Record<Tab, number>>>({});
  const shouldRestoreScroll = useRef(false);

  useEffect(() => {
    loadAppData().then((data) => {
      setSettings(data.settings);
      setPlans(data.plans);
      setBodyEntries(data.bodyEntries);
      setCheckins(data.checkins);
      setTrainingLogs(data.trainingLogs);
      setActivityAnalyses(data.activityAnalyses);
      setDayMemos(data.dayMemos);
      setLastFatigueReport(data.lastFatigueReport);
      setAiCoachSession(data.aiCoachSession);
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
      lastFatigueReport,
      aiCoachSession,
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
    lastFatigueReport,
    aiCoachSession,
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

  const replaceWeekPlans = (nextPlans: PlanDay[]) => {
    setPlans((current) => {
      const next = { ...current };
      for (const plan of nextPlans) {
        next[plan.date] = withCurrentPower(
          { ...plan, date: plan.date },
          settings.ftp,
          trainingTemplates,
        );
      }
      return next;
    });
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

  const clearLocalDataItem = (key: LocalDataClearKey) => {
    switch (key) {
      case "plans":
        setPlans({});
        break;
      case "bodyEntries":
        setBodyEntries({});
        break;
      case "checkins":
        setCheckins({});
        break;
      case "trainingLogs":
        setTrainingLogs({});
        break;
      case "dayMemos":
        setDayMemos({});
        break;
      case "activityAnalyses":
        setActivityAnalyses({});
        break;
      case "lastFatigueReport":
        setLastFatigueReport(undefined);
        break;
      case "aiCoachSession":
        setAiCoachSession(undefined);
        break;
      case "trainingTemplates":
        setTrainingTemplates(defaultTrainingTemplates);
        break;
    }
  };

  const nav = [
    ["today", Home, "今日"],
    ["plan", CalendarDays, "计划"],
    ["calendar", CalendarCheck, "日历"],
    ["body", Weight, "身体"],
    ["settings", Settings, "设置"],
  ] as const;

  const switchTab = (nextTab: Tab) => {
    if (nextTab === tab) return;
    scrollPositions.current[tab] = window.scrollY;
    shouldRestoreScroll.current = true;
    setTab(nextTab);
  };

  useEffect(() => {
    if (!shouldRestoreScroll.current) return;
    shouldRestoreScroll.current = false;
    const storedPosition = scrollPositions.current[tab];
    if (storedPosition === undefined && tab === "plan") return;
    window.setTimeout(() => {
      window.scrollTo({
        top: storedPosition ?? 0,
        behavior: "auto",
      });
    }, 120);
  }, [tab]);

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
              activityAnalyses={activityAnalyses}
              lastFatigueReport={lastFatigueReport}
              settings={settings}
              templates={trainingTemplates}
              onFatigueReport={setLastFatigueReport}
              onCheck={(key, value) => updateCheckin(today, key, value)}
            />
          )}
          {tab === "plan" && (
            <PlanPage
              settings={settings}
              plans={plans}
              bodyEntries={bodyEntries}
              checkins={checkins}
              templates={trainingTemplates}
              weekStart={weekStart}
              activityAnalyses={activityAnalyses}
              lastFatigueReport={lastFatigueReport}
              aiCoachSession={aiCoachSession}
              onWeekChange={setWeekStart}
              onPlanChange={updatePlan}
              onWeekPlansReplace={replaceWeekPlans}
              onAiCoachSession={setAiCoachSession}
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
              onAnalysisSave={(date, analysis) => {
                setActivityAnalyses((current) => ({
                  ...current,
                  [date]: analysis,
                }));
                setTrainingLogs((current) => ({
                  ...current,
                  [date]: {
                    ...current[date],
                    date,
                    actualMinutes: analysis.actualMinutes
                      ? String(analysis.actualMinutes)
                      : current[date]?.actualMinutes,
                    averagePower: analysis.averagePower
                      ? String(analysis.averagePower)
                      : current[date]?.averagePower,
                    notes: mergeAnalysisNote(current[date]?.notes, analysis),
                  },
                }));
                if (analysis.activityCount > 0) {
                  setCheckins((current) => ({
                    ...current,
                    [date]: { ...current[date], trainingDone: true },
                  }));
                }
              }}
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
              plans={plans}
              bodyEntries={bodyEntries}
              checkins={checkins}
              trainingLogs={trainingLogs}
              activityAnalyses={activityAnalyses}
              dayMemos={dayMemos}
              lastFatigueReport={lastFatigueReport}
              aiCoachSession={aiCoachSession}
              templates={trainingTemplates}
              onSettings={setSettings}
              onTemplates={setTrainingTemplates}
              onClearDataItem={clearLocalDataItem}
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
                  setLastFatigueReport(data.lastFatigueReport);
                  setAiCoachSession(data.aiCoachSession);
                  setTrainingTemplates(
                    data.trainingTemplates ?? defaultTrainingTemplates,
                  );
                  return importData(payload);
                });
              }}
              onClear={async () => {
                await clearAllData();
                setSettings(DEFAULT_SETTINGS);
                setPlans({});
                setBodyEntries({});
                setCheckins({});
                setTrainingLogs({});
                setActivityAnalyses({});
                setDayMemos({});
                setLastFatigueReport(undefined);
                setAiCoachSession(undefined);
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
        onChange={(value) => switchTab(value as Tab)}
      >
        {nav.map(([id, Icon, label]) => (
          <TabBarItem
            key={id}
            value={id}
            icon={<Icon size={23} strokeWidth={2.25} />}
          >
            {label}
          </TabBarItem>
        ))}
      </TabBar>
    </main>
  );
}

function useSafeAreaTop() {
  const [safeAreaTop, setSafeAreaTop] = useState(0);

  useEffect(() => {
    const measure = () => {
      const probe = document.createElement("div");
      probe.style.position = "fixed";
      probe.style.top = "0";
      probe.style.paddingTop = "env(safe-area-inset-top)";
      document.body.appendChild(probe);
      const next = Number.parseFloat(getComputedStyle(probe).paddingTop) || 0;
      probe.remove();
      setSafeAreaTop(next);
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return safeAreaTop;
}

function TodayPage({
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
      </div>

      <ReadinessPanel insight={readiness} />

      <NutritionPanel plan={plan} />

      <div className="panel fatigue-panel">
        <div className="section-head">
          <h3>AI 疲劳分析</h3>
          <Button
            size="small"
            shape="round"
            variant="outline"
            loading={fatigueLoading}
            onClick={handleFatigueAnalysis}
          >
            分析历史
          </Button>
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
        settings={settings}
        templates={templates}
      />

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

type ReadinessInsight = {
  level: "green" | "yellow" | "red" | "gray";
  label: string;
  title: string;
  summary: string;
  nextAction: string;
  tomorrowAdvice: string;
  metrics: FatigueLoadMetrics;
  latestAnalysis?: ActivityAnalysis;
};

function ReadinessPanel({ insight }: { insight: ReadinessInsight }) {
  return (
    <div className={`panel readiness-panel readiness-${insight.level}`}>
      <div className="readiness-head">
        <div>
          <h3>训练红绿灯</h3>
          <span>{insight.title}</span>
        </div>
        <strong>{insight.label}</strong>
      </div>
      <p>{insight.summary}</p>
      <div className="readiness-metrics">
        <Metric
          label="近7日 TSS"
          value={formatMetric(insight.metrics.last7Tss)}
        />
        <Metric label="CTL" value={formatMetric(insight.metrics.ctl)} />
        <Metric label="TSB" value={formatSignedMetric(insight.metrics.tsb)} />
      </div>
      <div className="readiness-actions">
        <div>
          <span>今天建议</span>
          <strong>{insight.nextAction}</strong>
        </div>
        <div>
          <span>明日微调</span>
          <strong>{insight.tomorrowAdvice}</strong>
        </div>
      </div>
      {insight.latestAnalysis && (
        <div className="readiness-diff">
          <span>最近偏差</span>
          <strong>
            {formatChineseDate(insight.latestAnalysis.date)} ·{" "}
            {insight.latestAnalysis.differencePercent}%
          </strong>
          <p>{insight.latestAnalysis.suggestion}</p>
        </div>
      )}
    </div>
  );
}

type DistributionBlock = {
  key: string;
  name: string;
  minutes: number;
  range?: [number, number];
  kind: string;
  start: number;
  end: number;
  power: number;
};

function PowerDistribution({
  segments,
  ftp,
}: {
  segments: PlanSegment[];
  ftp: number;
}) {
  const blocks = buildDistributionBlocks(segments, ftp);
  const totalMinutes = blocks.reduce((sum, block) => sum + block.minutes, 0);
  if (!blocks.length || totalMinutes <= 0) return null;
  const maxPower = Math.max(settingsFtpLine(ftp), ...blocks.map((block) => block.power));

  return (
    <div className="power-distribution" aria-label={`计划功率轮廓，${totalMinutes}分钟`}>
      <div className="power-profile-chart recharts-power-profile">
        <ResponsiveContainer width="100%" height={68}>
          <ComposedChart
            data={[
              { minute: 0, power: 0 },
              { minute: totalMinutes, power: maxPower },
            ]}
            margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          >
            <XAxis
              dataKey="minute"
              type="number"
              domain={[0, totalMinutes]}
              hide
            />
            <YAxis type="number" domain={[0, Math.ceil(maxPower * 1.08)]} hide />
            <ReferenceLine
              y={settingsFtpLine(ftp)}
              stroke="rgba(85, 100, 96, 0.42)"
              strokeDasharray="3 4"
              ifOverflow="extendDomain"
            />
            {blocks.map((block) => (
              <ReferenceArea
                key={block.key}
                x1={block.start}
                x2={block.end}
                y1={0}
                y2={block.power}
                fill={powerBlockColor(block.kind)}
                fillOpacity={0.86}
                stroke={powerBlockStroke(block.kind)}
                strokeOpacity={0.9}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function buildDistributionBlocks(segments: PlanSegment[], ftp: number) {
  let cursor = 0;
  return segments.flatMap((segment, segmentIndex) => {
    const repeat = Math.max(1, Math.round(segment.repeat ?? 1));
    const workMinutes = Math.max(0, Math.round(segment.durationMinutes ?? 0));
    const recoveryMinutes = Math.max(0, Math.round(segment.recoveryMinutes ?? 0));
    const blocks: DistributionBlock[] = [];
    for (let index = 0; index < repeat; index += 1) {
      if (workMinutes > 0) {
        const start = cursor;
        const end = cursor + workMinutes;
        blocks.push({
          key: `${segmentIndex}-${index}-work`,
          name: segment.name,
          minutes: workMinutes,
          range: segment.targetPowerRange,
          kind: labelPowerBlockKind(segment.targetPowerRange, ftp),
          start,
          end,
          power: averagePowerForRange(segment.targetPowerRange, ftp),
        });
        cursor = end;
      }
      if (recoveryMinutes > 0) {
        const start = cursor;
        const end = cursor + recoveryMinutes;
        blocks.push({
          key: `${segmentIndex}-${index}-recovery`,
          name: "恢复",
          minutes: recoveryMinutes,
          range: segment.recoveryPowerRange,
          kind: labelPowerBlockKind(segment.recoveryPowerRange, ftp),
          start,
          end,
          power: averagePowerForRange(segment.recoveryPowerRange, ftp),
        });
        cursor = end;
      }
    }
    return blocks;
  });
}

function labelPowerBlockKind(range: [number, number] | undefined, ftp: number) {
  if (!range || !ftp) return "pd-z2";
  const ratio = ((range[0] + range[1]) / 2) / ftp;
  if (ratio < 0.62) return "pd-recovery";
  if (ratio < 0.78) return "pd-z2";
  if (ratio < 0.88) return "pd-tempo";
  if (ratio < 0.95) return "pd-sweet";
  return "pd-threshold";
}

function averagePowerForRange(range: [number, number] | undefined, ftp: number) {
  if (!range) return Math.round(ftp * 0.55);
  return Math.round((range[0] + range[1]) / 2);
}

function settingsFtpLine(ftp: number) {
  return Math.max(1, Math.round(ftp * 0.9));
}

function powerBlockColor(kind: string) {
  return {
    "pd-recovery": "#78b8a9",
    "pd-z2": "#75b85c",
    "pd-tempo": "#c8ba61",
    "pd-sweet": "#d87083",
    "pd-threshold": "#df5f79",
  }[kind] ?? "#75b85c";
}

function powerBlockStroke(kind: string) {
  return {
    "pd-recovery": "#4f9587",
    "pd-z2": "#579941",
    "pd-tempo": "#a9943c",
    "pd-sweet": "#b84f66",
    "pd-threshold": "#bf415e",
  }[kind] ?? "#579941";
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
    ? (
        rpeValues.reduce((sum, value) => sum + value, 0) / rpeValues.length
      ).toFixed(1)
    : "-";
  const habits = weekKeys.flatMap((key) => {
    const item = checkins[key] ?? {};
    return [item.proteinDone, item.dinnerControlled, item.earlySleep];
  });
  const habitRate = habits.length
    ? Math.round((habits.filter(Boolean).length / habits.length) * 100)
    : 0;
  const weightTrend = buildWeightTrendText(bodyEntries);
  const reviewText = buildWeeklyReviewText({
    done,
    trainingDays,
    actualMinutes,
    strength,
    averageRpe,
    habitRate,
  });

  return (
    <div className="panel weekly-review">
      <div className="section-head">
        <h3>AI训练复盘周报</h3>
        <span>
          {formatMonthDay(week[0])} - {formatMonthDay(week[6])}
        </span>
      </div>
      <p className="weekly-review-summary">{reviewText}</p>
      <div className="review-grid">
        <Metric label="训练完成" value={`${done}/${trainingDays}`} />
        <Metric
          label="实际时长"
          value={actualMinutes ? `${actualMinutes} 分钟` : "-"}
        />
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

function buildWeeklyReviewText({
  done,
  trainingDays,
  actualMinutes,
  strength,
  averageRpe,
  habitRate,
}: {
  done: number;
  trainingDays: number;
  actualMinutes: number;
  strength: number;
  averageRpe: string;
  habitRate: number;
}) {
  if (!trainingDays)
    return "本周以恢复为主，继续保持体重和执行记录，别为了打卡硬凑训练。";
  if (!done && !actualMinutes) {
    return "本周还没有记录到训练完成，建议先补齐实际训练、RPE 和体感，再看负荷趋势。";
  }
  const completion = Math.round((done / trainingDays) * 100);
  const rpeHint =
    averageRpe !== "-" && Number(averageRpe) >= 7
      ? "主观强度偏高，接下来优先保证恢复。"
      : "整体强度可控，继续看长期趋势。";
  const strengthHint = strength ? `力量完成 ${strength} 次，` : "";
  return `本周完成率 ${completion}%，${strengthHint}累计 ${actualMinutes || 0} 分钟，习惯执行 ${habitRate}%。${rpeHint}`;
}

type MonthlyReportStats = {
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

function MonthlyReport({
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
      <div className="panel monthly-report">
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
                <strong>{stats.distanceKm.toFixed(1)}</strong>
                <span>本月骑行公里</span>
              </div>
              <div className="monthly-card-grid">
                <ReportMetricValue
                  value={stats.trainingCount}
                  unit="次"
                  label="训练次数"
                />
                <ReportMetricValue
                  value={formatDurationParts(stats.actualMinutes).value}
                  unit={formatDurationParts(stats.actualMinutes).unit}
                  label="训练时长"
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

function ReportMetricValue({
  value,
  unit,
  label,
}: {
  value: string | number;
  unit?: string;
  label: string;
}) {
  return (
    <div>
      <strong>
        {value}
        {unit && <small>{unit}</small>}
      </strong>
      <span>{label}</span>
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

function FatigueMetricsGrid({ metrics }: { metrics: FatigueLoadMetrics }) {
  const cards = [
    {
      label: "最近单次训练负荷",
      code: "TSS",
      value: formatMetric(metrics.latestTss),
      hint: metrics.latestTssDate
        ? formatChineseDate(metrics.latestTssDate)
        : "暂无训练负荷",
    },
    {
      label: "近 7 天总负荷",
      code: "7日 TSS",
      value: formatMetric(metrics.last7Tss),
      hint: "最近一周累计",
    },
    {
      label: "本周训练负荷",
      code: "周 TSS",
      value: formatMetric(metrics.currentWeekTss),
      hint: `上周 ${formatMetric(metrics.previousWeekTss)}`,
    },
    {
      label: "长期负荷",
      code: "CTL",
      value: formatMetric(metrics.ctl),
      hint: "约 42 天均值",
    },
    {
      label: "疲劳负荷",
      code: "ATL",
      value: formatMetric(metrics.atl),
      hint: "约 7 天均值",
    },
    {
      label: "状态平衡",
      code: "TSB",
      value: formatSignedMetric(metrics.tsb),
      hint: metrics.status,
    },
  ];

  return (
    <div className="fatigue-metrics">
      {cards.map((card) => (
        <div key={card.code}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <em>
            {card.code} · {card.hint}
          </em>
        </div>
      ))}
      <div className="fatigue-next">
        <span>接下来建议</span>
        <strong>{metrics.nextTraining}</strong>
      </div>
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
  const [monthSyncing, setMonthSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
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

  const handleMonthSync = async () => {
    setSyncError("");
    setSyncStatus("");
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
        setSyncStatus("这个月份还没有可同步的日期。");
        return;
      }

      const analyses = await syncIntervalsRangeAnalysis({ settings, targets });
      for (const analysis of analyses) {
        onAnalysisSave(analysis.date, analysis);
      }
      const activityDays = analyses.filter(
        (analysis) => analysis.activityCount > 0,
      ).length;
      setSyncStatus(
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
        {syncStatus && <p className="sync-success">{syncStatus}</p>}
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
            loading={syncing}
            disabled={monthSyncing}
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

function PlanPage({
  settings,
  plans,
  bodyEntries,
  checkins,
  trainingLogs,
  templates,
  weekStart,
  activityAnalyses,
  lastFatigueReport,
  aiCoachSession,
  onWeekChange,
  onPlanChange,
  onWeekPlansReplace,
  onAiCoachSession,
  onTemplate,
  onTrainingDone,
  onTrainingLogChange,
}: {
  settings: SettingsState;
  plans: Record<string, PlanDay>;
  bodyEntries: Record<string, BodyEntry>;
  checkins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  templates: TrainingTemplate[];
  weekStart: Date;
  activityAnalyses: Record<string, ActivityAnalysis>;
  lastFatigueReport?: FatigueAnalysisReport;
  aiCoachSession?: AiCoachSession;
  onWeekChange: (date: Date) => void;
  onPlanChange: (date: string, patch: Partial<PlanDay>) => void;
  onWeekPlansReplace: (plans: PlanDay[]) => void;
  onAiCoachSession: (session: AiCoachSession | undefined) => void;
  onTemplate: (date: string, id: string) => void;
  onTrainingDone: (date: string, value: boolean) => void;
  onTrainingLogChange: (date: string, patch: Partial<TrainingLog>) => void;
}) {
  const week = getWeekDays(weekStart);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiStatus, setAiStatus] = useState("");
  const [aiRecommendation, setAiRecommendation] =
    useState<AiTrainingRecommendation | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>(
    {},
  );
  const [intervalsPushLoading, setIntervalsPushLoading] = useState(false);
  const [intervalsPushStatus, setIntervalsPushStatus] = useState("");
  const [intervalsPushError, setIntervalsPushError] = useState("");
  const [intervalsPushConfirmOpen, setIntervalsPushConfirmOpen] =
    useState(false);
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

  const togglePlanDate = (date: string) => {
    setExpandedDates((current) => ({ ...current, [date]: !current[date] }));
  };

  const expandPlanDate = (date: string) => {
    setExpandedDates((current) =>
      current[date] ? current : { ...current, [date]: true },
    );
  };

  const scrollToDate = (date: string) => {
    expandPlanDate(date);
    window.setTimeout(() => {
      cardRefs.current[date]?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
    }, 40);
  };

  const weekPlans = week.map((day) => {
    const key = dateKey(day);
    return withCurrentPower(
      plans[key] ?? defaultPlanForDate(key, settings.ftp, templates),
      settings.ftp,
      templates,
    );
  });

  const recommendationPlans = Array.from({ length: 7 }, (_, index) => {
    const key = dateKey(addDays(new Date(), index));
    return withCurrentPower(
      plans[key] ?? defaultPlanForDate(key, settings.ftp, templates),
      settings.ftp,
      templates,
    );
  });

  useEffect(() => {
    setAiError("");
    setAiStatus("");
    setAiRecommendation(null);
  }, [weekStart]);

  const handleAiRecommend = async () => {
    setAiError("");
    setAiStatus("");
    setAiRecommendation(null);
    setAiLoading(true);
    try {
      const recentKeys = Array.from({ length: 28 }, (_, index) =>
        dateKey(addDays(new Date(), -index)),
      );
      const recommendation = await requestAiTrainingRecommendation({
        settings,
        weekPlans: recommendationPlans,
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

  const handleApplyAiPlans = () => {
    if (!aiRecommendation?.plans.length) return;
    onWeekPlansReplace(aiRecommendation.plans);
    setAiStatus("已按预览覆盖今天起 7 天的计划，实际完成记录保持不变。");
    setAiRecommendation(null);
  };

  const handlePushWeekPlan = async () => {
    setIntervalsPushConfirmOpen(false);
    setIntervalsPushError("");
    setIntervalsPushStatus("");
    setIntervalsPushLoading(true);
    try {
      const result = await pushIntervalsWeekPlan({
        settings,
        plans: weekPlans,
      });
      setIntervalsPushStatus(
        `已写入 Intervals.icu 日历：${result.synced}/${result.requested} 天。`,
      );
    } catch (error) {
      setIntervalsPushError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIntervalsPushLoading(false);
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
          <div className="section-actions">
            <Button
              size="small"
              shape="round"
              variant="outline"
              onClick={() => setCoachOpen(true)}
            >
              AI 咨询
            </Button>
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
        </div>
        {aiError && <p className="sync-error">{aiError}</p>}
        {aiStatus && <p className="sync-success">{aiStatus}</p>}
        {aiRecommendation && (
          <div className="ai-preview">
            <div className="ai-preview-head">
              <strong>待确认计划</strong>
              <span>
                {aiRecommendation.plans.length ? "尚未覆盖" : "仅可浏览"}
              </span>
            </div>
            <p className="ai-summary">{aiRecommendation.summary}</p>
            {aiRecommendation.plans.length ? (
              <div className="ai-preview-list">
                {aiRecommendation.plans.map((plan) => (
                  <div className="ai-preview-day" key={plan.date}>
                    <div>
                      <strong>{formatChineseDate(plan.date)}</strong>
                      <span>
                        {labelKind(plan.kind)}
                        {plan.exercises?.length ? " + 力量" : ""}
                      </span>
                    </div>
                    <h4>{plan.title}</h4>
                    <p>
                      {plan.durationLabel ||
                        (plan.durationMinutes
                          ? `${plan.durationMinutes}分钟`
                          : "不安排骑行")}
                      {plan.powerRange
                        ? ` · ${plan.powerRange[0]}-${plan.powerRange[1]}W`
                        : ""}
                    </p>
                    {plan.rideDetails && <p>{plan.rideDetails}</p>}
                    {plan.exercises?.length ? (
                      <ul>
                        {plan.exercises.slice(0, 3).map((exercise) => (
                          <li key={`${plan.date}-${exercise.name}`}>
                            {exercise.name} {exercise.sets}组 x {exercise.reps}
                          </li>
                        ))}
                        {plan.exercises.length > 3 && (
                          <li>还有 {plan.exercises.length - 3} 个力量动作</li>
                        )}
                      </ul>
                    ) : null}
                    {plan.nutrition && (
                      <p className="nutrition-note">{plan.nutrition}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <pre>{aiRecommendation.rawText}</pre>
            )}
            <div className="ai-preview-actions">
              <Button
                size="small"
                shape="round"
                variant="outline"
                onClick={() => setAiRecommendation(null)}
              >
                先不应用
              </Button>
              <Button
                size="small"
                shape="round"
                theme="primary"
                disabled={!aiRecommendation.plans.length}
                onClick={handleApplyAiPlans}
              >
                应用到本周计划
              </Button>
            </div>
          </div>
        )}
      </div>

      <TrainingCoachSheet
        visible={coachOpen}
        settings={settings}
        plans={plans}
        checkins={checkins}
        trainingLogs={trainingLogs}
        activityAnalyses={activityAnalyses}
        bodyEntries={bodyEntries}
        templates={templates}
        weekPlans={weekPlans}
        session={aiCoachSession}
        lastFatigueReport={lastFatigueReport}
        onSession={onAiCoachSession}
        onApplyPatch={(patch) => {
          onWeekPlansReplace(patch.changes.map((change) => change.after));
          setAiStatus("已应用 AI 咨询里的计划修改，实际完成记录保持不变。");
        }}
        onClose={() => setCoachOpen(false)}
      />

      {week.map((day) => {
        const key = dateKey(day);
        const plan = withCurrentPower(
          plans[key] ?? defaultPlanForDate(key, settings.ftp, templates),
          settings.ftp,
          templates,
        );
        const log = trainingLogs[key] ?? { date: key };
        const expanded = Boolean(expandedDates[key]);
        const isDone = Boolean(checkins[key]?.trainingDone);
        return (
          <article
            className={`panel plan-editor ${expanded ? "expanded" : "collapsed"}`}
            key={key}
            ref={(element) => {
              cardRefs.current[key] = element;
            }}
          >
            <div className="plan-head">
              <p className="plan-date" title={formatChineseDate(key)}>
                {formatChineseDate(key)}
              </p>
              <div className="plan-card-actions">
                <Button
                  size="small"
                  shape="round"
                  theme={isDone ? "primary" : "default"}
                  variant={isDone ? "base" : "outline"}
                  className={isDone ? "done" : ""}
                  onClick={() =>
                    onTrainingDone(key, !isDone)
                  }
                  aria-pressed={isDone}
                  icon={<Check size={15} />}
                >
                  {isDone ? "已完成" : "未完成"}
                </Button>
                <Button
                  size="small"
                  shape="round"
                  variant="outline"
                  className="plan-expand-button"
                  onClick={() => togglePlanDate(key)}
                  aria-expanded={expanded}
                  icon={
                    <ChevronDown size={15} className={expanded ? "open" : ""} />
                  }
                >
                  {expanded ? "收起" : "展开"}
                </Button>
              </div>
            </div>
            <div className="plan-title-row">
              <KindTag kind={plan.kind} />
              <h3 className="plan-title">{plan.title}</h3>
            </div>
            {!expanded ? (
              <div className="plan-summary-text">{buildPlanSummary(plan)}</div>
            ) : (
              <div className="plan-card-body">
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
                        strengthDurationLabel: Boolean(value)
                          ? "20-25分钟"
                          : "",
                      })
                    }
                  />
                </div>
                <PickerField
                  label="模板"
                  value={plan.templateId ?? ""}
                  options={templates.map((template) => ({
                    label: template.name,
                    value: template.id,
                  }))}
                  onChange={(value) => onTemplate(key, value)}
                />
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
                    当前 FTP 下目标功率：{plan.powerRange[0]}-
                    {plan.powerRange[1]}W
                  </div>
                )}
                {plan.rideDetails && (
                  <div className="inline-summary">{plan.rideDetails}</div>
                )}
                {plan.kind !== "rest" && (
                  <PlanSegmentEditor
                    segments={
                      plan.segments ?? buildDefaultSegmentsForPlan(plan) ?? []
                    }
                    defaultPowerRange={plan.powerRange}
                    onChange={(segments) => onPlanChange(key, { segments })}
                  />
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
              </div>
            )}
            {isDone && (
              <TrainingLogEditor
                log={log}
                onChange={(patch) => onTrainingLogChange(key, patch)}
              />
            )}
          </article>
        );
      })}

      <div className="panel intervals-plan-panel">
        <Button
          shape="round"
          variant="outline"
          loading={intervalsPushLoading}
          onClick={() => setIntervalsPushConfirmOpen(true)}
        >
          导入 Intervals.icu 日历
        </Button>
        {intervalsPushError && (
          <p className="sync-error">{intervalsPushError}</p>
        )}
        {intervalsPushStatus && (
          <p className="sync-success">{intervalsPushStatus}</p>
        )}
      </div>

      <Dialog
        visible={intervalsPushConfirmOpen}
        title="导入 Intervals.icu 日历"
        content={
          <div className="dialog-copy">
            <p>
              确认本周计划已经调整好后，再把 7 天计划写入 Intervals.icu 日历。
            </p>
            <p>
              应用只上传计划标题、训练分段、训练说明、预计时长、目标功率和力量动作。
              同日期的 wk-sport-app 计划会按当前内容更新。
            </p>
          </div>
        }
        cancelBtn="取消"
        confirmBtn="确认导入"
        onClose={() => setIntervalsPushConfirmOpen(false)}
        onCancel={() => setIntervalsPushConfirmOpen(false)}
        onConfirm={handlePushWeekPlan}
      />
    </section>
  );
}

function buildPlanSummary(plan: PlanDay) {
  const parts = [
    plan.kind === "rest"
      ? "休息日"
      : plan.durationLabel ||
        (plan.durationMinutes ? `${plan.durationMinutes}分钟` : ""),
    plan.powerRange ? `${plan.powerRange[0]}-${plan.powerRange[1]}W` : "",
    formatSegmentSummary(plan.segments),
    plan.exercises?.length
      ? `力量 ${plan.strengthDurationLabel || `${plan.exercises.length}个动作`}`
      : "",
  ].filter(Boolean);

  return parts.join(" · ") || "点击展开查看和编辑当天计划";
}

function PlanSegmentEditor({
  segments,
  defaultPowerRange,
  onChange,
}: {
  segments: PlanSegment[];
  defaultPowerRange?: [number, number];
  onChange: (segments: PlanSegment[] | undefined) => void;
}) {
  const updateSegment = (index: number, patch: Partial<PlanSegment>) => {
    onChange(
      segments.map((segment, currentIndex) =>
        currentIndex === index ? { ...segment, ...patch } : segment,
      ),
    );
  };

  const addSegment = () => {
    onChange([
      ...segments,
      {
        name: "新训练段",
        durationMinutes: 10,
        targetPowerRange: defaultPowerRange,
      },
    ]);
  };

  const removeSegment = (index: number) => {
    const next = segments.filter((_, currentIndex) => currentIndex !== index);
    onChange(next.length ? next : undefined);
  };

  return (
    <div className="segment-editor">
      <div className="section-head compact">
        <h4>训练分段</h4>
        <Button
          size="small"
          shape="round"
          variant="outline"
          icon={<Plus size={15} />}
          onClick={addSegment}
        >
          添加
        </Button>
      </div>
      {segments.map((segment, index) => (
        <div className="segment-card" key={`${segment.name}-${index}`}>
          <div className="segment-card-head">
            <span>{index + 1}</span>
            <Input
              value={segment.name}
              clearable
              placeholder="分段名称"
              onChange={(value) =>
                updateSegment(index, { name: String(value) })
              }
            />
            <Button
              size="small"
              shape="round"
              variant="outline"
              icon={<Trash2 size={15} />}
              onClick={() => removeSegment(index)}
            />
          </div>
          <div className="segment-fields">
            <label>
              时长
              <Input
                type="number"
                value={segment.durationMinutes ?? ""}
                placeholder="分钟"
                onChange={(value) =>
                  updateSegment(index, {
                    durationMinutes: optionalNumber(value),
                  })
                }
              />
            </label>
            <label>
              目标功率
              <PowerRangePickerField
                value={segment.targetPowerRange}
                placeholder="选择目标功率区间"
                onChange={(targetPowerRange) =>
                  updateSegment(index, { targetPowerRange })
                }
              />
            </label>
            <label>
              重复
              <Input
                type="number"
                value={segment.repeat ?? ""}
                placeholder="1"
                onChange={(value) =>
                  updateSegment(index, { repeat: optionalNumber(value) })
                }
              />
            </label>
            <label>
              恢复
              <Input
                type="number"
                value={segment.recoveryMinutes ?? ""}
                placeholder="分钟"
                onChange={(value) =>
                  updateSegment(index, {
                    recoveryMinutes: optionalNumber(value),
                  })
                }
              />
            </label>
            <label className="segment-field-wide">
              恢复功率
              <PowerRangePickerField
                value={segment.recoveryPowerRange}
                placeholder="选择恢复功率区间"
                onChange={(recoveryPowerRange) =>
                  updateSegment(index, { recoveryPowerRange })
                }
              />
            </label>
          </div>
          <Textarea
            value={segment.notes ?? ""}
            placeholder="备注，例如：组间轻松骑、逐步提高踏频..."
            autosize={{ minRows: 1, maxRows: 3 }}
            onChange={(value) => updateSegment(index, { notes: String(value) })}
          />
        </div>
      ))}
      {!segments.length && (
        <p className="muted-note">
          添加热身、主训练、恢复和冷身后，同步到 Intervals.icu 时会一起带过去。
        </p>
      )}
    </div>
  );
}

function PlanSegmentList({
  segments,
}: {
  segments: NonNullable<PlanDay["segments"]>;
}) {
  return (
    <div className="segment-list">
      <h4>训练分段</h4>
      {segments.map((segment, index) => (
        <div key={`${segment.name}-${index}`}>
          <span>{index + 1}</span>
          <strong>{segment.name}</strong>
          <em>
            {segment.repeat ? `${segment.repeat}x ` : ""}
            {segment.durationMinutes
              ? `${segment.durationMinutes}分钟`
              : "按体感"}
            {segment.targetPowerRange
              ? ` · ${segment.targetPowerRange[0]}-${segment.targetPowerRange[1]}W`
              : ""}
            {segment.recoveryMinutes
              ? ` · 组间${segment.recoveryMinutes}分钟`
              : ""}
          </em>
          {segment.notes && <p>{segment.notes}</p>}
        </div>
      ))}
    </div>
  );
}

function PowerRangePickerField({
  value,
  placeholder,
  onChange,
}: {
  value?: [number, number];
  placeholder: string;
  onChange: (range: [number, number] | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const display = value ? `${value[0]}-${value[1]}W` : placeholder;
  const lower = Math.max(0, Math.min(value?.[0] ?? 90, 400));
  const upper = Math.max(0, Math.min(value?.[1] ?? Math.max(lower, 120), 400));

  return (
    <div className="power-range-field">
      <button type="button" onClick={() => setOpen(true)}>
        <strong className={value ? "" : "placeholder"}>{display}</strong>
        <em>选择</em>
      </button>
      <Popup
        visible={open}
        placement="bottom"
        closeOnOverlayClick
        onClose={() => setOpen(false)}
      >
        <Picker
          title="选择功率区间"
          columns={[POWER_WATT_OPTIONS, POWER_WATT_OPTIONS]}
          value={[String(lower), String(Math.max(lower, upper))]}
          cancelBtn={value ? "清空" : false}
          confirmBtn="确定"
          onCancel={() => {
            onChange(undefined);
            setOpen(false);
          }}
          onConfirm={(nextValue) => {
            const first = Number(nextValue[0]);
            const second = Number(nextValue[1]);
            if (!Number.isFinite(first) || !Number.isFinite(second)) {
              onChange(undefined);
            } else {
              onChange([
                Math.round(Math.min(first, second)),
                Math.round(Math.max(first, second)),
              ]);
            }
            setOpen(false);
          }}
        />
      </Popup>
    </div>
  );
}

function FtpPercentRangePickerField({
  value,
  placeholder,
  onChange,
}: {
  value?: [number, number];
  placeholder: string;
  onChange: (range: [number, number] | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const low = Math.round((value?.[0] ?? 0.55) * 100);
  const high = Math.round((value?.[1] ?? 0.75) * 100);
  const lower = Math.max(20, Math.min(low, 200));
  const upper = Math.max(20, Math.min(high, 200));
  const display = value ? `${lower}-${upper}%` : placeholder;

  return (
    <div className="power-range-field">
      <button type="button" onClick={() => setOpen(true)}>
        <strong className={value ? "" : "placeholder"}>{display}</strong>
        <em>选择</em>
      </button>
      <Popup
        visible={open}
        placement="bottom"
        closeOnOverlayClick
        onClose={() => setOpen(false)}
      >
        <Picker
          title="选择 FTP 百分比区间"
          columns={[FTP_PERCENT_OPTIONS, FTP_PERCENT_OPTIONS]}
          value={[String(lower), String(Math.max(lower, upper))]}
          cancelBtn={value ? "清空" : false}
          confirmBtn="确定"
          onCancel={() => {
            onChange(undefined);
            setOpen(false);
          }}
          onConfirm={(nextValue) => {
            const first = Number(nextValue[0]);
            const second = Number(nextValue[1]);
            if (!Number.isFinite(first) || !Number.isFinite(second)) {
              onChange(undefined);
            } else {
              onChange([
                Math.round(Math.min(first, second)) / 100,
                Math.round(Math.max(first, second)) / 100,
              ]);
            }
            setOpen(false);
          }}
        />
      </Popup>
    </div>
  );
}

function optionalNumber(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function TrainingCoachSheet({
  visible,
  settings,
  plans,
  checkins,
  trainingLogs,
  activityAnalyses,
  bodyEntries,
  templates,
  weekPlans,
  session,
  lastFatigueReport,
  onSession,
  onApplyPatch,
  onClose,
}: {
  visible: boolean;
  settings: SettingsState;
  plans: Record<string, PlanDay>;
  checkins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  activityAnalyses: Record<string, ActivityAnalysis>;
  bodyEntries: Record<string, BodyEntry>;
  templates: TrainingTemplate[];
  weekPlans: PlanDay[];
  session?: AiCoachSession;
  lastFatigueReport?: FatigueAnalysisReport;
  onSession: (session: AiCoachSession | undefined) => void;
  onApplyPatch: (patch: AiPlanPatch) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messages = session?.messages ?? [];
  const pendingPatch = session?.pendingPatch?.appliedAt
    ? undefined
    : session?.pendingPatch;
  const quickQuestions = [
    "今天适合练吗？",
    "本周计划要不要降载？",
    "明天做 Z2 还是休息？",
    "帮我调整本周计划",
  ];

  const saveSession = (
    nextMessages: AiChatMessage[],
    pendingPatchNext = pendingPatch,
  ) => {
    onSession({
      messages: nextMessages.slice(-50),
      pendingPatch: pendingPatchNext,
      updatedAt: new Date().toISOString(),
    });
  };

  useEffect(() => {
    if (!visible) return;
    window.setTimeout(() => {
      const node = messageListRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    }, 40);
  }, [visible, messages.length, loading, pendingPatch?.id]);

  const sendQuestion = async (value?: string) => {
    const question = (value ?? input).trim();
    if (!question || loading) return;
    setInput("");
    setError("");

    const userMessage = createChatMessage("user", question);
    const nextMessages = [...messages, userMessage];
    saveSession(nextMessages);
    setLoading(true);
    try {
      const recentKeys = Array.from({ length: 42 }, (_, index) =>
        dateKey(addDays(new Date(), -index)),
      );
      const history = buildTrainingHistorySummary({
        settings,
        plans,
        checkins,
        trainingLogs,
        activityAnalyses,
        bodyEntries,
        templates,
      });
      const reply = await requestAiCoachChat({
        settings,
        question,
        messages: nextMessages,
        weekPlans,
        analyses: recentKeys
          .map((key) => activityAnalyses[key])
          .filter(Boolean),
        logs: recentKeys.map((key) => trainingLogs[key]).filter(Boolean),
        history,
        lastFatigueReport,
      });
      saveSession(
        [...nextMessages, createChatMessage("assistant", reply.message)],
        reply.planPatch ?? pendingPatch,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      saveSession(nextMessages);
    } finally {
      setLoading(false);
    }
  };

  const applyPatch = () => {
    if (!pendingPatch) return;
    const appliedPatch = {
      ...pendingPatch,
      appliedAt: new Date().toISOString(),
    };
    onApplyPatch(pendingPatch);
    saveSession(
      [
        ...messages,
        createChatMessage(
          "assistant",
          `已应用计划修改：${pendingPatch.summary}`,
        ),
      ],
      appliedPatch,
    );
  };

  const dismissPatch = () => {
    saveSession(messages, undefined);
  };

  return (
    <Popup
      visible={visible}
      placement="bottom"
      closeOnOverlayClick
      onClose={onClose}
    >
      <div className="coach-sheet">
        <div className="coach-head">
          <div>
            <h3>训练顾问</h3>
            <p>会结合你的本地训练、身体趋势和最近对话给建议</p>
          </div>
          <Button
            size="small"
            shape="round"
            variant="outline"
            onClick={onClose}
          >
            关闭
          </Button>
        </div>

        <div className="coach-quick">
          {quickQuestions.map((question) => (
            <button
              type="button"
              key={question}
              disabled={loading}
              onClick={() => sendQuestion(question)}
            >
              {question}
            </button>
          ))}
        </div>

        <div className="coach-messages" ref={messageListRef}>
          {messages.length ? (
            messages.map((message) => (
              <div key={message.id} className={`coach-message ${message.role}`}>
                <p>{message.content}</p>
              </div>
            ))
          ) : (
            <div className="coach-empty">
              问我今天练不练、本周是否降载，或者让 AI 先给一版计划修改建议。
            </div>
          )}
          {loading && <div className="coach-empty">正在分析训练记录...</div>}
        </div>

        {pendingPatch && (
          <div className="coach-patch">
            <div className="ai-preview-head">
              <strong>{pendingPatch.summary}</strong>
              <span>{pendingPatch.scope === "week" ? "整周" : "单日"}</span>
            </div>
            <div className="coach-patch-list">
              {pendingPatch.changes.map((change) => (
                <div key={change.date}>
                  <strong>{formatChineseDate(change.date)}</strong>
                  <p>
                    原计划：{change.before.title} ·{" "}
                    {labelKind(change.before.kind)}
                  </p>
                  <p>
                    建议：{change.after.title} · {labelKind(change.after.kind)}
                    {change.after.durationMinutes
                      ? ` · ${change.after.durationMinutes}分钟`
                      : ""}
                  </p>
                  {change.after.powerRange && (
                    <p>
                      功率：{change.after.powerRange[0]}-
                      {change.after.powerRange[1]}W
                    </p>
                  )}
                  {change.reason && <em>{change.reason}</em>}
                </div>
              ))}
            </div>
            <div className="ai-preview-actions">
              <Button
                size="small"
                shape="round"
                variant="outline"
                onClick={dismissPatch}
              >
                忽略
              </Button>
              <Button
                size="small"
                shape="round"
                theme="primary"
                onClick={applyPatch}
              >
                应用修改
              </Button>
            </div>
          </div>
        )}

        {error && <p className="sync-error">{error}</p>}
        <div className="coach-input">
          <Textarea
            value={input}
            placeholder="例如：帮我看下这周怎么调整，或者解释某个训练安排..."
            autosize={{ minRows: 1, maxRows: 4 }}
            onChange={(value) => setInput(String(value))}
          />
          <Button
            theme="primary"
            shape="round"
            loading={loading}
            disabled={!input.trim()}
            onClick={() => sendQuestion()}
          >
            发送
          </Button>
        </div>
      </div>
    </Popup>
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
        <PickerField
          label="RPE 主观用力"
          value={log.rpe ?? ""}
          options={RPE_OPTIONS}
          onChange={(value) => onChange({ rpe: value })}
        />
        <PickerField
          label="体感"
          value={log.feeling ?? ""}
          options={FEELING_OPTIONS}
          onChange={(value) =>
            onChange({
              feeling: (value || undefined) as TrainingLog["feeling"],
            })
          }
        />
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
  plans,
  bodyEntries,
  checkins,
  trainingLogs,
  activityAnalyses,
  dayMemos,
  lastFatigueReport,
  aiCoachSession,
  templates,
  onSettings,
  onTemplates,
  onClearDataItem,
  onExport,
  onImport,
  onClear,
}: {
  settings: SettingsState;
  plans: Record<string, PlanDay>;
  bodyEntries: Record<string, BodyEntry>;
  checkins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  activityAnalyses: Record<string, ActivityAnalysis>;
  dayMemos: Record<string, DayMemo>;
  lastFatigueReport?: FatigueAnalysisReport;
  aiCoachSession?: AiCoachSession;
  templates: TrainingTemplate[];
  onSettings: (settings: SettingsState) => void;
  onTemplates: (templates: TrainingTemplate[]) => void;
  onClearDataItem: (key: LocalDataClearKey) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onClear: () => void;
}) {
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");
  const [view, setView] = useState<SettingsView>("main");
  const [clearDialogStep, setClearDialogStep] = useState<0 | 1 | 2>(0);
  const [clearDataKey, setClearDataKey] = useState<LocalDataClearKey | null>(
    null,
  );
  const settingsScrollPositions = useRef<Partial<Record<SettingsView, number>>>(
    {},
  );
  const previousSettingsView = useRef<SettingsView>(view);
  const selected =
    templates.find((template) => template.id === selectedId) ?? templates[0];

  useEffect(() => {
    if (!templates.some((template) => template.id === selectedId)) {
      setSelectedId(templates[0]?.id ?? "");
    }
  }, [selectedId, templates]);

  useEffect(() => {
    const previous = previousSettingsView.current;
    if (previous === view) return;
    settingsScrollPositions.current[previous] = window.scrollY;
    previousSettingsView.current = view;
    const nextPosition = settingsScrollPositions.current[view] ?? 0;
    window.setTimeout(() => {
      window.scrollTo({ top: nextPosition, behavior: "auto" });
    }, 0);
  }, [view]);

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
        : (selected?.title.replace(/\s*\+\s*力量/g, "") ?? ""),
      exercises: enabled
        ? selected?.exercises?.length
          ? selected.exercises
          : defaultStrengthExercises()
        : undefined,
      strengthDurationLabel: enabled
        ? selected?.strengthDurationLabel || "20-25分钟"
        : "",
    });
  };

  const handleClearConfirm = async () => {
    if (clearDialogStep === 1) {
      setClearDialogStep(2);
      return;
    }
    setClearDialogStep(0);
    await onClear();
  };

  const handleClearDataItem = () => {
    if (!clearDataKey) return;
    onClearDataItem(clearDataKey);
    setClearDataKey(null);
  };

  return (
    <section className="stack">
      {view === "main" && (
        <>
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

          <div className="panel goal-panel">
            <h2>训练目标</h2>
            <p className="muted">
              这里会作为 AI
              生成训练计划和饮食建议的主要上下文，只在点击生成时发送给你配置的
              AI 接口。
            </p>
            <label>
              目标描述
              <Textarea
                value={settings.goalText ?? DEFAULT_SETTINGS.goalText}
                autosize={{ minRows: 7, maxRows: 12 }}
                onChange={(value) =>
                  onSettings({ ...settings, goalText: String(value) })
                }
              />
            </label>
            <div className="form-grid">
              <PickerField
                label="策略倾向"
                value={settings.strategyLevel ?? DEFAULT_SETTINGS.strategyLevel}
                options={STRATEGY_OPTIONS}
                onChange={(value) =>
                  onSettings({
                    ...settings,
                    strategyLevel: value as SettingsState["strategyLevel"],
                  })
                }
              />
              <PickerField
                label="当前重点"
                value={settings.goalFocus ?? DEFAULT_SETTINGS.goalFocus}
                options={GOAL_FOCUS_OPTIONS}
                onChange={(value) =>
                  onSettings({
                    ...settings,
                    goalFocus: value as SettingsState["goalFocus"],
                  })
                }
              />
            </div>
            <p className="goal-hint">
              建议按模板写清：目标、周期、训练时间、偏好、身体目标、饮食原则和限制。策略默认“平衡”，除非你明确愿意承受更高疲劳。
            </p>
          </div>

          <div className="settings-nav">
            <button type="button" onClick={() => setView("integrations")}>
              <span className="settings-nav-icon api">
                <KeyRound size={18} />
              </span>
              <span>
                <strong>外部 API 与 AI</strong>
                <em>Intervals.icu、ChatGPT 兼容接口和密钥</em>
              </span>
              <ChevronRight size={18} />
            </button>
            <button type="button" onClick={() => setView("templates")}>
              <span className="settings-nav-icon template">
                <ClipboardList size={18} />
              </span>
              <span>
                <strong>训练模板</strong>
                <em>{templates.length} 个模板，编辑类型、功率和饮食提示</em>
              </span>
              <ChevronRight size={18} />
            </button>
            <button type="button" onClick={() => setView("guide")}>
              <span className="settings-nav-icon guide">
                <BookOpenText size={18} />
              </span>
              <span>
                <strong>使用文档</strong>
                <em>安装到桌面、日常记录、同步、AI 和备份说明</em>
              </span>
              <ChevronRight size={18} />
            </button>
          </div>

          <InstallGuide />
        </>
      )}

      {view === "integrations" && (
        <>
          <SettingsSubpageHeader
            title="外部 API 与 AI"
            subtitle="这些配置只保存在本机浏览器，只有手动同步或生成建议时才会请求外部服务。"
            onBack={() => setView("main")}
          />
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
                  placeholder="填写 Intervals.icu API 地址"
                  onChange={(value) =>
                    onSettings({ ...settings, intervalsApiBase: String(value) })
                  }
                />
              </label>
              <label>
                Athlete ID
                <Input
                  value={settings.intervalsAthleteId ?? ""}
                  placeholder="填写 Athlete ID"
                  onChange={(value) =>
                    onSettings({
                      ...settings,
                      intervalsAthleteId: String(value),
                    })
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
            <h3>OpenAI 兼容接口</h3>
            <label>
              请求地址
              <Input
                value={settings.aiEndpoint ?? ""}
                placeholder="填写接口地址"
                onChange={(value) =>
                  onSettings({ ...settings, aiEndpoint: String(value) })
                }
              />
            </label>
            <div className="form-grid">
              <PickerField
                label="ChatGPT 模型"
                value={settings.aiModel || DEFAULT_AI_MODEL}
                options={CHATGPT_MODEL_OPTIONS}
                onChange={(aiModel) => onSettings({ ...settings, aiModel })}
              />
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
        </>
      )}

      {view === "templates" && (
        <>
          <SettingsSubpageHeader
            title="训练模板"
            subtitle="模板会影响新建或套用计划时的标题、强度、说明和饮食提示。"
            onBack={() => setView("main")}
          />
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
                <PickerField
                  label="选择模板"
                  value={selected.id}
                  options={templates.map((template) => ({
                    label: template.name,
                    value: template.id,
                  }))}
                  onChange={setSelectedId}
                />
                <div className="form-grid">
                  <label>
                    模板名
                    <Input
                      value={selected.name}
                      clearable
                      onChange={(value) =>
                        updateTemplate({ name: String(value) })
                      }
                    />
                  </label>
                  <PickerField
                    label="类型"
                    value={
                      selected.kind === "strength" ? "recovery" : selected.kind
                    }
                    options={TRAINING_KIND_OPTIONS}
                    onChange={(value) => applyKindPreset(value as TrainingKind)}
                  />
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
                    onChange={(value) =>
                      updateTemplate({ title: String(value) })
                    }
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
                      <FtpPercentRangePickerField
                        value={selected.rangePercent}
                        placeholder="选择 FTP 百分比区间"
                        onChange={(rangePercent) =>
                          updateTemplate({ rangePercent })
                        }
                      />
                    </label>
                  </div>
                )}
                {selected.kind !== "rest" && (
                  <PlanSegmentEditor
                    segments={
                      selected.segments ??
                      buildDefaultSegmentsForPlan({
                        kind: selected.kind,
                        durationMinutes: selected.durationMinutes,
                        powerRange: selected.rangePercent
                          ? [
                              Math.round(
                                selected.rangePercent[0] * settings.ftp,
                              ),
                              Math.round(
                                selected.rangePercent[1] * settings.ftp,
                              ),
                            ]
                          : undefined,
                      }) ??
                      []
                    }
                    defaultPowerRange={
                      selected.rangePercent
                        ? [
                            Math.round(selected.rangePercent[0] * settings.ftp),
                            Math.round(selected.rangePercent[1] * settings.ftp),
                          ]
                        : undefined
                    }
                    onChange={(segments) => updateTemplate({ segments })}
                  />
                )}
                {Boolean(selected.exercises?.length) && (
                  <label>
                    动作清单（每行：动作 | 组数 | 次数）
                    <Textarea
                      value={formatExercises(selected.exercises)}
                      autosize={{ minRows: 4, maxRows: 8 }}
                      onChange={(value) =>
                        updateTemplate({
                          exercises: parseExercises(String(value)),
                        })
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
                    onChange={(value) =>
                      updateTemplate({ notes: String(value) })
                    }
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
        </>
      )}

      {view === "guide" && (
        <>
          <SettingsSubpageHeader
            title="使用文档"
            subtitle="从添加到桌面到日常记录、同步、AI 咨询和备份的完整说明。"
            onBack={() => setView("main")}
          />
          <UserGuidePanel />
        </>
      )}

      {view === "main" && (
        <div className="panel">
          <h2>数据管理</h2>
          <BackupStatus lastBackupAt={settings.lastBackupAt} />
          <LocalDataSize
            settings={settings}
            plans={plans}
            bodyEntries={bodyEntries}
            checkins={checkins}
            trainingLogs={trainingLogs}
            activityAnalyses={activityAnalyses}
            dayMemos={dayMemos}
            lastFatigueReport={lastFatigueReport}
            aiCoachSession={aiCoachSession}
            templates={templates}
            onClearItem={setClearDataKey}
          />
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
              onClick={() => setClearDialogStep(1)}
            >
              清空本地数据
            </Button>
          </div>
        </div>
      )}
      <Dialog
        visible={clearDialogStep > 0}
        title={clearDialogStep === 1 ? "清空本地数据？" : "再次确认"}
        content={
          <div className="dialog-copy">
            {clearDialogStep === 1 ? (
              <p>
                这会清空所有本地训练计划、身体记录、打卡、备忘、设置和 API Key。
              </p>
            ) : (
              <p>清空后不能撤销，只能通过之前导出的 JSON 备份恢复。</p>
            )}
          </div>
        }
        cancelBtn="取消"
        confirmBtn={clearDialogStep === 1 ? "继续" : "确认清空"}
        onClose={() => setClearDialogStep(0)}
        onCancel={() => setClearDialogStep(0)}
        onConfirm={handleClearConfirm}
      />
      <Dialog
        visible={Boolean(clearDataKey)}
        title={`清理${clearDataKey ? DATA_CLEAR_LABELS[clearDataKey] : ""}？`}
        content={
          <div className="dialog-copy">
            <p>
              {clearDataKey === "trainingTemplates"
                ? "这会把训练模板恢复为默认模板，不会删除已经写入到日计划里的内容。"
                : `这会只清理“${
                    clearDataKey ? DATA_CLEAR_LABELS[clearDataKey] : ""
                  }”这一项本地数据，其它数据会保留。`}
            </p>
          </div>
        }
        cancelBtn="取消"
        confirmBtn="确认清理"
        onClose={() => setClearDataKey(null)}
        onCancel={() => setClearDataKey(null)}
        onConfirm={handleClearDataItem}
      />
    </section>
  );
}

function SettingsSubpageHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
}) {
  return (
    <div className="settings-subpage-head">
      <Button
        size="small"
        shape="round"
        variant="outline"
        icon={<ArrowLeft size={17} />}
        onClick={onBack}
      >
        返回
      </Button>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function InstallGuide() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installStatus, setInstallStatus] = useState("");

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () =>
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
  }, []);

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  const promptInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setInstallStatus(
      choice.outcome === "accepted" ? "已开始安装流程" : "已取消安装",
    );
  };

  return (
    <div className="panel install-guide">
      <div className="section-head">
        <div>
          <h2>添加到桌面</h2>
          <p className="muted">把 PWA 放到主屏幕后，会像单机 App 一样打开。</p>
        </div>
        <Smartphone size={22} />
      </div>
      {standalone ? (
        <p className="sync-success">当前已经是独立窗口模式。</p>
      ) : (
        <>
          {installPrompt && (
            <Button block theme="primary" shape="round" onClick={promptInstall}>
              安装应用
            </Button>
          )}
          <div className="install-steps">
            <div>
              <strong>iPhone / iPad</strong>
              <span>用 Safari 打开，点分享按钮，选择「添加到主屏幕」。</span>
            </div>
            <div>
              <strong>Android</strong>
              <span>
                用 Chrome 或 Edge
                打开，点菜单，选择「安装应用」或「添加到主屏幕」。
              </span>
            </div>
          </div>
          {isIos && (
            <p className="muted-note">
              iOS 不会弹出安装按钮，需要从 Safari 分享菜单手动添加。
            </p>
          )}
          {installStatus && <p className="sync-success">{installStatus}</p>}
        </>
      )}
    </div>
  );
}

function UserGuidePanel() {
  const sections = [
    {
      title: "添加到桌面",
      items: [
        "iPhone / iPad：用 Safari 打开网站，点分享按钮，选择「添加到主屏幕」。",
        "Android：用 Chrome 或 Edge 打开网站，点菜单里的「安装应用」或「添加到主屏幕」。",
        "添加后从桌面图标打开，会以 PWA 独立窗口运行。",
      ],
    },
    {
      title: "每日使用",
      items: [
        "「今日」优先看今日备忘、训练计划、推荐饮食和快捷打卡。",
        "底部快捷打卡记录训练完成、蛋白质、晚餐控制和早睡。",
        "AI 疲劳分析会保存最后一次结果，切换页面后不会丢。",
      ],
    },
    {
      title: "训练计划",
      items: [
        "「计划」默认显示本周，并自动定位到今天。",
        "每天卡片默认折叠，点「展开」后编辑模板、时长、备注和实际完成记录。",
        "顶部完成进度点可跳到对应日期，AI 生成的计划需要先预览，再手动应用覆盖。",
      ],
    },
    {
      title: "日历与身体",
      items: [
        "「日历」查看每天完成情况，也能写当天备忘。",
        "配置 Intervals.icu 后可同步单日或整月训练摘要，应用只保存分析结果。",
        "「身体」记录体重、体脂率、腰围、胸围和备注，趋势图放在身体页下方。",
      ],
    },
    {
      title: "设置与备份",
      items: [
        "设置主页可以改 FTP、身高和训练目标。",
        "外部 API、AI 配置、训练模板都放在独立子页面。",
        "长期记录建议每周导出一次 JSON，导入前应用会先自动备份当前数据。",
      ],
    },
    {
      title: "隐私边界",
      items: [
        "训练、身体、打卡、备忘和 API Key 保存在当前浏览器本地。",
        "外部同步和 AI 只在你点击对应按钮后请求。",
        "网站已接入 51.LA 访问统计，页面访问会加载第三方统计脚本；训练和身体数据不会由本应用主动提交给 51.LA。",
      ],
    },
  ];

  return (
    <div className="panel guide-panel">
      {sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <ul>
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
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

function LocalDataSize({
  settings,
  plans,
  bodyEntries,
  checkins,
  trainingLogs,
  activityAnalyses,
  dayMemos,
  lastFatigueReport,
  aiCoachSession,
  templates,
  onClearItem,
}: {
  settings: SettingsState;
  plans: Record<string, PlanDay>;
  bodyEntries: Record<string, BodyEntry>;
  checkins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  activityAnalyses: Record<string, ActivityAnalysis>;
  dayMemos: Record<string, DayMemo>;
  lastFatigueReport?: FatigueAnalysisReport;
  aiCoachSession?: AiCoachSession;
  templates: TrainingTemplate[];
  onClearItem: (key: LocalDataClearKey) => void;
}) {
  const snapshot = {
    schema: "wk-sport-app-v1",
    exportedAt: new Date().toISOString(),
    data: {
      settings,
      plans,
      bodyEntries,
      checkins,
      trainingLogs,
      activityAnalyses,
      dayMemos,
      lastFatigueReport,
      aiCoachSession,
      trainingTemplates: templates,
    },
  };
  const bytes = new Blob([JSON.stringify(snapshot)]).size;
  const rows: Array<{ key: LocalDataClearKey; count: number; hint: string }> = [
    { key: "plans", count: countRecord(plans), hint: "已编辑日计划" },
    {
      key: "bodyEntries",
      count: countRecord(bodyEntries),
      hint: "体重身体记录",
    },
    { key: "checkins", count: countRecord(checkins), hint: "每日执行打卡" },
    {
      key: "trainingLogs",
      count: countRecord(trainingLogs),
      hint: "实际完成记录",
    },
    { key: "dayMemos", count: countRecord(dayMemos), hint: "日历备忘" },
    {
      key: "activityAnalyses",
      count: countRecord(activityAnalyses),
      hint: "Intervals 摘要",
    },
    {
      key: "lastFatigueReport",
      count: lastFatigueReport ? 1 : 0,
      hint: "最后一次 AI 分析",
    },
    {
      key: "aiCoachSession",
      count: aiCoachSession?.messages.length ?? 0,
      hint: "聊天消息",
    },
    { key: "trainingTemplates", count: templates.length, hint: "模板库" },
  ];

  return (
    <div className="data-size-card">
      <div className="data-size-head">
        <span>本地数据量</span>
        <strong>{formatBytes(bytes)}</strong>
      </div>
      <div className="data-size-grid">
        {rows.map((row) => (
          <button
            type="button"
            key={row.key}
            disabled={row.count === 0}
            onClick={() => onClearItem(row.key)}
            title={`清理${DATA_CLEAR_LABELS[row.key]}`}
          >
            <span>{DATA_CLEAR_LABELS[row.key]}</span>
            <strong>{row.count}</strong>
            <em>{row.hint}</em>
          </button>
        ))}
      </div>
      <p>按当前可导出的 JSON 快照估算，浏览器实际占用会略有差异。</p>
    </div>
  );
}

type TrainingHistoryDay = TrainingHistorySummary["days"][number];

function buildTrainingHistorySummary({
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

function summarizeHistoryRows(rows: TrainingHistoryDay[]) {
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

function groupHistoryByWeek(rows: TrainingHistoryDay[]) {
  const groups = new Map<string, TrainingHistoryDay[]>();
  for (const row of rows) {
    const weekStart = dateKey(getWeekDays(new Date(`${row.date}T00:00:00`))[0]);
    groups.set(weekStart, [...(groups.get(weekStart) ?? []), row]);
  }
  return groups;
}

function buildFatigueLoadMetrics(
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

function buildReadinessInsight({
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

function buildTomorrowAdjustment({
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

function buildMonthlyReportStats({
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

function estimatePlannedTssFromLog(plan: PlanDay, actualMinutes: number) {
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

function buildMonthlyBodyTrend(
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

function buildBodyPoints(entries: BodyEntry[], key: "weightKg" | "waistCm") {
  return entries
    .map((entry) => ({
      date: entry.date,
      value: positiveNumber(entry[key]),
    }))
    .filter((point): point is { date: string; value: number } =>
      Boolean(point.value),
    );
}

function buildMonthlySummary({
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

function formatDuration(minutes: number) {
  if (!minutes) return "0 分钟";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} 分钟`;
  return rest ? `${hours}小时${rest}分` : `${hours}小时`;
}

function formatDurationParts(minutes: number) {
  if (!minutes) return { value: "0", unit: "分钟" };
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return { value: String(rest), unit: "分钟" };
  if (!rest) return { value: String(hours), unit: "小时" };
  return { value: `${hours}:${String(rest).padStart(2, "0")}`, unit: "小时" };
}

function formatDelta(value: number) {
  const rounded = Number(value.toFixed(1));
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function estimateDailyTss(row: TrainingHistoryDay) {
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

function exponentialAverage(values: number[], days: number) {
  if (!values.length) return undefined;
  const alpha = 2 / (days + 1);
  let value = values[0] ?? 0;
  for (const next of values.slice(1)) {
    value = value + alpha * (next - value);
  }
  return Math.round(value);
}

function labelLoadStatus(
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

function suggestNextTraining(
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

function buildBodyHistorySummary(entries: Record<string, BodyEntry>) {
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

function averageNumber(values: number[]) {
  if (!values.length) return undefined;
  return Number(
    (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1),
  );
}

function sumNumbers(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
}

function formatMetric(value?: number) {
  return value === undefined ? "-" : String(Math.round(value));
}

function formatSignedMetric(value?: number) {
  if (value === undefined) return "-";
  return value > 0 ? `+${Math.round(value)}` : String(Math.round(value));
}

function positiveNumber(value?: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function trimForAi(value: string | undefined, maxLength: number) {
  const text = value?.trim();
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function numeric(value?: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function labelPlan(plan: PlanDay) {
  return `${labelKind(plan.kind)}${plan.exercises?.length ? "+力量" : ""}`;
}

function createChatMessage(
  role: AiChatMessage["role"],
  content: string,
): AiChatMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function countRecord(record: Record<string, unknown>) {
  return Object.values(record).filter((item) => {
    if (!item) return false;
    if (typeof item !== "object") return true;
    return Object.values(item).some((value) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null && value !== "";
    });
  }).length;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function formatReportTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function mergeAnalysisNote(
  currentNote: string | undefined,
  analysis: ActivityAnalysis,
) {
  const marker = "[Intervals.icu]";
  const nextNote = `${marker} ${analysis.summary} ${analysis.suggestion}`;
  const kept = (currentNote ?? "")
    .split("\n")
    .filter((line) => !line.trim().startsWith(marker))
    .join("\n")
    .trim();
  return kept ? `${kept}\n${nextNote}` : nextNote;
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
