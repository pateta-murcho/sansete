use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::{hash_password, AdminUser};
use crate::error::AppError;
use crate::models::{
    Category, CategoryInput, MotoboyDto, MotoboyInput, MotoboyRow, OrderDto, OrderRow,
    ProductDto, ProductInput, ProductRow, UpdateStatusInput,
};
use crate::orders_common::row_to_dto;
use crate::state::AppState;
use crate::status_flow;

// ---------- Categories ----------

pub async fn list_categories(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<Json<Vec<Category>>, AppError> {
    let rows: Vec<Category> = sqlx::query_as("SELECT id, name FROM categories ORDER BY name")
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(rows))
}

pub async fn create_category(
    State(state): State<AppState>,
    _admin: AdminUser,
    Json(input): Json<CategoryInput>,
) -> Result<Json<Category>, AppError> {
    if input.name.trim().is_empty() {
        return Err(AppError::BadRequest("name is required".to_string()));
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO categories (id, name) VALUES (?, ?)")
        .bind(&id)
        .bind(&input.name)
        .execute(&state.pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(db) if db.is_unique_violation() => {
                AppError::BadRequest("category name already exists".to_string())
            }
            other => other.into(),
        })?;
    Ok(Json(Category { id, name: input.name }))
}

pub async fn update_category(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<String>,
    Json(input): Json<CategoryInput>,
) -> Result<Json<Category>, AppError> {
    let result = sqlx::query("UPDATE categories SET name = ? WHERE id = ?")
        .bind(&input.name)
        .bind(&id)
        .execute(&state.pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("category not found".to_string()));
    }
    Ok(Json(Category { id, name: input.name }))
}

pub async fn delete_category(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let result = sqlx::query("DELETE FROM categories WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("category not found".to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}

// ---------- Products ----------

const PRODUCT_SELECT: &str = "SELECT p.*, c.name as category_name FROM products p \
    LEFT JOIN categories c ON c.id = p.category_id";

pub async fn list_products(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<Json<Vec<ProductDto>>, AppError> {
    let rows: Vec<ProductRow> = sqlx::query_as(&format!("{PRODUCT_SELECT} ORDER BY p.name"))
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(rows.into_iter().map(ProductDto::from).collect()))
}

pub async fn get_product(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<String>,
) -> Result<Json<ProductDto>, AppError> {
    let row: Option<ProductRow> = sqlx::query_as(&format!("{PRODUCT_SELECT} WHERE p.id = ?"))
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?;
    match row {
        Some(r) => Ok(Json(r.into())),
        None => Err(AppError::NotFound("product not found".to_string())),
    }
}

pub async fn create_product(
    State(state): State<AppState>,
    _admin: AdminUser,
    Json(input): Json<ProductInput>,
) -> Result<Json<ProductDto>, AppError> {
    if input.name.trim().is_empty() {
        return Err(AppError::BadRequest("name is required".to_string()));
    }
    let id = Uuid::new_v4().to_string();
    let active = input.active.unwrap_or(true);
    sqlx::query(
        "INSERT INTO products (id, name, description, price, quantity, image_url, category_id, active) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.name)
    .bind(&input.description)
    .bind(input.price)
    .bind(input.quantity)
    .bind(&input.image_url)
    .bind(&input.category_id)
    .bind(active as i64)
    .execute(&state.pool)
    .await?;

    let row: ProductRow = sqlx::query_as(&format!("{PRODUCT_SELECT} WHERE p.id = ?"))
        .bind(&id)
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(row.into()))
}

pub async fn update_product(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<String>,
    Json(input): Json<ProductInput>,
) -> Result<Json<ProductDto>, AppError> {
    let active = input.active.unwrap_or(true);
    let result = sqlx::query(
        "UPDATE products SET name = ?, description = ?, price = ?, quantity = ?, image_url = ?, \
         category_id = ?, active = ? WHERE id = ?",
    )
    .bind(&input.name)
    .bind(&input.description)
    .bind(input.price)
    .bind(input.quantity)
    .bind(&input.image_url)
    .bind(&input.category_id)
    .bind(active as i64)
    .bind(&id)
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("product not found".to_string()));
    }

    let row: ProductRow = sqlx::query_as(&format!("{PRODUCT_SELECT} WHERE p.id = ?"))
        .bind(&id)
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(row.into()))
}

