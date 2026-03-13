use sysinfo::{Pid, ProcessesToUpdate, System};
use tauri::State;

use crate::models::system_metrics::SystemMetricsSnapshot;
use crate::services::process_monitor::SystemMetricsHandle;
use crate::utils::error::{AppError, MutexExt};

/// Return fresh system metrics (active refresh — lightweight targeted sysinfo call).
///
/// Async to avoid blocking the main thread — sysinfo refresh can take tens of
/// milliseconds, and running on the main thread blocks the WebView2 message pump.
#[tauri::command]
pub async fn get_system_metrics(
    metrics: State<'_, SystemMetricsHandle>,
) -> Result<SystemMetricsSnapshot, AppError> {
    let mut m = metrics.lock_or_err("Metrics")?;
    Ok(m.refresh_and_snapshot())
}

/// Kill a tracked game process by PID.
/// Only kills processes currently in the tracked process list and not The Roost itself.
#[tauri::command]
pub async fn kill_game_process(
    pid: u32,
    metrics: State<'_, SystemMetricsHandle>,
) -> Result<(), AppError> {
    // Verify PID is a tracked game process (tracked_pids excludes __self__)
    {
        let m = metrics.lock_or_err("Metrics")?;
        if !m.is_tracked_game_process(pid) {
            return Err(AppError::Validation(
                "Process is not a tracked game process".to_string(),
            ));
        }
    }

    // Kill using sysinfo — only refresh the specific PID for efficiency
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::Some(&[Pid::from_u32(pid)]), true);
    if let Some(process) = sys.process(Pid::from_u32(pid)) {
        process.kill();
        tracing::info!(pid = pid, "Game process killed by user");
        Ok(())
    } else {
        Err(AppError::NotFound(format!(
            "Process {} is no longer running",
            pid
        )))
    }
}
