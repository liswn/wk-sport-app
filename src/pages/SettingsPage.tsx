import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Button,
  Dialog,
  Input,
  Switch,
  Textarea,
} from "tdesign-mobile-react";
import {
  ChevronRight,
  BookOpenText,
  ClipboardList,
  Download,
  KeyRound,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { PickerField } from "../components/PickerField";
import {
  ActivityAnalysis,
  AiCoachSession,
  BodyEntry,
  Checkins,
  DEFAULT_AI_MODEL,
  DEFAULT_SETTINGS,
  DayMemo,
  type FatigueAnalysisReport,
  IgpsportSyncRecord,
  PlanDay,
  SettingsState,
  TrainingLog,
  TrainingKind,
  TrainingTemplate,
  buildDefaultSegmentsForPlan,
  createBlankTemplate,
  defaultTrainingTemplates,
} from "../model";
import { loginIgpsportAccount } from "../integrations";
import {
  buildTemplatePreset,
  defaultStrengthExercises,
  formatExercises,
  parseExercises,
} from "../trainingUtils";
import {
  SETTINGS_ROUTES,
  getSettingsViewFromPathname,
} from "../app/routes";
import {
  DATA_CLEAR_LABELS,
  formatReportTime,
  type LocalDataClearKey,
} from "../shared/lib";
import {
  BackupStatus,
  InstallGuide,
  LocalDataSize,
  PowerZone,
  SettingsSubpageHeader,
  UserGuidePanel,
} from "../features/settings";
import {
  CHATGPT_MODEL_OPTIONS,
  FtpPercentRangePickerField,
  GOAL_FOCUS_OPTIONS,
  PlanSegmentEditor,
  STRATEGY_OPTIONS,
  TRAINING_KIND_OPTIONS,
} from "../features/training";

export function SettingsPage({
  settings,
  plans,
  bodyEntries,
  checkins,
  trainingLogs,
  activityAnalyses,
  dayMemos,
  lastFatigueReport,
  aiCoachSession,
  igpsportSyncRecords,
  templates,
  onSettings,
  onTemplates,
  onClearDataItem,
  onExport,
  onImport,
  onClear,
}: {
  settings: SettingsState;
  plans: Record<string, PlanDay>;
  bodyEntries: Record<string, BodyEntry>;
  checkins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  activityAnalyses: Record<string, ActivityAnalysis>;
  dayMemos: Record<string, DayMemo>;
  lastFatigueReport?: FatigueAnalysisReport;
  aiCoachSession?: AiCoachSession;
  igpsportSyncRecords: Record<string, IgpsportSyncRecord>;
  templates: TrainingTemplate[];
  onSettings: (settings: SettingsState) => void;
  onTemplates: (templates: TrainingTemplate[]) => void;
  onClearDataItem: (key: LocalDataClearKey) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onClear: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const view = getSettingsViewFromPathname(location.pathname);
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");
  const [clearDialogStep, setClearDialogStep] = useState<0 | 1 | 2>(0);
  const [clearDataKey, setClearDataKey] = useState<LocalDataClearKey | null>(
    null,
  );
  const [templateDialog, setTemplateDialog] = useState<
    "delete" | "reset" | null
  >(null);
  const [igpsportPassword, setIgpsportPassword] = useState(
    settings.igpsportPassword ?? "",
  );
  const [igpsportLoggingIn, setIgpsportLoggingIn] = useState(false);
  const [igpsportLoginStatus, setIgpsportLoginStatus] = useState("");
  const [igpsportLoginError, setIgpsportLoginError] = useState("");
  const selected =
    templates.find((template) => template.id === selectedId) ?? templates[0];

  useEffect(() => {
    if (!templates.some((template) => template.id === selectedId)) {
      setSelectedId(templates[0]?.id ?? "");
    }
  }, [selectedId, templates]);

  useEffect(() => {
    setIgpsportPassword(settings.igpsportPassword ?? "");
  }, [settings.igpsportPassword]);

  const updateTemplate = (patch: Partial<TrainingTemplate>) => {
    if (!selected) return;
    onTemplates(
      templates.map((template) =>
        template.id === selected.id
          ? { ...template, ...patch, templateId: template.id }
          : template,
      ),
    );
  };

  const addTemplate = () => {
    const next = createBlankTemplate();
    onTemplates([...templates, next]);
    setSelectedId(next.id);
  };

  const deleteTemplate = () => {
    if (!selected || templates.length <= 1) return;
    const next = templates.filter((template) => template.id !== selected.id);
    onTemplates(next);
    setSelectedId(next[0]?.id ?? "");
    setTemplateDialog(null);
  };

  const resetTemplates = () => {
    onTemplates(defaultTrainingTemplates);
    setSelectedId(defaultTrainingTemplates[0].id);
    setTemplateDialog(null);
  };

  const applyKindPreset = (kind: TrainingKind) => {
    if (!selected) return;
    const nextKind = kind === "strength" ? "recovery" : kind;
    updateTemplate({
      ...buildTemplatePreset(nextKind, Boolean(selected.exercises?.length)),
      kind: nextKind,
    });
  };

  const toggleStrength = (enabled: boolean) => {
    updateTemplate({
      title: enabled
        ? selected?.title.includes("力量")
          ? selected.title
          : `${selected?.title ?? "训练"} + 力量`
        : (selected?.title.replace(/\s*\+\s*力量/g, "") ?? ""),
      exercises: enabled
        ? selected?.exercises?.length
          ? selected.exercises
          : defaultStrengthExercises()
        : undefined,
      strengthDurationLabel: enabled
        ? selected?.strengthDurationLabel || "20-25分钟"
        : "",
    });
  };

  const handleClearConfirm = async () => {
    if (clearDialogStep === 1) {
      setClearDialogStep(2);
      return;
    }
    setClearDialogStep(0);
    await onClear();
  };

  const handleClearDataItem = () => {
    if (!clearDataKey) return;
    onClearDataItem(clearDataKey);
    setClearDataKey(null);
  };

  const handleIgpsportLogin = async () => {
    setIgpsportLoginError("");
    setIgpsportLoginStatus("");
    setIgpsportLoggingIn(true);
    try {
      const nextSettings = await loginIgpsportAccount({
        settings,
        password: igpsportPassword,
      });
      onSettings(nextSettings);
      setIgpsportPassword(nextSettings.igpsportPassword ?? "");
      setIgpsportLoginStatus("登录成功，密码和访问令牌已加密保存在本机。");
    } catch (error) {
      setIgpsportLoginError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIgpsportLoggingIn(false);
    }
  };

  const clearIgpsportToken = () => {
    onSettings({
      ...settings,
      igpsportPassword: "",
      igpsportAccessToken: "",
      igpsportRefreshToken: "",
      igpsportTokenExpiresAt: "",
    });
    setIgpsportPassword("");
    setIgpsportLoginError("");
    setIgpsportLoginStatus("已清除 iGPSPORT 登录信息。");
  };

  return (
    <section className="stack">
      {view === "main" && (
        <>
          <div className="panel">
            <h2>设置</h2>
            <div className="form-grid">
              <label>
                FTP（瓦）
                <Input
                  type="number"
                  value={settings.ftp}
                  onChange={(value) =>
                    onSettings({ ...settings, ftp: Number(value) })
                  }
                />
              </label>
              <label>
                身高 cm
                <Input
                  type="number"
                  value={settings.heightCm ?? ""}
                  placeholder="例如 175"
                  onChange={(value) =>
                    onSettings({ ...settings, heightCm: String(value) })
                  }
                />
              </label>
            </div>
            <div className="zones">
              <PowerZone
                name="Z1恢复"
                range={[0, 96 / 175]}
                ftp={settings.ftp}
                prefix="<"
              />
              <PowerZone
                name="Z2耐力"
                range={[98 / 175, 131 / 175]}
                ftp={settings.ftp}
              />
              <PowerZone
                name="Z3节奏"
                range={[132 / 175, 157 / 175]}
                ftp={settings.ftp}
              />
              <PowerZone
                name="甜区"
                range={[154 / 175, 164 / 175]}
                ftp={settings.ftp}
              />
              <PowerZone
                name="阈值"
                range={[166 / 175, 184 / 175]}
                ftp={settings.ftp}
              />
            </div>
          </div>

          <div className="panel goal-panel">
            <h2>训练目标</h2>
            <p className="muted">
              这里会作为 AI
              生成训练计划和饮食建议的主要上下文，只在点击生成时发送给你配置的
              AI 接口。
            </p>
            <label>
              目标描述
              <Textarea
                value={settings.goalText ?? DEFAULT_SETTINGS.goalText}
                autosize={{ minRows: 7, maxRows: 12 }}
                onChange={(value) =>
                  onSettings({ ...settings, goalText: String(value) })
                }
              />
            </label>
            <div className="form-grid">
              <PickerField
                label="策略倾向"
                value={settings.strategyLevel ?? DEFAULT_SETTINGS.strategyLevel}
                options={STRATEGY_OPTIONS}
                onChange={(value) =>
                  onSettings({
                    ...settings,
                    strategyLevel: value as SettingsState["strategyLevel"],
                  })
                }
              />
              <PickerField
                label="当前重点"
                value={settings.goalFocus ?? DEFAULT_SETTINGS.goalFocus}
                options={GOAL_FOCUS_OPTIONS}
                onChange={(value) =>
                  onSettings({
                    ...settings,
                    goalFocus: value as SettingsState["goalFocus"],
                  })
                }
              />
            </div>
            <p className="goal-hint">
              建议按模板写清：目标、周期、训练时间、偏好、身体目标、饮食原则和限制。策略默认“平衡”，除非你明确愿意承受更高疲劳。
            </p>
          </div>

          <div className="settings-nav">
            <button
              type="button"
              onClick={() => navigate(SETTINGS_ROUTES.integrations)}
            >
              <span className="settings-nav-icon api">
                <KeyRound size={18} />
              </span>
              <span>
                <strong>外部 API 与 AI</strong>
                <em>Intervals.icu、iGPSPORT、ChatGPT 和密钥</em>
              </span>
              <ChevronRight size={18} />
            </button>
            <button
              type="button"
              onClick={() => navigate(SETTINGS_ROUTES.templates)}
            >
              <span className="settings-nav-icon template">
                <ClipboardList size={18} />
              </span>
              <span>
                <strong>训练模板</strong>
                <em>{templates.length} 个模板，编辑类型、功率和饮食提示</em>
              </span>
              <ChevronRight size={18} />
            </button>
            <button
              type="button"
              onClick={() => navigate(SETTINGS_ROUTES.guide)}
            >
              <span className="settings-nav-icon guide">
                <BookOpenText size={18} />
              </span>
              <span>
                <strong>使用文档</strong>
                <em>安装到桌面、日常记录、同步、AI 和备份说明</em>
              </span>
              <ChevronRight size={18} />
            </button>
          </div>

          <InstallGuide />
        </>
      )}

      {view === "integrations" && (
        <>
          <SettingsSubpageHeader
            title="外部 API 与 AI"
            subtitle="这些配置只保存在本机浏览器，只有手动同步或生成建议时才会请求外部服务。"
            onBack={() => navigate(SETTINGS_ROUTES.main)}
          />
          <div className="panel integration-panel">
            <h2>外部同步与 AI</h2>
            <p className="muted">
              这些配置只保存在本机浏览器。只有你点击同步或生成推荐时，才会请求对应服务。
            </p>
            <h3>Intervals.icu</h3>
            <div className="form-grid">
              <label>
                API 地址
                <Input
                  value={settings.intervalsApiBase ?? ""}
                  placeholder="填写 Intervals.icu API 地址"
                  onChange={(value) =>
                    onSettings({ ...settings, intervalsApiBase: String(value) })
                  }
                />
              </label>
              <label>
                Athlete ID
                <Input
                  value={settings.intervalsAthleteId ?? ""}
                  placeholder="填写 Athlete ID"
                  onChange={(value) =>
                    onSettings({
                      ...settings,
                      intervalsAthleteId: String(value),
                    })
                  }
                />
              </label>
            </div>
            <label>
              Intervals.icu API Key
              <Input
                type="password"
                value={settings.intervalsApiKey ?? ""}
                placeholder="仅保存在本地"
                onChange={(value) =>
                  onSettings({ ...settings, intervalsApiKey: String(value) })
                }
              />
            </label>
            <h3>iGPSPORT</h3>
            <p className="muted-note">
              用于手动把当天活动文件同步到 Intervals.icu。优先 FIT，若 OSS
              下载被浏览器拦截会自动尝试
              GPX。密码、访问令牌和刷新令牌都会加密保存在本机，用于自动续签。
            </p>
            <label>
              iGPSPORT 账号
              <Input
                value={settings.igpsportUsername ?? ""}
                placeholder="填写 iGPSPORT 账号"
                onChange={(value) =>
                  onSettings({
                    ...settings,
                    igpsportUsername: String(value),
                  })
                }
              />
            </label>
            <label>
              iGPSPORT 密码
              <Input
                type="password"
                value={igpsportPassword}
                placeholder="加密保存在本机，用于自动续签"
                onChange={(value) => setIgpsportPassword(String(value))}
              />
            </label>
            <p className="muted-note">
              Access Token：{settings.igpsportAccessToken ? "已保存" : "未登录"}
              {settings.igpsportTokenExpiresAt
                ? `，过期时间 ${formatReportTime(settings.igpsportTokenExpiresAt)}`
                : ""}
            </p>
            <div className="action-row">
              <Button
                theme="primary"
                variant="outline"
                loading={igpsportLoggingIn}
                disabled={
                  !settings.igpsportUsername?.trim() || !igpsportPassword.trim()
                }
                onClick={handleIgpsportLogin}
              >
                登录并加密保存
              </Button>
              <Button
                variant="outline"
                disabled={
                  !settings.igpsportAccessToken && !settings.igpsportPassword
                }
                onClick={clearIgpsportToken}
              >
                清除登录信息
              </Button>
            </div>
            {igpsportLoginStatus && (
              <p className="sync-success">{igpsportLoginStatus}</p>
            )}
            {igpsportLoginError && (
              <p className="sync-error">{igpsportLoginError}</p>
            )}
            <h3>OpenAI 兼容接口</h3>
            <label>
              请求地址
              <Input
                value={settings.aiEndpoint ?? ""}
                placeholder="填写接口地址"
                onChange={(value) =>
                  onSettings({ ...settings, aiEndpoint: String(value) })
                }
              />
            </label>
            <div className="form-grid">
              <PickerField
                label="ChatGPT 模型"
                value={settings.aiModel || DEFAULT_AI_MODEL}
                options={CHATGPT_MODEL_OPTIONS}
                onChange={(aiModel) => onSettings({ ...settings, aiModel })}
              />
              <label>
                API Key
                <Input
                  type="password"
                  value={settings.aiApiKey ?? ""}
                  placeholder="仅保存在本地"
                  onChange={(value) =>
                    onSettings({ ...settings, aiApiKey: String(value) })
                  }
                />
              </label>
            </div>
          </div>
        </>
      )}

      {view === "templates" && (
        <>
          <SettingsSubpageHeader
            title="训练模板"
            subtitle="模板会影响新建或套用计划时的标题、强度、说明和饮食提示。"
            onBack={() => navigate(SETTINGS_ROUTES.main)}
          />
          <div className="panel template-panel">
            <div className="section-head">
              <h2>训练模板</h2>
              <Button
                size="small"
                shape="round"
                theme="primary"
                variant="outline"
                icon={<Plus size={17} />}
                onClick={addTemplate}
              >
                新增
              </Button>
            </div>
            {selected && (
              <>
                <PickerField
                  label="选择模板"
                  value={selected.id}
                  options={templates.map((template) => ({
                    label: template.name,
                    value: template.id,
                  }))}
                  onChange={setSelectedId}
                />
                <div className="form-grid">
                  <label>
                    模板名
                    <Input
                      value={selected.name}
                      clearable
                      onChange={(value) =>
                        updateTemplate({ name: String(value) })
                      }
                    />
                  </label>
                  <PickerField
                    label="类型"
                    value={
                      selected.kind === "strength" ? "recovery" : selected.kind
                    }
                    options={TRAINING_KIND_OPTIONS}
                    onChange={(value) => applyKindPreset(value as TrainingKind)}
                  />
                </div>
                <div className="toggle-row">
                  <div>
                    <strong>力量训练</strong>
                    <span>打开后可和恢复、Z2、甜区等类型组合</span>
                  </div>
                  <Switch
                    size="small"
                    value={Boolean(selected.exercises?.length)}
                    onChange={(value) => toggleStrength(Boolean(value))}
                  />
                </div>
                <label>
                  计划标题
                  <Input
                    value={selected.title}
                    clearable
                    onChange={(value) =>
                      updateTemplate({ title: String(value) })
                    }
                  />
                </label>
                {selected.kind !== "rest" && (
                  <div className="form-grid">
                    <label>
                      时长（分钟）
                      <Input
                        type="number"
                        value={selected.durationMinutes ?? ""}
                        onChange={(value) =>
                          updateTemplate({ durationMinutes: Number(value) })
                        }
                      />
                    </label>
                    <label>
                      FTP百分比
                      <FtpPercentRangePickerField
                        value={selected.rangePercent}
                        placeholder="选择 FTP 百分比区间"
                        onChange={(rangePercent) =>
                          updateTemplate({ rangePercent })
                        }
                      />
                    </label>
                  </div>
                )}
                {selected.kind !== "rest" && (
                  <PlanSegmentEditor
                    segments={
                      selected.segments ??
                      buildDefaultSegmentsForPlan({
                        kind: selected.kind,
                        durationMinutes: selected.durationMinutes,
                        powerRange: selected.rangePercent
                          ? [
                              Math.round(
                                selected.rangePercent[0] * settings.ftp,
                              ),
                              Math.round(
                                selected.rangePercent[1] * settings.ftp,
                              ),
                            ]
                          : undefined,
                      }) ??
                      []
                    }
                    defaultPowerRange={
                      selected.rangePercent
                        ? [
                            Math.round(selected.rangePercent[0] * settings.ftp),
                            Math.round(selected.rangePercent[1] * settings.ftp),
                          ]
                        : undefined
                    }
                    onChange={(segments) => updateTemplate({ segments })}
                  />
                )}
                {Boolean(selected.exercises?.length) && (
                  <label>
                    动作清单（每行：动作 | 组数 | 次数）
                    <Textarea
                      value={formatExercises(selected.exercises)}
                      autosize={{ minRows: 4, maxRows: 8 }}
                      onChange={(value) =>
                        updateTemplate({
                          exercises: parseExercises(String(value)),
                        })
                      }
                    />
                  </label>
                )}
                <label>
                  骑行说明
                  <Textarea
                    value={selected.rideDetails ?? ""}
                    autosize={{ minRows: 2, maxRows: 5 }}
                    onChange={(value) =>
                      updateTemplate({ rideDetails: String(value) })
                    }
                  />
                </label>
                <label>
                  饮食提示
                  <Textarea
                    value={selected.nutrition ?? ""}
                    autosize={{ minRows: 2, maxRows: 5 }}
                    onChange={(value) =>
                      updateTemplate({ nutrition: String(value) })
                    }
                  />
                </label>
                <label>
                  备注
                  <Textarea
                    value={selected.notes ?? ""}
                    autosize={{ minRows: 2, maxRows: 5 }}
                    onChange={(value) =>
                      updateTemplate({ notes: String(value) })
                    }
                  />
                </label>
                <div className="action-row">
                  <Button
                    variant="outline"
                    icon={<RotateCcw size={17} />}
                    onClick={() => setTemplateDialog("reset")}
                  >
                    恢复默认
                  </Button>
                  <Button
                    theme="danger"
                    variant="outline"
                    icon={<Trash2 size={17} />}
                    onClick={() => setTemplateDialog("delete")}
                    disabled={templates.length <= 1}
                  >
                    删除模板
                  </Button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {view === "guide" && (
        <>
          <SettingsSubpageHeader
            title="使用文档"
            subtitle="从添加到桌面到日常记录、同步、AI 咨询和备份的完整说明。"
            onBack={() => navigate(SETTINGS_ROUTES.main)}
          />
          <UserGuidePanel />
        </>
      )}

      {view === "main" && (
        <div className="panel">
          <h2>数据管理</h2>
          <BackupStatus lastBackupAt={settings.lastBackupAt} />
          <LocalDataSize
            settings={settings}
            plans={plans}
            bodyEntries={bodyEntries}
            checkins={checkins}
            trainingLogs={trainingLogs}
            activityAnalyses={activityAnalyses}
            dayMemos={dayMemos}
            lastFatigueReport={lastFatigueReport}
            aiCoachSession={aiCoachSession}
            igpsportSyncRecords={igpsportSyncRecords}
            templates={templates}
            onClearItem={setClearDataKey}
          />
          <div className="action-list">
            <Button
              block
              variant="outline"
              icon={<Download size={18} />}
              onClick={onExport}
            >
              导出 JSON 备份
            </Button>
            <label className="file-button">
              <Upload size={18} />
              导入 JSON 恢复
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
            <Button
              block
              theme="danger"
              variant="outline"
              icon={<RotateCcw size={18} />}
              onClick={() => setClearDialogStep(1)}
            >
              清空本地数据
            </Button>
          </div>
        </div>
      )}
      <Dialog
        visible={clearDialogStep > 0}
        title={clearDialogStep === 1 ? "清空本地数据？" : "再次确认"}
        content={
          <div className="dialog-copy">
            {clearDialogStep === 1 ? (
              <p>
                这会清空所有本地训练计划、身体记录、打卡、备忘、设置和 API Key。
              </p>
            ) : (
              <p>清空后不能撤销，只能通过之前导出的 JSON 备份恢复。</p>
            )}
          </div>
        }
        cancelBtn="取消"
        confirmBtn={clearDialogStep === 1 ? "继续" : "确认清空"}
        onClose={() => setClearDialogStep(0)}
        onCancel={() => setClearDialogStep(0)}
        onConfirm={handleClearConfirm}
      />
      <Dialog
        visible={Boolean(clearDataKey)}
        title={`清理${clearDataKey ? DATA_CLEAR_LABELS[clearDataKey] : ""}？`}
        content={
          <div className="dialog-copy">
            <p>
              {clearDataKey === "trainingTemplates"
                ? "这会把训练模板恢复为默认模板，不会删除已经写入到日计划里的内容。"
                : `这会只清理“${
                    clearDataKey ? DATA_CLEAR_LABELS[clearDataKey] : ""
                  }”这一项本地数据，其它数据会保留。`}
            </p>
          </div>
        }
        cancelBtn="取消"
        confirmBtn="确认清理"
        onClose={() => setClearDataKey(null)}
        onCancel={() => setClearDataKey(null)}
        onConfirm={handleClearDataItem}
      />
      <Dialog
        visible={Boolean(templateDialog)}
        title={
          templateDialog === "delete" ? "删除训练模板？" : "恢复默认模板？"
        }
        content={
          <div className="dialog-copy">
            {templateDialog === "delete" ? (
              <p>
                删除模板“{selected?.name ?? ""}
                ”？已安排到日计划里的内容不会自动删除。
              </p>
            ) : (
              <p>
                这会用默认模板替换当前模板库，但不会删除已经写入到日计划里的内容。
              </p>
            )}
          </div>
        }
        cancelBtn="取消"
        confirmBtn={templateDialog === "delete" ? "确认删除" : "确认恢复"}
        onClose={() => setTemplateDialog(null)}
        onCancel={() => setTemplateDialog(null)}
        onConfirm={
          templateDialog === "delete" ? deleteTemplate : resetTemplates
        }
      />
    </section>
  );
}
