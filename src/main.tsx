import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  Cell,
  CellGroup,
  Input,
  Switch,
  TabBar,
  TabBarItem,
  Tag,
  Textarea
} from "tdesign-mobile-react";
import "tdesign-mobile-react/es/style/index.css";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  CalendarCheck,
  CalendarDays,
  Check,
  Download,
  Dumbbell,
  Home,
  Plus,
  RotateCcw,
  Settings,
  Trash2,
  Upload,
  Weight
} from "lucide-react";
import "./styles.css";
import { registerSW } from "virtual:pwa-register";
import {
  BodyEntry,
  Checkins,
  DEFAULT_SETTINGS,
  PlanDay,
  SettingsState,
  TrainingKind,
  TrainingTemplate,
  createBlankTemplate,
  defaultPlanForDate,
  defaultTrainingTemplates,
  getTemplate,
  materializeTemplate
} from "./model";
import { clearAllData, exportData, importData, loadAppData, saveAppData } from "./storage";
import { addDays, dateKey, formatChineseDate, formatMonthDay, getWeekDays, todayKey } from "./time";

registerSW({ immediate: true });

type Tab = "today" | "plan" | "calendar" | "body" | "settings";

function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [plans, setPlans] = useState<Record<string, PlanDay>>({});
  const [bodyEntries, setBodyEntries] = useState<Record<string, BodyEntry>>({});
  const [checkins, setCheckins] = useState<Record<string, Checkins>>({});
  const [trainingTemplates, setTrainingTemplates] = useState<TrainingTemplate[]>(defaultTrainingTemplates);
  const [weekStart, setWeekStart] = useState(() => getWeekDays(new Date())[0]);

  useEffect(() => {
    loadAppData().then((data) => {
      setSettings(data.settings);
      setPlans(data.plans);
      setBodyEntries(data.bodyEntries);
      setCheckins(data.checkins);
      setTrainingTemplates(data.trainingTemplates);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveAppData({ settings, plans, bodyEntries, checkins, trainingTemplates });
  }, [ready, settings, plans, bodyEntries, checkins, trainingTemplates]);

  const today = todayKey();
  const todayPlan = withCurrentPower(
    plans[today] ?? defaultPlanForDate(today, settings.ftp, trainingTemplates),
    settings.ftp,
    trainingTemplates
  );
  const todayCheckins = checkins[today] ?? {};

  const updatePlan = (date: string, patch: Partial<PlanDay>) => {
    setPlans((current) => {
      const base = current[date] ?? defaultPlanForDate(date, settings.ftp, trainingTemplates);
      return { ...current, [date]: withCurrentPower({ ...base, ...patch }, settings.ftp, trainingTemplates) };
    });
  };

  const applyTemplate = (date: string, id: string) => {
    const template = getTemplate(id, settings.ftp, trainingTemplates);
    setPlans((current) => ({ ...current, [date]: { ...template, date } }));
  };

  const updateCheckin = (date: string, key: keyof Checkins, value: boolean) => {
    setCheckins((current) => ({ ...current, [date]: { ...current[date], [key]: value } }));
  };

  const nav = [
    ["today", Home, "今日"],
    ["plan", CalendarDays, "计划"],
    ["calendar", CalendarCheck, "日历"],
    ["body", Weight, "身体"],
    ["settings", Settings, "设置"]
  ] as const;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">本地优先 · 离线可用</p>
          <h1>骑行训练</h1>
        </div>
        <div className="ftp-pill">FTP {settings.ftp}W</div>
      </header>

      {!ready ? (
        <section className="panel">正在加载本地数据...</section>
      ) : (
        <>
          {tab === "today" && (
            <TodayPage
              plan={todayPlan}
              checkins={todayCheckins}
              onCheck={(key, value) => updateCheckin(today, key, value)}
            />
          )}
          {tab === "plan" && (
            <PlanPage
              settings={settings}
              plans={plans}
              checkins={checkins}
              templates={trainingTemplates}
              weekStart={weekStart}
              onWeekChange={setWeekStart}
              onPlanChange={updatePlan}
              onTemplate={applyTemplate}
              onTrainingDone={(date, value) => updateCheckin(date, "trainingDone", value)}
            />
          )}
          {tab === "calendar" && (
            <CalendarPage
              settings={settings}
              plans={plans}
              checkins={checkins}
              templates={trainingTemplates}
            />
          )}
          {tab === "body" && (
            <BodyPage
              entries={bodyEntries}
              onSave={(entry) => setBodyEntries((current) => ({ ...current, [entry.date]: entry }))}
            />
          )}
          {tab === "settings" && (
            <SettingsPage
              settings={settings}
              templates={trainingTemplates}
              onSettings={setSettings}
              onTemplates={setTrainingTemplates}
              onExport={async () => downloadJson(await exportData())}
              onImport={(file) =>
                importJson(file).then((payload) => {
                  const data = payload.data ?? payload;
                  setSettings(data.settings ?? DEFAULT_SETTINGS);
                  setPlans(data.plans ?? {});
                  setBodyEntries(data.bodyEntries ?? {});
                  setCheckins(data.checkins ?? {});
                  setTrainingTemplates(data.trainingTemplates ?? defaultTrainingTemplates);
                  return importData(payload);
                })
              }
              onClear={async () => {
                if (!window.confirm("确定清空所有本地训练、身体和设置数据？此操作不能撤销。")) return;
                if (!window.confirm("再次确认：清空后只能通过之前导出的 JSON 恢复。")) return;
                await clearAllData();
                setSettings(DEFAULT_SETTINGS);
                setPlans({});
                setBodyEntries({});
                setCheckins({});
                setTrainingTemplates(defaultTrainingTemplates);
              }}
            />
          )}
        </>
      )}

      <TabBar
        className="bottom-nav"
        value={tab}
        fixed
        safeAreaInsetBottom
        onChange={(value) => setTab(value as Tab)}
      >
        {nav.map(([id, Icon, label]) => (
          <TabBarItem
            key={id}
            value={id}
            icon={<Icon size={20} />}
          >
            {label}
          </TabBarItem>
        ))}
      </TabBar>
    </main>
  );
}

