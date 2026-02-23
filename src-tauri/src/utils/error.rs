use serde::Serialize;
use std::sync::{Mutex, MutexGuard};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Credential store error: {0}")]
    Credential(String),

    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Store API error: {0}")]
    StoreApi(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Lock poisoned: {0}")]
    LockPoisoned(String),
}

impl AppError {
    /// Returns a machine-readable error code for frontend consumption.
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Io(_) => "IO_ERROR",
            AppError::Parse(_) => "PARSE_ERROR",
            AppError::NotFound(_) => "NOT_FOUND",
            AppError::Http(_) => "HTTP_ERROR",
            AppError::Credential(_) => "CREDENTIAL_ERROR",
            AppError::Database(_) => "DATABASE_ERROR",
            AppError::StoreApi(_) => "STORE_API_ERROR",
            AppError::Validation(_) => "VALIDATION_ERROR",
            AppError::LockPoisoned(_) => "LOCK_POISONED",
        }
    }
}

/// Extension trait for Mutex that maps poison errors to AppError::LockPoisoned.
pub trait MutexExt<T> {
    fn lock_or_err(&self, context: &str) -> Result<MutexGuard<'_, T>, AppError>;
}

impl<T> MutexExt<T> for Mutex<T> {
    fn lock_or_err(&self, context: &str) -> Result<MutexGuard<'_, T>, AppError> {
        self.lock()
            .map_err(|_| AppError::LockPoisoned(format!("{} lock poisoned", context)))
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}
