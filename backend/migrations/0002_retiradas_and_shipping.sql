CREATE TABLE orders_new (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  customer_whatsapp TEXT NOT NULL,
  delivery_type TEXT NOT NULL CHECK (delivery_type IN ('entrega','retirada')),
  neighborhood TEXT,
  address TEXT,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('pix','cartao','dinheiro')),
  payment_status TEXT NOT NULL DEFAULT 'pendente' CHECK (payment_status IN ('pendente','pago')),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN (
    'pendente','montando_pedido','pedido_pronto','aguardando_localizacao',
    'em_rota_de_entrega','entregue','retiradas','concluido'
  )),
  shipping_price REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  motoboy_id TEXT REFERENCES motoboys(id),
  pix_payment_id TEXT,
  pix_qr_base64 TEXT,
  pix_copia_cola TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO orders_new (
  id, customer_id, customer_name, customer_whatsapp, delivery_type, neighborhood, address,
  payment_method, payment_status, status, shipping_price, total, motoboy_id,
  pix_payment_id, pix_qr_base64, pix_copia_cola, created_at, updated_at
)
SELECT
  id, customer_id, customer_name, customer_whatsapp, delivery_type, neighborhood, address,
  payment_method, payment_status, status, 0, total, motoboy_id,
  pix_payment_id, pix_qr_base64, pix_copia_cola, created_at, updated_at
FROM orders;

DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_whatsapp ON orders(customer_whatsapp);

CREATE TABLE neighborhood_shipping_rates (
  neighborhood TEXT PRIMARY KEY,
  price REAL NOT NULL DEFAULT 0
);
