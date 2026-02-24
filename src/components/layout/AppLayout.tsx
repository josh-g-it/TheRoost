import { Outlet } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../../store/settingsSlice";
import { useTrayListener } from "../../hooks/useTrayListener";
import { IconRail } from "./IconRail";
import { BackgroundTaskBanner } from "../library/BackgroundTaskBanner";
import { UpdateBanner } from "./UpdateBanner";
import "./AppLayout.css";

export function AppLayout() {
  useTrayListener();
  const settings = useSettingsStore((s) => s.settings);
  const railMode = settings?.railMode ?? "dynamic";

  const openOverlay = () => {
    invoke("toggle_overlay");
  };

  return (
    <div className="app-layout">
      <IconRail onCommandCenterToggle={openOverlay} railMode={railMode} />
      <main className="app-layout__content" data-rail-mode={railMode}>
        <UpdateBanner />
        <BackgroundTaskBanner />
        <Outlet />
      </main>
    </div>
  );
}
