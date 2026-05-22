import { useMemo, useState } from "react";
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { BodyEntry } from "../model";
import { addDays, dateKey, todayKey } from "../time";
import { getRecentMonths, getRecentWeeks, getRecentYears, periodKey } from "../calendarUtils";

export type TrendDimension = "day" | "week" | "month" | "year";

type TrendPoint = {
  key: string;
  label: string;
  value: number | null;
  average?: number | null;
};

export function TrendChart({
  entries,
  field,
  average = false
}: {
  entries: BodyEntry[];
  field: "weightKg" | "waistCm";
  average?: boolean;
}) {
  const [dimension, setDimension] = useState<TrendDimension>("day");
  const chartData = useMemo(
    () => buildTrendData(entries, field, dimension),
    [dimension, entries, field]
  );
  const validValues = chartData.flatMap((point) => {
    const values = typeof point.value === "number" ? [point.value] : [];
    if (average && typeof point.average === "number") values.push(point.average);
    return values;
  });

  if (validValues.length < 2) {
    return (
      <div className="chart-card">
        <TrendDimensionControl value={dimension} onChange={setDimension} />
        <div className="empty-chart">至少记录 2 个时间点后显示趋势。</div>
      </div>
    );
  }

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const pad = Math.max((max - min) * 0.16, 0.8);
  const unit = field === "weightKg" ? "kg" : "cm";
  const brushStart = dimension === "day" ? Math.max(0, chartData.length - 7) : 0;
  const brushEnd = chartData.length - 1;

  return (
    <div className="chart-card">
      <TrendDimensionControl value={dimension} onChange={setDimension} />
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={dimension === "day" ? 250 : 224}>
          <ComposedChart
            key={`${field}-${dimension}-${chartData.length}`}
            data={chartData}
            margin={{ top: 12, right: 8, bottom: dimension === "day" ? 26 : 0, left: -18 }}
          >
            <defs>
              <linearGradient id={`fill-${field}-${dimension}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="8%" stopColor="#2c7a7b" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#2c7a7b" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e5e9e1" strokeDasharray="3 5" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#7c8581", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[Math.floor((min - pad) * 10) / 10, Math.ceil((max + pad) * 10) / 10]}
              tick={{ fill: "#7c8581", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              contentStyle={{
                border: "1px solid #dfe4dc",
                borderRadius: 8,
                boxShadow: "none",
                fontSize: 12
              }}
              labelFormatter={(label) => `${dimensionLabel(dimension)} ${label}`}
              formatter={(value, name) => [
                `${Number(value).toFixed(1)}${unit}`,
                name === "average" ? "7日平均" : field === "weightKg" ? "体重" : "腰围"
              ]}
            />
            <Area
              type="monotone"
              dataKey="value"
              connectNulls
              stroke="#2c7a7b"
              strokeWidth={2.6}
              fill={`url(#fill-${field}-${dimension})`}
              dot={{ r: 3, strokeWidth: 2, fill: "#ffffff" }}
              activeDot={{ r: 5 }}
            />
            {average && dimension === "day" && (
              <Line
                type="monotone"
                dataKey="average"
                connectNulls
                stroke="#d99a2b"
                strokeWidth={2.4}
                dot={false}
                strokeDasharray="5 4"
              />
            )}
            {dimension === "day" && (
              <Brush
                dataKey="label"
                height={24}
                travellerWidth={10}
                startIndex={brushStart}
                endIndex={brushEnd}
                stroke="#2c7a7b"
                fill="#f7f7f2"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        {average && dimension === "day" && <p className="muted">深色线为每日体重，浅色线为 7 日平均；拖动底部滑块查看其它日期。</p>}
        {dimension !== "day" && <p className="muted">{dimensionSummary(dimension)}，数值为该时间段内记录的平均值。</p>}
      </div>
    </div>
  );
}

function TrendDimensionControl({
  value,
  onChange
}: {
  value: TrendDimension;
  onChange: (value: TrendDimension) => void;
}) {
  const items = [
    ["day", "天"],
    ["week", "周"],
    ["month", "月"],
    ["year", "年"]
  ] as const;

  return (
    <div className="trend-switch">
      {items.map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={value === key ? "active" : ""}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function buildTrendData(entries: BodyEntry[], field: "weightKg" | "waistCm", dimension: TrendDimension): TrendPoint[] {
  if (dimension === "day") return buildDailyTrendData(entries, field);
  if (dimension === "week") return buildGroupedTrendData(entries, field, getRecentWeeks(10), "week");
  if (dimension === "month") return buildGroupedTrendData(entries, field, getRecentMonths(12), "month");
  return buildGroupedTrendData(entries, field, getRecentYears(5), "year");
}

function buildDailyTrendData(entries: BodyEntry[], field: "weightKg" | "waistCm"): TrendPoint[] {
  const valueByDate = new Map(
    entries
      .map((entry) => [entry.date, Number(entry[field])] as const)
      .filter(([, value]) => value > 0)
  );
  if (valueByDate.size === 0) return [];

  const dates = [...valueByDate.keys()].sort();
  const start = new Date(`${dates[0]}T00:00:00`);
  const end = new Date(`${todayKey()}T00:00:00`);
  const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

  return Array.from({ length: dayCount }, (_, index) => {
    const current = addDays(start, index);
    const key = dateKey(current);
    const value = valueByDate.get(key);
    const average = rollingAverage(valueByDate, current, 7);
    return {
      key,
      label: key.slice(5).replace("-", "/"),
      value: value ?? null,
      average
    };
  });
}

function buildGroupedTrendData(
  entries: BodyEntry[],
  field: "weightKg" | "waistCm",
  periods: Array<{ key: string; label: string }>,
  dimension: Exclude<TrendDimension, "day">
): TrendPoint[] {
  return periods.map((period) => {
    const values = entries
      .filter((entry) => periodKey(entry.date, dimension) === period.key)
      .map((entry) => Number(entry[field]))
      .filter((value) => value > 0);
    return {
      key: period.key,
      label: period.label,
      value: values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null
    };
  });
}

function rollingAverage(valueByDate: Map<string, number>, date: Date, days: number) {
  const values = Array.from({ length: days }, (_, index) => {
    const key = dateKey(addDays(date, -(days - 1 - index)));
    return valueByDate.get(key);
  }).filter((value): value is number => typeof value === "number" && value > 0);

  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null;
}

function dimensionLabel(dimension: TrendDimension) {
  return { day: "日期", week: "周", month: "月份", year: "年份" }[dimension];
}

function dimensionSummary(dimension: TrendDimension) {
  return {
    day: "最近7天",
    week: "最近10周（X轴为每周周一日期）",
    month: "最近1年",
    year: "最近5年"
  }[dimension];
}
