import { DEFAULT_AI_MODEL, buildDefaultSegmentsForPlan } from "./model";
import type {
  ActivityAnalysis,
  AiChatMessage,
  AiPlanPatch,
  Checkins,
  Exercise,
  FatigueAnalysisReport,
  FatigueLoadMetrics,
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
  const activities = (await fetchIntervalsActivities(settings, date, date)).filter((activity) =>
    isSameLocalDate(activity, date),
  );

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

  const events = plans.map((plan) => buildIntervalsPlanEvent(plan, settings.ftp));
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
    throw new Error(`Intervals.icu 写入计划失败：${response.status} ${response.statusText}`);
  }

  const payload = await response.json().catch(() => []);
  const returnedEvents = Array.isArray(payload) ? payload : [];
  return {
    requested: events.length,
    synced: returnedEvents.length || events.length,
    events: returnedEvents,
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
    throw new Error(`Intervals.icu 同步失败：${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  return normalizeActivities(payload);
}

function getIntervalsBase(settings: SettingsState) {
  return (settings.intervalsApiBase || "https://intervals.icu/api/v1").replace(/\/$/, "");
}

function getIntervalsAthleteId(settings: SettingsState) {
  if (!settings.intervalsApiKey?.trim() || !settings.intervalsAthleteId?.trim()) {
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

function buildIntervalsPlanEvent(plan: PlanDay, ftp: number): IntervalsPlanEvent {
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
    (hasRide ? plan.durationMinutes ?? 0 : inferStrengthMinutes(plan.strengthDurationLabel)) * 60;
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
      const line = `${segment.repeat ? `${segment.repeat}x ` : ""}${segment.durationMinutes ?? ""}m ${target} ${segment.name}`.trim();
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
    return ["10m 55%", "Main set 3x", `${8}m ${target}`, "4m 50%", `${cooldown}m 55%`];
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
    ? ((plan.powerRange[0] + plan.powerRange[1]) / 2) / ftp
    : plan.kind === "threshold"
      ? 0.95
      : plan.kind === "sweetspot"
        ? 0.9
        : plan.kind === "z2" || plan.kind === "aerobic"
          ? 0.68
          : plan.kind === "recovery"
            ? 0.55
            : 0.5;
  const load = Math.round((plan.durationMinutes / 60) * intensity * intensity * 100);
  return plan.exercises?.length ? load + 15 : load;
}

function inferStrengthMinutes(value?: string) {
  const numbers = (value ?? "")
    .match(/\d+/g)
    ?.map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
  if (!numbers?.length) return 25;
  return Math.round(numbers.reduce((sum, item) => sum + item, 0) / numbers.length);
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
    "输出必须是纯 JSON，不要 Markdown，不要代码块。",
    'JSON 格式：{"message":"给用户看的简短中文回复","planPatch":{"summary":"修改摘要","scope":"day|week","changes":[{"date":"YYYY-MM-DD","after":{"title":"训练标题","kind":"recovery|z2|aerobic|sweetspot|threshold|rest","durationMinutes":60,"durationLabel":"60分钟","powerRange":[110,125],"segments":[{"name":"热身","durationMinutes":10,"targetPowerRange":[90,110]},{"name":"主训练","durationMinutes":8,"targetPowerRange":[155,162],"repeat":3,"recoveryMinutes":4,"recoveryPowerRange":[85,100]},{"name":"冷身","durationMinutes":10,"targetPowerRange":[85,100]}],"rideDetails":"骑行说明","exercises":[{"name":"动作","sets":3,"reps":"8-12次"}],"strengthDurationLabel":"20-25分钟","notes":"备注","nutrition":"饮食提示"},"reason":"为什么这么改"}]}}}',
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
    JSON.stringify(messages.slice(-8).map(({ role, content }) => ({ role, content }))),
    "用户问题：",
    question,
  ].join("\n");

  const content = await requestOpenAiCompatibleChat({
    settings,
    prompt,
    temperature: 0.35,
    system:
      "你是克制的训练顾问。回答要短，计划修改必须放在结构化 planPatch 中；不确定时先说明假设和风险。",
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
  if (!String(content).trim()) throw new Error("AI 返回为空，请检查供应商接口格式。");
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
      sanitizeAiPlanDay(
        findAiDay(rawDays, basePlan.date, index),
        basePlan,
      ),
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

function parseAiCoachReply(content: string, weekPlans: PlanDay[]): AiCoachReply {
  const parsed = extractJson(content);
  if (!parsed) {
    return {
      rawText: content,
      message: content,
    };
  }

  const record = Array.isArray(parsed)
    ? ({ message: "", planPatch: { changes: parsed } } as Record<string, unknown>)
    : (parsed as Record<string, unknown>);
  const message =
    stringValue(record.message) ||
    stringValue(record.reply) ||
    stringValue(record.content) ||
    "我看完了当前训练记录。";
  const patchRecord = asRecord(record.planPatch ?? record.patch);
  const rawChanges =
    asArray(patchRecord?.changes) ??
    asArray(patchRecord?.days) ??
    asArray(record.changes) ??
    asArray(record.days) ??
    [];
  const changes = rawChanges
    .map((item) => sanitizePatchChange(item, weekPlans))
    .filter(Boolean) as AiPlanPatch["changes"];

  return {
    rawText: content,
    message,
    planPatch: changes.length
      ? {
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
        }
      : undefined,
  };
}

function sanitizePatchChange(input: unknown, weekPlans: PlanDay[]) {
  const record = asRecord(input);
  if (!record) return undefined;
  const date = stringValue(record.date);
  const before = weekPlans.find((plan) => plan.date === date);
  if (!before) return undefined;
  const after = sanitizeAiPlanDay(record.after ?? record.plan ?? record, before);
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

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) {
      try {
        return JSON.parse(fenced);
      } catch {
        // Continue with loose object extraction below.
      }
    }
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function findAiDay(days: unknown[], date: string, index: number) {
  const exact = days.find((day) => {
    const record = asRecord(day);
    return stringValue(record?.date) === date;
  });
  return exact ?? days[index];
}

function sanitizeAiPlanDay(input: unknown, basePlan: PlanDay): PlanDay | undefined {
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
    segments: plan.segments?.length ? plan.segments : buildDefaultSegmentsForPlan(plan),
  };
}

function normalizeTrainingKind(value: unknown): TrainingKind | undefined {
  const text = String(value ?? "").toLowerCase().trim();
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
  const actualMinutes = actualSeconds ? Math.round(actualSeconds / 60) : undefined;
  const weightedPower = weightedAverage(
    activities,
    (activity) => Number(activity.average_watts ?? activity.avg_watts ?? 0),
    (activity) => Number(activity.moving_time ?? activity.elapsed_time ?? 0),
  );
  const distanceMeters = sum(activities, (activity) => Number(activity.distance ?? 0));
  const trainingLoad = sum(activities, (activity) =>
    Number(activity.icu_training_load ?? activity.training_load ?? 0),
  );
  const targetPower = plan.powerRange
    ? (plan.powerRange[0] + plan.powerRange[1]) / 2
    : undefined;
  const durationDiff = plannedMinutes && actualMinutes
    ? Math.abs(actualMinutes - plannedMinutes) / plannedMinutes
    : 0;
  const powerDiff = targetPower && weightedPower
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
    distanceKm: distanceMeters ? Number((distanceMeters / 1000).toFixed(1)) : undefined,
    trainingLoad: trainingLoad ? Math.round(trainingLoad) : undefined,
    differencePercent,
    summary,
    suggestion: buildDifferenceSuggestion(differencePercent, plannedMinutes, actualMinutes),
  };
}

function buildDifferenceSuggestion(
  differencePercent: number,
  plannedMinutes?: number,
  actualMinutes?: number,
) {
  if (!actualMinutes) return "没有活动数据，先确认当天是否已同步到 Intervals.icu。";
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
