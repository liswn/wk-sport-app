import { useEffect, useRef, useState } from "react";
import {
  Button,
  Dialog,
  Input,
  Switch,
  Textarea,
} from "tdesign-mobile-react";
import { Check, ChevronDown } from "lucide-react";
import { KindTag, StrengthList } from "../components/TrainingBits";
import { PickerField } from "../components/PickerField";
import {
  ActivityAnalysis,
  AiCoachSession,
  BodyEntry,
  Checkins,
  type FatigueAnalysisReport,
  PlanDay,
  SettingsState,
  TrainingLog,
  TrainingTemplate,
  buildDefaultSegmentsForPlan,
  defaultPlanForDate,
} from "../model";
import type { AiTrainingRecommendation } from "../integrations";
import {
  requestAiTrainingRecommendation,
  pushIntervalsWeekPlan,
} from "../integrations";
import {
  addDays,
  dateKey,
  formatChineseDate,
  formatMonthDay,
  getWeekDays,
  todayKey,
} from "../time";
import {
  defaultStrengthExercises,
  labelKind,
  withCurrentPower,
} from "../trainingUtils";
import {
  PlanSegmentEditor,
  TrainingCoachSheet,
  TrainingLogEditor,
  buildPlanSummary,
} from "../features/training";

export function PlanPage({
  settings,
  plans,
  bodyEntries,
  checkins,
  trainingLogs,
  templates,
  weekStart,
  activityAnalyses,
  lastFatigueReport,
  aiCoachSession,
  onWeekChange,
  onPlanChange,
  onWeekPlansReplace,
  onAiCoachSession,
  onTemplate,
  onTrainingDone,
  onTrainingLogChange,
}: {
  settings: SettingsState;
  plans: Record<string, PlanDay>;
  bodyEntries: Record<string, BodyEntry>;
  checkins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  templates: TrainingTemplate[];
  weekStart: Date;
  activityAnalyses: Record<string, ActivityAnalysis>;
  lastFatigueReport?: FatigueAnalysisReport;
  aiCoachSession?: AiCoachSession;
  onWeekChange: (date: Date) => void;
  onPlanChange: (date: string, patch: Partial<PlanDay>) => void;
  onWeekPlansReplace: (plans: PlanDay[]) => void;
  onAiCoachSession: (session: AiCoachSession | undefined) => void;
  onTemplate: (date: string, id: string) => void;
  onTrainingDone: (date: string, value: boolean) => void;
  onTrainingLogChange: (date: string, patch: Partial<TrainingLog>) => void;
}) {
  const week = getWeekDays(weekStart);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiStatus, setAiStatus] = useState("");
  const [aiRecommendation, setAiRecommendation] =
    useState<AiTrainingRecommendation | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>(
    {},
  );
  const [intervalsPushLoading, setIntervalsPushLoading] = useState(false);
  const [intervalsPushStatus, setIntervalsPushStatus] = useState("");
  const [intervalsPushError, setIntervalsPushError] = useState("");
  const [intervalsPushConfirmOpen, setIntervalsPushConfirmOpen] =
    useState(false);
  const completedCount = week.filter(
    (day) => checkins[dateKey(day)]?.trainingDone,
  ).length;
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const didAutoScroll = useRef(false);

  useEffect(() => {
    if (didAutoScroll.current) return;
    const today = todayKey();
    const target = cardRefs.current[today];
    if (!target) return;
    didAutoScroll.current = true;
    window.setTimeout(
      () => target.scrollIntoView({ block: "start", behavior: "smooth" }),
      80,
    );
  }, [weekStart]);

  const togglePlanDate = (date: string) => {
    setExpandedDates((current) => ({ ...current, [date]: !current[date] }));
  };

  const expandPlanDate = (date: string) => {
    setExpandedDates((current) =>
      current[date] ? current : { ...current, [date]: true },
    );
  };

  const scrollToDate = (date: string) => {
    expandPlanDate(date);
    window.setTimeout(() => {
      cardRefs.current[date]?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
    }, 40);
  };

  const weekPlans = week.map((day) => {
    const key = dateKey(day);
    return withCurrentPower(
      plans[key] ?? defaultPlanForDate(key, settings.ftp, templates),
      settings.ftp,
      templates,
    );
  });

  const recommendationPlans = Array.from({ length: 7 }, (_, index) => {
    const key = dateKey(addDays(new Date(), index));
    return withCurrentPower(
      plans[key] ?? defaultPlanForDate(key, settings.ftp, templates),
      settings.ftp,
      templates,
    );
  });

  useEffect(() => {
    setAiError("");
    setAiStatus("");
    setAiRecommendation(null);
  }, [weekStart]);

  const handleAiRecommend = async () => {
    setAiError("");
    setAiStatus("");
    setAiRecommendation(null);
    setAiLoading(true);
    try {
      const recentKeys = Array.from({ length: 28 }, (_, index) =>
        dateKey(addDays(new Date(), -index)),
      );
      const recommendation = await requestAiTrainingRecommendation({
        settings,
        weekPlans: recommendationPlans,
        analyses: recentKeys
          .map((key) => activityAnalyses[key])
          .filter(Boolean),
        logs: recentKeys.map((key) => trainingLogs[key]).filter(Boolean),
      });
      setAiRecommendation(recommendation);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error));
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyAiPlans = () => {
    if (!aiRecommendation?.plans.length) return;
    onWeekPlansReplace(aiRecommendation.plans);
    setAiStatus("已按预览覆盖今天起 7 天的计划，实际完成记录保持不变。");
    setAiRecommendation(null);
  };

  const handlePushWeekPlan = async () => {
    setIntervalsPushConfirmOpen(false);
    setIntervalsPushError("");
    setIntervalsPushStatus("");
    setIntervalsPushLoading(true);
    try {
      const result = await pushIntervalsWeekPlan({
        settings,
        plans: weekPlans,
      });
      setIntervalsPushStatus(
        `已写入 Intervals.icu 日历：${result.synced}/${result.requested} 天。`,
      );
    } catch (error) {
      setIntervalsPushError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIntervalsPushLoading(false);
    }
  };

  return (
    <section className="stack">
      <div className="week-switch">
        <button
          type="button"
          onClick={() => onWeekChange(addDays(weekStart, -7))}
        >
          上一周
        </button>
        <strong>
          {formatMonthDay(week[0])} - {formatMonthDay(week[6])}
        </strong>
        <button
          type="button"
          onClick={() => onWeekChange(addDays(weekStart, 7))}
        >
          下一周
        </button>
      </div>
      <div
        className="completion-strip sticky-progress"
        aria-label="本周训练完成情况"
      >
        <span>本周完成</span>
        <strong>{completedCount}/7</strong>
        <div>
          {week.map((day) => {
            const key = dateKey(day);
            return (
              <button
                type="button"
                key={key}
                className={checkins[key]?.trainingDone ? "done" : ""}
                title={formatChineseDate(key)}
                onClick={() => scrollToDate(key)}
              />
            );
          })}
        </div>
      </div>

      <div className="panel ai-plan-panel">
        <div className="section-head">
          <h3>AI 训练建议</h3>
          <div className="section-actions">
            <Button
              size="small"
              shape="round"
              variant="outline"
              onClick={() => setCoachOpen(true)}
            >
              AI 咨询
            </Button>
            <Button
              size="small"
              shape="round"
              variant="outline"
              loading={aiLoading}
              onClick={handleAiRecommend}
            >
              生成推荐
            </Button>
          </div>
        </div>
        {aiError && <p className="sync-error">{aiError}</p>}
        {aiStatus && <p className="sync-success">{aiStatus}</p>}
        {aiRecommendation && (
          <div className="ai-preview">
            <div className="ai-preview-head">
              <strong>待确认计划</strong>
              <span>
                {aiRecommendation.plans.length ? "尚未覆盖" : "仅可浏览"}
              </span>
            </div>
            <p className="ai-summary">{aiRecommendation.summary}</p>
            {aiRecommendation.plans.length ? (
              <div className="ai-preview-list">
                {aiRecommendation.plans.map((plan) => (
                  <div className="ai-preview-day" key={plan.date}>
                    <div>
                      <strong>{formatChineseDate(plan.date)}</strong>
                      <span>
                        {labelKind(plan.kind)}
                        {plan.exercises?.length ? " + 力量" : ""}
                      </span>
                    </div>
                    <h4>{plan.title}</h4>
                    <p>
                      {plan.durationLabel ||
                        (plan.durationMinutes
                          ? `${plan.durationMinutes}分钟`
                          : "不安排骑行")}
                      {plan.powerRange
                        ? ` · ${plan.powerRange[0]}-${plan.powerRange[1]}W`
                        : ""}
                    </p>
                    {plan.rideDetails && <p>{plan.rideDetails}</p>}
                    {plan.exercises?.length ? (
                      <ul>
                        {plan.exercises.slice(0, 3).map((exercise) => (
                          <li key={`${plan.date}-${exercise.name}`}>
                            {exercise.name} {exercise.sets}组 x {exercise.reps}
                          </li>
                        ))}
                        {plan.exercises.length > 3 && (
                          <li>还有 {plan.exercises.length - 3} 个力量动作</li>
                        )}
                      </ul>
                    ) : null}
                    {plan.nutrition && (
                      <p className="nutrition-note">{plan.nutrition}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <pre>{aiRecommendation.rawText}</pre>
            )}
            <div className="ai-preview-actions">
              <Button
                size="small"
                shape="round"
                variant="outline"
                onClick={() => setAiRecommendation(null)}
              >
                先不应用
              </Button>
              <Button
                size="small"
                shape="round"
                theme="primary"
                disabled={!aiRecommendation.plans.length}
                onClick={handleApplyAiPlans}
              >
                应用到本周计划
              </Button>
            </div>
          </div>
        )}
      </div>

      <TrainingCoachSheet
        visible={coachOpen}
        settings={settings}
        plans={plans}
        checkins={checkins}
        trainingLogs={trainingLogs}
        activityAnalyses={activityAnalyses}
        bodyEntries={bodyEntries}
        templates={templates}
        weekPlans={weekPlans}
        session={aiCoachSession}
        lastFatigueReport={lastFatigueReport}
        onSession={onAiCoachSession}
        onApplyPatch={(patch) => {
          for (const change of patch.changes) {
            onPlanChange(change.date, change.after);
          }
          setAiStatus("已应用 AI 咨询里的计划修改，实际完成记录保持不变。");
        }}
        onClose={() => setCoachOpen(false)}
      />

      {week.map((day) => {
        const key = dateKey(day);
        const plan = withCurrentPower(
          plans[key] ?? defaultPlanForDate(key, settings.ftp, templates),
          settings.ftp,
          templates,
        );
        const log = trainingLogs[key] ?? { date: key };
        const expanded = Boolean(expandedDates[key]);
        const isDone = Boolean(checkins[key]?.trainingDone);
        return (
          <article
            className={`panel plan-editor ${expanded ? "expanded" : "collapsed"}`}
            key={key}
            ref={(element) => {
              cardRefs.current[key] = element;
            }}
          >
            <div className="plan-head">
              <p className="plan-date" title={formatChineseDate(key)}>
                {formatChineseDate(key)}
              </p>
              <div className="plan-card-actions">
                <Button
                  size="small"
                  shape="round"
                  theme={isDone ? "primary" : "default"}
                  variant={isDone ? "base" : "outline"}
                  className={isDone ? "done" : ""}
                  onClick={() => onTrainingDone(key, !isDone)}
                  aria-pressed={isDone}
                  icon={<Check size={15} />}
                >
                  {isDone ? "已完成" : "未完成"}
                </Button>
                <Button
                  size="small"
                  shape="round"
                  variant="outline"
                  className="plan-expand-button"
                  onClick={() => togglePlanDate(key)}
                  aria-expanded={expanded}
                  icon={
                    <ChevronDown size={15} className={expanded ? "open" : ""} />
                  }
                >
                  {expanded ? "收起" : "展开"}
                </Button>
              </div>
            </div>
            <div className="plan-title-row">
              <KindTag kind={plan.kind} />
              <h3 className="plan-title">{plan.title}</h3>
            </div>
            {!expanded ? (
              <div className="plan-summary-text">{buildPlanSummary(plan)}</div>
            ) : (
              <div className="plan-card-body">
                <div className="toggle-row">
                  <div>
                    <strong>力量训练</strong>
                    <span>打开后可和恢复、Z2、甜区等类型组合</span>
                  </div>
                  <Switch
                    size="small"
                    value={Boolean(plan.exercises?.length)}
                    onChange={(value) =>
                      onPlanChange(key, {
                        exercises: Boolean(value)
                          ? plan.exercises?.length
                            ? plan.exercises
                            : defaultStrengthExercises()
                          : undefined,
                        strengthDurationLabel: Boolean(value)
                          ? "20-25分钟"
                          : "",
                      })
                    }
                  />
                </div>
                <PickerField
                  label="模板"
                  value={plan.templateId ?? ""}
                  options={templates.map((template) => ({
                    label: template.name,
                    value: template.id,
                  }))}
                  onChange={(value) => onTemplate(key, value)}
                />
                <label>
                  标题
                  <Input
                    value={plan.title}
                    clearable
                    onChange={(value) =>
                      onPlanChange(key, { title: String(value) })
                    }
                  />
                </label>
                {plan.kind !== "rest" && (
                  <label>
                    时长（分钟）
                    <Input
                      type="number"
                      value={plan.durationMinutes ?? ""}
                      onChange={(value) =>
                        onPlanChange(key, { durationMinutes: Number(value) })
                      }
                    />
                  </label>
                )}
                {plan.kind !== "rest" && plan.powerRange && (
                  <div className="inline-summary">
                    当前 FTP 下目标功率：{plan.powerRange[0]}-
                    {plan.powerRange[1]}W
                  </div>
                )}
                {plan.rideDetails && (
                  <div className="inline-summary">{plan.rideDetails}</div>
                )}
                {plan.kind !== "rest" && (
                  <PlanSegmentEditor
                    segments={
                      plan.segments ?? buildDefaultSegmentsForPlan(plan) ?? []
                    }
                    defaultPowerRange={plan.powerRange}
                    onChange={(segments) => onPlanChange(key, { segments })}
                  />
                )}
                {plan.exercises && <StrengthList plan={plan} />}
                <label>
                  备注
                  <Textarea
                    value={plan.notes ?? ""}
                    autosize={{ minRows: 2, maxRows: 5 }}
                    onChange={(value) =>
                      onPlanChange(key, { notes: String(value) })
                    }
                  />
                </label>
                {plan.nutrition && (
                  <p className="nutrition-note">{plan.nutrition}</p>
                )}
              </div>
            )}
            {isDone && (
              <TrainingLogEditor
                log={log}
                onChange={(patch) => onTrainingLogChange(key, patch)}
              />
            )}
          </article>
        );
      })}

      <div className="panel intervals-plan-panel">
        <Button
          shape="round"
          variant="outline"
          loading={intervalsPushLoading}
          onClick={() => setIntervalsPushConfirmOpen(true)}
        >
          导入 Intervals.icu 日历
        </Button>
        {intervalsPushError && (
          <p className="sync-error">{intervalsPushError}</p>
        )}
        {intervalsPushStatus && (
          <p className="sync-success">{intervalsPushStatus}</p>
        )}
      </div>

      <Dialog
        visible={intervalsPushConfirmOpen}
        title="导入 Intervals.icu 日历"
        content={
          <div className="dialog-copy">
            <p>
              确认本周计划已经调整好后，再把 7 天计划写入 Intervals.icu 日历。
            </p>
            <p>
              应用只上传计划标题、训练分段、训练说明、预计时长、目标功率和力量动作。
              同日期的 wk-sport-app 计划会按当前内容更新。
            </p>
          </div>
        }
        cancelBtn="取消"
        confirmBtn="确认导入"
        onClose={() => setIntervalsPushConfirmOpen(false)}
        onCancel={() => setIntervalsPushConfirmOpen(false)}
        onConfirm={handlePushWeekPlan}
      />
    </section>
  );
}
