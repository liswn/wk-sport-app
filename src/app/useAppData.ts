import { useEffect, useRef, useState } from "react";
import {
  ActivityAnalysis,
  AiCoachSession,
  BodyEntry,
  Checkins,
  DEFAULT_SETTINGS,
  DayMemo,
  type FatigueAnalysisReport,
  IgpsportSyncRecord,
  PlanDay,
  SettingsState,
  TrainingLog,
  TrainingTemplate,
  defaultPlanForDate,
  defaultTrainingTemplates,
  getTemplate,
} from "../model";
import {
  clearAllData,
  exportData,
  importData,
  loadAppData,
  saveAppData,
} from "../storage";
import { getWeekDays, todayKey } from "../time";
import { withCurrentPower } from "../trainingUtils";
import {
  downloadJson,
  importJson,
  mergeAnalysisNote,
} from "./localData";
import type { LocalDataClearKey } from "../shared/lib";
import {
  canRunAutoDailySync,
  hasFreshAutoDailySyncAttempt,
  markAutoDailySyncRunning,
  mergeAutoDailySyncSettings,
  runAutoDailySync,
} from "./autoDailySync";

export function useAppData() {
  const [ready, setReady] = useState(false);
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
  const [igpsportSyncRecords, setIgpsportSyncRecords] = useState<
    Record<string, IgpsportSyncRecord>
  >({});
  const [weekStart, setWeekStart] = useState(() => getWeekDays(new Date())[0]);
  const autoDailySyncRef = useRef<string | null>(null);

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
      setIgpsportSyncRecords(data.igpsportSyncRecords);
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
      igpsportSyncRecords,
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
    igpsportSyncRecords,
  ]);

  useEffect(() => {
    if (!ready) return;
    const syncDate = todayKey();
    if (hasFreshAutoDailySyncAttempt(settings, syncDate)) return;
    if (autoDailySyncRef.current === syncDate) return;
    if (!canRunAutoDailySync(settings)) return;

    autoDailySyncRef.current = syncDate;
    const startedAt = new Date().toISOString();
    setSettings((current) =>
      markAutoDailySyncRunning(current, syncDate, startedAt),
    );

    runAutoDailySync(
      {
        settings,
        plans,
        bodyEntries,
        checkins,
        trainingLogs,
        activityAnalyses,
        templates: trainingTemplates,
        igpsportSyncRecords,
      },
      syncDate,
    )
      .then((result) => {
        setCheckins(result.checkins);
        setTrainingLogs(result.trainingLogs);
        setActivityAnalyses(result.activityAnalyses);
        setIgpsportSyncRecords(result.igpsportSyncRecords);
        if (result.fatigueReport) {
          setLastFatigueReport(result.fatigueReport);
        }
        setSettings((current) =>
          mergeAutoDailySyncSettings(current, result.settings, {
            lastAutoDailySyncAt: new Date().toISOString(),
            lastAutoDailySyncStatus: result.status,
            lastAutoDailySyncMessage: result.message,
          }),
        );
      })
      .catch((error) => {
        setSettings((current) => ({
          ...current,
          lastAutoDailySyncDate: syncDate,
          lastAutoDailySyncAt: new Date().toISOString(),
          lastAutoDailySyncStatus: "failed",
          lastAutoDailySyncMessage:
            error instanceof Error ? error.message : String(error),
        }));
      });
  }, [
    activityAnalyses,
    bodyEntries,
    checkins,
    igpsportSyncRecords,
    plans,
    ready,
    settings,
    trainingLogs,
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

  const saveActivityAnalysis = (date: string, analysis: ActivityAnalysis) => {
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
  };

  const exportBackup = async (label?: string) => {
    const exportedAt = new Date().toISOString();
    downloadJson(await exportData(), label);
    setSettings((current) => ({ ...current, lastBackupAt: exportedAt }));
  };

  const importBackup = async (file: File) => {
    await exportBackup("before-import");
    const payload = await importJson(file);
    const data = await importData(payload);
    setSettings(data.settings ?? DEFAULT_SETTINGS);
    setPlans(data.plans ?? {});
    setBodyEntries(data.bodyEntries ?? {});
    setCheckins(data.checkins ?? {});
    setTrainingLogs(data.trainingLogs ?? {});
    setActivityAnalyses(data.activityAnalyses ?? {});
    setDayMemos(data.dayMemos ?? {});
    setLastFatigueReport(data.lastFatigueReport);
    setAiCoachSession(data.aiCoachSession);
    setTrainingTemplates(data.trainingTemplates ?? defaultTrainingTemplates);
    setIgpsportSyncRecords(data.igpsportSyncRecords ?? {});
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
      case "igpsportSyncRecords":
        setIgpsportSyncRecords({});
        break;
    }
  };

  const clearAllLocalData = async () => {
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
    setIgpsportSyncRecords({});
  };

  return {
    ready,
    settings,
    setSettings,
    plans,
    bodyEntries,
    setBodyEntries,
    checkins,
    trainingLogs,
    activityAnalyses,
    dayMemos,
    setDayMemos,
    lastFatigueReport,
    setLastFatigueReport,
    aiCoachSession,
    setAiCoachSession,
    trainingTemplates,
    setTrainingTemplates,
    igpsportSyncRecords,
    setIgpsportSyncRecords,
    weekStart,
    setWeekStart,
    today,
    todayPlan,
    todayCheckins,
    updatePlan,
    applyTemplate,
    replaceWeekPlans,
    updateCheckin,
    updateTrainingLog,
    saveActivityAnalysis,
    exportBackup,
    importBackup,
    clearLocalDataItem,
    clearAllLocalData,
  };
}
