import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { BodyPage } from "../pages/BodyPage";
import { CalendarPage } from "../pages/CalendarPage";
import { PlanPage } from "../pages/PlanPage";
import { SettingsPage } from "../pages/SettingsPage";
import { TodayPage } from "../pages/TodayPage";
import type { useAppData } from "./useAppData";

type AppDataContext = ReturnType<typeof useAppData>;

type PageRouteConfig = {
  path: string;
  element: (data: AppDataContext) => ReactNode;
};

export const PAGE_ROUTES: PageRouteConfig[] = [
  {
    path: "/",
    element: (data) => (
      <TodayPage
        plan={data.todayPlan}
        memo={data.dayMemos[data.today]}
        checkins={data.todayCheckins}
        plans={data.plans}
        bodyEntries={data.bodyEntries}
        allCheckins={data.checkins}
        trainingLogs={data.trainingLogs}
        activityAnalyses={data.activityAnalyses}
        lastFatigueReport={data.lastFatigueReport}
        settings={data.settings}
        templates={data.trainingTemplates}
        onFatigueReport={data.setLastFatigueReport}
        onCheck={(key, value) => data.updateCheckin(data.today, key, value)}
      />
    ),
  },
  {
    path: "/today",
    element: () => <Navigate to="/" replace />,
  },
  {
    path: "/plan",
    element: (data) => (
      <PlanPage
        settings={data.settings}
        plans={data.plans}
        bodyEntries={data.bodyEntries}
        checkins={data.checkins}
        templates={data.trainingTemplates}
        weekStart={data.weekStart}
        activityAnalyses={data.activityAnalyses}
        lastFatigueReport={data.lastFatigueReport}
        aiCoachSession={data.aiCoachSession}
        onWeekChange={data.setWeekStart}
        onPlanChange={data.updatePlan}
        onWeekPlansReplace={data.replaceWeekPlans}
        onAiCoachSession={data.setAiCoachSession}
        onTemplate={data.applyTemplate}
        onTrainingDone={(date, value) =>
          data.updateCheckin(date, "trainingDone", value)
        }
        trainingLogs={data.trainingLogs}
        onTrainingLogChange={data.updateTrainingLog}
      />
    ),
  },
  {
    path: "/calendar",
    element: (data) => (
      <CalendarPage
        settings={data.settings}
        plans={data.plans}
        checkins={data.checkins}
        dayMemos={data.dayMemos}
        activityAnalyses={data.activityAnalyses}
        igpsportSyncRecords={data.igpsportSyncRecords}
        templates={data.trainingTemplates}
        onSettings={data.setSettings}
        onIgpsportSyncRecordsChange={data.setIgpsportSyncRecords}
        onAnalysisSave={data.saveActivityAnalysis}
        onMemoChange={(date, text) =>
          data.setDayMemos((current) => ({
            ...current,
            [date]: { date, text },
          }))
        }
      />
    ),
  },
  {
    path: "/body",
    element: (data) => (
      <BodyPage
        settings={data.settings}
        entries={data.bodyEntries}
        onSave={(entry) =>
          data.setBodyEntries((current) => ({
            ...current,
            [entry.date]: entry,
          }))
        }
      />
    ),
  },
  {
    path: "/settings/*",
    element: (data) => (
      <SettingsPage
        settings={data.settings}
        plans={data.plans}
        bodyEntries={data.bodyEntries}
        checkins={data.checkins}
        trainingLogs={data.trainingLogs}
        activityAnalyses={data.activityAnalyses}
        dayMemos={data.dayMemos}
        lastFatigueReport={data.lastFatigueReport}
        aiCoachSession={data.aiCoachSession}
        igpsportSyncRecords={data.igpsportSyncRecords}
        templates={data.trainingTemplates}
        onSettings={data.setSettings}
        onTemplates={data.setTrainingTemplates}
        onClearDataItem={data.clearLocalDataItem}
        onExport={() => data.exportBackup()}
        onImport={data.importBackup}
        onClear={data.clearAllLocalData}
      />
    ),
  },
  {
    path: "*",
    element: () => <Navigate to="/" replace />,
  },
];
