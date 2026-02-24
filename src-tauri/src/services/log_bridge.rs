use std::sync::Arc;

use tauri::Emitter;
use tracing::field::{Field, Visit};
use tracing_subscriber::layer::Context;
use tracing_subscriber::Layer;

use crate::models::log_event::LogEvent;

/// A tracing Layer that forwards structured events to the frontend via Tauri events.
pub struct TauriLogLayer {
    app_handle: Arc<tauri::AppHandle>,
}

impl TauriLogLayer {
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        Self {
            app_handle: Arc::new(app_handle),
        }
    }
}

impl<S> Layer<S> for TauriLogLayer
where
    S: tracing::Subscriber,
{
    fn on_event(&self, event: &tracing::Event<'_>, _ctx: Context<'_, S>) {
        // Skip DEBUG/TRACE events from being forwarded to the frontend.
        // These are too noisy for the debug panel — only forward INFO and above.
        // DEBUG logs still appear in Rust console output via the subscriber.
        if *event.metadata().level() >= tracing::Level::DEBUG {
            return;
        }

        let level = match *event.metadata().level() {
            tracing::Level::ERROR => "error",
            tracing::Level::WARN => "warn",
            tracing::Level::INFO => "info",
            tracing::Level::DEBUG | tracing::Level::TRACE => "debug",
        };

        let target = event.metadata().target();

        // Extract fields from the event
        let mut visitor = FieldVisitor::default();
        event.record(&mut visitor);

        // Use "message" field as the log message, fall back to target
        let message = visitor.message.unwrap_or_else(|| format!("[{}]", target));

        // Use "category" field if present, otherwise derive from target
        let category = visitor.category.unwrap_or_else(|| {
            if target.contains("steam_client") || target.contains("steam_api") {
                "api".to_string()
            } else if target.contains("scanner") || target.contains("vdf") {
                "scan".to_string()
            } else if target.contains("settings") {
                "settings".to_string()
            } else if target.contains("credential") {
                "credential".to_string()
            } else if target.contains("launcher") {
                "launch".to_string()
            } else {
                "system".to_string()
            }
        });

        // Use "source" field if present, otherwise use last segment of target
        let source = visitor
            .source
            .unwrap_or_else(|| target.rsplit("::").next().unwrap_or(target).to_string());

        // Collect remaining fields as metadata
        let metadata = if visitor.fields.is_empty() {
            None
        } else {
            Some(serde_json::Value::Object(
                visitor.fields.into_iter().collect(),
            ))
        };

        let log_event = LogEvent::new(level, &source, &category, &message, metadata);

        // Fire-and-forget emit to frontend
        let _ = self.app_handle.emit("log-event", &log_event);
    }
}

/// Visitor that extracts structured fields from tracing events.
#[derive(Default)]
struct FieldVisitor {
    message: Option<String>,
    category: Option<String>,
    source: Option<String>,
    fields: Vec<(String, serde_json::Value)>,
}

impl Visit for FieldVisitor {
    fn record_str(&mut self, field: &Field, value: &str) {
        match field.name() {
            "message" => self.message = Some(value.to_string()),
            "category" => self.category = Some(value.to_string()),
            "source" => self.source = Some(value.to_string()),
            name => self.fields.push((
                name.to_string(),
                serde_json::Value::String(value.to_string()),
            )),
        }
    }

    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        let s = format!("{:?}", value);
        match field.name() {
            "message" => self.message = Some(s),
            "category" => self.category = Some(s),
            "source" => self.source = Some(s),
            name => self
                .fields
                .push((name.to_string(), serde_json::Value::String(s))),
        }
    }

    fn record_i64(&mut self, field: &Field, value: i64) {
        self.fields.push((
            field.name().to_string(),
            serde_json::Value::Number(value.into()),
        ));
    }

    fn record_u64(&mut self, field: &Field, value: u64) {
        self.fields.push((
            field.name().to_string(),
            serde_json::Value::Number(value.into()),
        ));
    }

    fn record_bool(&mut self, field: &Field, value: bool) {
        self.fields
            .push((field.name().to_string(), serde_json::Value::Bool(value)));
    }

    fn record_f64(&mut self, field: &Field, value: f64) {
        if let Some(n) = serde_json::Number::from_f64(value) {
            self.fields
                .push((field.name().to_string(), serde_json::Value::Number(n)));
        }
    }
}
