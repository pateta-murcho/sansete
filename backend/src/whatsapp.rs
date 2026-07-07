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

fn require_configured(state: &AppState) -> Result<(), crate::error::AppError> {
    if state.evolution_api_url.is_empty() || state.evolution_api_key.is_empty() || state.evolution_instance.is_empty() {
        return Err(crate::error::AppError::BadRequest(
            "EVOLUTION_API_URL/EVOLUTION_API_KEY/EVOLUTION_INSTANCE not configured".to_string(),
        ));
    }
    Ok(())
}

async fn evolution_json(
    resp: reqwest::Response,
) -> Result<serde_json::Value, crate::error::AppError> {
    let status = resp.status();
    let body: serde_json::Value = resp.json().await.unwrap_or(serde_json::Value::Null);
    if !status.is_success() {
        return Err(crate::error::AppError::Internal(format!(
            "evolution api returned {status}: {body}"
        )));
    }
    Ok(body)
}

/// Current connection state of the configured instance
/// (`{"instance": {"instanceName": "...", "state": "open"|"connecting"|"close"}}`,
/// exact shape depends on the Evolution API version).
pub async fn connection_status(state: &AppState) -> Result<serde_json::Value, crate::error::AppError> {
    require_configured(state)?;
    let url = format!(
        "{}/instance/connectionState/{}",
        state.evolution_api_url.trim_end_matches('/'),
        state.evolution_instance
    );
    let resp = state
        .http
        .get(&url)
        .header("apikey", state.evolution_api_key.as_str())
        .send()
        .await
        .map_err(|e| crate::error::AppError::Internal(format!("evolution api unreachable: {e}")))?;
    evolution_json(resp).await
}

/// Creates the instance if it doesn't exist yet (ignored if it already does)
/// and returns a fresh QR code / pairing code to scan.
pub async fn connect(state: &AppState) -> Result<serde_json::Value, crate::error::AppError> {
    require_configured(state)?;
    let base = state.evolution_api_url.trim_end_matches('/');

    let _ = state
        .http
        .post(format!("{base}/instance/create"))
        .header("apikey", state.evolution_api_key.as_str())
        .json(&json!({
            "instanceName": *state.evolution_instance,
            "qrcode": true,
            "integration": "WHATSAPP-BAILEYS"
        }))
        .send()
        .await;

    let resp = state
        .http
        .get(format!("{base}/instance/connect/{}", state.evolution_instance))
        .header("apikey", state.evolution_api_key.as_str())
        .send()
        .await
        .map_err(|e| crate::error::AppError::Internal(format!("evolution api unreachable: {e}")))?;
    evolution_json(resp).await
}

/// Logs out the WhatsApp session (keeps the instance registered so it can
/// reconnect later with a new QR code).
pub async fn logout(state: &AppState) -> Result<(), crate::error::AppError> {
    require_configured(state)?;
    let url = format!(
        "{}/instance/logout/{}",
        state.evolution_api_url.trim_end_matches('/'),
        state.evolution_instance
    );
    let resp = state
        .http
        .delete(&url)
        .header("apikey", state.evolution_api_key.as_str())
        .send()
        .await
        .map_err(|e| crate::error::AppError::Internal(format!("evolution api unreachable: {e}")))?;
    evolution_json(resp).await.map(|_| ())
}
