import { useEffect, useState } from "react";
import { Button } from "tdesign-mobile-react";
import { ArrowLeft, Smartphone } from "lucide-react";
import type {
  ActivityAnalysis,
  AiCoachSession,
  BodyEntry,
  Checkins,
  DayMemo,
  FatigueAnalysisReport,
  IgpsportSyncRecord,
  PlanDay,
  SettingsState,
  TrainingLog,
  TrainingTemplate,
} from "../../model";
import {
  DATA_CLEAR_LABELS,
  countRecord,
  formatBytes,
  formatReportTime,
  type LocalDataClearKey,
} from "../../shared/lib";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function SettingsSubpageHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
}) {
  return (
    <div className="settings-subpage-head">
      <Button
        size="small"
        shape="round"
        variant="outline"
        icon={<ArrowLeft size={17} />}
        onClick={onBack}
      >
        返回
      </Button>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

export function InstallGuide() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installStatus, setInstallStatus] = useState("");

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () =>
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
  }, []);

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  const promptInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setInstallStatus(
      choice.outcome === "accepted" ? "已开始安装流程" : "已取消安装",
    );
  };

  return (
    <div className="panel install-guide">
      <div className="section-head">
        <div>
          <h2>添加到桌面</h2>
          <p className="muted">把 PWA 放到主屏幕后，会像单机 App 一样打开。</p>
        </div>
        <Smartphone size={22} />
      </div>
      {standalone ? (
        <p className="sync-success">当前已经是独立窗口模式。</p>
      ) : (
        <>
          {installPrompt && (
            <Button block theme="primary" shape="round" onClick={promptInstall}>
              安装应用
            </Button>
          )}
          <div className="install-steps">
            <div>
              <strong>iPhone / iPad</strong>
              <span>用 Safari 打开，点分享按钮，选择“添加到主屏幕”。</span>
            </div>
            <div>
              <strong>Android</strong>
              <span>
                用 Chrome 或 Edge 打开，点菜单，选择“安装应用”或“添加到主屏幕”。
              </span>
            </div>
          </div>
          {isIos && (
            <p className="muted-note">
              iOS 不会弹出安装按钮，需要从 Safari 分享菜单手动添加。
            </p>
          )}
          {installStatus && <p className="sync-success">{installStatus}</p>}
        </>
      )}
    </div>
  );
}

