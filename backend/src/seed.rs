use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::hash_password;
use crate::neighborhoods::NEIGHBORHOODS;

/// Seeds the shipping rates table with every João Pessoa neighborhood at
/// R$0,00 if it's still empty. Runs independently of the admin/product seed
/// below so it also backfills databases that were created before this table
/// existed.
pub async fn seed_shipping_rates_if_empty(pool: &PgPool) -> anyhow::Result<()> {
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM neighborhood_shipping_rates")
        .fetch_one(pool)
        .await?;
    if count.0 > 0 {
        return Ok(());
    }
    for name in NEIGHBORHOODS {
        sqlx::query("INSERT INTO neighborhood_shipping_rates (neighborhood, price) VALUES ($1, 0)")
            .bind(name)
            .execute(pool)
            .await?;
    }
    tracing::info!("seeded {} neighborhood shipping rates at R$0,00", NEIGHBORHOODS.len());
    Ok(())
}

pub async fn seed_if_empty(pool: &PgPool) -> anyhow::Result<()> {
    let admin_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM admins")
        .fetch_one(pool)
        .await?;

    if admin_count.0 > 0 {
        tracing::info!("seed data already present, skipping");
        return Ok(());
    }

    tracing::info!("seeding initial data...");

    // Admin
    let admin_id = Uuid::new_v4().to_string();
    let admin_password = "admin123";
    let admin_hash = hash_password(admin_password).expect("hash admin password");
    sqlx::query("INSERT INTO admins (id, email, password_hash, name) VALUES ($1, $2, $3, $4)")
        .bind(&admin_id)
        .bind("admin@sonset.com")
        .bind(&admin_hash)
        .bind("Admin Sunset Tabas")
        .execute(pool)
        .await?;

    // Motoboy
    let motoboy_id = Uuid::new_v4().to_string();
    let motoboy_password = "motoboy123";
    let motoboy_hash = hash_password(motoboy_password).expect("hash motoboy password");
    sqlx::query(
        "INSERT INTO motoboys (id, name, phone, email, password_hash, active) VALUES ($1, $2, $3, $4, $5, 1)",
    )
    .bind(&motoboy_id)
    .bind("Motoboy Teste")
    .bind("83999990000")
    .bind("motoboy@sonset.com")
    .bind(&motoboy_hash)
    .execute(pool)
    .await?;

    // Categories
    let categories = ["Bebidas", "Lanches", "Sobremesas"];
    let mut category_ids = Vec::new();
    for name in categories {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO categories (id, name) VALUES ($1, $2)")
            .bind(&id)
            .bind(name)
            .execute(pool)
            .await?;
        category_ids.push(id);
    }

    // Products: (name, description, price, quantity, category index)
    let products: [(&str, &str, f64, i64, usize); 6] = [
        ("Refrigerante Lata", "Refrigerante gelado 350ml", 6.0, 50, 0),
        ("Suco Natural", "Suco de frutas da estação 500ml", 8.5, 30, 0),
        ("Sanduíche Natural", "Pão integral, frango desfiado e salada", 14.9, 20, 1),
        ("Hambúrguer Artesanal", "Pão brioche, carne 180g, queijo e molho da casa", 24.9, 15, 1),
        ("Pudim de Leite", "Fatia individual de pudim caseiro", 9.9, 25, 2),
        ("Brownie com Sorvete", "Brownie de chocolate com bola de sorvete", 12.9, 18, 2),
    ];

    for (name, description, price, quantity, cat_idx) in products {
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO products (id, name, description, price, quantity, image_url, category_id, active) VALUES ($1, $2, $3, $4, $5, NULL, $6, 1)",
        )
        .bind(&id)
        .bind(name)
        .bind(description)
        .bind(price)
        .bind(quantity)
        .bind(&category_ids[cat_idx])
        .execute(pool)
        .await?;
    }

    println!("========================================");
    println!(" Sunset Tabas backend — seeded credentials");
    println!("----------------------------------------");
    println!(" Admin:    admin@sonset.com / {admin_password}");
    println!(" Motoboy:  motoboy@sonset.com / {motoboy_password}");
    println!("========================================");

    Ok(())
}
