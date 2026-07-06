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
}
