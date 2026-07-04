import { useAdminAuth } from '../store/adminAuth'
import { useMotoboyAuth } from '../store/motoboyAuth'
import { ApiError } from './apiError'
import { localApi } from './localApi'
import type { Category, FinanceiroSummary, Motoboy, Order, Product, ShippingRate } from './types'

// Set VITE_API_BASE_URL in the Vercel project's environment variables once
// the backend is deployed (Railway). Falls back to local dev.
export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

// No backend configured in production (e.g. deployed on Vercel alone, before
// Railway is set up) -> fall back to a localStorage-backed mock so the site
// can still be demoed end-to-end. Force it on with VITE_USE_LOCAL_DB=true;
// local dev keeps hitting the real backend at localhost:8080 by default.
export const USE_LOCAL_DB =
  import.meta.env.VITE_USE_LOCAL_DB === 'true' ||
  (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL)

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

const remoteApi = {
  categories: {
    list: () => request<Category[]>('/api/categories'),
  },
  products: {
    list: (categoryId?: string) =>
      request<Product[]>(`/api/products${categoryId ? `?category_id=${categoryId}` : ''}`),
    get: (id: string) => request<Product>(`/api/products/${id}`),
  },
  neighborhoods: {
    list: () => request<string[]>('/api/neighborhoods'),
  },
  shippingRates: {
    list: () => request<ShippingRate[]>('/api/shipping-rates'),
  },
  orders: {
    create: (payload: {
      customer_name: string
      customer_whatsapp: string
      delivery_type: 'entrega' | 'retirada'
      neighborhood?: string
      address?: string
      payment_method: 'pix' | 'cartao' | 'dinheiro'
      items: { product_id: string; quantity: number }[]
    }) =>
      request<Order>('/api/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    get: (id: string) => request<Order>(`/api/orders/${id}`),
    track: (whatsapp: string) =>
      request<Order[]>(`/api/orders/track?whatsapp=${encodeURIComponent(whatsapp)}`),
    refreshPayment: (id: string) =>
      request<Order>(`/api/orders/${id}/refresh-payment`, { method: 'POST' }),
    simulatePixPaid: (id: string) =>
      request<Order>(`/api/orders/${id}/simulate-pix-paid`, { method: 'POST' }),
  },
  auth: {
    adminLogin: (email: string, password: string) =>
      request<{ token: string; name: string }>('/api/auth/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    motoboyLogin: (email: string, password: string) =>
      request<{ token: string; name: string }>('/api/auth/motoboy/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
  },
  admin: {
    categories: {
      list: () => request<Category[]>('/api/admin/categories', { token: adminToken() }),
      create: (name: string) =>
        request<Category>('/api/admin/categories', {
          method: 'POST',
          body: JSON.stringify({ name }),
          token: adminToken(),
        }),
      delete: (id: string) =>
        request<void>(`/api/admin/categories/${id}`, { method: 'DELETE', token: adminToken() }),
    },
    products: {
      list: () => request<Product[]>('/api/admin/products', { token: adminToken() }),
      create: (payload: Partial<Product>) =>
        request<Product>('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(payload),
          token: adminToken(),
        }),
      update: (id: string, payload: Partial<Product>) =>
        request<Product>(`/api/admin/products/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
          token: adminToken(),
        }),
      delete: (id: string) =>
        request<void>(`/api/admin/products/${id}`, { method: 'DELETE', token: adminToken() }),
    },
    motoboys: {
      list: () => request<Motoboy[]>('/api/admin/motoboys', { token: adminToken() }),
      create: (payload: { name: string; phone: string; email: string; password: string }) =>
        request<Motoboy>('/api/admin/motoboys', {
          method: 'POST',
          body: JSON.stringify(payload),
          token: adminToken(),
        }),
      update: (id: string, payload: Partial<Motoboy> & { password?: string }) =>
        request<Motoboy>(`/api/admin/motoboys/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
          token: adminToken(),
        }),
      delete: (id: string) =>
        request<void>(`/api/admin/motoboys/${id}`, { method: 'DELETE', token: adminToken() }),
    },
    orders: {
      list: (status?: string) =>
        request<Order[]>(`/api/admin/orders${status ? `?status=${status}` : ''}`, {
          token: adminToken(),
        }),
      updateStatus: (id: string, status: string, paymentConfirmed?: boolean) =>
        request<Order>(`/api/admin/orders/${id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status, payment_confirmed: paymentConfirmed }),
          token: adminToken(),
        }),
    },
    shippingRates: {
      list: () => request<ShippingRate[]>('/api/admin/shipping-rates', { token: adminToken() }),
      update: (neighborhood: string, price: number) =>
        request<ShippingRate>(`/api/admin/shipping-rates/${encodeURIComponent(neighborhood)}`, {
          method: 'PUT',
          body: JSON.stringify({ price }),
          token: adminToken(),
        }),
    },
    financeiro: {
      get: () => request<FinanceiroSummary>('/api/admin/financeiro', { token: adminToken() }),
    },
  },
  motoboy: {
    orders: {
      list: (status: string) =>
        request<Order[]>(`/api/motoboy/orders?status=${status}`, { token: motoboyToken() }),
      requestLocation: (orderIds: string[]) =>
        request<{ updated: Order[]; skipped: { id: string; reason: string }[] }>(
          '/api/motoboy/orders/request-location',
          {
            method: 'POST',
            body: JSON.stringify({ order_ids: orderIds }),
            token: motoboyToken(),
          }
        ),
      updateStatus: (id: string, status: string, paymentConfirmed?: boolean) =>
        request<Order>(`/api/motoboy/orders/${id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status, payment_confirmed: paymentConfirmed }),
          token: motoboyToken(),
        }),
    },
  },
}

export const api = USE_LOCAL_DB ? localApi : remoteApi

export { ApiError }