function TodayPage({
  plan,
  checkins,
  onCheck
}: {
  plan: PlanDay;
  checkins: Checkins;
  onCheck: (key: keyof Checkins, value: boolean) => void;
}) {
  return (
    <section className="stack today-page">
      <div className="today-card">
        <div className="type-row">
          <KindTag kind={plan.kind} />
          <span>{formatChineseDate(plan.date)}</span>
        </div>
        <h2>{plan.title}</h2>
        {plan.kind === "rest" ? (
          <p className="muted">今天安排休息。恢复也是训练的一部分。</p>
        ) : plan.powerRange || plan.durationMinutes || plan.rideDetails ? (
          <div className="ride-metrics">
            <Metric label="时长" value={plan.durationLabel ?? `${plan.durationMinutes ?? 0} 分钟`} />
            <Metric label="功率" value={plan.powerRange ? `${plan.powerRange[0]}-${plan.powerRange[1]}W` : "按体感"} />
          </div>
        ) : null}
        {plan.rideDetails && <p className="note">{plan.rideDetails}</p>}
        {plan.exercises && <StrengthList plan={plan} />}
        {plan.notes && <p className="note">{plan.notes}</p>}
      </div>

      <NutritionPanel plan={plan} />

      <div className="floating-checkin" aria-label="今日执行">
        <CheckGrid checkins={checkins} onCheck={onCheck} compact />
      </div>
    </section>
  );
}

