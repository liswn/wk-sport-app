import { useMemo } from "react";
import type { BodyEntry } from "../../model";
import { TrendChart } from "../../components/TrendChart";
import {
  addDays,
  dateKey,
  formatMonthDay,
  getWeekDays,
  todayKey,
} from "../../time";
import { BMI_RANGES, calculateBmi, getBmiInfo } from "./bodyMetrics";

export function BodyStats({ entries }: { entries: Record<string, BodyEntry> }) {
  const points = useMemo(
    () =>
      Object.values(entries)
        .filter(
          (entry) => Number(entry.weightKg) > 0 || Number(entry.waistCm) > 0,
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    [entries],
  );

  return (
    <>
      <div className="panel">
        <h2>体重趋势</h2>
        <TrendChart entries={points} field="weightKg" average />
      </div>
      <div className="panel">
        <h2>腰围趋势</h2>
        <TrendChart entries={points} field="waistCm" />
      </div>
    </>
  );
}

export function WeekDatePicker({
  selectedDate,
  entries,
  onSelect,
}: {
  selectedDate: string;
  entries: Record<string, BodyEntry>;
  onSelect: (date: string) => void;
}) {
  const selected = new Date(`${selectedDate}T00:00:00`);
  const week = getWeekDays(selected);

  return (
    <div className="week-date-picker">
      <div className="week-switch compact">
        <button
          type="button"
          onClick={() => onSelect(dateKey(addDays(selected, -7)))}
        >
          上一周
        </button>
        <strong>
          {formatMonthDay(week[0])} - {formatMonthDay(week[6])}
        </strong>
        <button
          type="button"
          onClick={() => onSelect(dateKey(addDays(selected, 7)))}
        >
          下一周
        </button>
      </div>
      <div className="week-date-row">
        {week.map((day) => {
          const key = dateKey(day);
          const entry = entries[key];
          const hasBodyData = Boolean(
            entry &&
              (entry.weightKg || entry.waistCm || entry.bodyFat || entry.chestCm),
          );
          return (
            <button
              key={key}
              type="button"
              className={[
                key === selectedDate ? "active" : "",
                key === todayKey() ? "today" : "",
                hasBodyData ? "has-data" : "",
              ].join(" ")}
              onClick={() => onSelect(key)}
            >
              <span>
                {new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(
                  day,
                )}
              </span>
              <strong>{day.getDate()}</strong>
              <i />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BmiPanel({
  weightKg,
  heightCm,
}: {
  weightKg?: string;
  heightCm?: string;
}) {
  const bmi = calculateBmi(weightKg, heightCm);
  const info = bmi ? getBmiInfo(bmi) : undefined;

  return (
    <div className={`bmi-panel ${info?.level ?? ""}`}>
      <div>
        <span>BMI</span>
        <strong>{bmi ? bmi.toFixed(1) : "待计算"}</strong>
      </div>
      <p>
        {bmi
          ? `${info?.label}，${info?.hint}`
          : "在设置里录入身高，并在当天记录体重后自动计算。"}
      </p>
      <div className="bmi-ranges" aria-label="BMI 区间">
        {BMI_RANGES.map((range) => (
          <span
            key={range.level}
            className={info?.level === range.level ? "active" : ""}
          >
            {range.label}
            <em>{range.text}</em>
          </span>
        ))}
      </div>
    </div>
  );
}
