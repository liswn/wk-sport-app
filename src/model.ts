export type TrainingKind =
  | "recovery"
  | "z2"
  | "aerobic"
  | "sweetspot"
  | "threshold"
  | "rest"
  | "strength";

export type Exercise = {
  name: string;
  sets: number;
  reps: string;
};

export type PlanSegment = {
  name: string;
  durationMinutes?: number;
  targetPowerRange?: [number, number];
  repeat?: number;
  recoveryMinutes?: number;
  recoveryPowerRange?: [number, number];
  notes?: string;
};

export type PlanDay = {
  date: string;
  templateId?: string;
  title: string;
  kind: TrainingKind;
  durationMinutes?: number;
  durationLabel?: string;
  powerRange?: [number, number];
  segments?: PlanSegment[];
  rideDetails?: string;
  exercises?: Exercise[];
  strengthDurationLabel?: string;
  notes?: string;
  nutrition?: string;
};

export type TrainingTemplate = Omit<PlanDay, "date" | "powerRange"> & {
  id: string;
  name: string;
  rangePercent?: [number, number];
};

export type BodyEntry = {
  date: string;
  weightKg: string;
  bodyFat?: string;
  waistCm?: string;
  chestCm?: string;
  notes?: string;
};

export type Checkins = {
  trainingDone?: boolean;
  proteinDone?: boolean;
  dinnerControlled?: boolean;
  earlySleep?: boolean;
};

export type TrainingLog = {
  date: string;
  actualMinutes?: string;
  averagePower?: string;
  rpe?: string;
  feeling?: "easy" | "normal" | "tired" | "very-tired";
  notes?: string;
};

export type ActivityAnalysis = {
  date: string;
  syncedAt: string;
  activityCount: number;
  plannedTitle: string;
  plannedKind: TrainingKind;
  plannedMinutes?: number;
  plannedPowerRange?: [number, number];
  actualMinutes?: number;
  averagePower?: number;
  distanceKm?: number;
  trainingLoad?: number;
  differencePercent: number;
  summary: string;
  suggestion: string;
};

export type DayMemo = {
  date: string;
  text: string;
};

export type FatigueLoadMetrics = {
  latestTss?: number;
  latestTssDate?: string;
  last7Tss?: number;
  currentWeekTss?: number;
  previousWeekTss?: number;
  weeklyTss: Array<{ weekStart: string; tss: number }>;
  ctl?: number;
  atl?: number;
  tsb?: number;
  status: string;
  nextTraining: string;
  dataDays: number;
  loadDays: number;
};

export type FatigueAnalysisReport = {
  date: string;
  generatedAt: string;
  rangeStart: string;
  rangeEnd: string;
  metrics?: FatigueLoadMetrics;
  content: string;
};

export type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type AiPlanPatch = {
  id: string;
  createdAt: string;
  scope: "day" | "week";
  summary: string;
  changes: Array<{
    date: string;
    before: PlanDay;
    after: PlanDay;
    reason?: string;
  }>;
  appliedAt?: string;
};

export type AiCoachSession = {
  messages: AiChatMessage[];
  pendingPatch?: AiPlanPatch;
  updatedAt: string;
};

export type SettingsState = {
  ftp: number;
  heightCm?: string;
  goalText?: string;
  strategyLevel?: "conservative" | "balanced" | "active" | "aggressive";
  goalFocus?: "fat-loss" | "power" | "balanced" | "recovery";
  intervalsApiBase?: string;
  intervalsAthleteId?: string;
  intervalsApiKey?: string;
  aiEndpoint?: string;
  aiApiKey?: string;
  aiModel?: string;
  lastBackupAt?: string;
};

export const DEFAULT_AI_MODEL = "gpt-5.5";
export const SUPPORTED_CHATGPT_MODELS = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-4o",
  "gpt-4o-mini",
] as const;

export type AppData = {
  settings: SettingsState;
  plans: Record<string, PlanDay>;
  bodyEntries: Record<string, BodyEntry>;
  checkins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  activityAnalyses: Record<string, ActivityAnalysis>;
  dayMemos: Record<string, DayMemo>;
  lastFatigueReport?: FatigueAnalysisReport;
  aiCoachSession?: AiCoachSession;
  trainingTemplates: TrainingTemplate[];
};

export const DEFAULT_SETTINGS: SettingsState = {
  ftp: 175,
  goalText:
    "目标：减脂 + 提升骑行功率\n周期：未来 8-12 周\n当前 FTP：175W\n训练时间：工作日早上约 60 分钟，周末 75-90 分钟\n训练偏好：以骑行为主，每周 2 次新手力量训练\n身体目标：更关注体重 7 日均值和腰围趋势，不追求单日波动\n饮食原则：保证蛋白质，训练日前后不极端控碳，晚餐尽量 30 分钟内完成\n限制：不希望过度疲劳，优先长期可持续",
  strategyLevel: "balanced",
  goalFocus: "balanced",
  intervalsApiBase: "https://intervals.icu/api/v1",
  aiEndpoint: "",
  aiModel: DEFAULT_AI_MODEL
};