function NutritionPanel({ plan }: { plan: PlanDay }) {
  const tips = buildNutritionTips(plan);

  return (
    <div className="panel nutrition-panel">
      <h3>今日推荐饮食</h3>
      <div className="nutrition-list">
        {tips.map((tip) => (
          <div key={tip.label}>
            <span>{tip.label}</span>
            <strong>{tip.value}</strong>
          </div>
        ))}
      </div>
      <p className="nutrition-note">减脂期不要把训练日前后的碳水砍太狠；晚餐尽量简单，30分钟内完成。</p>
    </div>
  );
}

function CalendarPage({
  settings,
  plans,
  checkins,
  templates
}: {
  settings: SettingsState;
  plans: Record<string, PlanDay>;
  checkins: Record<string, Checkins>;
  templates: TrainingTemplate[];
}) {
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const days = getCalendarDays(monthAnchor);
  const monthLabel = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(monthAnchor);
  const monthKey = `${monthAnchor.getFullYear()}-${String(monthAnchor.getMonth() + 1).padStart(2, "0")}`;
  const monthDays = days.filter((day) => dateKey(day).startsWith(monthKey));
  const completed = monthDays.filter((day) => checkins[dateKey(day)]?.trainingDone).length;

  return (
    <section className="stack">
      <div className="week-switch">
        <button type="button" onClick={() => setMonthAnchor(addMonths(monthAnchor, -1))}>上个月</button>
        <strong>{monthLabel}</strong>
        <button type="button" onClick={() => setMonthAnchor(addMonths(monthAnchor, 1))}>下个月</button>
      </div>
      <div className="completion-strip">
        <span>本月训练完成</span>
        <strong>{completed}/{monthDays.length}</strong>
        <div>
          {monthDays.slice(0, 7).map((day) => (
            <i key={dateKey(day)} className={checkins[dateKey(day)]?.trainingDone ? "done" : ""} />
          ))}
        </div>
      </div>
      <div className="panel calendar-panel">
        <div className="calendar-weekdays">
          {["一", "二", "三", "四", "五", "六", "日"].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {days.map((day) => {
            const key = dateKey(day);
            const inMonth = key.startsWith(monthKey);
            const plan = withCurrentPower(
              plans[key] ?? defaultPlanForDate(key, settings.ftp, templates),
              settings.ftp,
              templates
            );
            const dayCheckins = checkins[key] ?? {};
            const score = [
              dayCheckins.trainingDone,
              dayCheckins.proteinDone,
              dayCheckins.dinnerControlled,
              dayCheckins.earlySleep
            ].filter(Boolean).length;

            return (
              <div
                key={key}
                className={[
                  "calendar-day",
                  inMonth ? "" : "muted-day",
                  key === todayKey() ? "today" : "",
                  dayCheckins.trainingDone ? "done" : ""
                ].join(" ")}
              >
                <div className="calendar-day-head">
                  <strong>{day.getDate()}</strong>
                  {dayCheckins.trainingDone && <Check size={14} />}
                </div>
                <span className={`calendar-kind kind-${plan.kind}`}>{labelKind(plan.kind)}</span>
                <div className="calendar-dots" aria-label={`完成 ${score}/4`}>
                  {[0, 1, 2, 3].map((item) => (
                    <i key={item} className={item < score ? "on" : ""} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PlanPage({
  settings,
  plans,
  checkins,
  templates,
  weekStart,
  onWeekChange,
  onPlanChange,
  onTemplate,
  onTrainingDone
}: {
  settings: SettingsState;
  plans: Record<string, PlanDay>;
  checkins: Record<string, Checkins>;
  templates: TrainingTemplate[];
  weekStart: Date;
  onWeekChange: (date: Date) => void;
  onPlanChange: (date: string, patch: Partial<PlanDay>) => void;
  onTemplate: (date: string, id: string) => void;
  onTrainingDone: (date: string, value: boolean) => void;
}) {
  const week = getWeekDays(weekStart);
  const completedCount = week.filter((day) => checkins[dateKey(day)]?.trainingDone).length;

  return (
    <section className="stack">
      <div className="week-switch">
        <button type="button" onClick={() => onWeekChange(addDays(weekStart, -7))}>上一周</button>
        <strong>{formatMonthDay(week[0])} - {formatMonthDay(week[6])}</strong>
        <button type="button" onClick={() => onWeekChange(addDays(weekStart, 7))}>下一周</button>
      </div>
      <div className="completion-strip" aria-label="本周训练完成情况">
        <span>本周完成</span>
        <strong>{completedCount}/7</strong>
        <div>
          {week.map((day) => {
            const key = dateKey(day);
            return (
              <i
                key={key}
                className={checkins[key]?.trainingDone ? "done" : ""}
                title={formatChineseDate(key)}
              />
            );
          })}
        </div>
      </div>

      {week.map((day) => {
        const key = dateKey(day);
        const plan = withCurrentPower(
          plans[key] ?? defaultPlanForDate(key, settings.ftp, templates),
          settings.ftp,
          templates
        );
        return (
          <article className="panel plan-editor" key={key}>
            <div className="plan-head">
              <div>
                <p className="eyebrow">{formatChineseDate(key)}</p>
                <h3>{plan.title}</h3>
              </div>
              <div className="plan-status">
                <KindTag kind={plan.kind} />
                <Button
                  size="small"
                  shape="round"
                  theme={checkins[key]?.trainingDone ? "primary" : "default"}
                  variant={checkins[key]?.trainingDone ? "base" : "outline"}
                  className={checkins[key]?.trainingDone ? "done" : ""}
                  onClick={() => onTrainingDone(key, !checkins[key]?.trainingDone)}
                  aria-pressed={Boolean(checkins[key]?.trainingDone)}
                  icon={<Check size={16} />}
                >
                  {checkins[key]?.trainingDone ? "已完成" : "未完成"}
                </Button>
              </div>
            </div>
            <label>
              模板
              <select value={plan.templateId ?? ""} onChange={(event) => onTemplate(key, event.target.value)}>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </label>
            <label>
              标题
              <Input value={plan.title} clearable onChange={(value) => onPlanChange(key, { title: String(value) })} />
            </label>
            {plan.kind !== "rest" && (
              <label>
                时长（分钟）
                <Input
                  type="number"
                  value={plan.durationMinutes ?? ""}
                  onChange={(value) => onPlanChange(key, { durationMinutes: Number(value) })}
                />
              </label>
            )}
            {plan.kind !== "rest" && plan.powerRange && (
              <div className="inline-summary">当前 FTP 下目标功率：{plan.powerRange[0]}-{plan.powerRange[1]}W</div>
            )}
            {plan.rideDetails && <div className="inline-summary">{plan.rideDetails}</div>}
            {plan.exercises && <StrengthList plan={plan} />}
            <label>
              备注
              <Textarea value={plan.notes ?? ""} autosize={{ minRows: 2, maxRows: 5 }} onChange={(value) => onPlanChange(key, { notes: String(value) })} />
            </label>
            {plan.nutrition && <p className="nutrition-note">{plan.nutrition}</p>}
          </article>
        );
      })}
    </section>
  );
}

function BodyPage({
  entries,
  onSave
}: {
  entries: Record<string, BodyEntry>;
  onSave: (entry: BodyEntry) => void;
}) {
  const [date, setDate] = useState(todayKey());
  const entry = entries[date] ?? { date, weightKg: "", bodyFat: "", waistCm: "", chestCm: "", notes: "" };

  const update = (patch: Partial<BodyEntry>) => onSave({ ...entry, ...patch, date });

  return (
    <section className="stack">
      <div className="panel">
        <h2>身体记录</h2>
        <WeekDatePicker selectedDate={date} entries={entries} onSelect={setDate} />
        <div className="form-grid">
          <label>
            体重 kg
            <Input type="number" value={entry.weightKg} clearable onChange={(value) => update({ weightKg: String(value) })} />
          </label>
          <label>
            体脂 %
            <Input type="number" value={entry.bodyFat ?? ""} clearable onChange={(value) => update({ bodyFat: String(value) })} />
          </label>
          <label>
            腰围 cm
            <Input type="number" value={entry.waistCm ?? ""} clearable onChange={(value) => update({ waistCm: String(value) })} />
          </label>
          <label>
            胸围 cm
            <Input type="number" value={entry.chestCm ?? ""} clearable onChange={(value) => update({ chestCm: String(value) })} />
          </label>
        </div>
        <label>
          备注
          <Textarea value={entry.notes ?? ""} autosize={{ minRows: 2, maxRows: 5 }} onChange={(value) => update({ notes: String(value) })} />
        </label>
        <p className="muted">输入后自动保存在本机浏览器 IndexedDB。</p>
      </div>
      <BodyStats entries={entries} />
    </section>
  );
}

function BodyStats({ entries }: { entries: Record<string, BodyEntry> }) {
  const points = useMemo(
    () =>
      Object.values(entries)
        .filter((entry) => Number(entry.weightKg) > 0 || Number(entry.waistCm) > 0)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [entries]
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

function WeekDatePicker({
  selectedDate,
  entries,
  onSelect
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
        <button type="button" onClick={() => onSelect(dateKey(addDays(selected, -7)))}>上一周</button>
        <strong>{formatMonthDay(week[0])} - {formatMonthDay(week[6])}</strong>
        <button type="button" onClick={() => onSelect(dateKey(addDays(selected, 7)))}>下一周</button>
      </div>
      <div className="week-date-row">
        {week.map((day) => {
          const key = dateKey(day);
          const entry = entries[key];
          const hasBodyData = Boolean(entry && (entry.weightKg || entry.waistCm || entry.bodyFat || entry.chestCm));
          return (
            <button
              key={key}
              type="button"
              className={[
                key === selectedDate ? "active" : "",
                key === todayKey() ? "today" : "",
                hasBodyData ? "has-data" : ""
              ].join(" ")}
              onClick={() => onSelect(key)}
            >
              <span>{new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(day)}</span>
              <strong>{day.getDate()}</strong>
              <i />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SettingsPage({
  settings,
  templates,
  onSettings,
  onTemplates,
  onExport,
  onImport,
  onClear
}: {
  settings: SettingsState;
  templates: TrainingTemplate[];
  onSettings: (settings: SettingsState) => void;
  onTemplates: (templates: TrainingTemplate[]) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onClear: () => void;
}) {
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0];

  useEffect(() => {
    if (!templates.some((template) => template.id === selectedId)) {
      setSelectedId(templates[0]?.id ?? "");
    }
  }, [selectedId, templates]);

  const updateTemplate = (patch: Partial<TrainingTemplate>) => {
    if (!selected) return;
    onTemplates(
      templates.map((template) =>
        template.id === selected.id
          ? { ...template, ...patch, templateId: template.id }
          : template
      )
    );
  };

  const addTemplate = () => {
    const next = createBlankTemplate();
    onTemplates([...templates, next]);
    setSelectedId(next.id);
  };

  const deleteTemplate = () => {
    if (!selected || templates.length <= 1) return;
    if (!window.confirm(`删除模板“${selected.name}”？已安排到日计划里的内容不会自动删除。`)) return;
    const next = templates.filter((template) => template.id !== selected.id);
    onTemplates(next);
    setSelectedId(next[0]?.id ?? "");
  };

  const resetTemplates = () => {
    if (!window.confirm("恢复默认模板？这会替换当前模板库，但不会删除已经编辑过的周计划。")) return;
    onTemplates(defaultTrainingTemplates);
    setSelectedId(defaultTrainingTemplates[0].id);
  };

  return (
    <section className="stack">
      <div className="panel">
        <h2>设置</h2>
        <label>
          FTP（瓦）
          <Input
            type="number"
            value={settings.ftp}
            onChange={(value) => onSettings({ ...settings, ftp: Number(value) })}
          />
        </label>
        <div className="zones">
          <PowerZone name="Z1恢复" range={[0, 96 / 175]} ftp={settings.ftp} prefix="<" />
          <PowerZone name="Z2耐力" range={[98 / 175, 131 / 175]} ftp={settings.ftp} />
          <PowerZone name="Z3节奏" range={[132 / 175, 157 / 175]} ftp={settings.ftp} />
          <PowerZone name="甜区" range={[154 / 175, 164 / 175]} ftp={settings.ftp} />
          <PowerZone name="阈值" range={[166 / 175, 184 / 175]} ftp={settings.ftp} />
        </div>
      </div>

      <div className="panel template-panel">
        <div className="section-head">
          <h2>训练模板</h2>
          <Button size="small" shape="round" theme="primary" variant="outline" icon={<Plus size={17} />} onClick={addTemplate}>
            新增
          </Button>
        </div>
        {selected && (
          <>
            <label>
              选择模板
              <select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                模板名
                <Input value={selected.name} clearable onChange={(value) => updateTemplate({ name: String(value) })} />
              </label>
              <label>
                类型
                <select
                  value={selected.kind}
                  onChange={(event) => updateTemplate({ kind: event.target.value as TrainingKind })}
                >
                  <option value="recovery">恢复</option>
                  <option value="z2">Z2</option>
                  <option value="aerobic">有氧</option>
                  <option value="sweetspot">甜区</option>
                  <option value="threshold">阈值</option>
                  <option value="strength">力量</option>
                  <option value="rest">休息</option>
                </select>
              </label>
            </div>
            <label>
              计划标题
              <Input value={selected.title} clearable onChange={(value) => updateTemplate({ title: String(value) })} />
            </label>
            {selected.kind !== "rest" && (
              <div className="form-grid">
                <label>
                  时长（分钟）
                  <Input
                    type="number"
                    value={selected.durationMinutes ?? ""}
                    onChange={(value) => updateTemplate({ durationMinutes: Number(value) })}
                  />
                </label>
                <label>
                  FTP百分比
                  <Input
                    value={formatRangePercent(selected.rangePercent)}
                    placeholder="例如 63-72"
                    onChange={(value) => updateTemplate({ rangePercent: parseRangePercent(String(value)) })}
                  />
                </label>
              </div>
            )}
            {selected.kind === "strength" && (
              <label>
                动作清单（每行：动作 | 组数 | 次数）
                <Textarea
                  value={formatExercises(selected.exercises)}
                  autosize={{ minRows: 4, maxRows: 8 }}
                  onChange={(value) => updateTemplate({ exercises: parseExercises(String(value)) })}
                />
              </label>
            )}
            <label>
              骑行说明
              <Textarea value={selected.rideDetails ?? ""} autosize={{ minRows: 2, maxRows: 5 }} onChange={(value) => updateTemplate({ rideDetails: String(value) })} />
            </label>
            <label>
              饮食提示
              <Textarea value={selected.nutrition ?? ""} autosize={{ minRows: 2, maxRows: 5 }} onChange={(value) => updateTemplate({ nutrition: String(value) })} />
            </label>
            <label>
              备注
              <Textarea value={selected.notes ?? ""} autosize={{ minRows: 2, maxRows: 5 }} onChange={(value) => updateTemplate({ notes: String(value) })} />
            </label>
            <div className="action-row">
              <Button variant="outline" icon={<RotateCcw size={17} />} onClick={resetTemplates}>恢复默认</Button>
              <Button theme="danger" variant="outline" icon={<Trash2 size={17} />} onClick={deleteTemplate} disabled={templates.length <= 1}>
                删除模板
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <h2>数据管理</h2>
        <div className="action-list">
          <Button block variant="outline" icon={<Download size={18} />} onClick={onExport}>导出 JSON 备份</Button>
          <label className="file-button">
            <Upload size={18} />导入 JSON 恢复
            <input
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImport(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <Button block theme="danger" variant="outline" icon={<RotateCcw size={18} />} onClick={onClear}>清空本地数据</Button>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StrengthList({ plan }: { plan: PlanDay }) {
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

function CheckGrid({
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

function KindTag({ kind }: { kind: TrainingKind }) {
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

function TrendChart({
  entries,
  field,
  average = false
}: {
  entries: BodyEntry[];
  field: "weightKg" | "waistCm";
  average?: boolean;
}) {
  const values = entries
    .map((entry) => ({
      date: entry.date,
      label: entry.date.slice(5).replace("-", "/"),
      value: Number(entry[field])
    }))
    .filter((point) => point.value > 0);

  if (values.length < 2) {
    return <div className="empty-chart">至少记录 2 天数据后显示趋势。</div>;
  }

  const chartData = values.map((point, index) => {
    const slice = values.slice(Math.max(0, index - 6), index + 1);
    return {
      ...point,
      average: Number((slice.reduce((sum, item) => sum + item.value, 0) / slice.length).toFixed(2))
    };
  });
  const allValues = chartData.flatMap((point) => (average ? [point.value, point.average] : [point.value]));
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const pad = Math.max((max - min) * 0.16, 0.8);
  const unit = field === "weightKg" ? "kg" : "cm";

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 12, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id={`fill-${field}`} x1="0" y1="0" x2="0" y2="1">
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
            labelFormatter={(label) => `日期 ${label}`}
            formatter={(value, name) => [
              `${Number(value).toFixed(1)}${unit}`,
              name === "average" ? "7日平均" : field === "weightKg" ? "体重" : "腰围"
            ]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#2c7a7b"
            strokeWidth={2.6}
            fill={`url(#fill-${field})`}
            dot={{ r: 3, strokeWidth: 2, fill: "#ffffff" }}
            activeDot={{ r: 5 }}
          />
          {average && (
            <Line
              type="monotone"
              dataKey="average"
              stroke="#d99a2b"
              strokeWidth={2.4}
              dot={false}
              strokeDasharray="5 4"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      {average && <p className="muted">深色线为每日体重，浅色线为 7 日平均。</p>}
    </div>
  );
}

function PowerZone({
  name,
  range,
  ftp,
  prefix
}: {
  name: string;
  range: [number, number];
  ftp: number;
  prefix?: string;
}) {
  const low = Math.round(ftp * range[0]);
  const high = Math.round(ftp * range[1]);
  return (
    <div>
      <span>{name}</span>
      <strong>{prefix ? `${prefix}${high}W` : `${low}-${high}W`}</strong>
    </div>
  );
}

function labelKind(kind: TrainingKind) {
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

function withCurrentPower(plan: PlanDay, ftp: number, templates: TrainingTemplate[]) {
  const template = templates.find((item) => item.id === plan.templateId);
  if (!template?.rangePercent) return plan;
  return { ...plan, powerRange: materializeTemplate(template, plan.date, ftp).powerRange };
}

function buildNutritionTips(plan: PlanDay) {
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

function formatRangePercent(range?: [number, number]) {
  if (!range) return "";
  return `${Math.round(range[0] * 100)}-${Math.round(range[1] * 100)}`;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function getCalendarDays(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const startDay = first.getDay() || 7;
  const start = addDays(first, -(startDay - 1));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function parseRangePercent(value: string): [number, number] | undefined {
  const [low, high] = value
    .split(/[-,，\s]+/)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
  if (!low || !high) return undefined;
  return [low / 100, high / 100];
}

function formatExercises(exercises?: { name: string; sets: number; reps: string }[]) {
  return (exercises ?? []).map((item) => `${item.name} | ${item.sets} | ${item.reps}`).join("\n");
}

function parseExercises(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", sets = "3", reps = "8-10"] = line.split("|").map((item) => item.trim());
      return { name, sets: Number(sets) || 3, reps };
    });
}

function downloadJson(data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bike-training-backup-${todayKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importJson(file: File) {
  return JSON.parse(await file.text());
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
