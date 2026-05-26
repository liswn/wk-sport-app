import { useState } from "react";
import { Input, Textarea } from "tdesign-mobile-react";
import { BodyEntry, SettingsState } from "../model";
import { todayKey } from "../time";
import { BmiPanel, BodyStats, WeekDatePicker } from "../features/body";

export function BodyPage({
  settings,
  entries,
  onSave,
}: {
  settings: SettingsState;
  entries: Record<string, BodyEntry>;
  onSave: (entry: BodyEntry) => void;
}) {
  const [date, setDate] = useState(todayKey());
  const entry = entries[date] ?? {
    date,
    weightKg: "",
    bodyFat: "",
    waistCm: "",
    chestCm: "",
    notes: "",
  };

  const update = (patch: Partial<BodyEntry>) =>
    onSave({ ...entry, ...patch, date });

  return (
    <section className="stack">
      <div className="panel">
        <h2>身体记录</h2>
        <WeekDatePicker
          selectedDate={date}
          entries={entries}
          onSelect={setDate}
        />
        <div className="form-grid">
          <label>
            体重 kg
            <Input
              type="number"
              value={entry.weightKg}
              clearable
              onChange={(value) => update({ weightKg: String(value) })}
            />
          </label>
          <label>
            体脂 %
            <Input
              type="number"
              value={entry.bodyFat ?? ""}
              clearable
              onChange={(value) => update({ bodyFat: String(value) })}
            />
          </label>
          <label>
            腰围 cm
            <Input
              type="number"
              value={entry.waistCm ?? ""}
              clearable
              onChange={(value) => update({ waistCm: String(value) })}
            />
          </label>
          <label>
            胸围 cm
            <Input
              type="number"
              value={entry.chestCm ?? ""}
              clearable
              onChange={(value) => update({ chestCm: String(value) })}
            />
          </label>
        </div>
        <BmiPanel weightKg={entry.weightKg} heightCm={settings.heightCm} />
        <label>
          备注
          <Textarea
            value={entry.notes ?? ""}
            autosize={{ minRows: 2, maxRows: 5 }}
            onChange={(value) => update({ notes: String(value) })}
          />
        </label>
      </div>
      <BodyStats entries={entries} />
    </section>
  );
}