const recoveryNutrition = "恢复/Z2：出门前可少吃，半根到1根香蕉即可。训练后补20-35g蛋白质，加适量主食。";
const hardNutrition = "甜区/长骑：出门前补20-40g碳水。训练后补20-35g蛋白质，加适量主食；减脂期不要把训练日前后的碳水砍太狠。";

export const defaultTrainingTemplates: TrainingTemplate[] = [
  {
    id: "monday-recovery",
    name: "周一 恢复骑",
    templateId: "monday-recovery",
    title: "恢复骑",
    kind: "recovery",
    durationMinutes: 45,
    durationLabel: "40-50分钟",
    rangePercent: [85 / 175, 100 / 175],
    rideDetails: "轻松恢复，目标85-100W。",
    notes: "早上轻松转腿，保持能完整说话。",
    nutrition: recoveryNutrition
  },
  {
    id: "tuesday-z2",
    name: "周二 Z2 60分钟",
    templateId: "tuesday-z2",
    title: "Z2耐力",
    kind: "z2",
    durationMinutes: 60,
    durationLabel: "60分钟",
    rangePercent: [110 / 175, 125 / 175],
    rideDetails: "稳定耐力骑，目标110-125W。",
    notes: "工作日早训主课，控制强度，不追速度。",
    nutrition: recoveryNutrition
  },
  {
    id: "wednesday-light-strength-a",
    name: "周三 轻松骑 + 力量A",
    templateId: "wednesday-light-strength-a",
    title: "轻松骑 + 力量A",
    kind: "recovery",
    durationMinutes: 25,
    durationLabel: "不骑或20-30分钟",
    rangePercent: [85 / 175, 95 / 175],
    rideDetails: "可不骑；如果骑，保持85-95W轻松恢复。",
    strengthDurationLabel: "20-25分钟",
    exercises: [
      { name: "徒手深蹲", sets: 3, reps: "8-12次" },
      { name: "墙壁/桌边俯卧撑", sets: 3, reps: "6-10次" },
      { name: "臀桥", sets: 3, reps: "12-15次" },
      { name: "死虫", sets: 2, reps: "6次/边" },
      { name: "平板支撑", sets: 2, reps: "20-30秒" }
    ],
    notes: "力量训练新手阶段，动作质量优先，不做到力竭。",
    nutrition: recoveryNutrition
  },
  {
    id: "thursday-sweetspot",
    name: "周四 甜区3x8",
    templateId: "thursday-sweetspot",
    title: "甜区 3x8分钟",
    kind: "sweetspot",
    durationMinutes: 60,
    durationLabel: "约60分钟",
    rangePercent: [155 / 175, 162 / 175],
    rideDetails: "3x8分钟，目标155-162W，组间4分钟轻松骑。",
    notes: "不要第一组冲太高，后两组保持稳定。",
    nutrition: hardNutrition
  },
  {
    id: "friday-recovery-rest",
    name: "周五 恢复骑或休息",
    templateId: "friday-recovery-rest",
    title: "恢复骑或休息",
    kind: "recovery",
    durationMinutes: 40,
    durationLabel: "30-45分钟或休息",
    rangePercent: [85 / 175, 100 / 175],
    rideDetails: "如果疲劳就直接休息；如果骑，保持85-100W。",
    notes: "看疲劳程度决定，不为了打卡硬骑。",
    nutrition: recoveryNutrition
  },
  {
    id: "saturday-long-z2",
    name: "周六 长Z2",
    templateId: "saturday-long-z2",
    title: "长Z2",
    kind: "z2",
    durationMinutes: 90,
    durationLabel: "75-90分钟",
    rangePercent: [110 / 175, 125 / 175],
    rideDetails: "长耐力骑，目标110-125W。",
    notes: "重点是稳定输出和补给，不追短时间高功率。",
    nutrition: hardNutrition
  },
  {
    id: "sunday-easy-strength-b",
    name: "周日 轻松骑 + 力量B",
    templateId: "sunday-easy-strength-b",
    title: "轻松骑或休息 + 力量B",
    kind: "recovery",
    durationMinutes: 30,
    durationLabel: "30分钟或休息",
    rangePercent: [90 / 175, 105 / 175],
    rideDetails: "可休息；如果骑，保持90-105W。",
    strengthDurationLabel: "20-25分钟",
    exercises: [
      { name: "分腿蹲", sets: 3, reps: "6-8次/边" },
      { name: "背包划船", sets: 3, reps: "8-12次" },
      { name: "臀桥", sets: 3, reps: "12-15次" },
      { name: "鸟狗", sets: 2, reps: "6次/边" },
      { name: "侧平板", sets: 2, reps: "15-20秒/边" }
    ],
    notes: "如果周六长骑后疲劳，骑行部分直接取消也可以。",
    nutrition: recoveryNutrition
  },
  {
    id: "threshold",
    name: "阈值训练",
    templateId: "threshold",
    title: "阈值训练",
    kind: "threshold",
    durationMinutes: 55,
    durationLabel: "约55分钟",
    rangePercent: [166 / 175, 172 / 175],
    rideDetails: "目标166-172W，作为后续替换课使用。",
    notes: "先保留为模板，不放入当前固定周计划。",
    nutrition: hardNutrition
  },
  {
    id: "rest",
    name: "休息",
    templateId: "rest",
    title: "休息",
    kind: "rest",
    notes: "睡眠、拉伸、散步即可。晚餐保持简单，30分钟内完成。",
    nutrition: "休息日也保证蛋白质，晚餐简单清淡即可。"
  }
];