export function UserGuidePanel() {
  const sections = [
    {
      title: "添加到桌面",
      items: [
        "iPhone / iPad：用 Safari 打开网站，点分享按钮，选择“添加到主屏幕”。",
        "Android：用 Chrome 或 Edge 打开网站，点菜单里的“安装应用”或“添加到主屏幕”。",
        "添加后从桌面图标打开，会以 PWA 独立窗口运行。",
      ],
    },
    {
      title: "每日使用",
      items: [
        "“今日”优先看今日备忘、训练计划、推荐饮食和快捷打卡。",
        "底部快捷打卡记录训练完成、蛋白质、晚餐控制和早睡。",
        "AI 疲劳分析会保存最后一次结果，切换页面后不会丢。",
      ],
    },
    {
      title: "训练计划",
      items: [
        "“计划”默认显示本周，并自动定位到今天。",
        "每天卡片默认折叠，点“展开”后编辑模板、时长、备注和实际完成记录。",
        "顶部完成进度点可跳到对应日期，AI 生成的计划需要先预览，再手动应用覆盖。",
      ],
    },
    {
      title: "日历与身体",
      items: [
        "“日历”查看每天完成情况，也能写当天备忘。",
        "配置 Intervals.icu 后可同步单日或整月训练摘要，应用只保存分析结果。",
        "“身体”记录体重、体脂率、腰围、胸围和备注，趋势图放在身体页下方。",
      ],
    },
    {
      title: "设置与备份",
      items: [
        "设置主页可以改 FTP、身高和训练目标。",
        "外部 API、AI 配置、训练模板都放在独立子页面。",
        "长期记录建议每周导出一次 JSON，导入前应用会先自动备份当前数据。",
      ],
    },
    {
      title: "隐私边界",
      items: [
        "训练、身体、打卡、备忘和 API Key 保存在当前浏览器本地。",
        "外部同步和 AI 只在你点击对应按钮后请求。",
        "网站已接入 51.LA 访问统计，页面访问会加载第三方统计脚本；训练和身体数据不会由本应用主动提交给 51.LA。",
      ],
    },
  ];

  return (
    <div className="panel guide-panel">
      {sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <ul>
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function BackupStatus({ lastBackupAt }: { lastBackupAt?: string }) {
  const lastBackupDate = lastBackupAt ? new Date(lastBackupAt) : null;
  const daysSince = lastBackupDate
    ? Math.floor((Date.now() - lastBackupDate.getTime()) / 86400000)
    : undefined;
  const needsBackup = daysSince === undefined || daysSince >= 7;

  return (
    <div className={`backup-status ${needsBackup ? "warn" : ""}`}>
      <span>{needsBackup ? "建议备份" : "备份状态"}</span>
      <strong>
        {lastBackupDate
          ? `上次备份：${formatReportTime(lastBackupDate.toISOString())}`
          : "还没有导出过备份"}
      </strong>
      <p>
        {needsBackup
          ? "长期记录建议每周手动导出一次 JSON。导入恢复前会自动先导出当前数据。"
          : "当前本地数据已在最近一周内备份过。"}
      </p>
    </div>
  );
}

export function LocalDataSize({
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
  onClearItem,
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
  onClearItem: (key: LocalDataClearKey) => void;
}) {
  const snapshot = {
    schema: "wk-sport-app-v1",
    exportedAt: new Date().toISOString(),
    data: {
      settings,
      plans,
      bodyEntries,
      checkins,
      trainingLogs,
      activityAnalyses,
      dayMemos,
      lastFatigueReport,
      aiCoachSession,
      trainingTemplates: templates,
      igpsportSyncRecords,
    },
  };
  const bytes = new Blob([JSON.stringify(snapshot)]).size;
  const rows: Array<{ key: LocalDataClearKey; count: number; hint: string }> = [
    { key: "plans", count: countRecord(plans), hint: "已编辑日计划" },
    {
      key: "bodyEntries",
      count: countRecord(bodyEntries),
      hint: "体重身体记录",
    },
    { key: "checkins", count: countRecord(checkins), hint: "每日执行打卡" },
    {
      key: "trainingLogs",
      count: countRecord(trainingLogs),
      hint: "实际完成记录",
    },
    { key: "dayMemos", count: countRecord(dayMemos), hint: "日历备忘" },
    {
      key: "activityAnalyses",
      count: countRecord(activityAnalyses),
      hint: "Intervals 摘要",
    },
    {
      key: "lastFatigueReport",
      count: lastFatigueReport ? 1 : 0,
      hint: "最后一次 AI 疲劳分析",
    },
    {
      key: "aiCoachSession",
      count: aiCoachSession?.messages?.length ?? 0,
      hint: "训练顾问上下文",
    },
    {
      key: "trainingTemplates",
      count: templates.length,
      hint: "自定义训练模板",
    },
    {
      key: "igpsportSyncRecords",
      count: countRecord(igpsportSyncRecords),
      hint: "防重复同步记录",
    },
  ];

  return (
    <div className="local-data-size">
      <div className="local-data-total">
        <span>本地数据量</span>
        <strong>{formatBytes(bytes)}</strong>
      </div>
      <div className="local-data-grid">
        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            className="local-data-item"
            onClick={() => onClearItem(row.key)}
          >
            <span>{DATA_CLEAR_LABELS[row.key]}</span>
            <strong>{row.count}</strong>
            <em>{row.hint}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

export function PowerZone({
  name,
  range,
  ftp,
  prefix,
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
