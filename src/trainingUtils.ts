import {
  PlanDay,
  PlanSegment,
  TrainingKind,
  TrainingTemplate,
  buildDefaultSegmentsForPlan,
  materializeTemplate,
} from "./model";

export function labelKind(kind: TrainingKind) {
  return {
    recovery: "恢复",
    z2: "Z2",
    aerobic: "有氧",
    sweetspot: "甜区",
    threshold: "阈值",
    rest: "休息",
    strength: "力量"
  }[kind];
}

export function withCurrentPower(plan: PlanDay, ftp: number, templates: TrainingTemplate[]) {
  const template = templates.find((item) => item.id === plan.templateId);
  const next = template?.rangePercent
    ? { ...plan, powerRange: materializeTemplate(template, plan.date, ftp).powerRange }
    : plan;
  return next.segments?.length
    ? next
    : { ...next, segments: buildDefaultSegmentsForPlan(next) };
}

export function buildNutritionTips(plan: PlanDay) {
  const isHardRide = plan.kind === "sweetspot" || plan.kind === "threshold" || plan.templateId === "saturday-long-z2";
  const isEasyRide = plan.kind === "recovery" || plan.kind === "z2" || plan.kind === "aerobic";
  const hasStrength = Boolean(plan.exercises?.length);

  if (plan.kind === "rest" && !hasStrength) {
    return [
      { label: "训练前", value: "无需刻意加餐，保持正常饮食。" },
      { label: "训练后", value: "保证蛋白质，晚餐简单清淡即可。" },
      { label: "蛋白质", value: "鸡蛋、豆腐、牛肉、虾、猪里脊都可以轮换。" }
    ];
  }

  return [
    {
      label: "训练前",
      value: isHardRide
        ? "补20-40g碳水，例如香蕉、面包或少量米饭。"
        : isEasyRide
          ? "可少吃，半根到1根香蕉即可。"
          : "力量训练前不必吃太多，空腹不舒服就加半根香蕉。"
    },
    {
      label: "训练后",
      value: "补20-35g蛋白质，加适量主食。"
    },
    {
      label: "晚餐",
      value: hasStrength
        ? "优先蛋白质和主食都到位，别把力量日吃得太低。"
        : "30分钟内解决，蛋白质来源可用牛肉、虾、猪里脊、鸡蛋或豆腐。"
    }
  ];
}

export function formatRangePercent(range?: [number, number]) {
  if (!range) return "";
  return `${Math.round(range[0] * 100)}-${Math.round(range[1] * 100)}`;
}

export function parseRangePercent(value: string): [number, number] | undefined {
  const [low, high] = value
    .split(/[-,，\s]+/)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
  if (!low || !high) return undefined;
  return [low / 100, high / 100];
}

export function formatExercises(exercises?: { name: string; sets: number; reps: string }[]) {
  return (exercises ?? []).map((item) => `${item.name} | ${item.sets} | ${item.reps}`).join("\n");
}

export function parseExercises(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", sets = "3", reps = "8-10"] = line.split("|").map((item) => item.trim());
      return { name, sets: Number(sets) || 3, reps };
    });
}

export function formatSegments(segments?: PlanSegment[]) {
  return (segments ?? [])
    .map((segment) =>
      [
        segment.name,
        segment.durationMinutes ?? "",
        formatPowerRange(segment.targetPowerRange),
        segment.repeat ?? "",
        segment.recoveryMinutes ?? "",
        formatPowerRange(segment.recoveryPowerRange),
        segment.notes ?? "",
      ].join(" | "),
    )
    .join("\n");
}

export function parseSegments(value: string) {
  const segments = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [
        name = "",
        duration = "",
        target = "",
        repeat = "",
        recovery = "",
        recoveryTarget = "",
        notes = "",
      ] = line.split("|").map((item) => item.trim());
      return {
        name: name || "训练段",
        durationMinutes: parsePositiveNumber(duration),
        targetPowerRange: parsePowerRange(target),
        repeat: parsePositiveNumber(repeat),
        recoveryMinutes: parsePositiveNumber(recovery),
        recoveryPowerRange: parsePowerRange(recoveryTarget),
        notes,
      };
    });
  return segments.length ? segments : undefined;
}

export function formatSegmentSummary(segments?: PlanSegment[]) {
  if (!segments?.length) return "";
  const total = segments.reduce((sum, segment) => {
    const work = segment.durationMinutes ?? 0;
    const repeat = segment.repeat ?? 1;
    const recovery = segment.recoveryMinutes
      ? segment.recoveryMinutes * Math.max(repeat - 1, 0)
      : 0;
    return sum + work * repeat + recovery;
  }, 0);
  return `${segments.length}段${total ? ` · 约${total}分钟` : ""}`;
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function formatPowerRange(range?: [number, number]) {
  return range ? `${range[0]}-${range[1]}W` : "";
}

function parsePowerRange(value: string): [number, number] | undefined {
  const [low, high] = value
    .replace(/[wW瓦]/g, "")
    .split(/[-,，\s]+/)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
  if (!low || !high) return undefined;
  return [Math.round(low), Math.round(high)];
}

export function buildTemplatePreset(
  kind: TrainingKind,
  hasStrength: boolean,
): Partial<TrainingTemplate> {
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
      nutrition:
        "恢复/Z2：出门前可少吃，半根到1根香蕉即可。训练后补20-35g蛋白质，加适量主食。",
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

export function defaultStrengthExercises() {
  return [
    { name: "徒手深蹲", sets: 3, reps: "8-12次" },
    { name: "墙壁/桌边俯卧撑", sets: 3, reps: "6-10次" },
    { name: "臀桥", sets: 3, reps: "12-15次" },
    { name: "死虫", sets: 2, reps: "6次/边" },
    { name: "平板支撑", sets: 2, reps: "20-30秒" },
  ];
}
