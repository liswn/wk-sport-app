import { useState } from "react";
import { Button, Input, Picker, Popup, Textarea } from "tdesign-mobile-react";
import { Plus, Trash2 } from "lucide-react";
import { PickerField } from "../../components/PickerField";
import type { PlanDay, PlanSegment, TrainingLog } from "../../model";
import { formatSegmentSummary } from "../../trainingUtils";
import { FEELING_OPTIONS, FTP_PERCENT_OPTIONS, POWER_WATT_OPTIONS, RPE_OPTIONS } from "./trainingOptions";

export function buildPlanSummary(plan: PlanDay) {
  const parts = [
    plan.kind === "rest"
      ? "休息日"
      : plan.durationLabel ||
        (plan.durationMinutes ? `${plan.durationMinutes}分钟` : ""),
    plan.powerRange ? `${plan.powerRange[0]}-${plan.powerRange[1]}W` : "",
    formatSegmentSummary(plan.segments),
    plan.exercises?.length
      ? `力量 ${plan.strengthDurationLabel || `${plan.exercises.length}个动作`}`
      : "",
  ].filter(Boolean);

  return parts.join(" · ") || "点击展开查看和编辑当天计划";
}

export function PlanSegmentEditor({
  segments,
  defaultPowerRange,
  onChange,
}: {
  segments: PlanSegment[];
  defaultPowerRange?: [number, number];
  onChange: (segments: PlanSegment[] | undefined) => void;
}) {
  const updateSegment = (index: number, patch: Partial<PlanSegment>) => {
    onChange(
      segments.map((segment, currentIndex) =>
        currentIndex === index ? { ...segment, ...patch } : segment,
      ),
    );
  };

  const addSegment = () => {
    onChange([
      ...segments,
      {
        name: "新训练段",
        durationMinutes: 10,
        targetPowerRange: defaultPowerRange,
      },
    ]);
  };

  const removeSegment = (index: number) => {
    const next = segments.filter((_, currentIndex) => currentIndex !== index);
    onChange(next.length ? next : undefined);
  };

  return (
    <div className="segment-editor">
      <div className="section-head compact">
        <h4>训练分段</h4>
        <Button
          size="small"
          shape="round"
          variant="outline"
          icon={<Plus size={15} />}
          onClick={addSegment}
        >
          添加
        </Button>
      </div>
      {segments.map((segment, index) => (
        <div className="segment-card" key={`${segment.name}-${index}`}>
          <div className="segment-card-head">
            <span>{index + 1}</span>
            <Input
              value={segment.name}
              clearable
              placeholder="分段名称"
              onChange={(value) =>
                updateSegment(index, { name: String(value) })
              }
            />
            <Button
              size="small"
              shape="round"
              variant="outline"
              icon={<Trash2 size={15} />}
              onClick={() => removeSegment(index)}
            />
          </div>
          <div className="segment-fields">
            <label>
              时长
              <Input
                type="number"
                value={segment.durationMinutes ?? ""}
                placeholder="分钟"
                onChange={(value) =>
                  updateSegment(index, {
                    durationMinutes: optionalNumber(value),
                  })
                }
              />
            </label>
            <label>
              目标功率
              <PowerRangePickerField
                value={segment.targetPowerRange}
                placeholder="选择目标功率区间"
                onChange={(targetPowerRange) =>
                  updateSegment(index, { targetPowerRange })
                }
              />
            </label>
            <label>
              重复
              <Input
                type="number"
                value={segment.repeat ?? ""}
                placeholder="1"
                onChange={(value) =>
                  updateSegment(index, { repeat: optionalNumber(value) })
                }
              />
            </label>
            <label>
              恢复
              <Input
                type="number"
                value={segment.recoveryMinutes ?? ""}
                placeholder="分钟"
                onChange={(value) =>
                  updateSegment(index, {
                    recoveryMinutes: optionalNumber(value),
                  })
                }
              />
            </label>
            <label className="segment-field-wide">
              恢复功率
              <PowerRangePickerField
                value={segment.recoveryPowerRange}
                placeholder="选择恢复功率区间"
                onChange={(recoveryPowerRange) =>
                  updateSegment(index, { recoveryPowerRange })
                }
              />
            </label>
          </div>
          <Textarea
            value={segment.notes ?? ""}
            placeholder="备注，例如：组间轻松骑、逐步提高踏频..."
            autosize={{ minRows: 1, maxRows: 3 }}
            onChange={(value) => updateSegment(index, { notes: String(value) })}
          />
        </div>
      ))}
      {!segments.length && (
        <p className="muted-note">
          添加热身、主训练、恢复和冷身后，同步到 Intervals.icu 时会一起带过去。
        </p>
      )}
    </div>
  );
}

export function PlanSegmentList({
  segments,
}: {
  segments: NonNullable<PlanDay["segments"]>;
}) {
  return (
    <div className="segment-list">
      <h4>训练分段</h4>
      {segments.map((segment, index) => (
        <div key={`${segment.name}-${index}`}>
          <span>{index + 1}</span>
          <strong>{segment.name}</strong>
          <em>
            {segment.repeat ? `${segment.repeat}x ` : ""}
            {segment.durationMinutes
              ? `${segment.durationMinutes}分钟`
              : "按体感"}
            {segment.targetPowerRange
              ? ` · ${segment.targetPowerRange[0]}-${segment.targetPowerRange[1]}W`
              : ""}
            {segment.recoveryMinutes
              ? ` · 组间${segment.recoveryMinutes}分钟`
              : ""}
          </em>
          {segment.notes && <p>{segment.notes}</p>}
        </div>
      ))}
    </div>
  );
}

