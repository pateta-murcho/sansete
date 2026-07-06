use serde_json::json;
use std::time::Duration;

use crate::state::AppState;

/// Fire-and-forget WhatsApp notification via a self-hosted Evolution API
/// instance (https://github.com/EvolutionAPI/evolution-api). Never blocks or
/// fails the caller: spawns a background task and logs+ignores any error. If
/// Evolution API isn't configured yet, just logs the message instead.
pub fn notify(state: &AppState, phone: &str, message: &str) {
    if state.evolution_api_url.is_empty()
        || state.evolution_api_key.is_empty()
        || state.evolution_instance.is_empty()
    {
        tracing::info!("[whatsapp not configured] to {}: {}", phone, message);
        return;
    }

    let http = state.http.clone();
    let url = format!(
        "{}/message/sendText/{}",
        state.evolution_api_url.trim_end_matches('/'),
        state.evolution_instance
    );
    let api_key = (*state.evolution_api_key).clone();
    let phone = phone.to_string();
    let message = message.to_string();

    tokio::spawn(async move {
        let result = http
            .post(&url)
            .timeout(Duration::from_secs(10))
            .header("apikey", api_key)
            .json(&json!({ "number": phone, "text": message }))
            .send()
            .await;

        match result {
            Ok(resp) if !resp.status().is_success() => {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                tracing::warn!(
                    "evolution api returned non-success status {} for phone {}: {}",
                    status, phone, body
                );
            }
            Err(e) => {
                tracing::warn!("failed to reach evolution api for phone {}: {}", phone, e);
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
