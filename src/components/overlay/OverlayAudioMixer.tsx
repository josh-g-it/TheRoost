import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audioMixerApi } from "../../services/tauri";
import type { AudioSnapshot, AudioSession, AudioDevice } from "../../types";
import { AppIcon } from "../common/AppIcon";
import type { IconName } from "../../utils/icons";
import "./OverlayAudioMixer.css";

const POLL_INTERVAL_MS = 2000;
const PEAK_THRESHOLD = 0.001;

type DeviceTab = "output" | "input";

export function OverlayAudioMixer() {
  const [snapshot, setSnapshot] = useState<AudioSnapshot | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [revealedExes, setRevealedExes] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);

  // Track which sessions are being actively dragged to skip poll overwrites
  const draggingPidsRef = useRef<Set<number>>(new Set());

  const fetchSnapshot = useCallback(() => {
    audioMixerApi
      .getSnapshot()
      .then((s) => {
        if (!mountedRef.current) return;
        setSnapshot((prev) => {
          if (!prev) return s;
          if (draggingPidsRef.current.size === 0) return s;
          const merged = {
            ...s,
            sessions: s.sessions.map((sess) => {
              if (draggingPidsRef.current.has(sess.pid)) {
                const local = prev.sessions.find((p) => p.pid === sess.pid);
                return local
                  ? { ...sess, volume: local.volume, isMuted: local.isMuted }
                  : sess;
              }
              return sess;
            }),
          };
          return merged;
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchSnapshot();
    const id = setInterval(fetchSnapshot, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchSnapshot]);

  // ── Auto-reveal based on peak level ─────────────────────────────
  useEffect(() => {
    if (!snapshot) return;
    let changed = false;
    const next = new Set(revealedExes);
    for (const session of snapshot.sessions) {
      if (session.peakLevel > PEAK_THRESHOLD && !next.has(session.exeName)) {
        next.add(session.exeName);
        changed = true;
      }
    }
    if (changed) setRevealedExes(next);
  }, [snapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Compute visible vs hidden sessions ──────────────────────────
  const sessionPrefsMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const pref of snapshot?.sessionPrefs ?? []) {
      map.set(pref.exeName, pref.hidden);
    }
    return map;
  }, [snapshot?.sessionPrefs]);

  const { visibleSessions, hiddenSessions } = useMemo(() => {
    if (!snapshot) return { visibleSessions: [], hiddenSessions: [] };
    const visible: AudioSession[] = [];
    const hidden: AudioSession[] = [];

    for (const session of snapshot.sessions) {
      const manuallyHidden = sessionPrefsMap.get(session.exeName) === true;
      const hasBeenRevealed = revealedExes.has(session.exeName);

      if (manuallyHidden) {
        hidden.push(session);
      } else if (hasBeenRevealed || session.peakLevel > PEAK_THRESHOLD) {
        visible.push(session);
      } else {
        hidden.push(session);
      }
    }

    return { visibleSessions: visible, hiddenSessions: hidden };
  }, [snapshot?.sessions, sessionPrefsMap, revealedExes]);

  // ── Master volume handlers ──────────────────────────────────────
  const handleMasterVolume = useCallback((volume: number) => {
    setSnapshot((prev) => (prev ? { ...prev, masterVolume: volume } : prev));
    audioMixerApi.setMasterVolume(volume).catch(() => {});
  }, []);

  const handleMasterMute = useCallback(() => {
    if (!snapshot) return;
    const muted = !snapshot.masterMuted;
    setSnapshot((prev) => (prev ? { ...prev, masterMuted: muted } : prev));
    audioMixerApi.setMasterMute(muted).catch(() => {});
  }, [snapshot]);

  // ── Per-session handlers ────────────────────────────────────────
  const handleSessionVolume = useCallback((pid: number, volume: number) => {
    setSnapshot((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sessions: prev.sessions.map((s) => (s.pid === pid ? { ...s, volume } : s)),
      };
    });
    audioMixerApi.setSessionVolume(pid, volume).catch(() => {});
  }, []);

  const handleSessionDragStart = useCallback((pid: number) => {
    draggingPidsRef.current.add(pid);
  }, []);

  const handleSessionDragEnd = useCallback((pid: number) => {
    draggingPidsRef.current.delete(pid);
  }, []);

  const handleSessionMute = useCallback(
    (pid: number) => {
      if (!snapshot) return;
      const session = snapshot.sessions.find((s) => s.pid === pid);
      if (!session) return;
      const muted = !session.isMuted;
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sessions: prev.sessions.map((s) =>
            s.pid === pid ? { ...s, isMuted: muted } : s,
          ),
        };
      });
      audioMixerApi.setSessionMute(pid, muted).catch(() => {});
    },
    [snapshot],
  );

  // ── Hide/unhide handlers ────────────────────────────────────────
  const handleHideSession = useCallback(
    (exeName: string) => {
      audioMixerApi
        .setSessionHidden(exeName, true)
        .then(fetchSnapshot)
        .catch(() => {});
    },
    [fetchSnapshot],
  );

  const handleUnhideSession = useCallback(
    (exeName: string) => {
      audioMixerApi
        .setSessionHidden(exeName, false)
        .then(fetchSnapshot)
        .catch(() => {});
    },
    [fetchSnapshot],
  );

  // ── Device switching ────────────────────────────────────────────
  const handleDeviceSwitch = useCallback(
    (deviceId: string, tab: DeviceTab) => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        const key = tab === "output" ? "outputDevices" : "inputDevices";
        return {
          ...prev,
          [key]: prev[key].map((d) => ({ ...d, isDefault: d.id === deviceId })),
        };
      });
      const fn =
        tab === "output"
          ? audioMixerApi.setDefaultOutputDevice
          : audioMixerApi.setDefaultInputDevice;
      fn(deviceId)
        .then(fetchSnapshot)
        .catch(() => {});
    },
    [fetchSnapshot],
  );

  // ── Device alias handlers ───────────────────────────────────────
  const handleSetDeviceAlias = useCallback(
    (deviceId: string, customName: string) => {
      if (!customName.trim()) {
        audioMixerApi
          .deleteDeviceAlias(deviceId)
          .then(fetchSnapshot)
          .catch(() => {});
      } else {
        audioMixerApi
          .setDeviceAlias(deviceId, customName.trim())
          .then(fetchSnapshot)
          .catch(() => {});
      }
    },
    [fetchSnapshot],
  );

  // ── Render ──────────────────────────────────────────────────────
  if (!snapshot) {
    return (
      <div className="overlay-audio">
        <div className="overlay-audio__empty">Loading audio...</div>
      </div>
    );
  }

  const sliderBg = (value: number, muted: boolean): React.CSSProperties => ({
    background: muted
      ? `var(--color-border)`
      : `linear-gradient(to right, var(--color-accent-primary) 0%, var(--color-accent-primary) ${value * 100}%, var(--color-border) ${value * 100}%, var(--color-border) 100%)`,
  });

  return (
    <div className="overlay-audio">
      {/* Device selectors */}
      <div className="overlay-audio__device-bar">
        <DeviceSelector
          icon="volume"
          devices={snapshot.outputDevices}
          tab="output"
          onSwitch={handleDeviceSwitch}
          onSetAlias={handleSetDeviceAlias}
        />
        <DeviceSelector
          icon="volume-off"
          devices={snapshot.inputDevices}
          tab="input"
          onSwitch={handleDeviceSwitch}
          onSetAlias={handleSetDeviceAlias}
        />
      </div>

      {/* Master volume */}
      <div className="overlay-audio__master">
        <span className="overlay-audio__master-label">Master</span>
        <input
          type="range"
          className={`overlay-audio__slider${snapshot.masterMuted ? " overlay-audio__slider--muted" : ""}`}
          min={0}
          max={1}
          step={0.01}
          value={snapshot.masterVolume}
          style={sliderBg(snapshot.masterVolume, snapshot.masterMuted)}
          onChange={(e) => handleMasterVolume(parseFloat(e.target.value))}
          onPointerDown={(e) => e.stopPropagation()}
        />
        <span className="overlay-audio__master-pct">
          {Math.round(snapshot.masterVolume * 100)}%
        </span>
        <button
          className={`overlay-audio__mute-btn${snapshot.masterMuted ? " overlay-audio__mute-btn--muted" : ""}`}
          onClick={handleMasterMute}
          onPointerDown={(e) => e.stopPropagation()}
          title={snapshot.masterMuted ? "Unmute" : "Mute"}
        >
          <AppIcon name={snapshot.masterMuted ? "volume-off" : "volume"} size={14} />
        </button>
      </div>

      {/* Visible sessions */}
      <div className="overlay-audio__sessions">
        {visibleSessions.length === 0 && hiddenSessions.length === 0 ? (
          <div className="overlay-audio__empty">No audio sessions</div>
        ) : (
          visibleSessions.map((session) => (
            <SessionCard
              key={session.pid}
              session={session}
              sliderBg={sliderBg}
              onVolumeChange={handleSessionVolume}
              onMuteToggle={handleSessionMute}
              onDragStart={handleSessionDragStart}
              onDragEnd={handleSessionDragEnd}
              onHide={handleHideSession}
            />
          ))
        )}
      </div>

      {/* Hidden sessions toggle */}
      {hiddenSessions.length > 0 && (
        <>
          <button
            className="overlay-audio__hidden-toggle"
            onClick={() => setShowHidden((v) => !v)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span
              className={`overlay-audio__hidden-toggle-arrow${showHidden ? " overlay-audio__hidden-toggle-arrow--open" : ""}`}
            >
              &#9656;
            </span>
            Hidden ({hiddenSessions.length})
          </button>
          {showHidden && (
            <div className="overlay-audio__hidden-list">
              {hiddenSessions.map((session) => (
                <HiddenSessionRow
                  key={session.pid}
                  session={session}
                  sliderBg={sliderBg}
                  onVolumeChange={handleSessionVolume}
                  onMuteToggle={handleSessionMute}
                  onDragStart={handleSessionDragStart}
                  onDragEnd={handleSessionDragEnd}
                  onUnhide={handleUnhideSession}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── DeviceSelector sub-component ────────────────────────────────

interface DeviceSelectorProps {
  icon: IconName;
  devices: AudioDevice[];
  tab: DeviceTab;
  onSwitch: (deviceId: string, tab: DeviceTab) => void;
  onSetAlias: (deviceId: string, customName: string) => void;
}

function DeviceSelector({
  icon,
  devices,
  tab,
  onSwitch,
  onSetAlias,
}: DeviceSelectorProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const defaultDevice = devices.find((d) => d.isDefault);
  const displayName =
    defaultDevice?.customName ||
    defaultDevice?.name ||
    (tab === "output" ? "No output" : "No input");

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const startEditing = (device: AudioDevice) => {
    setEditingId(device.id);
    setEditValue(device.customName || device.name);
  };

  const commitEdit = () => {
    if (editingId) {
      onSetAlias(editingId, editValue);
      setEditingId(null);
    }
  };

  return (
    <div className="overlay-audio__device-group" ref={dropdownRef}>
      <button
        className="overlay-audio__device-trigger"
        onClick={() => setOpen((v) => !v)}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="overlay-audio__device-trigger-icon">
          <AppIcon name={icon} size={11} />
        </span>
        <span className="overlay-audio__device-trigger-name" title={displayName}>
          {displayName}
        </span>
        <span className="overlay-audio__device-trigger-arrow">&#9662;</span>
      </button>

      {open && (
        <div className="overlay-audio__device-dropdown">
          {devices.map((device) => (
            <div key={device.id} className="overlay-audio__device-option">
              <span
                className={`overlay-audio__device-radio${device.isDefault ? " overlay-audio__device-radio--active" : ""}`}
                onClick={() => {
                  onSwitch(device.id, tab);
                  setOpen(false);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
              {editingId === device.id ? (
                <input
                  className="overlay-audio__device-name-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onBlur={commitEdit}
                  onPointerDown={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <>
                  <span
                    className={`overlay-audio__device-option-name${device.isDefault ? " overlay-audio__device-option-name--default" : ""}`}
                    onClick={() => {
                      onSwitch(device.id, tab);
                      setOpen(false);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    title={device.customName ? `${device.name} (renamed)` : device.name}
                  >
                    {device.customName || device.name}
                  </span>
                  <button
                    className="overlay-audio__device-edit-btn"
                    onClick={() => startEditing(device)}
                    onPointerDown={(e) => e.stopPropagation()}
                    title="Rename device"
                  >
                    <AppIcon name="edit" size={10} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SessionCard sub-component ───────────────────────────────────

interface SessionCardProps {
  session: AudioSession;
  sliderBg: (value: number, muted: boolean) => React.CSSProperties;
  onVolumeChange: (pid: number, volume: number) => void;
  onMuteToggle: (pid: number) => void;
  onDragStart: (pid: number) => void;
  onDragEnd: (pid: number) => void;
  onHide: (exeName: string) => void;
}

function SessionCard({
  session,
  sliderBg,
  onVolumeChange,
  onMuteToggle,
  onDragStart,
  onDragEnd,
  onHide,
}: SessionCardProps) {
  const isSystem = session.pid === 0;
  const displayName = isSystem
    ? "System Sounds"
    : session.displayName || session.exeName || `PID ${session.pid}`;

  return (
    <div className="overlay-audio__session-card">
      <div className="overlay-audio__session-row">
        <button
          className={`overlay-audio__mute-btn${session.isMuted ? " overlay-audio__mute-btn--muted" : ""}`}
          onClick={() => onMuteToggle(session.pid)}
          onPointerDown={(e) => e.stopPropagation()}
          title={session.isMuted ? "Unmute" : "Mute"}
        >
          <AppIcon name={session.isMuted ? "volume-off" : "volume"} size={12} />
        </button>
        <span
          className={`overlay-audio__session-name${isSystem ? " overlay-audio__session-name--system" : ""}`}
          title={displayName}
        >
          {displayName}
        </span>
        <input
          type="range"
          className={`overlay-audio__slider${session.isMuted ? " overlay-audio__slider--muted" : ""}`}
          min={0}
          max={1}
          step={0.01}
          value={session.volume}
          style={sliderBg(session.volume, session.isMuted)}
          onChange={(e) => onVolumeChange(session.pid, parseFloat(e.target.value))}
          onPointerDown={(e) => {
            e.stopPropagation();
            onDragStart(session.pid);
          }}
          onPointerUp={() => onDragEnd(session.pid)}
          onPointerCancel={() => onDragEnd(session.pid)}
        />
        <span className="overlay-audio__session-pct">
          {Math.round(session.volume * 100)}%
        </span>
        <button
          className="overlay-audio__session-hide-btn"
          onClick={() => onHide(session.exeName)}
          onPointerDown={(e) => e.stopPropagation()}
          title="Hide from mixer"
        >
          <AppIcon name="eye-off" size={10} />
        </button>
      </div>
      <div className="overlay-audio__peak-bar">
        <div
          className="overlay-audio__peak-fill"
          style={{ width: `${Math.min(session.peakLevel * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ── HiddenSessionRow sub-component ──────────────────────────────

interface HiddenSessionRowProps {
  session: AudioSession;
  sliderBg: (value: number, muted: boolean) => React.CSSProperties;
  onVolumeChange: (pid: number, volume: number) => void;
  onMuteToggle: (pid: number) => void;
  onDragStart: (pid: number) => void;
  onDragEnd: (pid: number) => void;
  onUnhide: (exeName: string) => void;
}

function HiddenSessionRow({
  session,
  sliderBg,
  onVolumeChange,
  onMuteToggle,
  onDragStart,
  onDragEnd,
  onUnhide,
}: HiddenSessionRowProps) {
  const isSystem = session.pid === 0;
  const displayName = isSystem
    ? "System Sounds"
    : session.displayName || session.exeName || `PID ${session.pid}`;

  return (
    <div className="overlay-audio__session-card overlay-audio__session-card--dimmed">
      <div className="overlay-audio__session-row">
        <button
          className={`overlay-audio__mute-btn${session.isMuted ? " overlay-audio__mute-btn--muted" : ""}`}
          onClick={() => onMuteToggle(session.pid)}
          onPointerDown={(e) => e.stopPropagation()}
          title={session.isMuted ? "Unmute" : "Mute"}
        >
          <AppIcon name={session.isMuted ? "volume-off" : "volume"} size={12} />
        </button>
        <span
          className={`overlay-audio__session-name${isSystem ? " overlay-audio__session-name--system" : ""}`}
          title={displayName}
        >
          {displayName}
        </span>
        <input
          type="range"
          className={`overlay-audio__slider${session.isMuted ? " overlay-audio__slider--muted" : ""}`}
          min={0}
          max={1}
          step={0.01}
          value={session.volume}
          style={sliderBg(session.volume, session.isMuted)}
          onChange={(e) => onVolumeChange(session.pid, parseFloat(e.target.value))}
          onPointerDown={(e) => {
            e.stopPropagation();
            onDragStart(session.pid);
          }}
          onPointerUp={() => onDragEnd(session.pid)}
          onPointerCancel={() => onDragEnd(session.pid)}
        />
        <span className="overlay-audio__session-pct">
          {Math.round(session.volume * 100)}%
        </span>
        <button
          className="overlay-audio__hidden-show-btn"
          onClick={() => onUnhide(session.exeName)}
          onPointerDown={(e) => e.stopPropagation()}
          title="Show in mixer"
        >
          Show
        </button>
      </div>
    </div>
  );
}
