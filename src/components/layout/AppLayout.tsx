import { Outlet, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../../store/settingsSlice";
import { useTrayListener } from "../../hooks/useTrayListener";
import { useEventListener } from "../../hooks/useEventListener";
import { IconRail } from "./IconRail";
import { BackgroundTaskBanner } from "../library/BackgroundTaskBanner";
import { UpdateBanner } from "./UpdateBanner";
import "./AppLayout.css";

interface PostSessionReviewPayload {
  gameId: string;
  gameName: string;
  durationMinutes: number;
}

export function AppLayout() {
  useTrayListener();
  const navigate = useNavigate();
  const settings = useSettingsStore((s) => s.settings);
  const railMode = settings?.railMode ?? "dynamic";

  const openOverlay = () => {
    invoke("toggle_overlay");
  };

  // Global listener for post-session review prompts from process monitor
  useEventListener<PostSessionReviewPayload>(
    "post-session-review",
    (event) => {
      const { gameId, gameName, durationMinutes } = event.payload;
      sessionStorage.setItem(
        "pendingReview",
        JSON.stringify({ gameId, gameName, durationMinutes }),
      );
      navigate("/assistant");
    },
    [navigate],
  );

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
