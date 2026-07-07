use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;

use crate::auth::{MotoboyUser, SunsetMotoboySession};
use crate::error::AppError;
use crate::models::{
    OrderDto, OrderRow, RequestLocationInput, RequestLocationResult, SkippedOrder,
    UpdateStatusInput,
};
use crate::orders_common::{fetch_order_dto, fetch_order_row, row_to_dto};
use crate::state::AppState;
use crate::status_flow;
use crate::whatsapp;

#[derive(Debug, Deserialize)]
pub struct OrdersQuery {
    pub status: String,
}

pub async fn list_orders(
    State(state): State<AppState>,
    MotoboyUser(claims): MotoboyUser,
    Query(q): Query<OrdersQuery>,
) -> Result<Json<Vec<OrderDto>>, AppError> {
    if !matches!(
        q.status.as_str(),
        "pedido_pronto" | "aguardando_localizacao" | "em_rota_de_entrega" | "concluido"
    ) {
        return Err(AppError::BadRequest("invalid status filter".to_string()));
    }

    let rows: Vec<OrderRow> = if q.status == "pedido_pronto" {
        sqlx::query_as(
            "SELECT * FROM orders WHERE delivery_type = 'entrega' AND status = 'pedido_pronto' \
             AND motoboy_id IS NULL ORDER BY created_at ASC",
        )
        .fetch_all(&state.pool)
        .await?
    } else if q.status == "em_rota_de_entrega" {
        // "entregue" is a short-lived transitional status (payment confirmation
        // may still be pending for non-pix orders) — it's shown in the same tab
        // as "em rota" so the motoboy can find it and finish the "Concluir" step.
        sqlx::query_as(
            "SELECT * FROM orders WHERE delivery_type = 'entrega' \
             AND status IN ('em_rota_de_entrega', 'entregue') AND motoboy_id = $1 \
             ORDER BY created_at DESC",
        )
        .bind(&claims.sub)
        .fetch_all(&state.pool)
        .await?
    } else {
        sqlx::query_as(
            "SELECT * FROM orders WHERE delivery_type = 'entrega' AND status = $1 \
             AND motoboy_id = $2 ORDER BY created_at DESC",
        )
        .bind(&q.status)
        .bind(&claims.sub)
        .fetch_all(&state.pool)
        .await?
    };

    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        result.push(row_to_dto(&state.pool, row).await?);
    }
    Ok(Json(result))
}

pub async fn request_location(
    State(state): State<AppState>,
    MotoboyUser(claims): MotoboyUser,
    Json(input): Json<RequestLocationInput>,
) -> Result<Json<RequestLocationResult>, AppError> {
    let mut updated = Vec::new();
    let mut skipped = Vec::new();

    for order_id in input.order_ids {
        let Some(order) = fetch_order_row(&state.pool, &order_id).await? else {
            skipped.push(SkippedOrder {
                id: order_id,
                reason: "order not found".to_string(),
            });
            continue;
        };

        if order.delivery_type != "entrega" {
            skipped.push(SkippedOrder {
                id: order_id,
                reason: "order is not a delivery order".to_string(),
            });
            continue;
        }
        if order.status != "pedido_pronto" {
            skipped.push(SkippedOrder {
                id: order_id,
                reason: format!("order is not in pedido_pronto (currently {})", order.status),
            });
            continue;
        }
        if order.motoboy_id.is_some() {
            skipped.push(SkippedOrder {
                id: order_id,
                reason: "order already assigned to a motoboy".to_string(),
            });
            continue;
        }

        sqlx::query(
            "UPDATE orders SET motoboy_id = $1, status = 'aguardando_localizacao', updated_at = now()::text WHERE id = $2",
        )
        .bind(&claims.sub)
        .bind(&order_id)
        .execute(&state.pool)
        .await?;

        let digits = whatsapp::digits_only(&order.customer_whatsapp);
        let msg = format!(
            "Olá {}! Para agilizar sua entrega, envie sua localização atual aqui no WhatsApp 📍",
            order.customer_name
        );
        whatsapp::notify(&state, &digits, &msg);

        let dto = fetch_order_dto(&state.pool, &order_id)
            .await?
            .ok_or_else(|| AppError::Internal("order vanished".to_string()))?;
        updated.push(dto);
    }

    Ok(Json(RequestLocationResult { updated, skipped }))
}

pub async fn update_order_status(
    State(state): State<AppState>,
    MotoboyUser(claims): MotoboyUser,
    Path(id): Path<String>,
    Json(input): Json<UpdateStatusInput>,
) -> Result<Json<OrderDto>, AppError> {
    let Some(order) = fetch_order_row(&state.pool, &id).await? else {
        return Err(AppError::NotFound("order not found".to_string()));
    };

    if order.motoboy_id.as_deref() != Some(claims.sub.as_str()) {
        return Err(AppError::Forbidden("order is not assigned to you".to_string()));
    }

    let set_paid = status_flow::motoboy_apply_transition(
        &order.status,
        &input.status,
        &order.payment_method,
        &order.payment_status,
        input.payment_confirmed,
    )?;

    if set_paid {
        sqlx::query(
            "UPDATE orders SET status = $1, payment_status = 'pago', updated_at = now()::text WHERE id = $2",
        )
        .bind(&input.status)
        .bind(&id)
        .execute(&state.pool)
        .await?;
    } else {
        sqlx::query("UPDATE orders SET status = $1, updated_at = now()::text WHERE id = $2")
            .bind(&input.status)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    if input.status == "em_rota_de_entrega" {
        let digits = whatsapp::digits_only(&order.customer_whatsapp);
        whatsapp::notify(
            &state,
            &digits,
            "Seu pedido acabou de sair para entrega! Aguarde no local informado 🛵",
        );
    }

    let dto = fetch_order_dto(&state.pool, &id)
        .await?
        .ok_or_else(|| AppError::NotFound("order not found".to_string()))?;
    Ok(Json(dto))
}

// ---------- WhatsApp (Evolution API) — own instance per motoboy ----------
//
// Each motoboy gets their own Evolution API instance ("motoboy-<id>"),
// separate from the store's own ("sunset"), so location-request messages go
// out from the motoboy's own number. Auth via SunsetMotoboySession (checks
// sunset.sessions directly), same reasoning as SunsetAdminSession.

fn motoboy_instance_name(motoboy_id: &str) -> String {
    format!("motoboy-{motoboy_id}")
}

pub async fn whatsapp_status(
    State(state): State<AppState>,
    SunsetMotoboySession(motoboy_id): SunsetMotoboySession,
) -> Result<Json<serde_json::Value>, AppError> {
    let instance = motoboy_instance_name(&motoboy_id);
    Ok(Json(whatsapp::connection_status(&state, &instance).await?))
}

pub async fn whatsapp_connect(
    State(state): State<AppState>,
    SunsetMotoboySession(motoboy_id): SunsetMotoboySession,
) -> Result<Json<serde_json::Value>, AppError> {
    let instance = motoboy_instance_name(&motoboy_id);
    Ok(Json(whatsapp::connect(&state, &instance).await?))
}

pub async fn whatsapp_logout(
    State(state): State<AppState>,
    SunsetMotoboySession(motoboy_id): SunsetMotoboySession,
) -> Result<StatusCode, AppError> {
    let instance = motoboy_instance_name(&motoboy_id);
    whatsapp::logout(&state, &instance).await?;
    Ok(StatusCode::NO_CONTENT)
}
