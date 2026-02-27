import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { LibraryView } from "./components/library/LibraryView";
import { SettingsView } from "./components/settings/SettingsView";
import { FirstRunSetup } from "./components/setup/FirstRunSetup";
import { LoadingSpinner } from "./components/common/LoadingSpinner";
import { RouteErrorFallback } from "./components/common/RouteErrorFallback";
import { useSettings } from "./hooks/useSettings";
import { useTheme } from "./hooks/useTheme";
import { useDebugListener } from "./hooks/useDebugListener";
import { APP_NAME } from "./constants";
import { DebugPanel } from "./components/debug/DebugPanel";
import { ActivityView } from "./components/activity/ActivityView";
import { ProfileView } from "./components/profile/ProfileView";
import { NotesView } from "./components/notes/NotesView";
import { NewsView } from "./components/news/NewsView";
import { StorageView } from "./components/storage/StorageView";
import { AssistantView } from "./components/assistant/AssistantView";

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <Navigate to="/library" replace /> },
      {
        path: "/library",
        element: <LibraryView />,
        errorElement: <RouteErrorFallback />,
      },
      {
        path: "/assistant",
        element: <AssistantView />,
        errorElement: <RouteErrorFallback />,
      },
      {
        path: "/activity",
        element: <ActivityView />,
        errorElement: <RouteErrorFallback />,
      },
      {
        path: "/profile",
        element: <ProfileView />,
        errorElement: <RouteErrorFallback />,
      },
      { path: "/notes", element: <NotesView />, errorElement: <RouteErrorFallback /> },
      { path: "/news", element: <NewsView />, errorElement: <RouteErrorFallback /> },
      {
        path: "/storage",
        element: <StorageView />,
        errorElement: <RouteErrorFallback />,
      },
      {
        path: "/settings",
        element: <SettingsView />,
        errorElement: <RouteErrorFallback />,
      },
      { path: "/debug", element: <DebugPanel />, errorElement: <RouteErrorFallback /> },
      { path: "*", element: <Navigate to="/library" replace /> },
    ],
  },
]);

function App() {
  const { settings, isLoading } = useSettings();
  useTheme();
  useDebugListener();

  if (isLoading || !settings) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <LoadingSpinner size="lg" message={`Loading ${APP_NAME}...`} />
      </div>
    );
  }

  if (settings.isFirstRun) {
    return <FirstRunSetup />;
  }

  return <RouterProvider router={router} />;
}

export default App;
