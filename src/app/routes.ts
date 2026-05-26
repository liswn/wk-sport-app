export type Tab = "today" | "plan" | "calendar" | "body" | "settings";

export type SettingsView = "main" | "integrations" | "templates" | "guide";

export const TAB_ROUTES: Record<Tab, string> = {
  today: "/",
  plan: "/plan",
  calendar: "/calendar",
  body: "/body",
  settings: "/settings",
};

export const SETTINGS_ROUTES: Record<SettingsView, string> = {
  main: "/settings",
  integrations: "/settings/integrations",
  templates: "/settings/templates",
  guide: "/settings/guide",
};

export function getTabFromPathname(pathname: string): Tab {
  if (pathname.startsWith("/plan")) return "plan";
  if (pathname.startsWith("/calendar")) return "calendar";
  if (pathname.startsWith("/body")) return "body";
  if (pathname.startsWith("/settings")) return "settings";
  return "today";
}

export function getSettingsViewFromPathname(
  pathname: string,
): SettingsView {
  if (pathname.startsWith("/settings/integrations")) return "integrations";
  if (pathname.startsWith("/settings/templates")) return "templates";
  if (pathname.startsWith("/settings/guide")) return "guide";
  return "main";
}
