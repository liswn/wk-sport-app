import { PlanDay, TrainingKind, TrainingTemplate, materializeTemplate } from "./model";

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
  if (!template?.rangePercent) return plan;
  return { ...plan, powerRange: materializeTemplate(template, plan.date, ftp).powerRange };
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
