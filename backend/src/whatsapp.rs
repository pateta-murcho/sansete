use serde_json::json;
use std::time::Duration;

use crate::state::AppState;

/// Fire-and-forget WhatsApp notification. Never blocks or fails the caller:
/// spawns a background task and logs+ignores any error.
pub fn notify(state: &AppState, phone: &str, message: &str) {
    let http = state.http.clone();
    let url = format!("{}/send", state.whatsapp_url);
    let phone = phone.to_string();
    let message = message.to_string();

    tokio::spawn(async move {
        let result = http
            .post(&url)
            .timeout(Duration::from_secs(5))
            .json(&json!({ "phone": phone, "message": message }))
            .send()
            .await;

        match result {
            Ok(resp) if !resp.status().is_success() => {
                tracing::warn!(
                    "whatsapp gateway returned non-success status {} for phone {}",
                    resp.status(),
                    phone
                );
            }
            Err(e) => {
                tracing::warn!("failed to reach whatsapp gateway for phone {}: {}", phone, e);
            }
            _ => {}
        }
    });
}

/// Strip everything except digits, so phone numbers are always sent as
/// "digits only with country code" as required by the gateway.
pub fn digits_only(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_digit()).collect()
}
