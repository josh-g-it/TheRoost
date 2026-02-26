use tauri::State;

use crate::models::recap::{RecapData, RecapSummary};
use crate::services::cache_db::CacheDbHandle;
use crate::services::recap_service;
use crate::utils::error::{AppError, MutexExt};

#[tauri::command]
pub async fn get_recap(
    period_key: String,
    db: State<'_, CacheDbHandle>,
) -> Result<Option<RecapData>, AppError> {
    let db = db.lock_or_err("DB")?;
    db.get_recap(&period_key)
}

#[tauri::command]
pub async fn list_recaps(db: State<'_, CacheDbHandle>) -> Result<Vec<RecapSummary>, AppError> {
    let db = db.lock_or_err("DB")?;
    db.list_recaps()
}

#[tauri::command]
pub async fn generate_recap(
    period_key: String,
    period_type: String,
    db: State<'_, CacheDbHandle>,
) -> Result<RecapData, AppError> {
    let recap = match period_type.as_str() {
        "monthly" => {
            let parts: Vec<&str> = period_key.split('-').collect();
            if parts.len() != 2 {
                return Err(AppError::Validation(
                    "Monthly period_key must be YYYY-MM".into(),
                ));
            }
            let year: i32 = parts[0]
                .parse()
                .map_err(|_| AppError::Validation("Invalid year".into()))?;
            let month: u32 = parts[1]
                .parse()
                .map_err(|_| AppError::Validation("Invalid month".into()))?;
            recap_service::generate_monthly_recap(db.inner(), year, month)?
        }
        "yearly" => {
            let year: i32 = period_key
                .parse()
                .map_err(|_| AppError::Validation("Invalid year".into()))?;
            recap_service::generate_yearly_recap(db.inner(), year)?
        }
        _ => {
            return Err(AppError::Validation(
                "period_type must be 'monthly' or 'yearly'".into(),
            ))
        }
    };

    // Store the computed recap
    {
        let db = db.lock_or_err("DB")?;
        db.save_recap(&period_key, &period_type, &recap)?;
    }

    Ok(recap)
}

#[tauri::command]
pub async fn delete_recap(
    period_key: String,
    db: State<'_, CacheDbHandle>,
) -> Result<(), AppError> {
    let db = db.lock_or_err("DB")?;
    db.delete_recap(&period_key)
}
