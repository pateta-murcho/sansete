use sqlx::PgPool;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub jwt_secret: Arc<String>,
    pub http: reqwest::Client,
    pub evolution_api_url: Arc<String>,
    pub evolution_api_key: Arc<String>,
    pub evolution_instance: Arc<String>,
    pub mp_token: Arc<Option<String>>,
    pub pickup_address: Arc<String>,
    /// This backend's own public URL (e.g. Railway domain), registered as
    /// the Evolution API webhook target so incoming WhatsApp messages
    /// (location shares) reach `/api/webhooks/evolution`.
    pub backend_public_url: Arc<String>,
    /// Supabase project URL + service_role key, used server-side only to
    /// upload product images to Supabase Storage (bypasses RLS — never
    /// send this key to the browser).
    pub supabase_url: Arc<String>,
    pub supabase_service_key: Arc<String>,
}
