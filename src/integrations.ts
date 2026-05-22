import {
  ActivityAnalysis,
  PlanDay,
  SettingsState,
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

export async function syncIntervalsAnalysis({
  settings,
  date,
  plan,
}: {
  settings: SettingsState;
  date: string;
  plan: PlanDay;
}) {
  if (!settings.intervalsApiKey?.trim() || !settings.intervalsAthleteId?.trim()) {
    throw new Error("请先在设置里填写 Intervals.icu Athlete ID 和 API Key。");
  }

  const base = (settings.intervalsApiBase || "https://intervals.icu/api/v1").replace(/\/$/, "");
  const params = new URLSearchParams({ oldest: date, newest: date });
  const url = `${base}/athlete/${encodeURIComponent(settings.intervalsAthleteId.trim())}/activities?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${btoa(`API_KEY:${settings.intervalsApiKey.trim()}`)}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Intervals.icu 同步失败：${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const activities = normalizeActivities(payload).filter((activity) =>
    isSameLocalDate(activity, date),
  );

  return buildActivityAnalysis(date, plan, activities);
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

  const prompt = [
    "你是一个偏保守的骑行训练助手。请基于用户最近的训练分析摘要，为下一周给出训练计划和饮食建议。",
    "用户目标：减脂 + 提升功率。当前 FTP：" + settings.ftp + "W。",
    "要求：中文，简洁，按周一到周日输出；每一天包含训练类型、时长、目标功率或力量内容、饮食重点；不要建议过度训练；如果数据不足，要明确说明。",
    "当前周计划：",
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

  const response = await fetch(settings.aiEndpoint.trim(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.aiApiKey.trim()}`,
    },
    body: JSON.stringify({
      model: settings.aiModel?.trim() || "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "你只提供个人训练记录辅助建议，不替代医疗建议。回答要可执行、克制、手机屏幕友好。",
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
