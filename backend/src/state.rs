use sqlx::PgPool;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub jwt_secret: Arc<String>,
    pub http: reqwest::Client,
    pub whatsapp_url: Arc<String>,
    pub mp_token: Arc<Option<String>>,
    pub pickup_address: Arc<String>,
}
