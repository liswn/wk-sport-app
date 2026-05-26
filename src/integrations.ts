import { DEFAULT_AI_MODEL, buildDefaultSegmentsForPlan } from "./model";
import type {
  ActivityAnalysis,
  AiChatMessage,
  AiPlanPatch,
  Checkins,
  Exercise,
  FatigueAnalysisReport,
  FatigueLoadMetrics,
  IgpsportSyncRecord,
  PlanDay,
  PlanSegment,
  SettingsState,
  TrainingKind,
  TrainingLog,
} from "./model";
import { formatChineseDate } from "./time";

type IntervalsActivity = {
  type?: string;
  name?: string;
  moving_time?: number;
  elapsed_time?: number;
  average_watts?: number;
  avg_watts?: number;
  distance?: number;
  icu_training_load?: number;
  training_load?: number;
  start_date_local?: string;
  start_date?: string;
};

type IntervalsPlanEvent = {
  category: "WORKOUT" | "NOTE";
  start_date_local: string;
  external_id: string;
  name: string;
  description: string;
  type?: "Ride" | "WeightTraining";
  moving_time?: number;
  icu_training_load?: number;
  color?: string;
};

type IgpsportActivity = {
  rideId?: string | number;
  activityId?: string | number;
  id?: string | number;
  name?: string;
  title?: string;
  beginTime?: string;
  startTime?: string;
  start_time?: string;
  distance?: number;
  totalDistance?: number;
};

type IgpsportTokenData = {
  access_token?: string;
  accessToken?: string;
  refresh_token?: string;
  refreshToken?: string;
  expires_in?: number;
  expiresIn?: number;
  token_type?: string;
};

export type AiTrainingRecommendation = {
  summary: string;
  plans: PlanDay[];
  rawText: string;
};

export type AiCoachReply = {
  message: string;
  planPatch?: AiPlanPatch;
  rawText: string;
};

export type IntervalsPlanPushResult = {
  requested: number;
  synced: number;
  events: unknown[];
};

export type TrainingHistorySummary = {
  range: {
    days: number;
    start: string;
    end: string;
  };
  goal: {
    ftp: number;
    text?: string;
    strategy?: SettingsState["strategyLevel"];
    focus?: SettingsState["goalFocus"];
  };
  totals: {
    trainingDays: number;
    completedDays: number;
    actualMinutes: number;
    averageRpe?: number;
    highRpeDays: number;
    tiredDays: number;
    hardSessions: number;
    totalTrainingLoad?: number;
  };
  recent7: {
    trainingDays: number;
    actualMinutes: number;
    averageRpe?: number;
    trainingLoad?: number;
  };
  recent14: {
    trainingDays: number;
    actualMinutes: number;
    averageRpe?: number;
    trainingLoad?: number;
  };
  weekly: Array<{
    weekStart: string;
    trainingDays: number;
    actualMinutes: number;
    averageRpe?: number;
    trainingLoad?: number;
    hardSessions: number;
    tiredDays: number;
  }>;
  body: {
    latestWeightKg?: number;
    sevenDayAverageKg?: number;
    fourteenDayAverageKg?: number;
    latestWaistCm?: number;
  };
  loadMetrics: FatigueLoadMetrics;
  days: Array<{
    date: string;
    plannedTitle: string;
    plannedKind: PlanDay["kind"];
    plannedMinutes?: number;
    done: boolean;
    actualMinutes?: number;
    averagePower?: number;
    rpe?: number;
    feeling?: TrainingLog["feeling"];
    trainingLoad?: number;
    differencePercent?: number;
    checkins?: Checkins;
    notes?: string;
    intervalSummary?: string;
  }>;
};

export async function syncIntervalsAnalysis({
  settings,
  date,
  plan,
}: {
  settings: SettingsState;
  date: string;
  plan: PlanDay;
}) {
  const activities = (
    await fetchIntervalsActivities(settings, date, date)
  ).filter((activity) => isSameLocalDate(activity, date));

  return buildActivityAnalysis(date, plan, activities);
}

export async function syncIntervalsRangeAnalysis({
  settings,
  targets,
}: {
  settings: SettingsState;
  targets: Array<{ date: string; plan: PlanDay }>;
}) {
  if (!targets.length) return [];
  const sorted = [...targets].sort((a, b) => a.date.localeCompare(b.date));
  const activities = await fetchIntervalsActivities(
    settings,
    sorted[0].date,
    sorted[sorted.length - 1].date,
  );

  return sorted.map(({ date, plan }) =>
    buildActivityAnalysis(
      date,
      plan,
      activities.filter((activity) => isSameLocalDate(activity, date)),
    ),
  );
}

export type IgpsportDateSyncResult = {
  settings: SettingsState;
  syncRecords: Record<string, IgpsportSyncRecord>;
  analysis: ActivityAnalysis;
  message: string;
};

export async function syncIgpsportDateToIntervals({
  settings,
  date,
  plan,
  syncRecords,
}: {
  settings: SettingsState;
  date: string;
  plan: PlanDay;
  syncRecords: Record<string, IgpsportSyncRecord>;
}): Promise<IgpsportDateSyncResult> {
  getIntervalsAthleteId(settings);
  getIntervalsAuthHeader(settings);

  let authenticatedSettings = await ensureIgpsportSession(settings);
  let activities: IgpsportActivity[];
  try {
    activities = await fetchIgpsportActivities(authenticatedSettings, date);
  } catch (error) {
    if (!(error instanceof IgpsportUnauthorizedError)) throw error;
    authenticatedSettings = await ensureIgpsportSession(authenticatedSettings, {
      forceRenew: true,
    });
    activities = await fetchIgpsportActivities(authenticatedSettings, date);
  }

  const nextRecords = { ...syncRecords };
  let uploaded = 0;
  let duplicates = 0;
  let skipped = 0;

  for (const activity of activities) {
    const rideId = getIgpsportRideId(activity);
    if (!rideId) continue;
    const key = `igpsport-${rideId}`;
    const existing = nextRecords[key];
    if (existing && ["uploaded", "duplicate", "skipped"].includes(existing.status)) {
      skipped += 1;
      continue;
    }

    let activityFile: IgpsportActivityFile;
    try {
      activityFile = await downloadIgpsportActivityFile(
        authenticatedSettings,
        rideId,
      );
    } catch (error) {
      if (!(error instanceof IgpsportUnauthorizedError)) throw error;
      authenticatedSettings = await ensureIgpsportSession(authenticatedSettings, {
        forceRenew: true,
      });
      activityFile = await downloadIgpsportActivityFile(
        authenticatedSettings,
        rideId,
      );
    }
    const fileHash = await digestActivityFile(activityFile.bytes);
    const matchingHash = Object.values(nextRecords).find(
      (record) =>
        record.fileHash === fileHash &&
        (record.status === "uploaded" || record.status === "duplicate"),
    );
    if (matchingHash) {
      skipped += 1;
      nextRecords[key] = buildIgpsportSyncRecord({
        date,
        rideId,
        activity,
        fileHash,
        status: "skipped",
        message: "同一活动文件已同步，已跳过。",
        intervalsActivityId: matchingHash.intervalsActivityId,
      });
      continue;
    }

    const upload = await uploadFitToIntervals({
      settings: authenticatedSettings,
      rideId,
      activityFile,
    });
    if (upload.duplicate) {
      duplicates += 1;
    } else {
      uploaded += 1;
    }
    nextRecords[key] = buildIgpsportSyncRecord({
      date,
      rideId,
      activity,
      fileType: activityFile.type,
      fileHash,
      status: upload.duplicate ? "duplicate" : "uploaded",
      message: upload.duplicate
        ? "Intervals.icu 已存在该文件。"
        : `${activityFile.type.toUpperCase()} 已上传到 Intervals.icu。`,
      intervalsActivityId: upload.activityId,
    });
  }

  const analysis = await syncIntervalsAnalysis({
    settings: authenticatedSettings,
    date,
    plan,
  });
  const noRecords = activities.length === 0;
  const message = noRecords
    ? `${date} 在 iGPSPORT 没有可同步的训练记录。`
    : `iGPSPORT 同步完成：上传 ${uploaded} 条，重复 ${duplicates} 条，跳过 ${skipped} 条。`;
  return {
    settings: authenticatedSettings,
    syncRecords: nextRecords,
    analysis,
    message,
  };
}

