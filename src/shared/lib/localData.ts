export type LocalDataClearKey =
  | "plans"
  | "bodyEntries"
  | "checkins"
  | "trainingLogs"
  | "dayMemos"
  | "activityAnalyses"
  | "lastFatigueReport"
  | "aiCoachSession"
  | "trainingTemplates"
  | "igpsportSyncRecords";

export const DATA_CLEAR_LABELS: Record<LocalDataClearKey, string> = {
  plans: "计划",
  bodyEntries: "身体",
  checkins: "打卡",
  trainingLogs: "训练记录",
  dayMemos: "备忘",
  activityAnalyses: "训练分析",
  lastFatigueReport: "疲劳分析",
  aiCoachSession: "AI咨询",
  trainingTemplates: "模板",
  igpsportSyncRecords: "iGPSPORT",
};
