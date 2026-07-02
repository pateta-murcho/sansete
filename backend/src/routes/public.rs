use axum::extract::{Path, Query, State};
use axum::Json;
use serde::Deserialize;
use uuid::Uuid;

use crate::error::AppError;
use crate::mercadopago;
use crate::models::{Category, CreateOrderInput, OrderDto, ProductDto, ProductRow, ShippingRate};
use crate::neighborhoods::NEIGHBORHOODS;
use crate::orders_common::{fetch_order_dto, fetch_order_row, row_to_dto, short_id};
use crate::state::AppState;
use crate::whatsapp;

pub async fn neighborhoods() -> Json<Vec<&'static str>> {
    Json(NEIGHBORHOODS.to_vec())
}

pub async fn shipping_rates(State(state): State<AppState>) -> Result<Json<Vec<ShippingRate>>, AppError> {
    let rows: Vec<ShippingRate> = sqlx::query_as(
        "SELECT neighborhood, price FROM neighborhood_shipping_rates ORDER BY neighborhood",
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

pub async fn list_categories(State(state): State<AppState>) -> Result<Json<Vec<Category>>, AppError> {
    let rows: Vec<Category> = sqlx::query_as("SELECT id, name FROM categories ORDER BY name")
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(rows))
}

#[derive(Debug, Deserialize)]
pub struct ProductQuery {
    pub category_id: Option<String>,
}

pub async fn list_products(
    State(state): State<AppState>,
    Query(q): Query<ProductQuery>,
) -> Result<Json<Vec<ProductDto>>, AppError> {
    let rows: Vec<ProductRow> = match q.category_id {
        Some(cat_id) => {
            sqlx::query_as(
                "SELECT p.*, c.name as category_name FROM products p \
                 LEFT JOIN categories c ON c.id = p.category_id \
                 WHERE p.active = 1 AND p.category_id = ? ORDER BY p.name",
            )
            .bind(cat_id)
            .fetch_all(&state.pool)
            .await?
        }
        None => {
            sqlx::query_as(
                "SELECT p.*, c.name as category_name FROM products p \
                 LEFT JOIN categories c ON c.id = p.category_id \
                 WHERE p.active = 1 ORDER BY p.name",
            )
            .fetch_all(&state.pool)
            .await?
        }
    };
    Ok(Json(rows.into_iter().map(ProductDto::from).collect()))
}

pub async fn get_product(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ProductDto>, AppError> {
    let row: Option<ProductRow> = sqlx::query_as(
        "SELECT p.*, c.name as category_name FROM products p \
         LEFT JOIN categories c ON c.id = p.category_id \
         WHERE p.id = ? AND p.active = 1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;

    match row {
        Some(r) => Ok(Json(r.into())),
        None => Err(AppError::NotFound("product not found".to_string())),
    }
}

pub async fn create_order(
    State(state): State<AppState>,
    Json(input): Json<CreateOrderInput>,
) -> Result<Json<OrderDto>, AppError> {
    if input.items.is_empty() {
        return Err(AppError::BadRequest("order must have at least one item".to_string()));
    }
    if !matches!(input.delivery_type.as_str(), "entrega" | "retirada") {
        return Err(AppError::BadRequest("invalid delivery_type".to_string()));
    }
    if !matches!(input.payment_method.as_str(), "pix" | "cartao" | "dinheiro") {
        return Err(AppError::BadRequest("invalid payment_method".to_string()));
    }
    if input.customer_name.trim().is_empty() || input.customer_whatsapp.trim().is_empty() {
        return Err(AppError::BadRequest("customer_name and customer_whatsapp are required".to_string()));
    }

    let mut tx = state.pool.begin().await?;

    // Validate products / stock, compute total, snapshot names/prices.
    struct LineItem {
        product_id: String,
        product_name: String,
        unit_price: f64,
        quantity: i64,
    }
    let mut line_items = Vec::with_capacity(input.items.len());
    let mut total = 0.0f64;

    for item in &input.items {
        if item.quantity <= 0 {
            return Err(AppError::BadRequest("item quantity must be positive".to_string()));
        }
        let product: Option<(String, String, f64, i64, i64)> = sqlx::query_as(
            "SELECT id, name, price, quantity, active FROM products WHERE id = ?",
        )
        .bind(&item.product_id)
        .fetch_optional(&mut *tx)
        .await?;

        let Some((id, name, price, stock, active)) = product else {
            return Err(AppError::BadRequest(format!(
                "product {} not found",
                item.product_id
            )));
        };
        if active == 0 {
            return Err(AppError::BadRequest(format!("product {name} is not available")));
        }
        if stock < item.quantity {
            return Err(AppError::BadRequest(format!(
                "insufficient stock for product {name}"
            )));
        }

        total += price * item.quantity as f64;
        line_items.push(LineItem {
            product_id: id,
            product_name: name,
            unit_price: price,
            quantity: item.quantity,
        });
    }

    // Shipping fee: looked up server-side from the admin-configured rate for
    // the chosen neighborhood, never trusted from the client. Pickup orders
    // never carry a shipping fee.
    let shipping_price: f64 = if input.delivery_type == "entrega" {
        match &input.neighborhood {
            Some(n) if !n.trim().is_empty() => {
                let row: Option<(f64,)> = sqlx::query_as(
                    "SELECT price FROM neighborhood_shipping_rates WHERE neighborhood = ?",
                )
                .bind(n)
                .fetch_optional(&mut *tx)
                .await?;
                row.map(|(p,)| p).unwrap_or(0.0)
            }
            _ => 0.0,
        }
    } else {
        0.0
    };
    total += shipping_price;

    // Upsert customer by whatsapp.
    let existing_customer: Option<(String,)> =
        sqlx::query_as("SELECT id FROM customers WHERE whatsapp = ?")
            .bind(&input.customer_whatsapp)
            .fetch_optional(&mut *tx)
            .await?;

    let customer_id = match existing_customer {
        Some((cid,)) => {
            sqlx::query("UPDATE customers SET name = ? WHERE id = ?")
                .bind(&input.customer_name)
                .bind(&cid)
                .execute(&mut *tx)
                .await?;
            cid
        }
        None => {
            let cid = Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO customers (id, name, whatsapp) VALUES (?, ?, ?)")
                .bind(&cid)
                .bind(&input.customer_name)
                .bind(&input.customer_whatsapp)
                .execute(&mut *tx)
                .await?;
            cid
        }
    };

    // Decrement stock.
    for li in &line_items {
        sqlx::query("UPDATE products SET quantity = quantity - ? WHERE id = ?")
            .bind(li.quantity)
            .bind(&li.product_id)
            .execute(&mut *tx)
            .await?;
    }

    // Insert order.
    let order_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO orders (id, customer_id, customer_name, customer_whatsapp, delivery_type, \
         neighborhood, address, payment_method, payment_status, status, shipping_price, total) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendente', 'pendente', ?, ?)",
    )
    .bind(&order_id)
    .bind(&customer_id)
    .bind(&input.customer_name)
    .bind(&input.customer_whatsapp)
    .bind(&input.delivery_type)
    .bind(&input.neighborhood)
    .bind(&input.address)
    .bind(&input.payment_method)
    .bind(shipping_price)
    .bind(total)
    .execute(&mut *tx)
    .await?;

    for li in &line_items {
        let item_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity) \
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&item_id)
        .bind(&order_id)
        .bind(&li.product_id)
        .bind(&li.product_name)
        .bind(li.unit_price)
        .bind(li.quantity)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    // Pix: create the payment now (network call, so done after the DB tx commits).
    if input.payment_method == "pix" {
        let digits = whatsapp::digits_only(&input.customer_whatsapp);
        match mercadopago::create_pix_payment(&state, total, &digits).await {
            Ok(pix) => {
                sqlx::query(
                    "UPDATE orders SET pix_payment_id = ?, pix_qr_base64 = ?, pix_copia_cola = ? WHERE id = ?",
                )
                .bind(&pix.payment_id)
                .bind(&pix.qr_code_base64)
                .bind(&pix.qr_code)
                .bind(&order_id)
                .execute(&state.pool)
                .await?;
            }
            Err(e) => {
                tracing::error!("failed to create pix payment for order {order_id}: {e:?}");
                // Order already exists; surface the error but the order itself was created.
                return Err(e);
            }
        }
    }

    let dto = fetch_order_dto(&state.pool, &order_id)
        .await?
        .ok_or_else(|| AppError::Internal("order vanished after creation".to_string()))?;
    Ok(Json(dto))
}

pub async fn get_order(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<OrderDto>, AppError> {
    match fetch_order_dto(&state.pool, &id).await? {
        Some(dto) => Ok(Json(dto)),
        None => Err(AppError::NotFound("order not found".to_string())),
    }
}

#[derive(Debug, Deserialize)]
pub struct TrackQuery {
    pub whatsapp: String,
}

pub async fn track_orders(
    State(state): State<AppState>,
    Query(q): Query<TrackQuery>,
) -> Result<Json<Vec<OrderDto>>, AppError> {
    let rows: Vec<crate::models::OrderRow> = sqlx::query_as(
        "SELECT * FROM orders WHERE customer_whatsapp = ? ORDER BY created_at DESC",
    )
    .bind(&q.whatsapp)
    .fetch_all(&state.pool)
    .await?;

    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        result.push(row_to_dto(&state.pool, row).await?);
    }
    Ok(Json(result))
}

pub async fn refresh_payment(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<OrderDto>, AppError> {
    let Some(order) = fetch_order_row(&state.pool, &id).await? else {
        return Err(AppError::NotFound("order not found".to_string()));
    };

    if order.payment_method != "pix" || order.payment_status == "pago" {
        return Ok(Json(row_to_dto(&state.pool, order).await?));
    }

    let (Some(payment_id), true) = (order.pix_payment_id.clone(), state.mp_token.is_some()) else {
        // Mock mode (or no payment id yet): nothing to check against the real API.
        return Ok(Json(row_to_dto(&state.pool, order).await?));
    };

    let status = mercadopago::get_payment_status(&state, &payment_id).await?;
    if status == "approved" {
        sqlx::query("UPDATE orders SET payment_status = 'pago', updated_at = datetime('now') WHERE id = ?")
            .bind(&id)
            .execute(&state.pool)
            .await?;

        let digits = whatsapp::digits_only(&order.customer_whatsapp);
        let msg = format!(
            "Recebemos seu pagamento! Seu pedido #{} já está sendo preparado. 🌇",
            short_id(&order.id)
        );
        whatsapp::notify(&state, &digits, &msg);
    }

    let dto = fetch_order_dto(&state.pool, &id)
        .await?
        .ok_or_else(|| AppError::NotFound("order not found".to_string()))?;
    Ok(Json(dto))
}

pub async fn simulate_pix_paid(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<OrderDto>, AppError> {
    if state.mp_token.is_some() {
        return Err(AppError::Forbidden(
            "a real MP_ACCESS_TOKEN is configured; simulate-pix-paid is disabled".to_string(),
        ));
    }

    let Some(order) = fetch_order_row(&state.pool, &id).await? else {
        return Err(AppError::NotFound("order not found".to_string()));
    };
    if order.payment_method != "pix" {
        return Err(AppError::BadRequest("order is not a pix payment".to_string()));
    }

    if order.payment_status != "pago" {
        sqlx::query("UPDATE orders SET payment_status = 'pago', updated_at = datetime('now') WHERE id = ?")
            .bind(&id)
            .execute(&state.pool)
            .await?;

        let digits = whatsapp::digits_only(&order.customer_whatsapp);
        let msg = format!(
            "Recebemos seu pagamento! Seu pedido #{} já está sendo preparado. 🌇",
            short_id(&order.id)
        );
        whatsapp::notify(&state, &digits, &msg);
    }

    let dto = fetch_order_dto(&state.pool, &id)
        .await?
        .ok_or_else(|| AppError::NotFound("order not found".to_string()))?;
    Ok(Json(dto))
}