export async function pushIntervalsWeekPlan({
  settings,
  plans,
}: {
  settings: SettingsState;
  plans: PlanDay[];
}): Promise<IntervalsPlanPushResult> {
  if (!plans.length) {
    throw new Error("当前没有可同步的计划。");
  }

  const events = plans.map((plan) =>
    buildIntervalsPlanEvent(plan, settings.ftp),
  );
  const base = getIntervalsBase(settings);
  const athleteId = getIntervalsAthleteId(settings);
  const url = `${base}/athlete/${encodeURIComponent(athleteId)}/events/bulk?upsert=true`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: getIntervalsAuthHeader(settings),
    },
    body: JSON.stringify(events),
  });

  if (!response.ok) {
    throw new Error(
      `Intervals.icu 写入计划失败：${response.status} ${response.statusText}`,
    );
  }

  const payload = await response.json().catch(() => []);
  const returnedEvents = Array.isArray(payload) ? payload : [];
  return {
    requested: events.length,
    synced: returnedEvents.length || events.length,
    events: returnedEvents,
  };
}

class IgpsportUnauthorizedError extends Error {}

async function ensureIgpsportSession(
  settings: SettingsState,
  options: { forceRenew?: boolean } = {},
) {
  const expiresAt = settings.igpsportTokenExpiresAt
    ? new Date(settings.igpsportTokenExpiresAt).getTime()
    : 0;
  if (
    !options.forceRenew &&
    settings.igpsportAccessToken?.trim() &&
    (!expiresAt || expiresAt > Date.now() + 60_000)
  ) {
    return settings;
  }

  const refreshed = await refreshIgpsportAccount(settings).catch(() => undefined);
  if (refreshed) return refreshed;

  if (settings.igpsportUsername?.trim() && settings.igpsportPassword?.trim()) {
    return loginIgpsportAccount({ settings });
  }

  throw new Error(
    "iGPSPORT 登录已过期。没有找到可用的刷新接口或本地保存的密码，请到设置页重新登录。",
  );
}

export async function loginIgpsportAccount({
  settings,
  password,
}: {
  settings: SettingsState;
  password?: string;
}) {
  const username = settings.igpsportUsername?.trim();
  const loginPassword = password ?? settings.igpsportPassword ?? "";
  if (!username || !loginPassword) {
    throw new Error("请先在设置里填写 iGPSPORT 账号和密码。");
  }

  const response = await fetch(
    "https://prod.zh.igpsport.com/service/auth/account/login",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appId: "igpsport-web",
        username,
        password: loginPassword,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`iGPSPORT 登录失败：${response.status} ${response.statusText}`);
  }
  const payload = await response.json().catch(() => ({}));
  const data = extractIgpsportTokenData(payload);
  if (!getIgpsportAccessToken(data)) {
    throw new Error("iGPSPORT 登录未返回 access_token，请检查账号或接口响应。");
  }
  return applyIgpsportTokenData(settings, data, {
    password: loginPassword,
  });
}

async function refreshIgpsportAccount(settings: SettingsState) {
  const refreshToken = settings.igpsportRefreshToken?.trim();
  if (!refreshToken) return undefined;

  const base = "https://prod.zh.igpsport.com/service";
  const requests = [
    {
      url: `${base}/auth/refresh`,
      body: { refreshToken, appId: "igpsport-web" },
    },
    {
      url: `${base}/auth/refresh`,
      body: { refresh_token: refreshToken, appId: "igpsport-web" },
    },
    {
      url: `${base}/auth/account/refresh`,
      body: { refreshToken, appId: "igpsport-web" },
    },
    {
      url: `${base}/auth/account/refresh`,
      body: { refresh_token: refreshToken, appId: "igpsport-web" },
    },
  ];

  for (const request of requests) {
    try {
      const response = await fetch(request.url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request.body),
      });
      if (!response.ok) continue;
      const payload = await response.json().catch(() => ({}));
      const data = extractIgpsportTokenData(payload);
      if (getIgpsportAccessToken(data)) {
        return applyIgpsportTokenData(settings, data);
      }
    } catch {
      // iGPSPORT has no public refresh docs. If a candidate endpoint is blocked
      // or absent, fall back to encrypted-password login below.
    }
  }

  return undefined;
}

function extractIgpsportTokenData(payload: unknown): IgpsportTokenData {
  const record = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : {};
  const data = record.data && typeof record.data === "object"
    ? (record.data as Record<string, unknown>)
    : record;
  return data as IgpsportTokenData;
}

function applyIgpsportTokenData(
  settings: SettingsState,
  data: IgpsportTokenData,
  options: { password?: string } = {},
) {
  const accessToken = getIgpsportAccessToken(data);
  if (!accessToken) return settings;
  const refreshToken =
    data.refresh_token?.trim() ||
    data.refreshToken?.trim() ||
    settings.igpsportRefreshToken ||
    "";
  const expiresIn = Number(data.expires_in ?? data.expiresIn);
  const expiresAt = Number.isFinite(expiresIn)
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : settings.igpsportTokenExpiresAt || "";

  return {
    ...settings,
    igpsportPassword: options.password ?? settings.igpsportPassword ?? "",
    igpsportAccessToken: accessToken,
    igpsportRefreshToken: refreshToken,
    igpsportTokenExpiresAt: expiresAt,
  };
}

function getIgpsportAccessToken(data: IgpsportTokenData) {
  return data.access_token?.trim() || data.accessToken?.trim() || "";
}

