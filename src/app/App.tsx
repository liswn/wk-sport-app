import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import "tdesign-mobile-react/es/style/index.css";
import "../styles.css";
import { getTabFromPathname } from "./routes";
import { AppShell } from "./AppShell";
import { PAGE_ROUTES } from "./pageRoutes";
import { useAppData } from "./useAppData";

export default function App() {
  const location = useLocation();
  const data = useAppData();
  const tab = getTabFromPathname(location.pathname);

  useEffect(() => {
    window.setTimeout(() => {
      window.scrollTo({
        top: 0,
        behavior: "auto",
      });
    }, 0);
  }, [location.pathname]);

  return (
    <AppShell ready={data.ready} ftp={data.settings.ftp} tab={tab}>
      <Routes>
        {PAGE_ROUTES.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={route.element(data)}
          />
        ))}
      </Routes>
    </AppShell>
  );
}
