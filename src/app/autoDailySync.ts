import {
  requestAiFatigueAnalysis,
  syncIgpsportDateToIntervals,
  type TrainingHistorySummary,
} from "../integrations";
import type {
  ActivityAnalysis,
  BodyEntry,
  Checkins,
  FatigueAnalysisReport,
  IgpsportSyncRecord,
  PlanDay,
  SettingsState,
  TrainingLog,
  TrainingTemplate,
} from "../model";
import { defaultPlanForDate } from "../model";
import { todayKey } from "../time";
import { buildTrainingHistorySummary } from "../features/training";
import { withCurrentPower } from "../trainingUtils";
import { mergeAnalysisNote } from "./localData";

type AutoDailySyncSnapshot = {
  settings: SettingsState;
  plans: Record<string, PlanDay>;
  bodyEntries: Record<string, BodyEntry>;
  checkins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  activityAnalyses: Record<string, ActivityAnalysis>;
  templates: TrainingTemplate[];
  igpsportSyncRecords: Record<string, IgpsportSyncRecord>;
};

export type AutoDailySyncResult = {
  settings: SettingsState;
  checkins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  activityAnalyses: Record<string, ActivityAnalysis>;
  igpsportSyncRecords: Record<string, IgpsportSyncRecord>;
  fatigueReport?: FatigueAnalysisReport;
  status: "success" | "partial";
  message: string;
};

export function canRunAutoDailySync(settings: SettingsState) {
  const hasIntervals =
    Boolean(settings.intervalsAthleteId?.trim()) &&
    Boolean(settings.intervalsApiKey?.trim());
  const hasIgpsportSession =
    Boolean(settings.igpsportAccessToken?.trim()) ||
    Boolean(settings.igpsportRefreshToken?.trim()) ||
    (Boolean(settings.igpsportUsername?.trim()) &&
      Boolean(settings.igpsportPassword?.trim()));
  const hasAi =
    Boolean(settings.aiEndpoint?.trim()) && Boolean(settings.aiApiKey?.trim());

  return hasIntervals && hasIgpsportSession && hasAi;
}

export function hasFreshAutoDailySyncAttempt(
  settings: SettingsState,
  date = todayKey(),
) {
  if (settings.lastAutoDailySyncDate !== date) return false;
  if (settings.lastAutoDailySyncStatus !== "running") return true;

  const startedAt = settings.lastAutoDailySyncAt
    ? new Date(settings.lastAutoDailySyncAt).getTime()
    : 0;
  if (!Number.isFinite(startedAt) || !startedAt) return false;
  return Date.now() - startedAt < 15 * 60 * 1000;
}

export function markAutoDailySyncRunning(
  settings: SettingsState,
  date = todayKey(),
  at = new Date().toISOString(),
): SettingsState {
  return {
    ...settings,
    lastAutoDailySyncDate: date,
    lastAutoDailySyncAt: at,
    lastAutoDailySyncStatus: "running",
    lastAutoDailySyncMessage: "正在自动同步今日训练并生成疲劳分析。",
  };
}

export function mergeAutoDailySyncSettings(
  current: SettingsState,
  resultSettings: SettingsState,
  patch: Pick<
    SettingsState,
    | "lastAutoDailySyncAt"
    | "lastAutoDailySyncStatus"
    | "lastAutoDailySyncMessage"
  >,
): SettingsState {
  return {
    ...current,
    igpsportPassword:
      resultSettings.igpsportPassword ?? current.igpsportPassword,
    igpsportAccessToken:
      resultSettings.igpsportAccessToken ?? current.igpsportAccessToken,
    igpsportRefreshToken:
      resultSettings.igpsportRefreshToken ?? current.igpsportRefreshToken,
    igpsportTokenExpiresAt:
      resultSettings.igpsportTokenExpiresAt ??
      current.igpsportTokenExpiresAt,
    lastAutoDailySyncDate: current.lastAutoDailySyncDate,
    ...patch,
  };
}

export async function runAutoDailySync(
  snapshot: AutoDailySyncSnapshot,
  date = todayKey(),
): Promise<AutoDailySyncResult> {
  const plan = withCurrentPower(
    snapshot.plans[date] ??
      defaultPlanForDate(date, snapshot.settings.ftp, snapshot.templates),
    snapshot.settings.ftp,
    snapshot.templates,
  );

  const igpsportResult = await syncIgpsportDateToIntervals({
    settings: snapshot.settings,
    date,
    plan,
    syncRecords: snapshot.igpsportSyncRecords,
  });

  const nextMaps = applyAnalysisToSnapshot({
    date,
    analysis: igpsportResult.analysis,
    checkins: snapshot.checkins,
    trainingLogs: snapshot.trainingLogs,
    activityAnalyses: snapshot.activityAnalyses,
  });

  const history = buildTrainingHistorySummary({
    settings: igpsportResult.settings,
    plans: snapshot.plans,
    checkins: nextMaps.checkins,
    trainingLogs: nextMaps.trainingLogs,
    activityAnalyses: nextMaps.activityAnalyses,
    bodyEntries: snapshot.bodyEntries,
    templates: snapshot.templates,
  });

  let fatigueReport: FatigueAnalysisReport | undefined;
  let status: AutoDailySyncResult["status"] = "success";
  let message = `${igpsportResult.message} 已更新训练状态并完成 AI 分析。`;
  try {
    fatigueReport = await buildFatigueReport({
      settings: igpsportResult.settings,
      history,
      date,
    });
  } catch (error) {
    status = "partial";
    message = `${igpsportResult.message} 已更新训练同步结果，但 AI 分析失败：${formatError(error)}`;
  }

  return {
    settings: igpsportResult.settings,
    checkins: nextMaps.checkins,
    trainingLogs: nextMaps.trainingLogs,
    activityAnalyses: nextMaps.activityAnalyses,
    igpsportSyncRecords: igpsportResult.syncRecords,
    fatigueReport,
    status,
    message,
  };
}

async function buildFatigueReport({
  settings,
  history,
  date,
}: {
  settings: SettingsState;
  history: TrainingHistorySummary;
  date: string;
}): Promise<FatigueAnalysisReport> {
  const content = await requestAiFatigueAnalysis({ settings, history });
  return {
    date,
    generatedAt: new Date().toISOString(),
    rangeStart: history.range.start,
    rangeEnd: history.range.end,
    metrics: history.loadMetrics,
    content,
  };
}

function applyAnalysisToSnapshot({
  date,
  analysis,
  checkins,
  trainingLogs,
  activityAnalyses,
}: {
  date: string;
  analysis: ActivityAnalysis;
  checkins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  activityAnalyses: Record<string, ActivityAnalysis>;
}) {
  const currentLog = trainingLogs[date];
  return {
    activityAnalyses: {
      ...activityAnalyses,
      [date]: analysis,
    },
    trainingLogs: {
      ...trainingLogs,
      [date]: {
        ...currentLog,
        date,
        actualMinutes: analysis.actualMinutes
          ? String(analysis.actualMinutes)
          : currentLog?.actualMinutes,
        averagePower: analysis.averagePower
          ? String(analysis.averagePower)
          : currentLog?.averagePower,
        notes: mergeAnalysisNote(currentLog?.notes, analysis),
      },
    },
    checkins:
      analysis.activityCount > 0
        ? {
            ...checkins,
            [date]: { ...checkins[date], trainingDone: true },
          }
        : checkins,
  };
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