export function PowerRangePickerField({
  value,
  placeholder,
  onChange,
}: {
  value?: [number, number];
  placeholder: string;
  onChange: (range: [number, number] | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const display = value ? `${value[0]}-${value[1]}W` : placeholder;
  const lower = Math.max(0, Math.min(value?.[0] ?? 90, 400));
  const upper = Math.max(0, Math.min(value?.[1] ?? Math.max(lower, 120), 400));

  return (
    <div className="power-range-field">
      <button type="button" onClick={() => setOpen(true)}>
        <strong className={value ? "" : "placeholder"}>{display}</strong>
        <em>选择</em>
      </button>
      <Popup
        visible={open}
        placement="bottom"
        closeOnOverlayClick
        onClose={() => setOpen(false)}
      >
        <Picker
          title="选择功率区间"
          columns={[POWER_WATT_OPTIONS, POWER_WATT_OPTIONS]}
          value={[String(lower), String(Math.max(lower, upper))]}
          cancelBtn={value ? "清空" : false}
          confirmBtn="确定"
          onCancel={() => {
            onChange(undefined);
            setOpen(false);
          }}
          onConfirm={(nextValue) => {
            const first = Number(nextValue[0]);
            const second = Number(nextValue[1]);
            if (!Number.isFinite(first) || !Number.isFinite(second)) {
              onChange(undefined);
            } else {
              onChange([
                Math.round(Math.min(first, second)),
                Math.round(Math.max(first, second)),
              ]);
            }
            setOpen(false);
          }}
        />
      </Popup>
    </div>
  );
}

export function FtpPercentRangePickerField({
  value,
  placeholder,
  onChange,
}: {
  value?: [number, number];
  placeholder: string;
  onChange: (range: [number, number] | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const low = Math.round((value?.[0] ?? 0.55) * 100);
  const high = Math.round((value?.[1] ?? 0.75) * 100);
  const lower = Math.max(20, Math.min(low, 200));
  const upper = Math.max(20, Math.min(high, 200));
  const display = value ? `${lower}-${upper}%` : placeholder;

  return (
    <div className="power-range-field">
      <button type="button" onClick={() => setOpen(true)}>
        <strong className={value ? "" : "placeholder"}>{display}</strong>
        <em>选择</em>
      </button>
      <Popup
        visible={open}
        placement="bottom"
        closeOnOverlayClick
        onClose={() => setOpen(false)}
      >
        <Picker
          title="选择 FTP 百分比区间"
          columns={[FTP_PERCENT_OPTIONS, FTP_PERCENT_OPTIONS]}
          value={[String(lower), String(Math.max(lower, upper))]}
          cancelBtn={value ? "清空" : false}
          confirmBtn="确定"
          onCancel={() => {
            onChange(undefined);
            setOpen(false);
          }}
          onConfirm={(nextValue) => {
            const first = Number(nextValue[0]);
            const second = Number(nextValue[1]);
            if (!Number.isFinite(first) || !Number.isFinite(second)) {
              onChange(undefined);
            } else {
              onChange([
                Math.round(Math.min(first, second)) / 100,
                Math.round(Math.max(first, second)) / 100,
              ]);
            }
            setOpen(false);
          }}
        />
      </Popup>
    </div>
  );
}

export function optionalNumber(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function TrainingLogEditor({
  log,
  onChange,
}: {
  log: TrainingLog;
  onChange: (patch: Partial<TrainingLog>) => void;
}) {
  return (
    <div className="actual-log">
      <h4>实际完成记录</h4>
      <div className="form-grid">
        <label>
          实际时长
          <Input
            type="number"
            value={log.actualMinutes ?? ""}
            placeholder="分钟"
            onChange={(value) => onChange({ actualMinutes: String(value) })}
          />
        </label>
        <label>
          平均功率
          <Input
            type="number"
            value={log.averagePower ?? ""}
            placeholder="W，可选"
            onChange={(value) => onChange({ averagePower: String(value) })}
          />
        </label>
        <PickerField
          label="RPE 主观用力"
          value={log.rpe ?? ""}
          options={RPE_OPTIONS}
          onChange={(value) => onChange({ rpe: value })}
        />
        <PickerField
          label="体感"
          value={log.feeling ?? ""}
          options={FEELING_OPTIONS}
          onChange={(value) =>
            onChange({
              feeling: (value || undefined) as TrainingLog["feeling"],
            })
          }
        />
      </div>
      <label>
        训练备注
        <Textarea
          value={log.notes ?? ""}
          placeholder="比如：腿有点沉、功率稳定、需要调低明天强度..."
          autosize={{ minRows: 2, maxRows: 4 }}
          onChange={(value) => onChange({ notes: String(value) })}
        />
      </label>
    </div>
  );
}
