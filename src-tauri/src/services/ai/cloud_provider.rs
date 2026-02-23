use std::future::Future;
use std::pin::Pin;

use crate::utils::error::AppError;

/// Trait for cloud AI providers (Gemini, OpenAI, Claude).
/// Each provider implements the HTTP communication; the caller handles
/// JSON parsing and action ID validation.
pub trait CloudProviderApi: Send + Sync {
    /// Send a query to the cloud provider and return raw response text.
    /// The system_prompt and user_message are separate for providers that
    /// support system instructions natively.
    fn send_query(
        &self,
        system_prompt: &str,
        user_message: &str,
        api_key: &str,
    ) -> Pin<Box<dyn Future<Output = Result<String, AppError>> + Send + '_>>;

    /// Human-readable provider name for logging and UI.
    fn name(&self) -> &'static str;
}