export const weeklyTemplateIds = [
  "monday-recovery",
  "tuesday-z2",
  "wednesday-light-strength-a",
  "thursday-sweetspot",
  "friday-recovery-rest",
  "saturday-long-z2",
  "sunday-easy-strength-b"
];

export function createBlankTemplate(): TrainingTemplate {
  const id = `custom-${Date.now()}`;
  return {
    id,
    name: "自定义训练",
    templateId: id,
    title: "自定义训练",
    kind: "z2",
    durationMinutes: 60,
    durationLabel: "60分钟",
    rangePercent: [110 / 175, 125 / 175],
    notes: ""
  };
}

export function getTemplate(id: string, ftp: number, templates: TrainingTemplate[]): PlanDay {
  const template = templates.find((item) => item.id === id) ?? templates[0] ?? defaultTrainingTemplates[1];
  return materializeTemplate(template, "", ftp);
}

export function defaultPlanForDate(date: string, ftp: number, templates: TrainingTemplate[]): PlanDay {
  const weekday = new Date(`${date}T00:00:00`).getDay();
  const mondayFirstIndex = weekday === 0 ? 6 : weekday - 1;
  const templateId = weeklyTemplateIds[mondayFirstIndex];
  const template =
    templates.find((item) => item.id === templateId) ??
    defaultTrainingTemplates.find((item) => item.id === templateId) ??
    defaultTrainingTemplates[1];
  return materializeTemplate(template, date, ftp);
}

export function materializeTemplate(template: TrainingTemplate, date: string, ftp: number): PlanDay {
  const powerRange = template.rangePercent
    ? ([Math.round(template.rangePercent[0] * ftp), Math.round(template.rangePercent[1] * ftp)] as [number, number])
    : undefined;
  const plan = {
    date,
    templateId: template.id,
    title: template.title,
    kind: template.kind,
    durationMinutes: template.durationMinutes,
    durationLabel: template.durationLabel,
    powerRange,
    segments: template.segments,
    rideDetails: template.rideDetails,
    exercises: template.exercises,
    strengthDurationLabel: template.strengthDurationLabel,
    notes: template.notes,
    nutrition: template.nutrition
  };
  return {
    ...plan,
    segments: plan.segments?.length ? plan.segments : buildDefaultSegmentsForPlan(plan),
  };
}

export function buildDefaultSegmentsForPlan(plan: Pick<PlanDay, "kind" | "durationMinutes" | "powerRange">): PlanSegment[] | undefined {
  const duration = plan.durationMinutes ?? 0;
  if (plan.kind === "rest" || duration <= 0) return undefined;
  const target = plan.powerRange;
  const easy: [number, number] = [85, 100];
  const warmup = Math.min(12, Math.max(8, Math.round(duration * 0.18)));
  const cooldown = Math.min(10, Math.max(5, Math.round(duration * 0.12)));

  if (plan.kind === "sweetspot") {
    return [
      { name: "热身", durationMinutes: 12, targetPowerRange: [90, 115], notes: "逐步提高踏频和功率" },
      {
        name: "甜区主训练",
        durationMinutes: 8,
        targetPowerRange: target,
        repeat: 3,
        recoveryMinutes: 4,
        recoveryPowerRange: easy,
        notes: "3x8分钟，组间轻松骑",
      },
      { name: "冷身", durationMinutes: 10, targetPowerRange: easy },
    ];
  }

  if (plan.kind === "threshold") {
    return [
      { name: "热身", durationMinutes: 12, targetPowerRange: [90, 120], notes: "包含2-3次短促唤醒" },
      {
        name: "阈值主训练",
        durationMinutes: 10,
        targetPowerRange: target,
        repeat: 2,
        recoveryMinutes: 5,
        recoveryPowerRange: easy,
        notes: "控制输出，不冲过头",
      },
      { name: "冷身", durationMinutes: 10, targetPowerRange: easy },
    ];
  }

  const main = Math.max(duration - warmup - cooldown, 10);
  return [
    { name: "热身", durationMinutes: warmup, targetPowerRange: easy },
    { name: labelSegmentMain(plan.kind), durationMinutes: main, targetPowerRange: target },
    { name: "冷身", durationMinutes: cooldown, targetPowerRange: easy },
  ];
}

function labelSegmentMain(kind: TrainingKind) {
  return {
    recovery: "轻松恢复",
    z2: "Z2稳定骑",
    aerobic: "有氧稳定骑",
    sweetspot: "甜区主训练",
    threshold: "阈值主训练",
    rest: "休息",
    strength: "力量训练",
  }[kind];
}
