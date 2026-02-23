import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SystemMetricsSnapshot } from "../../types";
import { SELF_PROCESS_ID } from "../../types";
import { formatBytes } from "../../utils/formatters";
import { AppIcon } from "../common/AppIcon";
import { Sparkline } from "./Sparkline";
import "./OverlaySystemMonitor.css";

const POLL_INTERVAL_MS = 1000;

function formatCpu(value: number): string {
  return value < 10 ? `${value.toFixed(1)}%` : `${Math.round(value)}%`;
}

function formatRamFraction(used: number, total: number): string {
  return `${formatBytes(used)} / ${formatBytes(total)}`;
}

interface OverlaySystemMonitorProps {
  activeSessions: { gameId: string }[];
  games: { gameId: string; name: string }[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function OverlaySystemMonitor(_props: OverlaySystemMonitorProps) {
  const [snapshot, setSnapshot] = useState<SystemMetricsSnapshot | null>(null);
  const [confirmKillPid, setConfirmKillPid] = useState<number | null>(null);
  const mountedRef = useRef(true);

  const fetchMetrics = useCallback(() => {
    invoke<SystemMetricsSnapshot>("get_system_metrics")
      .then((data) => {
        if (mountedRef.current) {
          setSnapshot(data);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchMetrics();
    const interval = setInterval(fetchMetrics, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchMetrics]);

  const handleKill = useCallback(
    (pid: number) => {
      invoke("kill_game_process", { pid })
        .then(() => {
          setConfirmKillPid(null);
          fetchMetrics();
        })
        .catch(() => setConfirmKillPid(null));
    },
    [fetchMetrics],
  );

  if (!snapshot) {
    return (
      <div className="overlay-sysmon">
        <div className="overlay-sysmon__empty">Loading metrics...</div>
      </div>
    );
  }

  const { current, history, processes } = snapshot;
  const cpuHistory = history.map((s) => s.cpuPercent);
  const ramHistory = history.map((s) => s.ramUsed);
  const gpuHistory = history
    .map((s) => s.gpuPercent)
    .filter((v): v is number => v !== null);
  const vramHistory = history
    .map((s) => s.gpuVramUsed)
    .filter((v): v is number => v !== null);
  const hasGpu = current.gpuPercent !== null;
  const hasVram = current.gpuVramUsed !== null && current.gpuVramTotal !== null;

  // Sort processes: The Roost first, then game processes by CPU desc
  const sortedProcesses = [...processes].sort((a, b) => {
    if (a.gameId === SELF_PROCESS_ID) return -1;
    if (b.gameId === SELF_PROCESS_ID) return 1;
    return b.cpuPercent - a.cpuPercent;
  });

  const gameProcesses = sortedProcesses.filter((p) => p.gameId !== SELF_PROCESS_ID);

  return (
    <div className="overlay-sysmon">
      {/* ── System Metrics ────────────────────────────────── */}
      <div className="overlay-sysmon__metrics">
        {/* CPU — auto-scales to data range so small spikes are visible */}
        <div className="overlay-sysmon__metric-row">
          <span className="overlay-sysmon__metric-label">CPU</span>
          <span className="overlay-sysmon__metric-sparkline">
            <Sparkline data={cpuHistory} height={30} />
          </span>
          <span className="overlay-sysmon__metric-value">
            {formatCpu(current.cpuPercent)}
          </span>
        </div>

        {/* RAM — auto-scales to data range */}
        <div className="overlay-sysmon__metric-row">
          <span className="overlay-sysmon__metric-label">RAM</span>
          <span className="overlay-sysmon__metric-sparkline">
            <Sparkline
              data={ramHistory}
              height={30}
              color="var(--color-accent-secondary, var(--color-accent-primary))"
            />
          </span>
          <span className="overlay-sysmon__metric-value">
            {formatRamFraction(current.ramUsed, current.ramTotal)}
          </span>
        </div>

        {/* GPU utilization */}
        <div
          className={`overlay-sysmon__metric-row${!hasGpu ? " overlay-sysmon__metric-row--unavailable" : ""}`}
        >
          <span className="overlay-sysmon__metric-label">GPU</span>
          <span className="overlay-sysmon__metric-sparkline">
            <Sparkline
              data={gpuHistory}
              height={30}
              max={100}
              color="var(--color-accent-tertiary, #10b981)"
            />
          </span>
          <span className="overlay-sysmon__metric-value">
            {hasGpu ? formatCpu(current.gpuPercent!) : "Unavailable"}
          </span>
        </div>

        {/* VRAM */}
        <div
          className={`overlay-sysmon__metric-row${!hasVram ? " overlay-sysmon__metric-row--unavailable" : ""}`}
        >
          <span className="overlay-sysmon__metric-label">VRAM</span>
          <span className="overlay-sysmon__metric-sparkline">
            <Sparkline
              data={vramHistory}
              height={30}
              color="var(--color-accent-tertiary, #10b981)"
            />
          </span>
          <span className="overlay-sysmon__metric-value">
            {hasVram
              ? formatRamFraction(current.gpuVramUsed!, current.gpuVramTotal!)
              : "Unavailable"}
          </span>
        </div>
      </div>

      {/* ── Process List ──────────────────────────────────── */}
      <div className="overlay-sysmon__processes">
        {/* Column headers */}
        <div className="overlay-sysmon__proc-columns">
          <span className="overlay-sysmon__col-icon" />
          <span className="overlay-sysmon__col-name">Process</span>
          <span className="overlay-sysmon__col-stat">CPU</span>
          <span className="overlay-sysmon__col-stat">RAM</span>
          <span className="overlay-sysmon__col-stat">GPU</span>
          <span className="overlay-sysmon__col-action" />
        </div>

        {sortedProcesses.map((proc) => {
          const isSelf = proc.gameId === SELF_PROCESS_ID;
          const isConfirming = confirmKillPid === proc.pid;

          return (
            <div
              key={proc.pid}
              className={`overlay-sysmon__proc-row ${isSelf ? "overlay-sysmon__proc-row--self" : ""}`}
            >
              <span className="overlay-sysmon__proc-icon">
                <AppIcon name={isSelf ? "settings" : "play"} size={14} />
              </span>
              <span className="overlay-sysmon__proc-name" title={proc.exeName}>
                {proc.name}
              </span>
              <span className="overlay-sysmon__proc-stat">
                {formatCpu(proc.cpuPercent)}
              </span>
              <span className="overlay-sysmon__proc-stat">
                {formatBytes(proc.ramBytes)}
              </span>
              <span className="overlay-sysmon__proc-stat">
                {proc.gpuPercent !== null ? formatCpu(proc.gpuPercent) : "—"}
              </span>
              {!isSelf && !isConfirming && (
                <button
                  className="overlay-sysmon__proc-kill"
                  onClick={() => setConfirmKillPid(proc.pid)}
                  onPointerDown={(e) => e.stopPropagation()}
                  title="End task"
                >
                  End
                </button>
              )}
              {isSelf && <span className="overlay-sysmon__proc-kill-spacer" />}
              {isConfirming && (
                <div className="overlay-sysmon__confirm">
                  <span className="overlay-sysmon__confirm-text">End {proc.name}?</span>
                  <button
                    className="overlay-sysmon__confirm-yes"
                    onClick={() => handleKill(proc.pid)}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    Yes
                  </button>
                  <button
                    className="overlay-sysmon__confirm-cancel"
                    onClick={() => setConfirmKillPid(null)}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {gameProcesses.length === 0 && (
          <div className="overlay-sysmon__empty">No game processes detected</div>
        )}
      </div>
    </div>
  );
}
