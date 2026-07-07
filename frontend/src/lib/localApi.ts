// Frontend-only "backend": persists everything in localStorage instead of
// calling a real API. Used when no backend is configured (see api.ts) so the
// site can be demoed on Vercel alone. Mirrors the Rust backend's business
// rules (status flow, stock checks, shipping calc, financeiro aggregation)
// as closely as practical — see backend/src/status_flow.rs and
// backend/src/routes/*.rs for the source of truth this was ported from.
import QRCode from 'qrcode'
import { ApiError } from './apiError'
import {
  ADMIN_CREDENTIALS,
  FAKE_MOTOBOY_ID,
  loadDb,
  saveDb,
  nowIso,
  uid,
  NEIGHBORHOODS,
  type LocalDb,
  type LocalMotoboy,
} from './localData'
import { useMotoboyAuth } from '../store/motoboyAuth'
import type {
  Category,
  FinanceiroSummary,
  Motoboy,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
  ShippingRate,
  StatusCount,
  TopProduct,
} from './types'

function notifyLocal(phone: string, message: string) {
  console.info(`[demo] WhatsApp para ${phone}: ${message}`)
}

function productDto(db: LocalDb, p: Product): Product {
  const cat = db.categories.find((c) => c.id === p.category_id)
  return { ...p, category_name: cat?.name ?? null }
}

function stripPassword(m: LocalMotoboy): Motoboy {
  const { password: _password, ...rest } = m
  return rest
}

function currentMotoboyId(): string {
  const token = useMotoboyAuth.getState().token
  if (!token || !token.startsWith('local-motoboy:')) {
    throw new ApiError(401, 'not authenticated')
  }
  return token.slice('local-motoboy:'.length)
}

function fakePixCode(): string {
  const rand = uid().replace(/-/g, '').slice(0, 25).toUpperCase()
  return `00020126580014BR.GOV.BCB.PIX0136${rand}5204000053039865802BR5912SUNSET TABAS6009SAO PAULO62070503***6304ABCD`
}

// ---------- status flow (mirrors backend/src/status_flow.rs) ----------

function confirmPaymentIfNeeded(
  paymentMethod: PaymentMethod,
  paymentStatus: string,
  paymentConfirmed?: boolean
): boolean {
  if (paymentMethod === 'pix') {
    if (paymentStatus !== 'pago') throw new ApiError(400, 'pix payment has not been confirmed yet')
    return false
  }
  if (paymentConfirmed !== true) {
    throw new ApiError(400, 'payment_confirmed: true is required to complete this order')
  }
  return true
}

function adminApplyTransition(order: Order, target: string, paymentConfirmed?: boolean): boolean {
  const current = order.status
  if (current === 'pendente' && target === 'montando_pedido') return false
  if (current === 'montando_pedido' && target === 'pedido_pronto') return false
  if (current === 'pedido_pronto' && target === 'retiradas') {
    if (order.delivery_type !== 'retirada') {
      throw new ApiError(400, 'only retirada orders can move to retiradas')
    }
    return false
  }
  if (current === 'retiradas' && target === 'concluido') {
    if (order.delivery_type !== 'retirada') {
      throw new ApiError(400, 'only retirada orders can be concluded from retiradas')
    }
    return confirmPaymentIfNeeded(order.payment_method, order.payment_status, paymentConfirmed)
  }
  throw new ApiError(400, `invalid status transition: ${current} -> ${target}`)
}

function motoboyApplyTransition(order: Order, target: string, paymentConfirmed?: boolean): boolean {
  const current = order.status
  if (current === 'aguardando_localizacao' && target === 'em_rota_de_entrega') return false
  if (current === 'em_rota_de_entrega' && target === 'entregue') {
    return confirmPaymentIfNeeded(order.payment_method, order.payment_status, paymentConfirmed)
  }
  if (current === 'entregue' && target === 'concluido') {
    if (order.payment_status === 'pago') return false
    return confirmPaymentIfNeeded(order.payment_method, order.payment_status, paymentConfirmed)
  }
  throw new ApiError(400, `invalid status transition: ${current} -> ${target}`)
}

