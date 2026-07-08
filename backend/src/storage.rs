use std::time::Duration;

use crate::error::AppError;
use crate::state::AppState;

const BUCKET: &str = "sunset-products";

/// Uploads raw image bytes to the `sunset-products` Supabase Storage bucket
/// using the service_role key (server-side only — bypasses RLS, so this
/// must never run with anything but an admin-authenticated request behind
/// it). Returns the public URL to store as the product's image_url.
pub async fn upload_image(
    state: &AppState,
    filename: &str,
    content_type: &str,
    bytes: Vec<u8>,
) -> Result<String, AppError> {
    if state.supabase_url.is_empty() || state.supabase_service_key.is_empty() {
        return Err(AppError::BadRequest(
            "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured".to_string(),
        ));
    }

    let base = state.supabase_url.trim_end_matches('/');
    let upload_url = format!("{base}/storage/v1/object/{BUCKET}/{filename}");

    let resp = state
        .http
        .post(&upload_url)
        .timeout(Duration::from_secs(30))
        .header("Authorization", format!("Bearer {}", state.supabase_service_key))
        .header("apikey", state.supabase_service_key.as_str())
        .header("Content-Type", content_type)
        .header("x-upsert", "true")
        .body(bytes)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("supabase storage unreachable: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!(
            "supabase storage upload failed ({status}): {body}"
        )));
    }

    Ok(format!("{base}/storage/v1/object/public/{BUCKET}/{filename}"))
}

/// Picks a file extension from the upload's content-type, since browsers
/// don't always send a trustworthy filename.
pub fn extension_for(content_type: &str) -> &'static str {
    match content_type {
        "image/png" => "png",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "bin",
    }
}
