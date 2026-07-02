import { useEffect, useState } from 'react'
import { Loader2, Package } from 'lucide-react'
import { StatusBadge } from '../../components/ui/Badge'
import Card from '../../components/ui/Card'
import { api } from '../../lib/api'
import type { Order } from '../../lib/types'

function currency(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'pendente', label: 'Pendentes' },
  { value: 'montando_pedido', label: 'Montando' },
  { value: 'pedido_pronto', label: 'Prontos' },
  { value: 'retiradas', label: 'Retiradas' },
  { value: 'concluido', label: 'Concluídos' },
] as const

// pedido_pronto's next step depends on delivery_type: retirada orders move to
// 'retiradas' (admin handles the pickup handoff); entrega orders have no admin
// action here — the motoboy takes over via the fila.
function nextStatusFor(order: Order): string | null {
  switch (order.status) {
    case 'pendente':
      return 'montando_pedido'
    case 'montando_pedido':
      return 'pedido_pronto'
    case 'pedido_pronto':
      return order.delivery_type === 'retirada' ? 'retiradas' : null
    case 'retiradas':
      return 'concluido'
    default:
      return null
  }
}
const NEXT_LABEL: Record<string, string> = {
  pendente: 'Montar pedido',
  montando_pedido: 'Marcar pronto',
  pedido_pronto: 'Pronto pra retirada',
  retiradas: 'Concluir retirada',
}

export default function AdminPedidos() {
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('all')
  const [loading, setLoading] = useState(true)
  const [confirmingOrder, setConfirmingOrder] = useState<Order | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    api.admin.orders.list().then(setOrders).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const advance = async (order: Order, requirePayment: boolean) => {
    if (requirePayment) {
      setConfirmingOrder(order)
      return
    }
    const next = nextStatusFor(order)
    if (!next) return
    setBusyId(order.id)
    try {
      await api.admin.orders.updateStatus(order.id, next)
      load()
    } finally {
      setBusyId(null)
    }
  }

  const confirmPayment = async () => {
    if (!confirmingOrder) return
    const next = nextStatusFor(confirmingOrder)
    if (!next) return
    setBusyId(confirmingOrder.id)
    try {
      await api.admin.orders.updateStatus(confirmingOrder.id, next, true)
      setConfirmingOrder(null)
      load()
    } finally {
      setBusyId(null)
    }
  }

  const visible = orders.filter((o) => filter === 'all' || o.status === filter)

  return (
    <div>
      <h1 className="text-2xl font-black mb-6">Pedidos</h1>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-6 scrollbar-hide">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === f.value ? 'sunset-bg text-white' : 'bg-son-surface-light border border-white/5 text-son-silver hover:border-son-pink/30'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-son-pink" />
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-son-silver-dim">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nenhum pedido aqui.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {visible.map((order) => {
            const next = nextStatusFor(order)
            const canAdvance = !!next
            const requiresPaymentConfirm =
              order.status === 'retiradas' && order.payment_method !== 'pix' && order.payment_status !== 'pago'

            return (
              <Card key={order.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-son-silver-dim">#{order.id.slice(0, 8)}</span>
                  <StatusBadge status={order.status} />
                </div>
                <p className="font-semibold text-white">{order.customer_name}</p>
                <p className="text-xs text-son-silver-dim mb-2">{order.customer_whatsapp}</p>
                <ul className="text-sm text-son-silver space-y-0.5 mb-2">
                  {order.items.map((item) => (
                    <li key={item.product_id}>
                      {item.quantity}x {item.product_name}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between text-sm mb-3">
                  <span className="text-son-silver-dim">
                    {order.delivery_type === 'retirada' ? 'Retirada' : `Entrega · ${order.neighborhood}`} ·{' '}
                    {order.payment_method}
                  </span>
                  <span className="sunset-text font-bold">{currency(order.total)}</span>
                </div>
                {canAdvance && (
                  <button
                    onClick={() => advance(order, requiresPaymentConfirm)}
                    disabled={busyId === order.id}
                    className="btn-secondary w-full text-sm py-2"
                  >
                    {busyId === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    {NEXT_LABEL[order.status]}
                  </button>
                )}
                {order.status === 'pedido_pronto' && order.delivery_type === 'entrega' && (
                  <p className="text-xs text-son-silver-dim text-center">Aguardando motoboy</p>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {confirmingOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setConfirmingOrder(null)}>
          <div className="glass rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-white mb-2">Confirmar pagamento</h3>
            <p className="text-sm text-son-silver-dim mb-5">
              Confirme que recebeu o pagamento em {confirmingOrder.payment_method} de{' '}
              <span className="sunset-text font-bold">{currency(confirmingOrder.total)}</span> para concluir o pedido.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmingOrder(null)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button onClick={confirmPayment} disabled={busyId === confirmingOrder.id} className="btn-primary flex-1">
                {busyId === confirmingOrder.id ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
