use axum::extract::State;
use axum::Json;

use crate::auth::{make_token, verify_password};
use crate::error::AppError;
use crate::models::{LoginInput, LoginResponse};
use crate::state::AppState;

pub async fn admin_login(
    State(state): State<AppState>,
    Json(input): Json<LoginInput>,
) -> Result<Json<LoginResponse>, AppError> {
    let row: Option<(String, String, String)> =
        sqlx::query_as("SELECT id, password_hash, name FROM admins WHERE email = $1")
            .bind(&input.email)
            .fetch_optional(&state.pool)
            .await?;

    let Some((id, hash, name)) = row else {
        return Err(AppError::Unauthorized("invalid credentials".to_string()));
    };
    if !verify_password(&input.password, &hash) {
        return Err(AppError::Unauthorized("invalid credentials".to_string()));
    }

    let token = make_token(&state.jwt_secret, &id, "admin", &name);
    Ok(Json(LoginResponse { token, name }))
}

pub async fn motoboy_login(
    State(state): State<AppState>,
    Json(input): Json<LoginInput>,
) -> Result<Json<LoginResponse>, AppError> {
    let row: Option<(String, String, String, i64)> = sqlx::query_as(
        "SELECT id, password_hash, name, active FROM motoboys WHERE email = $1",
    )
    .bind(&input.email)
    .fetch_optional(&state.pool)
    .await?;

    let Some((id, hash, name, active)) = row else {
        return Err(AppError::Unauthorized("invalid credentials".to_string()));
    };
    if active == 0 || !verify_password(&input.password, &hash) {
        return Err(AppError::Unauthorized("invalid credentials".to_string()));
    }

    let token = make_token(&state.jwt_secret, &id, "motoboy", &name);
    Ok(Json(LoginResponse { token, name }))
}
