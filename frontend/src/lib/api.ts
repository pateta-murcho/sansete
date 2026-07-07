import { useAdminAuth } from '../store/adminAuth'
import { useMotoboyAuth } from '../store/motoboyAuth'
import { ApiError } from './apiError'
import { localApi } from './localApi'
import { supabasePublicApi } from './supabasePublicApi'
import { supabase } from './supabaseClient'
import type {
  Category,
  EvolutionConnect,
  EvolutionStatus,
  FinanceiroSummary,
  Motoboy,
  Order,
  Product,
  ShippingRate,
} from './types'

// Ainda usado só pro login admin/motoboy e Pix, que continuam no backend
// Rust (Railway) até a migração de auth/Pix pra Supabase Auth/Edge Functions.
export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

// Catálogo/checkout/consulta falam direto com o Supabase (ver
// supabasePublicApi.ts) — sem isso configurado, cai em modo demonstração
// (localStorage) pra não quebrar a build. Force com VITE_USE_LOCAL_DB=true;
// local dev continua batendo no Supabase real por padrão.
export const USE_LOCAL_DB =
  import.meta.env.VITE_USE_LOCAL_DB === 'true' ||
  (import.meta.env.PROD && !import.meta.env.VITE_SUPABASE_URL)

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, headers, ...rest } = options
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  })
  if (!res.ok) {
    let message = `Erro ${res.status}`
    try {
      const body = await res.json()
      message = body.error || body.message || message
    } catch {
      // resposta sem corpo JSON
    }
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function adminToken() {
  return useAdminAuth.getState().token ?? undefined
}
function motoboyToken() {
  return useMotoboyAuth.getState().token ?? undefined
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new ApiError(error.message === 'unauthorized' ? 401 : 400, error.message)
  return data as T
}

const remoteApi = {
  // Catálogo, checkout e consulta de pedido falam direto com o Supabase
  // (RLS + RPCs) — ver frontend/src/lib/supabasePublicApi.ts e
  // supabase/sunset_public_rls_and_rpc.sql. Não dependem do Railway.
  categories: supabasePublicApi.categories,
  products: supabasePublicApi.products,
  neighborhoods: supabasePublicApi.neighborhoods,
  shippingRates: supabasePublicApi.shippingRates,
  orders: {
    create: supabasePublicApi.orders.create,
    get: supabasePublicApi.orders.get,
    track: supabasePublicApi.orders.track,
    // Pix ainda depende do backend Rust (precisa do token secreto do
    // Mercado Pago) até virar uma Supabase Edge Function.
    refreshPayment: (id: string) =>
      request<Order>(`/api/orders/${id}/refresh-payment`, { method: 'POST' }),
    simulatePixPaid: (id: string) =>
      request<Order>(`/api/orders/${id}/simulate-pix-paid`, { method: 'POST' }),
  },
  // Login fala direto com o Supabase (RPC sunset.admin_login/motoboy_login —
  // ver supabase/sunset_admin_auth.sql), sem passar pelo Railway. O token
  // retornado é uma sessão opaca guardada em sunset.sessions, não um JWT.
  auth: {
    adminLogin: async (email: string, password: string) => {
      const { data, error } = await supabase.rpc('admin_login', { p_email: email, p_password: password })
      if (error) throw new ApiError(401, 'Credenciais inválidas.')
      return data as { token: string; name: string }
    },
    motoboyLogin: async (email: string, password: string) => {
      const { data, error } = await supabase.rpc('motoboy_login', { p_email: email, p_password: password })
      if (error) throw new ApiError(401, 'Credenciais inválidas.')
      return data as { token: string; name: string }
    },
    setAdminPassword: async (newPassword: string) => {
      const { error } = await supabase.rpc('admin_set_password', {
        p_token: adminToken(),
        p_new_password: newPassword,
      })
      if (error) throw new ApiError(400, error.message)
    },
  },
  // CRUD do admin e fila do motoboy falam direto com o Supabase via RPC
  // (ver supabase/sunset_admin_crud.sql), passando o token de
  // sunset.sessions como primeiro parâmetro em vez de header Authorization.
  admin: {
    categories: {
      list: () => rpc<Category[]>('admin_list_categories', { p_token: adminToken() }),
      create: (name: string) => rpc<Category>('admin_create_category', { p_token: adminToken(), p_name: name }),
      delete: (id: string) => rpc<void>('admin_delete_category', { p_token: adminToken(), p_id: id }),
    },
    products: {
      list: () => rpc<Product[]>('admin_list_products', { p_token: adminToken() }),
      create: (payload: Partial<Product>) =>
        rpc<Product>('admin_create_product', {
          p_token: adminToken(),
          p_name: payload.name,
          p_description: payload.description ?? null,
          p_price: payload.price,
          p_quantity: payload.quantity,
          p_image_url: payload.image_url ?? null,
          p_category_id: payload.category_id ?? null,
          p_active: payload.active ?? true,
        }),
      update: (id: string, payload: Partial<Product>) =>
        rpc<Product>('admin_update_product', {
          p_token: adminToken(),
          p_id: id,
          p_name: payload.name,
          p_description: payload.description ?? null,
          p_price: payload.price,
          p_quantity: payload.quantity,
          p_image_url: payload.image_url ?? null,
          p_category_id: payload.category_id ?? null,
          p_active: payload.active ?? true,
        }),
      delete: (id: string) => rpc<void>('admin_delete_product', { p_token: adminToken(), p_id: id }),
    },
    motoboys: {
      list: () => rpc<Motoboy[]>('admin_list_motoboys', { p_token: adminToken() }),
      create: (payload: { name: string; phone: string; email: string; password: string }) =>
        rpc<Motoboy>('admin_create_motoboy', {
          p_token: adminToken(),
          p_name: payload.name,
          p_phone: payload.phone,
          p_email: payload.email,
          p_password: payload.password,
        }),
      update: (id: string, payload: Partial<Motoboy> & { password?: string }) =>
        rpc<Motoboy>('admin_update_motoboy', {
          p_token: adminToken(),
          p_id: id,
          p_name: payload.name,
          p_phone: payload.phone,
          p_email: payload.email,
          p_password: payload.password || null,
          p_active: payload.active ?? true,
        }),
      delete: (id: string) => rpc<void>('admin_delete_motoboy', { p_token: adminToken(), p_id: id }),
    },
    orders: {
      list: (status?: string) => rpc<Order[]>('admin_list_orders', { p_token: adminToken(), p_status: status ?? null }),
      updateStatus: (id: string, status: string, paymentConfirmed?: boolean) =>
        rpc<Order>('admin_update_order_status', {
          p_token: adminToken(),
          p_order_id: id,
          p_status: status,
          p_payment_confirmed: paymentConfirmed ?? null,
        }),
    },
    shippingRates: {
      list: () => rpc<ShippingRate[]>('admin_list_shipping_rates', { p_token: adminToken() }),
      update: (neighborhood: string, price: number) =>
        rpc<ShippingRate>('admin_update_shipping_rate', {
          p_token: adminToken(),
          p_neighborhood: neighborhood,
          p_price: price,
        }),
    },
    financeiro: {
      get: () => rpc<FinanceiroSummary>('admin_financeiro', { p_token: adminToken() }),
    },
    // Único pedaço do admin que ainda fala com o backend Rust (Railway) em
    // vez do Supabase — a chave da Evolution API precisa ficar fora do
    // navegador.
    whatsapp: {
      status: () => request<EvolutionStatus>('/api/admin/whatsapp/status', { token: adminToken() }),
      connect: () => request<EvolutionConnect>('/api/admin/whatsapp/connect', { token: adminToken() }),
      logout: () => request<void>('/api/admin/whatsapp/logout', { method: 'POST', token: adminToken() }),
    },
  },
  motoboy: {
    orders: {
      list: (status: string) => rpc<Order[]>('motoboy_list_orders', { p_token: motoboyToken(), p_status: status }),
      requestLocation: (orderIds: string[]) =>
        rpc<{ updated: Order[]; skipped: { id: string; reason: string }[] }>('motoboy_request_location', {
          p_token: motoboyToken(),
          p_order_ids: orderIds,
        }),
      updateStatus: (id: string, status: string, paymentConfirmed?: boolean) =>
        rpc<Order>('motoboy_update_order_status', {
          p_token: motoboyToken(),
          p_order_id: id,
          p_status: status,
          p_payment_confirmed: paymentConfirmed ?? null,
        }),
    },
  },
}

export const api = USE_LOCAL_DB ? localApi : remoteApi

export { ApiError }
