import { useState, useCallback } from "react";
import type { ConfirmDialogProps } from "../components/common/ConfirmDialog";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/**
 * Hook for imperatively showing a styled confirm dialog.
 *
 * Usage:
 * ```tsx
 * const { confirm, dialogProps } = useConfirmDialog();
 *
 * const handleDelete = async () => {
 *   const ok = await confirm({ title: "Delete?", message: "Are you sure?" });
 *   if (!ok) return;
 *   // proceed
 * };
 *
 * return <><ConfirmDialog {...dialogProps} /> ... </>;
 * ```
 */
export function useConfirmDialog() {
  const [state, setState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ options, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (state) {
      state.resolve(true);
      setState(null);
    }
  }, [state]);

  const handleCancel = useCallback(() => {
    if (state) {
      state.resolve(false);
      setState(null);
    }
  }, [state]);

  const dialogProps: ConfirmDialogProps = {
    isOpen: state !== null,
    title: state?.options.title ?? "",
    message: state?.options.message ?? "",
    confirmLabel: state?.options.confirmLabel,
    cancelLabel: state?.options.cancelLabel,
    destructive: state?.options.destructive,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  };

  return { confirm, dialogProps };
}
