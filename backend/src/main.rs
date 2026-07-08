mod auth;
mod error;
mod mercadopago;
mod models;
mod neighborhoods;
mod orders_common;
mod routes;
mod seed;
mod state;
mod status_flow;
mod storage;
mod whatsapp;

use std::str::FromStr;
use std::sync::Arc;

use axum::http::HeaderValue;
use axum::routing::{get, patch, post, put};
use axum::Router;
use rand::Rng;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;

use state::AppState;

fn random_secret() -> String {
    let mut rng = rand::thread_rng();
    (0..48)
        .map(|_| rng.sample(rand::distributions::Alphanumeric) as char)
        .collect()
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set (Postgres connection string, e.g. Supabase)");

    let jwt_secret = match std::env::var("JWT_SECRET") {
        Ok(s) if !s.is_empty() => s,
        _ => {
            tracing::warn!(
                "JWT_SECRET not set — generating a random secret for this run (tokens won't survive a restart)"
            );
            random_secret()
        }
    };

    let evolution_api_url = std::env::var("EVOLUTION_API_URL").unwrap_or_default();
    let evolution_api_key = std::env::var("EVOLUTION_API_KEY").unwrap_or_default();
    let evolution_instance = std::env::var("EVOLUTION_INSTANCE").unwrap_or_default();
    if evolution_api_url.is_empty() || evolution_api_key.is_empty() || evolution_instance.is_empty() {
        tracing::warn!(
            "EVOLUTION_API_URL/EVOLUTION_API_KEY/EVOLUTION_INSTANCE not fully set — WhatsApp messages will only be logged, not sent"
        );
    }

    let mp_token = std::env::var("MP_ACCESS_TOKEN")
        .ok()
        .filter(|s| !s.trim().is_empty());

    if mp_token.is_none() {
        tracing::info!("MP_ACCESS_TOKEN not set — running Mercado Pago Pix in MOCK mode");
    } else {
        tracing::info!("MP_ACCESS_TOKEN set — using real Mercado Pago API");
    }

    let pickup_address = std::env::var("STORE_PICKUP_ADDRESS")
        .unwrap_or_else(|_| "combine o endereço pelo WhatsApp da loja".to_string());

    // Registered as the Evolution API webhook target (see whatsapp::set_webhook)
    // so incoming location messages reach /api/webhooks/evolution. Without it,
    // instances still connect/send fine — only the "receive customer location"
    // feature is disabled.
    let backend_public_url = std::env::var("BACKEND_PUBLIC_URL").unwrap_or_default();
    if backend_public_url.is_empty() {
        tracing::warn!(
            "BACKEND_PUBLIC_URL not set — Evolution API webhooks won't be configured, so incoming WhatsApp location messages won't be captured"
        );
    }

    // Server-side only — used to upload product images to Supabase Storage
    // (bypasses RLS). Never expose SUPABASE_SERVICE_ROLE_KEY to the frontend.
    let supabase_url = std::env::var("SUPABASE_URL").unwrap_or_default();
    let supabase_service_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY").unwrap_or_default();
    if supabase_url.is_empty() || supabase_service_key.is_empty() {
        tracing::warn!(
            "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — product image upload will be disabled"
        );
    }

    // This Supabase project is shared with other apps (e.g. VRTech), which use
    // the default "public" schema with similarly-named tables (products,
    // categories, orders...). To avoid colliding with those, everything this
    // backend creates/reads lives in its own "sunset" schema instead —
    // `after_connect` sets search_path on every pooled connection so every
    // unqualified table name in our SQL resolves there, with no need to
    // schema-qualify each query by hand.
    let connect_options = PgConnectOptions::from_str(&database_url)?;
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                sqlx::query("SET search_path TO sunset, public")
                    .execute(conn)
                    .await?;
                Ok(())
            })
        })
        .connect_with(connect_options)
        .await?;

    sqlx::query("CREATE SCHEMA IF NOT EXISTS sunset")
        .execute(&pool)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    seed::seed_if_empty(&pool).await?;
    seed::seed_shipping_rates_if_empty(&pool).await?;

    let http = reqwest::Client::new();

    let state = AppState {
        pool,
        jwt_secret: Arc::new(jwt_secret),
        http,
        evolution_api_url: Arc::new(evolution_api_url),
        evolution_api_key: Arc::new(evolution_api_key),
        evolution_instance: Arc::new(evolution_instance),
        mp_token: Arc::new(mp_token),
        pickup_address: Arc::new(pickup_address),
        backend_public_url: Arc::new(backend_public_url),
        supabase_url: Arc::new(supabase_url),
        supabase_service_key: Arc::new(supabase_service_key),
    };

    // CORS_ORIGINS: comma-separated list of allowed frontend origins. Defaults
    // to local dev plus the production domain this project deploys to.
    let cors_origins: Vec<HeaderValue> = std::env::var("CORS_ORIGINS")
        .unwrap_or_else(|_| {
            "http://localhost:5173,https://sunset-tabas.vercel.app".to_string()
        })
        .split(',')
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().parse::<HeaderValue>())
        .collect::<Result<_, _>>()?;
    tracing::info!("CORS allowed origins: {:?}", cors_origins);

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(cors_origins))
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    let app = Router::new()
        // auth
        .route("/api/auth/admin/login", post(routes::auth::admin_login))
        .route("/api/auth/motoboy/login", post(routes::auth::motoboy_login))
        // public / customer-facing
        .route("/api/categories", get(routes::public::list_categories))
        .route("/api/products", get(routes::public::list_products))
        .route("/api/products/{id}", get(routes::public::get_product))
        .route("/api/neighborhoods", get(routes::public::neighborhoods))
        .route("/api/shipping-rates", get(routes::public::shipping_rates))
        .route("/api/orders", post(routes::public::create_order))
        .route("/api/orders/track", get(routes::public::track_orders))
        .route("/api/orders/{id}", get(routes::public::get_order))
        .route(
            "/api/orders/{id}/refresh-payment",
            post(routes::public::refresh_payment),
        )
        .route(
            "/api/orders/{id}/simulate-pix-paid",
            post(routes::public::simulate_pix_paid),
        )
        .route("/api/orders/notify-created", post(routes::public::notify_order_created))
        // admin
        .route(
            "/api/admin/categories",
            get(routes::admin::list_categories).post(routes::admin::create_category),
        )
        .route(
            "/api/admin/categories/{id}",
            put(routes::admin::update_category).delete(routes::admin::delete_category),
        )
        .route(
            "/api/admin/products",
            get(routes::admin::list_products).post(routes::admin::create_product),
        )
        .route(
            "/api/admin/products/{id}",
            get(routes::admin::get_product)
                .put(routes::admin::update_product)
                .delete(routes::admin::delete_product),
        )
        .route("/api/admin/products/upload-image", post(routes::admin::upload_product_image))
        .route(
            "/api/admin/motoboys",
            get(routes::admin::list_motoboys).post(routes::admin::create_motoboy),
        )
        .route(
            "/api/admin/motoboys/{id}",
            get(routes::admin::get_motoboy)
                .put(routes::admin::update_motoboy)
                .delete(routes::admin::delete_motoboy),
        )
        .route("/api/admin/orders", get(routes::admin::list_orders))
        .route(
            "/api/admin/orders/{id}/status",
            patch(routes::admin::update_order_status),
        )
        .route("/api/admin/financeiro", get(routes::admin::financeiro))
        .route("/api/admin/whatsapp/status", get(routes::admin::whatsapp_status))
        .route("/api/admin/whatsapp/connect", get(routes::admin::whatsapp_connect))
        .route("/api/admin/whatsapp/logout", post(routes::admin::whatsapp_logout))
        .route("/api/admin/whatsapp/notify-order-ready", post(routes::admin::notify_order_ready))
        .route(
            "/api/admin/shipping-rates",
            get(routes::admin::list_shipping_rates),
        )
        .route(
            "/api/admin/shipping-rates/{neighborhood}",
            put(routes::admin::update_shipping_rate),
        )
        // motoboy
        .route("/api/motoboy/orders", get(routes::motoboy::list_orders))
        .route(
            "/api/motoboy/orders/request-location",
            post(routes::motoboy::request_location),
        )
        .route(
            "/api/motoboy/orders/{id}/status",
            patch(routes::motoboy::update_order_status),
        )
        .route("/api/motoboy/whatsapp/status", get(routes::motoboy::whatsapp_status))
        .route("/api/motoboy/whatsapp/connect", get(routes::motoboy::whatsapp_connect))
        .route("/api/motoboy/whatsapp/logout", post(routes::motoboy::whatsapp_logout))
        .route(
            "/api/motoboy/whatsapp/notify-location-request",
            post(routes::motoboy::notify_location_request),
        )
        .route(
            "/api/motoboy/whatsapp/notify-en-route",
            post(routes::motoboy::notify_en_route),
        )
        // Público de propósito: é a Evolution API chamando, não um usuário
        // logado. Fica fora do CORS layer não importar (não é um browser).
        .route("/api/webhooks/evolution", post(routes::webhooks::evolution_webhook))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    // Bind to 0.0.0.0 so this also works inside a container (Railway etc, which
    // injects PORT); locally it's still reachable at http://localhost:<port>.
    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("sonset_backend listening on http://{addr}");
    axum::serve(listener, app).await?;

    Ok(())
}