// ---------- public / customer-facing ----------

async function listCategoriesPublic(): Promise<Category[]> {
  const db = loadDb()
  return [...db.categories].sort((a, b) => a.name.localeCompare(b.name))
}

async function listProducts(categoryId?: string): Promise<Product[]> {
  const db = loadDb()
  return db.products
    .filter((p) => p.active && (!categoryId || p.category_id === categoryId))
    .map((p) => productDto(db, p))
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function getProduct(id: string): Promise<Product> {
  const db = loadDb()
  const p = db.products.find((x) => x.id === id && x.active)
  if (!p) throw new ApiError(404, 'product not found')
  return productDto(db, p)
}

async function createOrder(payload: {
  customer_name: string
  customer_whatsapp: string
  delivery_type: 'entrega' | 'retirada'
  neighborhood?: string
  address?: string
  payment_method: 'pix' | 'cartao' | 'dinheiro'
  items: { product_id: string; quantity: number }[]
}): Promise<Order> {
  const db = loadDb()

  if (!payload.items || payload.items.length === 0) {
    throw new ApiError(400, 'order must have at least one item')
  }
  if (!['entrega', 'retirada'].includes(payload.delivery_type)) {
    throw new ApiError(400, 'invalid delivery_type')
  }
  if (!['pix', 'cartao', 'dinheiro'].includes(payload.payment_method)) {
    throw new ApiError(400, 'invalid payment_method')
  }
  if (!payload.customer_name.trim() || !payload.customer_whatsapp.trim()) {
    throw new ApiError(400, 'customer_name and customer_whatsapp are required')
  }

  let total = 0
  const items = []
  for (const item of payload.items) {
    if (item.quantity <= 0) throw new ApiError(400, 'item quantity must be positive')
    const product = db.products.find((p) => p.id === item.product_id)
    if (!product) throw new ApiError(400, `product ${item.product_id} not found`)
    if (!product.active) throw new ApiError(400, `product ${product.name} is not available`)
    if (product.quantity < item.quantity) {
      throw new ApiError(400, `insufficient stock for product ${product.name}`)
    }
    total += product.price * item.quantity
    items.push({
      product_id: product.id,
      product_name: product.name,
      unit_price: product.price,
      quantity: item.quantity,
    })
  }

  let shippingPrice = 0
  if (payload.delivery_type === 'entrega' && payload.neighborhood) {
    const rate = db.shippingRates.find((r) => r.neighborhood === payload.neighborhood)
    shippingPrice = rate?.price ?? 0
  }
  total += shippingPrice

  for (const item of payload.items) {
    const product = db.products.find((p) => p.id === item.product_id)!
    product.quantity -= item.quantity
  }

  const order: Order = {
    id: uid(),
    customer_name: payload.customer_name.trim(),
    customer_whatsapp: payload.customer_whatsapp.trim(),
    delivery_type: payload.delivery_type,
    neighborhood: payload.delivery_type === 'retirada' ? null : payload.neighborhood ?? null,
    address: payload.delivery_type === 'retirada' ? null : payload.address ?? null,
    payment_method: payload.payment_method,
    payment_status: 'pendente',
    status: 'pendente',
    shipping_price: shippingPrice,
    total,
    motoboy_id: null,
    pix_payment_id: null,
    pix_qr_base64: null,
    pix_copia_cola: null,
    items,
    created_at: nowIso(),
    updated_at: nowIso(),
  }

  if (payload.payment_method === 'pix') {
    const copiaCola = fakePixCode()
    order.pix_payment_id = `local-${uid()}`
    order.pix_copia_cola = copiaCola
    order.pix_qr_base64 = await QRCode.toDataURL(copiaCola)
  }

  db.orders.push(order)
  saveDb(db)
  return order
}

async function getOrder(id: string): Promise<Order> {
  const db = loadDb()
  const order = db.orders.find((o) => o.id === id)
  if (!order) throw new ApiError(404, 'order not found')
  return order
}

async function trackOrders(whatsapp: string): Promise<Order[]> {
  const db = loadDb()
  return db.orders
    .filter((o) => o.customer_whatsapp === whatsapp)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

async function refreshPayment(id: string): Promise<Order> {
  // No real Mercado Pago to poll in demo mode — mirrors the backend's mock
  // mode, which also never auto-confirms without simulate-pix-paid.
  return getOrder(id)
}

async function simulatePixPaid(id: string): Promise<Order> {
  const db = loadDb()
  const order = db.orders.find((o) => o.id === id)
  if (!order) throw new ApiError(404, 'order not found')
  if (order.payment_method !== 'pix') throw new ApiError(400, 'order is not a pix payment')
  if (order.payment_status !== 'pago') {
    order.payment_status = 'pago'
    order.updated_at = nowIso()
    notifyLocal(
      order.customer_whatsapp,
      `Recebemos seu pagamento! Seu pedido #${order.id.slice(0, 8)} já está sendo preparado. 🌇`
    )
    saveDb(db)
  }
  return order
}

// ---------- auth ----------

async function adminLogin(email: string, password: string): Promise<{ token: string; name: string }> {
  if (email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password) {
    return { token: 'local-admin-token', name: ADMIN_CREDENTIALS.name }
  }
  throw new ApiError(401, 'invalid credentials')
}

async function motoboyLogin(email: string, password: string): Promise<{ token: string; name: string }> {
  const db = loadDb()
  const m = db.motoboys.find((x) => x.email === email)
  if (!m || !m.active || m.password !== password) throw new ApiError(401, 'invalid credentials')
  return { token: `local-motoboy:${m.id}`, name: m.name }
}

async function setAdminPassword(newPassword: string): Promise<void> {
  if (newPassword.trim().length < 6) throw new ApiError(400, 'new password must be at least 6 characters')
  ADMIN_CREDENTIALS.password = newPassword
}

// ---------- admin ----------

async function adminListCategories(): Promise<Category[]> {
  return listCategoriesPublic()
}

async function createCategory(name: string): Promise<Category> {
  if (!name.trim()) throw new ApiError(400, 'name is required')
  const db = loadDb()
  if (db.categories.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) {
    throw new ApiError(400, 'category name already exists')
  }
  const category = { id: uid(), name: name.trim() }
  db.categories.push(category)
  saveDb(db)
  return category
}

async function deleteCategory(id: string): Promise<void> {
  const db = loadDb()
  const idx = db.categories.findIndex((c) => c.id === id)
  if (idx === -1) throw new ApiError(404, 'category not found')
  db.categories.splice(idx, 1)
  for (const p of db.products) if (p.category_id === id) p.category_id = null
  saveDb(db)
}

async function adminListProducts(): Promise<Product[]> {
  const db = loadDb()
  return db.products.map((p) => productDto(db, p)).sort((a, b) => a.name.localeCompare(b.name))
}

async function createProduct(payload: Partial<Product>): Promise<Product> {
  if (!payload.name?.trim()) throw new ApiError(400, 'name is required')
  const db = loadDb()
  const product: Product = {
    id: uid(),
    name: payload.name.trim(),
    description: payload.description ?? null,
    price: payload.price ?? 0,
    quantity: payload.quantity ?? 0,
    image_url: payload.image_url ?? null,
    category_id: payload.category_id ?? null,
    active: payload.active ?? true,
  }
  db.products.push(product)
  saveDb(db)
  return productDto(db, product)
}

async function updateProduct(id: string, payload: Partial<Product>): Promise<Product> {
  const db = loadDb()
  const product = db.products.find((p) => p.id === id)
  if (!product) throw new ApiError(404, 'product not found')
  product.name = payload.name ?? product.name
  product.description = payload.description ?? null
  product.price = payload.price ?? product.price
  product.quantity = payload.quantity ?? product.quantity
  product.image_url = payload.image_url ?? null
  product.category_id = payload.category_id ?? null
  product.active = payload.active ?? true
  saveDb(db)
  return productDto(db, product)
}

async function deleteProduct(id: string): Promise<void> {
  const db = loadDb()
  const idx = db.products.findIndex((p) => p.id === id)
  if (idx === -1) throw new ApiError(404, 'product not found')
  db.products.splice(idx, 1)
  saveDb(db)
}

async function adminListMotoboys(): Promise<Motoboy[]> {
  const db = loadDb()
  return db.motoboys.map(stripPassword).sort((a, b) => a.name.localeCompare(b.name))
}

async function createMotoboy(payload: {
  name: string
  phone: string
  email: string
  password: string
  whatsapp?: string
  commission_percent?: number
}): Promise<Motoboy> {
  if (!payload.password) throw new ApiError(400, 'password is required to create a motoboy')
  const db = loadDb()
  if (db.motoboys.some((m) => m.email === payload.email)) {
    throw new ApiError(400, 'email already in use')
  }
  const motoboy: LocalMotoboy = {
    id: uid(),
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    password: payload.password,
    whatsapp: payload.whatsapp ?? null,
    commission_percent: payload.commission_percent ?? 0,
    active: true,
  }
  db.motoboys.push(motoboy)
  saveDb(db)
  return stripPassword(motoboy)
}

async function updateMotoboy(
  id: string,
  payload: Partial<Motoboy> & { password?: string }
): Promise<Motoboy> {
  const db = loadDb()
  const motoboy = db.motoboys.find((m) => m.id === id)
  if (!motoboy) throw new ApiError(404, 'motoboy not found')
  if (payload.name !== undefined) motoboy.name = payload.name
  if (payload.phone !== undefined) motoboy.phone = payload.phone
  if (payload.email !== undefined) motoboy.email = payload.email
  if (payload.active !== undefined) motoboy.active = payload.active
  if (payload.whatsapp !== undefined) motoboy.whatsapp = payload.whatsapp
  if (payload.commission_percent !== undefined) motoboy.commission_percent = payload.commission_percent
  if (payload.password) motoboy.password = payload.password
  saveDb(db)
  return stripPassword(motoboy)
}

async function deleteMotoboy(id: string): Promise<void> {
  const db = loadDb()
  const idx = db.motoboys.findIndex((m) => m.id === id)
  if (idx === -1) throw new ApiError(404, 'motoboy not found')
  db.motoboys.splice(idx, 1)
  for (const o of db.orders) if (o.motoboy_id === id) o.motoboy_id = null
  saveDb(db)
}

async function adminListOrders(status?: string): Promise<Order[]> {
  const db = loadDb()
  const filtered = status ? db.orders.filter((o) => o.status === status) : db.orders
  return [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

async function adminUpdateStatus(id: string, status: string, paymentConfirmed?: boolean): Promise<Order> {
  const db = loadDb()
  const order = db.orders.find((o) => o.id === id)
  if (!order) throw new ApiError(404, 'order not found')
  const setPaid = adminApplyTransition(order, status, paymentConfirmed)
  order.status = status as OrderStatus
  if (setPaid) order.payment_status = 'pago'
  order.updated_at = nowIso()
  if (status === 'retiradas') {
    notifyLocal(
      order.customer_whatsapp,
      'Seu pedido está pronto! Pode vir buscar 😊 Combine o endereço pelo WhatsApp da loja.'
    )
  }
  saveDb(db)
  return order
}

async function adminListShippingRates(): Promise<ShippingRate[]> {
  const db = loadDb()
  return [...db.shippingRates].sort((a, b) => a.neighborhood.localeCompare(b.neighborhood))
}

async function adminUpdateShippingRate(neighborhood: string, price: number): Promise<ShippingRate> {
  const db = loadDb()
  let rate = db.shippingRates.find((r) => r.neighborhood === neighborhood)
  if (!rate) {
    rate = { neighborhood, price }
    db.shippingRates.push(rate)
  } else {
    rate.price = price
  }
  saveDb(db)
  return rate
}

async function financeiro(): Promise<FinanceiroSummary> {
  const db = loadDb()
  const paid = db.orders.filter((o) => o.payment_status === 'pago')
  const total_revenue = paid.reduce((sum, o) => sum + o.total, 0)
  const total_orders = db.orders.length

  const statusCounts = new Map<OrderStatus, number>()
  for (const o of db.orders) statusCounts.set(o.status, (statusCounts.get(o.status) ?? 0) + 1)
  const orders_by_status: StatusCount[] = Array.from(statusCounts.entries()).map(([status, count]) => ({
    status,
    count,
  }))

  const productAgg = new Map<string, TopProduct>()
  for (const o of paid) {
    for (const item of o.items) {
      const cur = productAgg.get(item.product_id) ?? {
        product_id: item.product_id,
        product_name: item.product_name,
        quantity_sold: 0,
        revenue: 0,
      }
      cur.quantity_sold += item.quantity
      cur.revenue += item.unit_price * item.quantity
      productAgg.set(item.product_id, cur)
    }
  }
  const top_products = Array.from(productAgg.values())
    .sort((a, b) => b.quantity_sold - a.quantity_sold)
    .slice(0, 10)

  const recent_orders = [...db.orders].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20)

  const motoboys = db.motoboys.map((m) => {
    const delivered = db.orders.filter(
      (o) => o.motoboy_id === m.id && o.status === 'concluido' && o.delivery_type === 'entrega'
    )
    const total_shipping = delivered.reduce((sum, o) => sum + o.shipping_price, 0)
    return {
      id: m.id,
      name: m.name,
      commission_percent: m.commission_percent,
      total_deliveries: delivered.length,
      total_shipping,
      total_earnings: Math.round(total_shipping * (m.commission_percent / 100) * 100) / 100,
    }
  })

  return { total_revenue, total_orders, orders_by_status, top_products, recent_orders, motoboys }
}

async function motoboyFinanceiro(): Promise<import('./types').MotoboyFinanceiro> {
  const db = loadDb()
  const motoboy = db.motoboys.find((m) => m.id === FAKE_MOTOBOY_ID)
  const commission_percent = motoboy?.commission_percent ?? 0
  const delivered = db.orders.filter(
    (o) => o.motoboy_id === FAKE_MOTOBOY_ID && o.status === 'concluido' && o.delivery_type === 'entrega'
  )
  const deliveries = delivered
    .map((o) => ({
      id: o.id,
      customer_name: o.customer_name,
      neighborhood: o.neighborhood,
      shipping_price: o.shipping_price,
      earned: Math.round(o.shipping_price * (commission_percent / 100) * 100) / 100,
      updated_at: o.updated_at ?? o.created_at,
    }))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const total_shipping = delivered.reduce((sum, o) => sum + o.shipping_price, 0)
  return {
    commission_percent,
    total_deliveries: deliveries.length,
    total_shipping,
    total_earnings: Math.round(total_shipping * (commission_percent / 100) * 100) / 100,
    deliveries,
  }
}

// ---------- motoboy ----------

async function motoboyListOrders(status: string): Promise<Order[]> {
  const db = loadDb()
  const selfId = currentMotoboyId()
  if (status === 'pedido_pronto') {
    return db.orders
      .filter((o) => o.delivery_type === 'entrega' && o.status === 'pedido_pronto' && !o.motoboy_id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  }
  if (status === 'em_rota_de_entrega') {
    return db.orders
      .filter(
        (o) =>
          o.delivery_type === 'entrega' &&
          (o.status === 'em_rota_de_entrega' || o.status === 'entregue') &&
          o.motoboy_id === selfId
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  return db.orders
    .filter((o) => o.delivery_type === 'entrega' && o.status === status && o.motoboy_id === selfId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

async function requestLocation(
  orderIds: string[]
): Promise<{ updated: Order[]; skipped: { id: string; reason: string }[] }> {
  const db = loadDb()
  const selfId = currentMotoboyId()
  const updated: Order[] = []
  const skipped: { id: string; reason: string }[] = []

  for (const id of orderIds) {
    const order = db.orders.find((o) => o.id === id)
    if (!order) {
      skipped.push({ id, reason: 'order not found' })
      continue
    }
    if (order.delivery_type !== 'entrega') {
      skipped.push({ id, reason: 'order is not a delivery order' })
      continue
    }
    if (order.status !== 'pedido_pronto') {
      skipped.push({ id, reason: `order is not in pedido_pronto (currently ${order.status})` })
      continue
    }
    if (order.motoboy_id) {
      skipped.push({ id, reason: 'order already assigned to a motoboy' })
      continue
    }
    order.motoboy_id = selfId
    order.status = 'aguardando_localizacao'
    order.updated_at = nowIso()
    notifyLocal(
      order.customer_whatsapp,
      `Olá ${order.customer_name}! Para agilizar sua entrega, envie sua localização atual aqui no WhatsApp 📍`
    )
    updated.push(order)
  }

  saveDb(db)
  return { updated, skipped }
}

async function motoboyUpdateStatus(id: string, status: string, paymentConfirmed?: boolean): Promise<Order> {
  const db = loadDb()
  const selfId = currentMotoboyId()
  const order = db.orders.find((o) => o.id === id)
  if (!order) throw new ApiError(404, 'order not found')
  if (order.motoboy_id !== selfId) throw new ApiError(403, 'order is not assigned to you')

  const setPaid = motoboyApplyTransition(order, status, paymentConfirmed)
  order.status = status as OrderStatus
  if (setPaid) order.payment_status = 'pago'
  order.updated_at = nowIso()
  if (status === 'em_rota_de_entrega') {
    notifyLocal(order.customer_whatsapp, 'Seu pedido acabou de sair para entrega! Aguarde no local informado 🛵')
  }
  saveDb(db)
  return order
}

export const localApi = {
  categories: { list: listCategoriesPublic },
  products: { list: listProducts, get: getProduct },
  neighborhoods: { list: async () => [...NEIGHBORHOODS] },
  shippingRates: { list: adminListShippingRates },
  orders: {
    create: createOrder,
    get: getOrder,
    track: trackOrders,
    refreshPayment,
    simulatePixPaid,
  },
  auth: { adminLogin, motoboyLogin, setAdminPassword },
  admin: {
    categories: { list: adminListCategories, create: createCategory, delete: deleteCategory },
    products: { list: adminListProducts, create: createProduct, update: updateProduct, delete: deleteProduct },
    motoboys: {
      list: adminListMotoboys,
      create: createMotoboy,
      update: updateMotoboy,
      delete: deleteMotoboy,
    },
    orders: { list: adminListOrders, updateStatus: adminUpdateStatus },
    shippingRates: { list: adminListShippingRates, update: adminUpdateShippingRate },
    financeiro: { get: financeiro },
    whatsapp: {
      status: async () => ({ instance: { state: 'close' } }),
      connect: async () => {
        throw new ApiError(400, 'WhatsApp não disponível no modo demonstração.')
      },
      logout: async () => {},
    },
  },
  motoboy: {
    orders: { list: motoboyListOrders, requestLocation, updateStatus: motoboyUpdateStatus },
    financeiro: { get: motoboyFinanceiro },
    whatsapp: {
      status: async () => ({ instance: { state: 'close' } }),
      connect: async () => {
        throw new ApiError(400, 'WhatsApp não disponível no modo demonstração.')
      },
      logout: async () => {},
      notifyLocationRequest: async () => {},
    },
  },
}
