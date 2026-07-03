use sqlx::PgPool;

use crate::error::AppError;
use crate::models::{OrderDto, OrderItemDto, OrderRow};

pub async fn fetch_order_row(pool: &PgPool, id: &str) -> Result<Option<OrderRow>, AppError> {
    let row: Option<OrderRow> = sqlx::query_as("SELECT * FROM orders WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row)
}

pub async fn fetch_items(pool: &PgPool, order_id: &str) -> Result<Vec<OrderItemDto>, AppError> {
    let items: Vec<OrderItemDto> = sqlx::query_as(
        "SELECT id, product_id, product_name, unit_price, quantity FROM order_items WHERE order_id = $1",
    )
    .bind(order_id)
    .fetch_all(pool)
    .await?;
    Ok(items)
}

pub async fn fetch_order_dto(pool: &PgPool, id: &str) -> Result<Option<OrderDto>, AppError> {
    let Some(row) = fetch_order_row(pool, id).await? else {
        return Ok(None);
    };
    let items = fetch_items(pool, id).await?;
    Ok(Some(OrderDto::from_row(row, items)))
}

pub async fn row_to_dto(pool: &PgPool, row: OrderRow) -> Result<OrderDto, AppError> {
    let items = fetch_items(pool, &row.id).await?;
    Ok(OrderDto::from_row(row, items))
}

/// Short id used in customer-facing WhatsApp messages, e.g. "#a1b2c3d4".
pub fn short_id(id: &str) -> &str {
    &id[..id.len().min(8)]
}