async function fetchIgpsportActivities(settings: SettingsState, date: string) {
  const params = new URLSearchParams({
    pageNo: "1",
    pageSize: "100",
    reqType: "0",
    sort: "1",
    sortType: "1",
    beginTime: date,
    endTime: date,
  });
  const payload = await fetchIgpsportJson(
    settings,
    `https://prod.zh.igpsport.com/service/web-gateway/web-analyze/activity/queryMyActivity?${params.toString()}`,
  );
  const data = payload?.data;
  const activities =
    (Array.isArray(data) && data) ||
    (Array.isArray(data?.list) && data.list) ||
    (Array.isArray(data?.records) && data.records) ||
    (Array.isArray(data?.rows) && data.rows) ||
    [];
  return activities as IgpsportActivity[];
}

async function fetchIgpsportDownloadUrl(
  settings: SettingsState,
  rideId: string,
) {
  const payload = await fetchIgpsportJson(
    settings,
    `https://prod.zh.igpsport.com/service/web-gateway/web-analyze/activity/getDownloadUrl/${encodeURIComponent(rideId)}`,
  );
  const downloadUrl = typeof payload?.data === "string" ? payload.data : "";
  if (!downloadUrl.trim()) {
    throw new Error(`iGPSPORT 活动 ${rideId} 未返回 FIT 下载链接。`);
  }
  return downloadUrl;
}

async function fetchIgpsportJson(settings: SettingsState, url: string) {
  const token = settings.igpsportAccessToken?.trim();
  if (!token) throw new Error("iGPSPORT 尚未登录。");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (response.status === 401) throw new IgpsportUnauthorizedError();
  if (!response.ok) {
    throw new Error(`iGPSPORT 请求失败：${response.status} ${response.statusText}`);
  }
  const payload = await response.json().catch(() => ({}));
  if (payload?.code !== undefined && payload.code !== 0) {
    throw new Error(payload.message || "iGPSPORT 返回失败状态。");
  }
  return payload;
}

function getIgpsportRideId(activity: IgpsportActivity) {
  const value = activity.rideId ?? activity.activityId ?? activity.id;
  return value === undefined || value === null ? "" : String(value);
}

type IgpsportActivityFile = {
  type: "fit" | "gpx";
  bytes: ArrayBuffer;
};

async function downloadIgpsportActivityFile(
  settings: SettingsState,
  rideId: string,
): Promise<IgpsportActivityFile> {
  const fitUrl = await fetchIgpsportDownloadUrl(settings, rideId);
  try {
    return {
      type: "fit",
      bytes: await downloadIgpsportFile(settings, fitUrl),
    };
  } catch (error) {
    if (error instanceof IgpsportUnauthorizedError) throw error;
    return {
      type: "gpx",
      bytes: await downloadIgpsportFile(
        settings,
        `https://prod.zh.igpsport.com/service/web-gateway/web-analyze/activity/exportGpx/${encodeURIComponent(rideId)}`,
      ),
    };
  }
}