pub async fn delete_product(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let result = sqlx::query("DELETE FROM products WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("product not found".to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}

// ---------- Motoboys ----------

pub async fn list_motoboys(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<Json<Vec<MotoboyDto>>, AppError> {
    let rows: Vec<MotoboyRow> = sqlx::query_as("SELECT * FROM motoboys ORDER BY name")
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(rows.into_iter().map(MotoboyDto::from).collect()))
}

pub async fn get_motoboy(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<String>,
) -> Result<Json<MotoboyDto>, AppError> {
    let row: Option<MotoboyRow> = sqlx::query_as("SELECT * FROM motoboys WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?;
    match row {
        Some(r) => Ok(Json(r.into())),
        None => Err(AppError::NotFound("motoboy not found".to_string())),
    }
}

pub async fn create_motoboy(
    State(state): State<AppState>,
    _admin: AdminUser,
    Json(input): Json<MotoboyInput>,
) -> Result<Json<MotoboyDto>, AppError> {
    let Some(password) = input.password.as_deref().filter(|p| !p.is_empty()) else {
        return Err(AppError::BadRequest("password is required to create a motoboy".to_string()));
    };
    let hash = hash_password(password)?;
    let id = Uuid::new_v4().to_string();
    let active = input.active.unwrap_or(true);

    sqlx::query(
        "INSERT INTO motoboys (id, name, phone, email, password_hash, active) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.name)
    .bind(&input.phone)
    .bind(&input.email)
    .bind(&hash)
    .bind(active as i64)
    .execute(&state.pool)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(db) if db.is_unique_violation() => {
            AppError::BadRequest("email already in use".to_string())
        }
        other => other.into(),
    })?;

    let row: MotoboyRow = sqlx::query_as("SELECT * FROM motoboys WHERE id = ?")
        .bind(&id)
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(row.into()))
}

pub async fn update_motoboy(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<String>,
    Json(input): Json<MotoboyInput>,
) -> Result<Json<MotoboyDto>, AppError> {
    let active = input.active.unwrap_or(true);

    if let Some(password) = input.password.as_deref().filter(|p| !p.is_empty()) {
        let hash = hash_password(password)?;
        let result = sqlx::query(
            "UPDATE motoboys SET name = ?, phone = ?, email = ?, password_hash = ?, active = ? WHERE id = ?",
        )
        .bind(&input.name)
        .bind(&input.phone)
        .bind(&input.email)
        .bind(&hash)
        .bind(active as i64)
        .bind(&id)
        .execute(&state.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(AppError::NotFound("motoboy not found".to_string()));
        }
    } else {
        let result = sqlx::query(
            "UPDATE motoboys SET name = ?, phone = ?, email = ?, active = ? WHERE id = ?",
        )
        .bind(&input.name)
        .bind(&input.phone)
        .bind(&input.email)
        .bind(active as i64)
        .bind(&id)
        .execute(&state.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(AppError::NotFound("motoboy not found".to_string()));
        }
    }

    let row: MotoboyRow = sqlx::query_as("SELECT * FROM motoboys WHERE id = ?")
        .bind(&id)
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(row.into()))
}

pub async fn delete_motoboy(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let result = sqlx::query("DELETE FROM motoboys WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("motoboy not found".to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}

// ---------- Orders ----------

#[derive(Debug, Deserialize)]
pub struct OrdersQuery {
    pub status: Option<String>,
}

pub async fn list_orders(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(q): Query<OrdersQuery>,
) -> Result<Json<Vec<OrderDto>>, AppError> {
    let rows: Vec<OrderRow> = match q.status {
        Some(status) => {
            sqlx::query_as("SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC")
                .bind(status)
                .fetch_all(&state.pool)
                .await?
        }
        None => {
            sqlx::query_as("SELECT * FROM orders ORDER BY created_at DESC")
                .fetch_all(&state.pool)
                .await?
        }
    };

    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        result.push(row_to_dto(&state.pool, row).await?);
    }
    Ok(Json(result))
}

pub async fn update_order_status(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<String>,
    Json(input): Json<UpdateStatusInput>,
) -> Result<Json<OrderDto>, AppError> {
    let Some(order) = crate::orders_common::fetch_order_row(&state.pool, &id).await? else {
        return Err(AppError::NotFound("order not found".to_string()));
    };

    let set_paid = status_flow::admin_apply_transition(
        &order.status,
        &input.status,
        &order.delivery_type,
        &order.payment_method,
        &order.payment_status,
        input.payment_confirmed,
    )?;

    if set_paid {
        sqlx::query(
            "UPDATE orders SET status = ?, payment_status = 'pago', updated_at = datetime('now') WHERE id = ?",
        )
        .bind(&input.status)
        .bind(&id)
        .execute(&state.pool)
        .await?;
    } else {
        sqlx::query("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?")
            .bind(&input.status)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    let dto = crate::orders_common::fetch_order_dto(&state.pool, &id)
        .await?
        .ok_or_else(|| AppError::NotFound("order not found".to_string()))?;
    Ok(Json(dto))
}
