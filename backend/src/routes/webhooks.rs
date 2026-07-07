use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde_json::Value;

use crate::state::AppState;

/// Receives incoming-message events from every Evolution API instance
/// (store + each motoboy — whatsapp::set_webhook points them all here).
/// Only cares about WhatsApp location shares: matches the sender's phone
/// against an order that's waiting on a location and saves the coordinates.
///
/// Public on purpose (Evolution API calls this, not a logged-in browser) —
/// always answers 200 so Evolution never retry-storms us over events we
/// don't care about.
pub async fn evolution_webhook(State(state): State<AppState>, Json(payload): Json<Value>) -> StatusCode {
    if let Err(e) = handle(&state, &payload).await {
        tracing::warn!("evolution webhook handling failed: {e:?}");
    }
    StatusCode::OK
}

async fn handle(state: &AppState, payload: &Value) -> anyhow::Result<()> {
    tracing::info!(
        "evolution webhook: event={} instance={}",
        payload.get("event").and_then(Value::as_str).unwrap_or("?"),
        payload.get("instance").and_then(Value::as_str).unwrap_or("?"),
    );

    let data = payload.get("data").unwrap_or(&Value::Null);
    let message = data.get("message").unwrap_or(&Value::Null);

    // WhatsApp has two distinct share types: a fixed pin ("locationMessage")
    // and a live/moving share ("liveLocationMessage") — both carry the same
    // lat/lng field names, so either is handled the same way here.
    let location = message
        .get("locationMessage")
        .or_else(|| message.get("liveLocationMessage"));
    let Some(location) = location else {
        return Ok(());
    };
    let (Some(lat), Some(lng)) = (
        location.get("degreesLatitude").and_then(Value::as_f64),
        location.get("degreesLongitude").and_then(Value::as_f64),
    ) else {
        return Ok(());
    };

    // "5583999999999@s.whatsapp.net" -> "5583999999999"
    let remote_jid = data
        .get("key")
        .and_then(|k| k.get("remoteJid"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let phone_digits: String = remote_jid.chars().take_while(char::is_ascii_digit).collect();
    if phone_digits.is_empty() {
        return Ok(());
    }

    // No way to tell which specific order a raw WhatsApp message is "for"
    // when the same customer has more than one order awaiting a location at
    // once — so this updates all of them rather than guessing by recency.
    let result = sqlx::query(
        "UPDATE orders SET customer_lat = $1, customer_lng = $2 \
         WHERE customer_whatsapp = $3 AND status = 'aguardando_localizacao'",
    )
    .bind(lat)
    .bind(lng)
    .bind(&phone_digits)
    .execute(&state.pool)
    .await?;

    if result.rows_affected() > 0 {
        tracing::info!(
            "captured customer location for phone {phone_digits} ({} order(s))",
            result.rows_affected()
        );
    } else {
        tracing::info!("got a location from {phone_digits} but no order is awaiting one from them");
    }

    Ok(())
}
