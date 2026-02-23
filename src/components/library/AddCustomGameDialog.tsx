import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Input } from "../common/Input";
import { Button } from "../common/Button";
import { useUIStore } from "../../store/uiSlice";
import { useLibraryStore } from "../../store/librarySlice";
import { customGameApi } from "../../services/tauri";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type { Game } from "../../types";
import "./AddCustomGameDialog.css";

interface AddCustomGameDialogProps {
  /** Existing game to edit, or null for add mode */
  editGame: Game | null;
  onClose: () => void;
}

export function AddCustomGameDialog({ editGame, onClose }: AddCustomGameDialogProps) {
  const isEditMode = editGame !== null;

  const [name, setName] = useState(editGame?.name ?? "");
  const [exePath, setExePath] = useState("");
  const [launchArgs, setLaunchArgs] = useState(editGame?.launchArgs ?? "");
  const [description, setDescription] = useState(editGame?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const addGame = useLibraryStore((s) => s.addGame);
  const removeGame = useLibraryStore((s) => s.removeGame);
  const closeDialog = useUIStore((s) => s.closeCustomGameDialog);
  const selectGame = useUIStore((s) => s.selectGame);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Load existing exe path in edit mode
  useEffect(() => {
    if (editGame?.installPath) {
      // installPath is the parent dir; we don't store the full exe path in the Game struct
      // so we just show the install path as a hint
      setExePath(editGame.installPath);
    }
  }, [editGame]);

  // Focus name input on mount
  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmDelete) {
          setConfirmDelete(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, confirmDelete]);

  const handleBrowse = async () => {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        filters: [
          {
            name: "Executable",
            extensions: ["exe"],
          },
        ],
      });
      if (selected) {
        setExePath(selected);
        setError(null);
        // Auto-fill name from exe filename if name is empty
        if (!name.trim()) {
          const fileName =
            selected
              .split(/[\\/]/)
              .pop()
              ?.replace(/\.exe$/i, "") ?? "";
          if (fileName) {
            setName(fileName);
          }
        }
      }
    } catch (e) {
      logger.error("AddCustomGameDialog", "library", "File picker error", {
        error: getErrorMessage(e),
      });
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Game name is required");
      return;
    }
    if (!exePath.trim()) {
      setError("Executable path is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (isEditMode && editGame) {
        const updated = await customGameApi.update(
          editGame.gameId,
          trimmedName !== editGame.name ? trimmedName : null,
          exePath !== editGame.installPath ? exePath : null,
          description.trim() !== (editGame.description ?? "") ? description.trim() : null,
          launchArgs.trim() !== (editGame.launchArgs ?? "") ? launchArgs.trim() : null,
        );
        // Update in library by removing old and adding updated
        removeGame(editGame.gameId);
        addGame(updated);
        logger.info("AddCustomGameDialog", "library", "Custom game updated", {
          gameId: editGame.gameId,
        });
      } else {
        const newGame = await customGameApi.add(
          trimmedName,
          exePath,
          description.trim() || undefined,
          launchArgs.trim() || undefined,
        );
        addGame(newGame);
        logger.info("AddCustomGameDialog", "library", "Custom game added", {
          gameId: newGame.gameId,
          name: trimmedName,
        });
      }
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editGame) return;

    setSaving(true);
    setError(null);

    try {
      await customGameApi.remove(editGame.gameId);
      removeGame(editGame.gameId);
      selectGame(null); // Close GameDetail if open
      closeDialog();
      logger.info("AddCustomGameDialog", "library", "Custom game removed", {
        gameId: editGame.gameId,
      });
    } catch (e) {
      setError(getErrorMessage(e));
      setSaving(false);
    }
  };

  return (
    <div className="custom-game__overlay" onClick={onClose}>
      <div
        className="custom-game"
        role="dialog"
        aria-modal="true"
        aria-label={isEditMode ? "Edit Custom Game" : "Add Custom Game"}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="custom-game__title">
          {isEditMode ? "Edit Custom Game" : "Add Custom Game"}
        </h2>

        {confirmDelete ? (
          <div className="custom-game__confirm">
            <p className="custom-game__confirm-text">
              Are you sure you want to remove <strong>{editGame?.name}</strong>? This will
              delete the game and all its data (sessions, tags, favorites, cover art).
            </p>
            {error && <p className="custom-game__error">{error}</p>}
            <div className="custom-game__confirm-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleDelete} loading={saving}>
                Remove Game
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="custom-game__field">
              <label className="custom-game__label">Game Name</label>
              <Input
                ref={nameInputRef}
                placeholder="e.g. Hollow Knight"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
              />
            </div>

            <div className="custom-game__field">
              <label className="custom-game__label">Executable Path</label>
              <div className="custom-game__path-row">
                <Input
                  placeholder="C:\Games\MyGame\game.exe"
                  value={exePath}
                  onChange={(e) => {
                    setExePath(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                  }}
                />
                <button className="custom-game__browse" onClick={handleBrowse}>
                  Browse
                </button>
              </div>
            </div>

            <div className="custom-game__field">
              <label className="custom-game__label">Launch Arguments (optional)</label>
              <Input
                placeholder="e.g. --processStart Discord.exe"
                value={launchArgs}
                onChange={(e) => {
                  setLaunchArgs(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
              />
            </div>

            <div className="custom-game__field">
              <label className="custom-game__label">Description (optional)</label>
              <textarea
                className="custom-game__textarea"
                placeholder="A brief description of the game..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {error && <p className="custom-game__error">{error}</p>}

            <div
              className={`custom-game__actions ${isEditMode ? "custom-game__actions--split" : ""}`}
            >
              {isEditMode && (
                <div className="custom-game__delete-group">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                    disabled={saving}
                  >
                    Remove
                  </Button>
                </div>
              )}
              <div className="custom-game__actions">
                <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  loading={saving}
                  disabled={!name.trim() || !exePath.trim()}
                >
                  {isEditMode ? "Save" : "Add Game"}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
