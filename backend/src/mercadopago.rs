use base64::{engine::general_purpose, Engine as _};
use image::{DynamicImage, Luma};
use qrcode::QrCode;
use rand::Rng;
use serde::Deserialize;
use serde_json::json;
use std::io::Cursor;

use crate::error::AppError;
use crate::state::AppState;

pub struct PixResult {
    pub payment_id: String,
    pub qr_code: String,
    pub qr_code_base64: String,
}

/// Render a QR code image (PNG) encoding `data`, returned as a base64 string.
fn render_qr_base64(data: &str) -> Result<String, AppError> {
    let code = QrCode::new(data.as_bytes())
        .map_err(|e| AppError::Internal(format!("qr generation error: {e}")))?;
    let image = code.render::<Luma<u8>>().build();
    let dynamic = DynamicImage::ImageLuma8(image);
    let mut buf = Cursor::new(Vec::new());
    dynamic
        .write_to(&mut buf, image::ImageFormat::Png)
        .map_err(|e| AppError::Internal(format!("qr encode error: {e}")))?;
    Ok(general_purpose::STANDARD.encode(buf.into_inner()))
}

/// Generate a fake but well-formed-looking EMV-style Pix "copia e cola" string.
fn fake_copia_cola() -> String {
    let mut rng = rand::thread_rng();
    let chunk: String = (0..24)
        .map(|_| {
            let c = rng.gen_range(0..36);
            std::char::from_digit(c, 36).unwrap_or('0').to_ascii_uppercase()
        })
        .collect();
    format!(
        "00020126580014BR.GOV.BCB.PIX0136{chunk}5204000053039865802BR5913SONSET LOJA6009SAO PAULO62070503***6304ABCD"
    )
}

#[derive(Debug, Deserialize)]
struct MpPaymentResponse {
    id: serde_json::Value,
    point_of_interaction: Option<PointOfInteraction>,
}

#[derive(Debug, Deserialize)]
struct PointOfInteraction {
    transaction_data: Option<TransactionData>,
}

#[derive(Debug, Deserialize)]
struct TransactionData {
    qr_code: Option<String>,
    qr_code_base64: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MpStatusResponse {
    status: String,
}

/// Create a Pix payment. In mock mode (no MP_ACCESS_TOKEN configured), fakes
/// a plausible response with a real, scannable QR image.
pub async fn create_pix_payment(
    state: &AppState,
    total: f64,
    whatsapp_digits: &str,
) -> Result<PixResult, AppError> {
    match state.mp_token.as_ref() {
        Some(token) => {
            let idempotency_key = uuid::Uuid::new_v4().to_string();
            let body = json!({
                "transaction_amount": total,
                "description": "Pedido Sonset",
                "payment_method_id": "pix",
                "payer": { "email": format!("{whatsapp_digits}@sonset.cliente") }
            });
            let resp = state
                .http
                .post("https://api.mercadopago.com/v1/payments")
                .bearer_auth(token)
                .header("X-Idempotency-Key", idempotency_key)
                .json(&body)
                .send()
                .await
                .map_err(|e| AppError::Internal(format!("mercado pago request failed: {e}")))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                tracing::error!("mercado pago create payment failed: {status} {text}");
                return Err(AppError::Internal(
                    "failed to create pix payment".to_string(),
                ));
            }

            let parsed: MpPaymentResponse = resp
                .json()
                .await
                .map_err(|e| AppError::Internal(format!("mercado pago parse error: {e}")))?;

            let td = parsed
                .point_of_interaction
                .and_then(|p| p.transaction_data)
                .ok_or_else(|| {
                    AppError::Internal("mercado pago response missing transaction data".to_string())
                })?;

            Ok(PixResult {
                payment_id: parsed.id.to_string(),
                qr_code: td.qr_code.unwrap_or_default(),
                qr_code_base64: td.qr_code_base64.unwrap_or_default(),
            })
        }
        None => {
            let copia_cola = fake_copia_cola();
            let qr_code_base64 = render_qr_base64(&copia_cola)?;
            Ok(PixResult {
                payment_id: format!("mock-{}", uuid::Uuid::new_v4()),
                qr_code: copia_cola,
                qr_code_base64,
            })
        }
    }
}

/// Check a Pix payment's status against the real Mercado Pago API. Only
/// meaningful (and only called) when a real MP_ACCESS_TOKEN is configured.
pub async fn get_payment_status(state: &AppState, payment_id: &str) -> Result<String, AppError> {
    let token = state
        .mp_token
        .as_ref()
        .as_ref()
        .ok_or_else(|| AppError::Internal("mercado pago not configured".to_string()))?;

    let url = format!("https://api.mercadopago.com/v1/payments/{payment_id}");
    let resp = state
        .http
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("mercado pago request failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        tracing::error!("mercado pago get payment failed: {status} {text}");
        return Err(AppError::Internal(
            "failed to fetch pix payment status".to_string(),
        ));
    }

    let parsed: MpStatusResponse = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("mercado pago parse error: {e}")))?;
    Ok(parsed.status)
}
