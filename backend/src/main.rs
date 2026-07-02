mod auth;
mod error;
mod mercadopago;
mod models;
mod orders_common;
mod routes;
mod seed;
mod state;
mod status_flow;
mod whatsapp;

use std::str::FromStr;
use std::sync::Arc;

use axum::http::HeaderValue;
use axum::routing::{get, patch, post, put};
use axum::Router;
use rand::Rng;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tower_http::cors::{Any, CorsLayer};
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

    let database_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://dev.db".to_string());

    let jwt_secret = match std::env::var("JWT_SECRET") {
        Ok(s) if !s.is_empty() => s,
        _ => {
            tracing::warn!(
                "JWT_SECRET not set — generating a random secret for this run (tokens won't survive a restart)"
            );
            random_secret()
        }
    };

    let whatsapp_url = std::env::var("WHATSAPP_GATEWAY_URL")
        .unwrap_or_else(|_| "http://localhost:3001".to_string());

    let mp_token = std::env::var("MP_ACCESS_TOKEN")
        .ok()
        .filter(|s| !s.trim().is_empty());

    if mp_token.is_none() {
        tracing::info!("MP_ACCESS_TOKEN not set — running Mercado Pago Pix in MOCK mode");
    } else {
        tracing::info!("MP_ACCESS_TOKEN set — using real Mercado Pago API");
    }

    let connect_options = SqliteConnectOptions::from_str(&database_url)?.create_if_missing(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(connect_options)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    seed::seed_if_empty(&pool).await?;

    let http = reqwest::Client::new();

    let state = AppState {
        pool,
        jwt_secret: Arc::new(jwt_secret),
        http,
        whatsapp_url: Arc::new(whatsapp_url),
        mp_token: Arc::new(mp_token),
    };

    let cors = CorsLayer::new()
        .allow_origin("http://localhost:5173".parse::<HeaderValue>()?)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        // auth
        .route("/api/auth/admin/login", post(routes::auth::admin_login))
        .route("/api/auth/motoboy/login", post(routes::auth::motoboy_login))
        // public / customer-facing
        .route("/api/categories", get(routes::public::list_categories))
        .route("/api/products", get(routes::public::list_products))
        .route("/api/products/{id}", get(routes::public::get_product))
        .route("/api/neighborhoods", get(routes::public::neighborhoods))
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
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:8080").await?;
    tracing::info!("sonset_backend listening on http://127.0.0.1:8080");
    axum::serve(listener, app).await?;

    Ok(())
}
