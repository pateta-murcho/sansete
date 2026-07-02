import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2, Package, Search } from 'lucide-react'
import SiteHeader from '../components/layout/SiteHeader'
import { StatusBadge } from '../components/ui/Badge'
import { api } from '../lib/api'
import type { Order } from '../lib/types'
import { useCustomer } from '../store/customer'

function currency(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
}

export default function Consultar() {
  const customer = useCustomer()
  const [searchParams] = useSearchParams()
  const [phone, setPhone] = useState(customer.whatsapp)
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [loading, setLoading] = useState(false)

  const search = async (rawPhone: string) => {
    const digits = rawPhone.replace(/\D/g, '')
    if (digits.length < 10) return
    setLoading(true)
    try {
      const result = await api.orders.track(`55${digits}`)
      setOrders(result)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const orderId = searchParams.get('order')
    if (orderId) {
      setLoading(true)
      api
        .orders.get(orderId)
        .then((o) => setOrders([o]))
        .finally(() => setLoading(false))
    } else if (customer.whatsapp) {
      search(customer.whatsapp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="min-h-screen bg-son-black text-white">
      <SiteHeader />
      <div className="max-w-xl mx-auto px-5 sm:px-10 pb-20">
        <h1 className="text-2xl sm:text-3xl font-black mb-1">Acompanhar pedido</h1>
        <p className="text-son-silver-dim text-sm mb-6">Informe o WhatsApp usado na compra.</p>

        <div className="flex gap-2 mb-8">
          <input
            className="input-field"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            placeholder="(83) 99999-9999"
            type="tel"
            inputMode="numeric"
          />
          <button
            onClick={() => search(phone)}
            className="btn-primary px-5"
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </button>
        </div>

        {orders === null ? null : orders.length === 0 ? (
          <div className="text-center py-16 text-son-silver-dim">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Nenhum pedido encontrado para esse número.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {orders.map((order) => (
              <li key={order.id} className="bg-son-surface border border-white/5 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-son-silver-dim">Pedido #{order.id.slice(0, 8)}</span>
                  <StatusBadge status={order.status} />
                </div>
                <ul className="text-sm text-son-silver space-y-0.5 mb-2">
                  {order.items.map((item) => (
                    <li key={item.product_id}>
                      {item.quantity}x {item.product_name}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-son-silver-dim">
                    {order.delivery_type === 'retirada' ? 'Retirada no local' : `Entrega em ${order.neighborhood ?? '-'}`}
                  </span>
                  <span className="sunset-text font-bold">{currency(order.total)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
