import { Metric } from "../../components/TrainingBits";
import type { FatigueLoadMetrics, PlanDay } from "../../model";
import { formatChineseDate } from "../../time";
import { buildNutritionTips } from "../../trainingUtils";
import { formatMetric, formatSignedMetric } from "../../shared/lib";
import type { ReadinessInsight } from "./trainingHistory";

export function ReadinessPanel({
  insight,
  embedded = false,
}: {
  insight: ReadinessInsight;
  embedded?: boolean;
}) {
  return (
    <div
      className={`${embedded ? "" : "panel"} readiness-panel readiness-${insight.level}`}
    >
      <div className="readiness-head">
        <div>
          <h3>训练红绿灯</h3>
          <span>{insight.title}</span>
        </div>
        <strong>{insight.label}</strong>
      </div>
      <p>{insight.summary}</p>
      <div className="readiness-metrics">
        <Metric
          label="近7日 TSS"
          value={formatMetric(insight.metrics.last7Tss)}
        />
        <Metric label="CTL" value={formatMetric(insight.metrics.ctl)} />
        <Metric label="TSB" value={formatSignedMetric(insight.metrics.tsb)} />
      </div>
      <div className="readiness-actions">
        <div>
          <span>今天建议</span>
          <strong>{insight.nextAction}</strong>
        </div>
        <div>
          <span>明日微调</span>
          <strong>{insight.tomorrowAdvice}</strong>
        </div>
      </div>
      {insight.latestAnalysis && (
        <div className="readiness-diff">
          <span>最近偏差</span>
          <strong>
            {formatChineseDate(insight.latestAnalysis.date)} ·{" "}
            {insight.latestAnalysis.differencePercent}%
          </strong>
          <p>{insight.latestAnalysis.suggestion}</p>
        </div>
      )}
    </div>
  );
}

export function NutritionPanel({
  plan,
  embedded = false,
}: {
  plan: PlanDay;
  embedded?: boolean;
}) {
  const tips = buildNutritionTips(plan);

  return (
    <div
      className={`${embedded ? "today-nutrition" : "panel"} nutrition-panel`}
    >
      <h3>今日推荐饮食</h3>
      <p className="nutrition-context">
        按今日计划：{plan.title}
        {plan.durationMinutes
          ? ` · ${plan.durationLabel ?? `${plan.durationMinutes}分钟`}`
          : ""}
      </p>
      <div className="nutrition-list">
        {tips.map((tip) => (
          <div
            key={tip.label}
            className={tip.label === "计划提示" ? "primary" : ""}
          >
            <span>{tip.label}</span>
            <strong>{tip.value}</strong>
          </div>
        ))}
      </div>
      <p className="nutrition-note">
        减脂期不要把训练日前后的碳水砍太狠；晚餐尽量简单，30分钟内完成。
      </p>
    </div>
  );
}

export function FatigueMetricsGrid({ metrics }: { metrics: FatigueLoadMetrics }) {
  const cards = [
    {
      label: "最近单次训练负荷",
      code: "TSS",
      value: formatMetric(metrics.latestTss),
      hint: metrics.latestTssDate
        ? formatChineseDate(metrics.latestTssDate)
        : "暂无训练负荷",
    },
    {
      label: "近 7 天总负荷",
      code: "7日 TSS",
      value: formatMetric(metrics.last7Tss),
      hint: "最近一周累计",
    },
    {
      label: "本周训练负荷",
      code: "周 TSS",
      value: formatMetric(metrics.currentWeekTss),
      hint: `上周 ${formatMetric(metrics.previousWeekTss)}`,
    },
    {
      label: "长期负荷",
      code: "CTL",
      value: formatMetric(metrics.ctl),
      hint: "约 42 天均值",
    },
    {
      label: "疲劳负荷",
      code: "ATL",
      value: formatMetric(metrics.atl),
      hint: "约 7 天均值",
    },
    {
      label: "状态平衡",
      code: "TSB",
      value: formatSignedMetric(metrics.tsb),
      hint: metrics.status,
    },
  ];

  return (
    <div className="fatigue-metrics">
      {cards.map((card) => (
        <div key={card.code}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <em>
            {card.code} · {card.hint}
          </em>
        </div>
      ))}
      <div className="fatigue-next">
        <span>接下来建议</span>
        <strong>{metrics.nextTraining}</strong>
      </div>
    </div>
  );
}
