import type { PickerOption } from "../../components/PickerField";
import { SUPPORTED_CHATGPT_MODELS } from "../../model";

export const TRAINING_KIND_OPTIONS: PickerOption[] = [
  { label: "恢复", value: "recovery" },
  { label: "Z2", value: "z2" },
  { label: "有氧", value: "aerobic" },
  { label: "甜区", value: "sweetspot" },
  { label: "阈值", value: "threshold" },
  { label: "休息", value: "rest" },
];

export const FEELING_OPTIONS: PickerOption[] = [
  { label: "未记录", value: "" },
  { label: "轻松", value: "easy" },
  { label: "正常", value: "normal" },
  { label: "累", value: "tired" },
  { label: "很累", value: "very-tired" },
];

export const RPE_OPTIONS: PickerOption[] = [
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

export const STRATEGY_OPTIONS: PickerOption[] = [
  { label: "保守", value: "conservative" },
  { label: "平衡", value: "balanced" },
  { label: "积极", value: "active" },
  { label: "激进", value: "aggressive" },
];

export const GOAL_FOCUS_OPTIONS: PickerOption[] = [
  { label: "减脂优先", value: "fat-loss" },
  { label: "功率提升优先", value: "power" },
  { label: "均衡推进", value: "balanced" },
  { label: "恢复调整", value: "recovery" },
];

export const CHATGPT_MODEL_OPTIONS: PickerOption[] = [
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

export const POWER_WATT_OPTIONS: PickerOption[] = Array.from(
  { length: 401 },
  (_, index) => ({
    label: `${index}W`,
    value: String(index),
  }),
);

export const FTP_PERCENT_OPTIONS: PickerOption[] = Array.from(
  { length: 181 },
  (_, index) => ({
    label: `${index + 20}%`,
    value: String(index + 20),
  }),
);