async function downloadIgpsportFile(
  settings: SettingsState,
  downloadUrl: string,
) {
  const token = settings.igpsportAccessToken?.trim();
  if (!token) throw new Error("iGPSPORT 尚未登录。");
  let response: Response;
  try {
    response = await fetch(downloadUrl, {
      headers: {
        Accept: "application/octet-stream,*/*",
        authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    throw new Error(
      "iGPSPORT 活动文件下载失败。FIT 链接可能被 OSS CORS 拦截；如果 GPX 接口也失败，请改为手动选择文件上传。",
      { cause: error },
    );
  }
  if (response.status === 401) throw new IgpsportUnauthorizedError();
  if (!response.ok) {
    throw new Error(`下载 iGPSPORT 活动文件失败：${response.status} ${response.statusText}`);
  }
  return response.arrayBuffer();
}

async function digestActivityFile(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function uploadFitToIntervals({
  settings,
  rideId,
  activityFile,
}: {
  settings: SettingsState;
  rideId: string;
  activityFile: IgpsportActivityFile;
}) {
  const base = getIntervalsBase(settings);
  const athleteId = getIntervalsAthleteId(settings);
  const params = new URLSearchParams({ external_id: `igpsport-${rideId}` });
  const formData = new FormData();
  formData.append(
    "file",
    new File([activityFile.bytes], `igpsport-${rideId}.${activityFile.type}`, {
      type: "application/octet-stream",
    }),
  );
  const response = await fetch(
    `${base}/athlete/${encodeURIComponent(athleteId)}/activities?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: getIntervalsAuthHeader(settings),
      },
      body: formData,
    },
  );
  if (!response.ok) {
    throw new Error(
      `Intervals.icu 上传 ${activityFile.type.toUpperCase()} 失败：${response.status} ${response.statusText}`,
    );
  }
  const payload = await response.json().catch(() => ({}));
  return {
    duplicate: response.status === 200,
    activityId: String(
      payload?.id ?? payload?.activity_id ?? payload?.activityId ?? "",
    ),
  };
}

function buildIgpsportSyncRecord({
  date,
  rideId,
  activity,
  fileHash,
  fileType,
  intervalsActivityId,
  status,
  message,
}: {
  date: string;
  rideId: string;
  activity: IgpsportActivity;
  fileHash?: string;
  fileType?: IgpsportSyncRecord["fileType"];
  intervalsActivityId?: string;
  status: IgpsportSyncRecord["status"];
  message?: string;
}): IgpsportSyncRecord {
  return {
    id: `igpsport-${rideId}`,
    date,
    rideId,
    title: activity.title ?? activity.name,
    startedAt:
      activity.startTime ?? activity.beginTime ?? activity.start_time,
    fileType,
    fileHash,
    intervalsActivityId: intervalsActivityId || undefined,
    status,
    message,
    syncedAt: new Date().toISOString(),
  };
}

async function fetchIntervalsActivities(
  settings: SettingsState,
  oldest: string,
  newest: string,
) {
  const base = getIntervalsBase(settings);
  const athleteId = getIntervalsAthleteId(settings);
  const params = new URLSearchParams({ oldest, newest });
  const url = `${base}/athlete/${encodeURIComponent(athleteId)}/activities?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: getIntervalsAuthHeader(settings),
    },
  });

  if (!response.ok) {
    throw new Error(
      `Intervals.icu 同步失败：${response.status} ${response.statusText}`,
    );
  }

  const payload = await response.json();
  return normalizeActivities(payload);
}

function getIntervalsBase(settings: SettingsState) {
  return (settings.intervalsApiBase || "https://intervals.icu/api/v1").replace(
    /\/$/,
    "",
  );
}

function getIntervalsAthleteId(settings: SettingsState) {
  if (
    !settings.intervalsApiKey?.trim() ||
    !settings.intervalsAthleteId?.trim()
  ) {
    throw new Error("请先在设置里填写 Intervals.icu Athlete ID 和 API Key。");
  }
  return settings.intervalsAthleteId.trim();
}

function getIntervalsAuthHeader(settings: SettingsState) {
  if (!settings.intervalsApiKey?.trim()) {
    throw new Error("请先在设置里填写 Intervals.icu API Key。");
  }
  return `Basic ${btoa(`API_KEY:${settings.intervalsApiKey.trim()}`)}`;
}

function buildIntervalsPlanEvent(
  plan: PlanDay,
  ftp: number,
): IntervalsPlanEvent {
  const hasRide = plan.kind !== "rest" && Boolean(plan.durationMinutes);
  const hasStrength = Boolean(plan.exercises?.length);
  const description = buildIntervalsWorkoutDescription(plan, ftp);

  if (!hasRide && !hasStrength) {
    return {
      category: "NOTE",
      start_date_local: `${plan.date}T00:00:00`,
      external_id: `wk-sport-app-plan-${plan.date}`,
      name: plan.title || "休息",
      description,
      color: "gray",
    };
  }

  const movingTime =
    (hasRide
      ? (plan.durationMinutes ?? 0)
      : inferStrengthMinutes(plan.strengthDurationLabel)) * 60;
  const trainingLoad = estimatePlannedTrainingLoad(plan, ftp);

  return {
    category: "WORKOUT",
    start_date_local: `${plan.date}T00:00:00`,
    external_id: `wk-sport-app-plan-${plan.date}`,
    name: plan.title || labelPlanKind(plan.kind),
    description,
    type: hasRide ? "Ride" : "WeightTraining",
    moving_time: movingTime || undefined,
    icu_training_load: trainingLoad,
  };
}

function buildIntervalsWorkoutDescription(plan: PlanDay, ftp: number) {
  const lines = [
    plan.title,
    `类型：${labelPlanKind(plan.kind)}${plan.exercises?.length ? " + 力量" : ""}`,
  ];

  if (plan.kind !== "rest" && plan.durationMinutes) {
    lines.push("");
    lines.push("Workout");
    for (const step of buildWorkoutStepLines(plan, ftp)) {
      lines.push(`- ${step}`);
    }
  }

  if (plan.powerRange) {
    const [low, high] = plan.powerRange;
    lines.push(`目标功率：${low}-${high}W`);
  }
  if (plan.rideDetails) lines.push(`骑行说明：${plan.rideDetails}`);
  if (plan.exercises?.length) {
    lines.push("");
    lines.push("力量训练：");
    for (const exercise of plan.exercises) {
      lines.push(`- ${exercise.name} ${exercise.sets}组 x ${exercise.reps}`);
    }
  }
  if (plan.nutrition) lines.push(`饮食提示：${plan.nutrition}`);
  if (plan.notes) lines.push(`备注：${plan.notes}`);
  lines.push("");
  lines.push("来源：wk-sport-app");

  return lines.filter(Boolean).join("\n");
}

function buildWorkoutStepLines(plan: PlanDay, ftp: number) {
  if (plan.segments?.length) {
    return plan.segments.flatMap((segment) => {
      const target = segment.targetPowerRange
        ? formatPowerRangeTarget(segment.targetPowerRange, ftp)
        : formatPowerTarget(plan, ftp);
      const line =
        `${segment.repeat ? `${segment.repeat}x ` : ""}${segment.durationMinutes ?? ""}m ${target} ${segment.name}`.trim();
      const recovery = segment.recoveryMinutes
        ? `${segment.recoveryMinutes}m ${
            segment.recoveryPowerRange
              ? formatPowerRangeTarget(segment.recoveryPowerRange, ftp)
              : "50%"
          } 组间恢复`
        : "";
      return recovery ? [line, recovery] : [line];
    });
  }

  const duration = plan.durationMinutes ?? 0;
  const target = formatPowerTarget(plan, ftp);

  if (plan.kind === "sweetspot" && duration >= 45) {
    const cooldown = Math.max(duration - 46, 5);
    return [
      "10m 55%",
      "Main set 3x",
      `${8}m ${target}`,
      "4m 50%",
      `${cooldown}m 55%`,
    ];
  }

  if (plan.kind === "threshold" && duration >= 45) {
    const work = Math.max(duration - 20, 20);
    return ["10m 55%", `${work}m ${target}`, "10m 55%"];
  }

  return [`${duration}m ${target}`];
}

function formatPowerTarget(plan: PlanDay, ftp: number) {
  if (!plan.powerRange || !ftp) return "Z2";
  return formatPowerRangeTarget(plan.powerRange, ftp);
}

function formatPowerRangeTarget(range: [number, number], ftp: number) {
  if (!ftp) return `${range[0]}-${range[1]}W`;
  const averagePower = (range[0] + range[1]) / 2;
  return `${Math.round((averagePower / ftp) * 100)}%`;
}

function estimatePlannedTrainingLoad(plan: PlanDay, ftp: number) {
  if (!plan.durationMinutes) return plan.exercises?.length ? 15 : undefined;
  const intensity = plan.powerRange?.length
    ? (plan.powerRange[0] + plan.powerRange[1]) / 2 / ftp
    : plan.kind === "threshold"
      ? 0.95
      : plan.kind === "sweetspot"
        ? 0.9
        : plan.kind === "z2" || plan.kind === "aerobic"
          ? 0.68
          : plan.kind === "recovery"
            ? 0.55
            : 0.5;
  const load = Math.round(
    (plan.durationMinutes / 60) * intensity * intensity * 100,
  );
  return plan.exercises?.length ? load + 15 : load;
}

function inferStrengthMinutes(value?: string) {
  const numbers = (value ?? "")
    .match(/\d+/g)
    ?.map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
  if (!numbers?.length) return 25;
  return Math.round(
    numbers.reduce((sum, item) => sum + item, 0) / numbers.length,
  );
}

function labelPlanKind(kind: TrainingKind) {
  return {
    recovery: "恢复",
    z2: "Z2",
    aerobic: "有氧",
    sweetspot: "甜区",
    threshold: "阈值",
    rest: "休息",
    strength: "力量",
  }[kind];
}

export async function requestAiTrainingRecommendation({
  settings,
  weekPlans,
  analyses,
  logs,
}: {
  settings: SettingsState;
  weekPlans: PlanDay[];
  analyses: ActivityAnalysis[];
  logs: TrainingLog[];
}) {
  if (!settings.aiEndpoint?.trim() || !settings.aiApiKey?.trim()) {
    throw new Error("请先在设置里填写 AI 请求地址和 API Key。");
  }

  const strategyLabel = {
    conservative: "保守：优先恢复和稳定执行，训练增加更慢",
    balanced: "平衡：兼顾减脂、功率和恢复",
    active: "积极：更重视进步，但仍避免硬撑",
    aggressive: "激进：允许更高训练压力，但必须提示疲劳风险",
  }[settings.strategyLevel ?? "balanced"];
  const focusLabel = {
    "fat-loss": "减脂优先",
    power: "功率提升优先",
    balanced: "均衡推进",
    recovery: "恢复调整",
  }[settings.goalFocus ?? "balanced"];
  const prompt = [
    "你是一个偏保守的骑行训练助手。请基于用户最近的训练分析摘要，为从今天开始连续 7 天给出训练计划和饮食建议。",
    "用户当前目标配置：",
    settings.goalText?.trim() || "目标：减脂 + 提升骑行功率",
    "策略倾向：" + strategyLabel,
    "当前重点：" + focusLabel,
    "当前 FTP：" + settings.ftp + "W。",
    "要求：中文，克制，不要建议过度训练；如果数据不足，要明确说明。",
    "输出必须是纯 JSON，不要 Markdown，不要代码块，不要额外解释。",
    'JSON 格式：{"summary":"给用户看的简短说明","days":[{"date":"YYYY-MM-DD","title":"训练标题","kind":"recovery|z2|aerobic|sweetspot|threshold|rest","durationMinutes":60,"durationLabel":"60分钟","powerRange":[110,125],"segments":[{"name":"热身","durationMinutes":10,"targetPowerRange":[90,110]},{"name":"甜区主训练","durationMinutes":8,"targetPowerRange":[155,162],"repeat":3,"recoveryMinutes":4,"recoveryPowerRange":[85,100],"notes":"组间轻松骑"},{"name":"冷身","durationMinutes":10,"targetPowerRange":[85,100]}],"rideDetails":"骑行说明","exercises":[{"name":"动作","sets":3,"reps":"8-12次"}],"strengthDurationLabel":"20-25分钟","notes":"备注","nutrition":"饮食提示"}]}',
    "days 必须覆盖目标 7 天，并且 date 必须使用目标计划里的日期。骑行训练必须尽量给出 segments 表示热身、主训练、恢复、冷身；力量训练用 exercises 表示，可以和任意骑行类型组合；休息日可以不填 durationMinutes、powerRange 和 segments。",
    "目标 7 天当前计划：",
    JSON.stringify(
      weekPlans.map((plan) => ({
        date: plan.date,
        title: plan.title,
        kind: plan.kind,
        durationMinutes: plan.durationMinutes,
        powerRange: plan.powerRange,
        hasStrength: Boolean(plan.exercises?.length),
        notes: plan.notes,
        nutrition: plan.nutrition,
      })),
    ),
    "最近训练分析摘要：",
    JSON.stringify(analyses),
    "最近手动训练记录：",
    JSON.stringify(logs),
  ].join("\n");

  const content = await requestOpenAiCompatibleChat({
    settings,
    prompt,
    temperature: 0.4,
    system:
      "你只提供个人训练记录辅助建议，不替代医疗建议。回答要可执行、克制、手机屏幕友好。",
  });

  return parseAiRecommendation(content, weekPlans);
}

export async function requestAiFatigueAnalysis({
  settings,
  history,
}: {
  settings: SettingsState;
  history: TrainingHistorySummary;
}) {
  const prompt = [
    "你是一个偏保守的骑行训练与恢复分析助手。用户可能没有完全按训练计划执行，请优先分析实际完成记录。",
    "关键负荷数值已经由应用本地计算，请不要展开长篇建议，不要写饮食睡眠段落。",
    "只输出 4 行以内，适合手机一眼看完：",
    "疲劳值：0-100",
    "判断：恢复良好 / 正常负荷 / 偏疲劳 / 需要降载 / 数据不足",
    "下一步：休息 / 恢复骑 / Z2 / 可做甜区 / 可做阈值，给出一个明确选择",
    "依据：一句话，引用 TSS/CTL/TSB/RPE 中最关键的 1-2 个点",
    "用户目标：",
    settings.goalText?.trim() || "目标：减脂 + 提升骑行功率",
    "历史训练摘要 JSON：",
    JSON.stringify(history),
  ].join("\n");

  return requestOpenAiCompatibleChat({
    settings,
    prompt,
    temperature: 0.3,
    system:
      "你只提供个人训练记录辅助建议，不替代医疗建议。回答要克制、可执行，不鼓励硬撑。",
  });
}

export async function requestAiCoachChat({
  settings,
  question,
  messages,
  weekPlans,
  analyses,
  logs,
  history,
  lastFatigueReport,
}: {
  settings: SettingsState;
  question: string;
  messages: AiChatMessage[];
  weekPlans: PlanDay[];
  analyses: ActivityAnalysis[];
  logs: TrainingLog[];
  history: TrainingHistorySummary;
  lastFatigueReport?: FatigueAnalysisReport;
}): Promise<AiCoachReply> {
  const prompt = [
    "你是这个本地训练记录应用里的“训练顾问”。优先结合骑行、力量训练、恢复、训练饮食执行、身体趋势、同步配置和训练计划回答；如果问题超出你的能力，简短说明边界并尽量给出可执行的下一步。",
    "不要修改实际完成记录、打卡、体重、体脂、腰围、胸围、FTP、Intervals.icu 同步结果和历史训练日志。",
    "如果需要调整计划，只能通过 planPatch 给出可预览的计划修改；用户确认后应用才会覆盖计划。",
    "输出必须是一个可以被 JSON.parse 直接解析的单层 JSON 对象，不要 Markdown，不要代码块，不要把 JSON 再作为字符串塞进 message/content 里。",
    "返回内容必须只有一个根对象，结尾不要多余的右花括号、解释文字或其它字符。",
    "message 只能放给用户看的自然语言短句；planPatch 必须是对象，不允许是字符串。",
    'JSON 格式：{"message":"给用户看的简短中文回复","planPatch":{"summary":"修改摘要","scope":"day|week","changes":[{"date":"YYYY-MM-DD","after":{"title":"训练标题","kind":"recovery|z2|aerobic|sweetspot|threshold|rest","durationMinutes":60,"durationLabel":"60分钟","powerRange":[110,125],"segments":[{"name":"热身","durationMinutes":10,"targetPowerRange":[90,110]},{"name":"主训练","durationMinutes":8,"targetPowerRange":[155,162],"repeat":3,"recoveryMinutes":4,"recoveryPowerRange":[85,100]},{"name":"冷身","durationMinutes":10,"targetPowerRange":[85,100]}],"rideDetails":"骑行说明","exercises":[{"name":"动作","sets":3,"reps":"8-12次"}],"strengthDurationLabel":"20-25分钟","notes":"备注","nutrition":"饮食提示"},"reason":"为什么这么改"}]}}',
    '正确示例：{"message":"建议今晚保守低Z2。","planPatch":{"summary":"把今晚改为低Z2","scope":"day","changes":[{"date":"2026-05-25","after":{"title":"低Z2骑","kind":"z2","durationMinutes":75,"powerRange":[95,115]},"reason":"近期负荷偏高"}]}}',
    '错误示例：{"message":"{\\"message\\":\\"...\\",\\"planPatch\\":{...}}"}。不要这样返回。',
    "如果没有计划修改，省略 planPatch。",
    "当前用户目标：",
    settings.goalText?.trim() || "目标：减脂 + 提升骑行功率",
    "当前 FTP：" + settings.ftp + "W。",
    "本周计划 JSON：",
    JSON.stringify(weekPlans),
    "最近训练分析摘要 JSON：",
    JSON.stringify(analyses),
    "最近手动训练记录 JSON：",
    JSON.stringify(logs),
    "最近训练负荷与身体趋势 JSON：",
    JSON.stringify({
      loadMetrics: history.loadMetrics,
      recent7: history.recent7,
      recent14: history.recent14,
      weekly: history.weekly,
      body: history.body,
      lastFatigueReport,
    }),
    "最近对话 JSON：",
    JSON.stringify(
      messages.slice(-8).map(({ role, content }) => ({ role, content })),
    ),
    "用户问题：",
    question,
  ].join("\n");

  const content = await requestOpenAiCompatibleChat({
    settings,
    prompt,
    temperature: 0.35,
    system:
      "你是克制的训练顾问。必须只返回可 JSON.parse 的单层 JSON 对象；回答要短，计划修改必须放在结构化 planPatch 对象中；不确定时先说明假设和风险。",
  });

  return parseAiCoachReply(content, weekPlans);
}

async function requestOpenAiCompatibleChat({
  settings,
  prompt,
  system,
  temperature,
}: {
  settings: SettingsState;
  prompt: string;
  system: string;
  temperature: number;
}) {
  if (!settings.aiEndpoint?.trim() || !settings.aiApiKey?.trim()) {
    throw new Error("请先在设置里填写 AI 请求地址和 API Key。");
  }

  const response = await fetch(normalizeAiEndpoint(settings.aiEndpoint), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.aiApiKey.trim()}`,
    },
    body: JSON.stringify({
      model: settings.aiModel?.trim() || DEFAULT_AI_MODEL,
      temperature,
      messages: [
        {
          role: "system",
          content: system,
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI 请求失败：${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const content =
    payload?.choices?.[0]?.message?.content ??
    payload?.output_text ??
    payload?.content ??
    "";
  if (!String(content).trim())
    throw new Error("AI 返回为空，请检查供应商接口格式。");
  return String(content).trim();
}

function normalizeAiEndpoint(input?: string) {
  const endpoint = input?.trim().replace(/\/+$/, "") ?? "";
  if (endpoint.endsWith("/chat/completions")) return endpoint;
  if (endpoint.endsWith("/v1")) return `${endpoint}/chat/completions`;
  return `${endpoint}/v1/chat/completions`;
}

function parseAiRecommendation(
  content: string,
  basePlans: PlanDay[],
): AiTrainingRecommendation {
  const parsed = extractJson(content);
  if (!parsed) {
    return {
      rawText: content,
      summary: content,
      plans: [],
    };
  }

  const record = parsed as Record<string, unknown>;
  const rawDays =
    asArray(parsed) ??
    asArray(record.days) ??
    asArray(record.plans) ??
    asArray(record.weekPlan) ??
    [];
  const plans = basePlans
    .map((basePlan, index) =>
      sanitizeAiPlanDay(findAiDay(rawDays, basePlan.date, index), basePlan),
    )
    .filter(Boolean) as PlanDay[];

  return {
    rawText: content,
    summary:
      stringValue(record.summary) ||
      stringValue(record.overview) ||
      stringValue(record.message) ||
      "AI 已生成一版新的本周训练计划，请先浏览再决定是否覆盖。",
    plans: plans.length === basePlans.length ? plans : [],
  };
}

export function parseAiCoachReply(
  content: string,
  weekPlans: PlanDay[],
): AiCoachReply {
  const records = collectCoachReplyRecords(content);
  if (!records.length) {
    return {
      rawText: content,
      message: content,
    };
  }

  for (const record of records) {
    const patchRecord = coerceJsonRecord(record.planPatch ?? record.patch);
    const rawChanges =
      asArray(patchRecord?.changes) ??
      asArray(patchRecord?.days) ??
      asArray(record.changes) ??
      asArray(record.days) ??
      [];
    const changes = rawChanges
      .map((item) => sanitizePatchChange(item, weekPlans))
      .filter(Boolean) as AiPlanPatch["changes"];
    if (!changes.length) continue;

    return {
      rawText: content,
      message: chooseCoachMessage(record, patchRecord, true),
      planPatch: {
        id: `patch-${Date.now()}`,
        createdAt: new Date().toISOString(),
        scope:
          stringValue(patchRecord?.scope ?? record.scope) === "day"
            ? "day"
            : changes.length > 1
              ? "week"
              : "day",
        summary:
          stringValue(patchRecord?.summary ?? record.summary) ||
          "AI 建议调整训练计划",
        changes,
      },
    };
  }

  const record = records[0];
  return {
    rawText: content,
    message: chooseCoachMessage(record, undefined, false),
  };
}

function collectCoachReplyRecords(input: unknown): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();

  const visit = (value: unknown) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    if (typeof value === "string") {
      const parsed = extractJson(value);
      if (parsed !== undefined && parsed !== value) visit(parsed);
      return;
    }
    if (Array.isArray(value)) {
      records.push({ message: "", planPatch: { changes: value } });
      value.forEach(visit);
      return;
    }
    const record = asRecord(value);
    if (!record) return;
    records.push(record);

    const chatCompletionContent = extractChatCompletionContent(record);
    if (chatCompletionContent) visit(chatCompletionContent);

    visit(record.message);
    visit(record.rawText);
    visit(record.content);
    visit(record.reply);
    visit(record.planPatch);
    visit(record.patch);
  };

  visit(input);
  return records;
}

function chooseCoachMessage(
  record: Record<string, unknown>,
  patchRecord: Record<string, unknown> | undefined,
  hasPatch: boolean,
) {
  const rawMessage =
    stringValue(record.message) ||
    stringValue(record.reply) ||
    stringValue(record.content);
  if (rawMessage && !looksLikeJsonPayload(rawMessage)) {
    return normalizeCoachMessage(rawMessage);
  }
  return (
    normalizeCoachMessage(
      stringValue(patchRecord?.summary ?? record.summary),
    ) ||
    (hasPatch
      ? "我生成了一版可预览的计划修改，你可以先看一下再决定是否应用。"
      : "我看完了当前训练记录。")
  );
}

function normalizeCoachMessage(value: string) {
  return value
    .replace(/([\u4e00-\u9fff])[\r\n]+([\u4e00-\u9fff])/g, "$1$2")
    .replace(/[ \t]*[\r\n]+[ \t]*/g, " ")
    .trim();
}

function extractNestedJsonRecord(value: unknown) {
  if (typeof value !== "string") return undefined;
  const parsed = extractJson(value);
  return asRecord(parsed);
}

function extractChatCompletionContent(record: Record<string, unknown>) {
  const choices = asArray(record.choices);
  const firstChoice = asRecord(choices?.[0]);
  const message = asRecord(firstChoice?.message);
  return stringValue(message?.content);
}

function coerceJsonRecord(value: unknown) {
  return asRecord(value) ?? extractNestedJsonRecord(value);
}

function looksLikeJsonPayload(value?: string) {
  const text = value?.trim();
  if (!text) return false;
  return (
    text.startsWith("{") ||
    text.startsWith("[") ||
    text.startsWith("```") ||
    (text.includes('"planPatch"') && text.includes('"changes"'))
  );
}

function sanitizePatchChange(input: unknown, weekPlans: PlanDay[]) {
  const record = asRecord(input);
  if (!record) return undefined;
  const date = stringValue(record.date);
  if (!date) return undefined;
  const before = weekPlans.find((plan) => plan.date === date) ?? {
    ...weekPlans[0],
    date,
  };
  if (!before) return undefined;
  const after = sanitizeAiPlanDay(
    record.after ?? record.plan ?? record,
    before,
  );
  if (!after) return undefined;
  return {
    date,
    before,
    after,
    reason: stringValue(record.reason),
  };
}

function extractJson(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return undefined;

  const parsedDirect = parseLooseJson(trimmed);
  if (parsedDirect !== undefined) return parsedDirect;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    const parsedFenced = parseLooseJson(fenced);
    if (parsedFenced !== undefined) return parsedFenced;
  }

  const start = trimmed.indexOf("{");
  if (start < 0) return undefined;

  const balanced = findFirstBalancedJsonObject(trimmed, start);
  if (balanced) {
    const parsedBalanced = parseLooseJson(balanced);
    if (parsedBalanced !== undefined) return parsedBalanced;
  }

  const end = trimmed.lastIndexOf("}");
  if (end <= start) return undefined;
  return parseLooseJson(trimmed.slice(start, end + 1));
}

