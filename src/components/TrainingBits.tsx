import { Check, Dumbbell } from "lucide-react";
import { Cell, CellGroup, Switch, Tag } from "tdesign-mobile-react";
import { Checkins, PlanDay, TrainingKind } from "../model";
import { labelKind } from "../trainingUtils";

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function StrengthList({ plan }: { plan: PlanDay }) {
  return (
    <div className="strength-list">
      {plan.exercises?.map((exercise) => (
        <div key={`${exercise.name}-${exercise.sets}-${exercise.reps}`}>
          <Dumbbell size={18} />
          <span>{exercise.name}</span>
          <strong>{exercise.sets} x {exercise.reps}</strong>
        </div>
      ))}
    </div>
  );
}

export function CheckGrid({
  checkins,
  onCheck,
  compact = false
}: {
  checkins: Checkins;
  onCheck: (key: keyof Checkins, value: boolean) => void;
  compact?: boolean;
}) {
  const items = [
    ["trainingDone", "完成训练"],
    ["proteinDone", "蛋白质够"],
    ["dinnerControlled", "控制晚餐"],
    ["earlySleep", "早睡"]
  ] as const;

  if (compact) {
    return (
      <div className="check-quick-row">
        {items.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={checkins[key] ? "active" : ""}
            onClick={() => onCheck(key, !checkins[key])}
            aria-pressed={Boolean(checkins[key])}
          >
            <span>{checkins[key] ? <Check size={17} /> : null}</span>
            <em>{label}</em>
          </button>
        ))}
      </div>
    );
  }

  return (
    <CellGroup theme="card" className="check-list">
      {items.map(([key, label]) => (
        <Cell
          key={key}
          title={label}
          note={checkins[key] ? "已完成" : "未完成"}
          rightIcon={
            <Switch
              size="small"
              value={Boolean(checkins[key])}
              onChange={(value) => onCheck(key, Boolean(value))}
            />
          }
        />
      ))}
    </CellGroup>
  );
}

export function KindTag({ kind }: { kind: TrainingKind }) {
  const themeMap: Record<TrainingKind, "default" | "primary" | "warning" | "danger" | "success"> = {
    recovery: "primary",
    z2: "success",
    aerobic: "success",
    sweetspot: "warning",
    threshold: "danger",
    rest: "default",
    strength: "primary"
  };

  return (
    <Tag className={`type-chip kind-${kind}`} theme={themeMap[kind]} variant="light" shape="round">
      {labelKind(kind)}
    </Tag>
  );
}
