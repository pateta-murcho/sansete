export type OrderStatus =
  | 'pendente'
  | 'montando_pedido'
  | 'pedido_pronto'
  | 'aguardando_localizacao'
  | 'em_rota_de_entrega'
  | 'entregue'
  | 'retiradas'
  | 'concluido'

export type DeliveryType = 'entrega' | 'retirada'
export type PaymentMethod = 'pix' | 'cartao' | 'dinheiro'
export type PaymentStatus = 'pendente' | 'pago'

export interface Category {
  id: string
  name: string
}

export interface Product {
  id: string
  name: string
  description: string | null
  price: number
  quantity: number
  image_url: string | null
  category_id: string | null
  category_name?: string | null
  active?: boolean
}

export interface OrderItem {
  id?: string
  product_id: string
  product_name: string
  unit_price: number
  quantity: number
}

export interface Order {
  id: string
  customer_name: string
  customer_whatsapp: string
  delivery_type: DeliveryType
  neighborhood: string | null
  address: string | null
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  status: OrderStatus
  shipping_price: number
  total: number
  motoboy_id: string | null
  pix_payment_id?: string | null
  pix_qr_base64?: string | null
  pix_copia_cola?: string | null
  items: OrderItem[]
  created_at: string
  updated_at?: string
}

export interface Motoboy {
  id: string
  name: string
  phone: string
  email: string
  active: boolean
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pendente: 'Pendente',
  montando_pedido: 'Montando pedido',
  pedido_pronto: 'Pedido pronto',
  aguardando_localizacao: 'Aguardando localização',
  em_rota_de_entrega: 'Em rota de entrega',
  entregue: 'Entregue',
  retiradas: 'Aguardando retirada',
  concluido: 'Concluído',
}

export interface ShippingRate {
  neighborhood: string
  price: number
}

export interface StatusCount {
  status: OrderStatus
  count: number
}

export interface TopProduct {
  product_id: string
  product_name: string
  quantity_sold: number
  revenue: number
}

export interface FinanceiroSummary {
  total_revenue: number
  total_orders: number
  orders_by_status: StatusCount[]
  top_products: TopProduct[]
  recent_orders: Order[]
}