function findFirstBalancedJsonObject(text: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return undefined;
}

function parseLooseJson(text: string) {
  for (const candidate of buildJsonParseCandidates(text)) {
    try {
      return unwrapJsonValue(JSON.parse(candidate));
    } catch {
      try {
        return unwrapJsonValue(JSON.parse(escapeJsonStringControls(candidate)));
      } catch {
        // Try the next representation. Some OpenAI-compatible relays return a
        // JSON object as a bare escaped string, for example {\"message\":...}.
      }
    }
  }
  return undefined;
}

function buildJsonParseCandidates(text: string) {
  const candidates = [text];
  for (const escaped of repairBareEscapedJsonCandidates(text)) {
    if (escaped && !candidates.includes(escaped)) candidates.push(escaped);
  }
  return candidates;
}

function repairBareEscapedJsonCandidates(text: string) {
  const trimmed = text.trim();
  const candidates: string[] = [];
  if (!/[\\"]/.test(trimmed)) return candidates;

  const unquoted = trimmed.match(/^"([\s\S]*)"$/)?.[1];
  if (unquoted) candidates.push(unquoted);

  let repaired = unquoted ?? trimmed;
  for (let index = 0; index < 3; index += 1) {
    const next = repaired
      .replace(/^\\+([{\[])/, "$1")
      .replace(/([}\]])\\+$/, "$1")
      .replace(/\\+"/g, '"');
    if (next === repaired) break;
    repaired = next;
    candidates.push(repaired);
  }

  return candidates;
}

function escapeJsonStringControls(text: string) {
  let inString = false;
  let escaped = false;
  let repaired = "";

  for (const char of text) {
    if (!inString) {
      repaired += char;
      if (char === '"') inString = true;
      continue;
    }
    if (escaped) {
      repaired += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      repaired += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      repaired += char;
      inString = false;
      continue;
    }
    if (char === "\n") {
      repaired += "\\n";
      continue;
    }
    if (char === "\r") {
      repaired += "\\r";
      continue;
    }
    if (char === "\t") {
      repaired += "\\t";
      continue;
    }
    repaired += char;
  }
  return repaired;
}

function unwrapJsonValue(value: unknown): unknown {
  let current = value;
  for (let index = 0; index < 4; index += 1) {
    if (typeof current !== "string") return current;
    const text = current.trim();
    if (!looksLikeJsonPayload(text)) return current;
    try {
      current = JSON.parse(text);
    } catch {
      return current;
    }
  }
  return current;
}

function findAiDay(days: unknown[], date: string, index: number) {
  const exact = days.find((day) => {
    const record = asRecord(day);
    return stringValue(record?.date) === date;
  });
  return exact ?? days[index];
}

function sanitizeAiPlanDay(
  input: unknown,
  basePlan: PlanDay,
): PlanDay | undefined {
  const record = asRecord(input);
  if (!record) return undefined;
  const exercises = normalizeExercises(record.exercises);
  const kind = normalizeTrainingKind(record.kind) ?? basePlan.kind;
  const powerRange = normalizePowerRange(
    record.powerRange ?? record.targetPowerRange ?? record.targetPower,
  );
  const durationMinutes = numberValue(
    record.durationMinutes ?? record.minutes ?? record.duration,
  );
  const segments = normalizeSegments(record.segments ?? record.steps);

  const plan = {
    date: basePlan.date,
    templateId: undefined,
    title: stringValue(record.title) || basePlan.title,
    kind,
    durationMinutes,
    durationLabel: stringValue(record.durationLabel),
    powerRange: kind === "rest" ? undefined : powerRange,
    segments,
    rideDetails: stringValue(record.rideDetails ?? record.ride),
    exercises,
    strengthDurationLabel: exercises?.length
      ? stringValue(record.strengthDurationLabel) || "20-25分钟"
      : undefined,
    notes: stringValue(record.notes ?? record.reason),
    nutrition: stringValue(record.nutrition ?? record.diet),
  };
  return {
    ...plan,
    segments: plan.segments?.length
      ? plan.segments
      : buildDefaultSegmentsForPlan(plan),
  };
}

function normalizeTrainingKind(value: unknown): TrainingKind | undefined {
  const text = String(value ?? "")
    .toLowerCase()
    .trim();
  const map: Record<string, TrainingKind> = {
    recovery: "recovery",
    z1: "recovery",
    恢复: "recovery",
    恢复骑: "recovery",
    z2: "z2",
    耐力: "z2",
    有氧: "aerobic",
    aerobic: "aerobic",
    sweetspot: "sweetspot",
    "sweet-spot": "sweetspot",
    sweet: "sweetspot",
    甜区: "sweetspot",
    threshold: "threshold",
    阈值: "threshold",
    rest: "rest",
    休息: "rest",
    strength: "strength",
    力量: "strength",
  };
  if (map[text]) return map[text];
  if (text.includes("sweet") || text.includes("甜区")) return "sweetspot";
  if (text.includes("threshold") || text.includes("阈值")) return "threshold";
  if (text.includes("z2") || text.includes("耐力")) return "z2";
  if (text.includes("recovery") || text.includes("恢复")) return "recovery";
  if (text.includes("rest") || text.includes("休息")) return "rest";
  if (text.includes("aerobic") || text.includes("有氧")) return "aerobic";
  if (text.includes("strength") || text.includes("力量")) return "strength";
  return undefined;
}

function normalizePowerRange(value: unknown): [number, number] | undefined {
  if (Array.isArray(value)) {
    const numbers = value.map(numberValue).filter(isNumber);
    if (numbers.length >= 2) return sortRange(numbers[0], numbers[1]);
  }

  const matches = String(value ?? "").match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length < 2) return undefined;
  return sortRange(Number(matches[0]), Number(matches[1]));
}

function normalizeSegments(value: unknown): PlanSegment[] | undefined {
  const items = asArray(value);
  if (!items?.length) return undefined;
  const segments = items
    .map((item) => {
      const record = asRecord(item);
      if (!record) return undefined;
      const name = stringValue(record.name ?? record.title ?? record.label);
      if (!name) return undefined;
      return {
        name,
        durationMinutes: numberValue(
          record.durationMinutes ?? record.minutes ?? record.duration,
        ),
        targetPowerRange: normalizePowerRange(
          record.targetPowerRange ?? record.powerRange ?? record.targetPower,
        ),
        repeat: numberValue(record.repeat ?? record.repeats),
        recoveryMinutes: numberValue(
          record.recoveryMinutes ?? record.recovery ?? record.restMinutes,
        ),
        recoveryPowerRange: normalizePowerRange(
          record.recoveryPowerRange ?? record.restPowerRange,
        ),
        notes: stringValue(record.notes ?? record.description),
      };
    })
    .filter(Boolean) as PlanSegment[];
  return segments.length ? segments : undefined;
}

function sortRange(a: number, b: number): [number, number] {
  const low = Math.round(Math.min(a, b));
  const high = Math.round(Math.max(a, b));
  return [low, high];
}

function normalizeExercises(value: unknown): Exercise[] | undefined {
  const items = asArray(value);
  if (!items?.length) return undefined;
  const exercises = items
    .map((item) => {
      const record = asRecord(item);
      if (!record) return undefined;
      const name = stringValue(record.name);
      if (!name) return undefined;
      return {
        name,
        sets: numberValue(record.sets) ?? 3,
        reps: stringValue(record.reps) || "8-12次",
      };
    })
    .filter(Boolean) as Exercise[];
  return exercises.length ? exercises : undefined;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : undefined;
}

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const number =
    typeof value === "string"
      ? Number(value.match(/\d+(?:\.\d+)?/)?.[0])
      : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function isNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeActivities(payload: unknown): IntervalsActivity[] {
  if (Array.isArray(payload)) return payload as IntervalsActivity[];
  const record = payload as {
    activities?: IntervalsActivity[];
    items?: IntervalsActivity[];
    data?: IntervalsActivity[];
  };
  return record.activities ?? record.items ?? record.data ?? [];
}

function isSameLocalDate(activity: IntervalsActivity, date: string) {
  const stamp = activity.start_date_local ?? activity.start_date;
  if (!stamp) return true;
  return stamp.startsWith(date);
}

function buildActivityAnalysis(
  date: string,
  plan: PlanDay,
  activities: IntervalsActivity[],
): ActivityAnalysis {
  const plannedMinutes = plan.durationMinutes;
  const actualSeconds = sum(activities, (activity) =>
    Number(activity.moving_time ?? activity.elapsed_time ?? 0),
  );
  const actualMinutes = actualSeconds
    ? Math.round(actualSeconds / 60)
    : undefined;
  const weightedPower = weightedAverage(
    activities,
    (activity) => Number(activity.average_watts ?? activity.avg_watts ?? 0),
    (activity) => Number(activity.moving_time ?? activity.elapsed_time ?? 0),
  );
  const distanceMeters = sum(activities, (activity) =>
    Number(activity.distance ?? 0),
  );
  const trainingLoad = sum(activities, (activity) =>
    Number(activity.icu_training_load ?? activity.training_load ?? 0),
  );
  const targetPower = plan.powerRange
    ? (plan.powerRange[0] + plan.powerRange[1]) / 2
    : undefined;
  const durationDiff =
    plannedMinutes && actualMinutes
      ? Math.abs(actualMinutes - plannedMinutes) / plannedMinutes
      : 0;
  const powerDiff =
    targetPower && weightedPower
      ? Math.abs(weightedPower - targetPower) / targetPower
      : 0;
  const differencePercent = Math.min(
    100,
    Math.round((durationDiff * 0.55 + powerDiff * 0.45) * 100),
  );
  const summary = activities.length
    ? [
        `同步到 ${activities.length} 条训练。`,
        actualMinutes ? `实际 ${actualMinutes} 分钟` : "",
        weightedPower ? `均功率 ${Math.round(weightedPower)}W` : "",
        trainingLoad ? `训练负荷 ${Math.round(trainingLoad)}` : "",
        `差异度 ${differencePercent}%`,
      ]
        .filter(Boolean)
        .join("，")
    : `${formatChineseDate(date)} 没有同步到训练活动。`;

  return {
    date,
    syncedAt: new Date().toISOString(),
    activityCount: activities.length,
    plannedTitle: plan.title,
    plannedKind: plan.kind,
    plannedMinutes,
    plannedPowerRange: plan.powerRange,
    actualMinutes,
    averagePower: weightedPower ? Math.round(weightedPower) : undefined,
    distanceKm: distanceMeters
      ? Number((distanceMeters / 1000).toFixed(1))
      : undefined,
    trainingLoad: trainingLoad ? Math.round(trainingLoad) : undefined,
    differencePercent,
    summary,
    suggestion: buildDifferenceSuggestion(
      differencePercent,
      plannedMinutes,
      actualMinutes,
    ),
  };
}

function buildDifferenceSuggestion(
  differencePercent: number,
  plannedMinutes?: number,
  actualMinutes?: number,
) {
  if (!actualMinutes)
    return "没有活动数据，先确认当天是否已同步到 Intervals.icu。";
  if (differencePercent <= 12) return "执行和计划很接近，可以按原计划继续。";
  if (plannedMinutes && actualMinutes > plannedMinutes * 1.25) {
    return "实际量明显偏高，下一次训练建议保守一点，优先恢复。";
  }
  if (plannedMinutes && actualMinutes < plannedMinutes * 0.75) {
    return "实际量明显偏低，先看原因：时间不足可以接受，疲劳导致则调整后续强度。";
  }
  return "和计划有一定偏差，建议结合主观疲劳和体重趋势调整后续训练。";
}

function sum<T>(items: T[], picker: (item: T) => number) {
  return items.reduce((total, item) => {
    const value = picker(item);
    return Number.isFinite(value) ? total + value : total;
  }, 0);
}

function weightedAverage<T>(
  items: T[],
  valuePicker: (item: T) => number,
  weightPicker: (item: T) => number,
) {
  const totalWeight = sum(items, weightPicker);
  if (!totalWeight) return 0;
  const total = items.reduce((acc, item) => {
    const value = valuePicker(item);
    const weight = weightPicker(item);
    if (!Number.isFinite(value) || !Number.isFinite(weight)) return acc;
    return acc + value * weight;
  }, 0);
  return total / totalWeight;
}
