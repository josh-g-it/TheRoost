use std::sync::{Arc, Mutex};
use std::time::Instant;

use crate::models::ai::CloudProvider;

/// Runtime cloud AI configuration. Managed as Tauri state.
/// Updated via commands when settings change; daily counter resets automatically.
#[derive(Debug, Clone)]
pub struct CloudConfig {
    pub enabled: bool,
    pub provider: CloudProvider,
    pub daily_limit: u32,
    pub requests_today: u32,
    pub last_reset_date: String,
    pub last_request_at: Option<Instant>,
    pub rate_limited_until: Option<Instant>,
}

pub type CloudConfigHandle = Arc<Mutex<CloudConfig>>;

impl CloudConfig {
    pub fn new(enabled: bool, provider: CloudProvider, daily_limit: u32) -> Self {
        Self {
            enabled,
            provider,
            daily_limit,
            requests_today: 0,
            last_reset_date: today_iso(),
            last_request_at: None,
            rate_limited_until: None,
        }
    }

    /// Check and reset daily counter if the date has changed.
    pub fn maybe_reset_daily(&mut self) {
        let today = today_iso();
        if self.last_reset_date != today {
            self.requests_today = 0;
            self.last_reset_date = today;
        }
    }

    /// Whether a cloud request is allowed right now (rate limit + daily limit).
    pub fn can_request(&mut self) -> bool {
        self.maybe_reset_daily();

        // Check server-side rate limit cooldown (e.g., after 429)
        if let Some(until) = self.rate_limited_until {
            if Instant::now() < until {
                return false;
            }
            self.rate_limited_until = None;
        }

        // Check client-side rate limit (2s between requests)
        if let Some(last) = self.last_request_at {
            if last.elapsed().as_secs_f64() < 2.0 {
                return false;
            }
        }

        // Check daily limit
        self.requests_today < self.daily_limit
    }

    /// Record that a request was made.
    pub fn record_request(&mut self) {
        self.requests_today += 1;
        self.last_request_at = Some(Instant::now());
    }

    /// Set a rate-limit cooldown (e.g., 60s after a 429).
    pub fn set_rate_limited(&mut self, seconds: u64) {
        self.rate_limited_until =
            Some(Instant::now() + std::time::Duration::from_secs(seconds));
    }
}

fn today_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%d").to_string()
}
