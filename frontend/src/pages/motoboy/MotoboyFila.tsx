import { useEffect, useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { GripVertical, Loader2, MapPin, MapPinned, Navigation, Package, PackageCheck } from 'lucide-react'
import { StatusBadge } from '../../components/ui/Badge'
import WhatsAppLink from '../../components/ui/WhatsAppLink'
import { api, ApiError } from '../../lib/api'
import type { Order, OrderStatus } from '../../lib/types'

function currency(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

const TABS: { value: OrderStatus; label: string }[] = [
  { value: 'pedido_pronto', label: 'Pedido pronto' },
  { value: 'aguardando_localizacao', label: 'Aguardando localização' },
  { value: 'em_rota_de_entrega', label: 'Em rota' },
  { value: 'concluido', label: 'Concluídos' },
]

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  aguardando_localizacao: 'em_rota_de_entrega',
  em_rota_de_entrega: 'entregue',
  entregue: 'concluido',
}
const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  aguardando_localizacao: 'Saiu para entrega',
  em_rota_de_entrega: 'Marcar entregue',
  entregue: 'Concluir',
}

function OrderCard({
  order,
  tab,
  selected,
  toggleSelect,
  busyId,
  advance,
}: {
  order: Order
  tab: OrderStatus
  selected: string[]
  toggleSelect: (id: string) => void
  busyId: string | null
  advance: (order: Order, requirePayment: boolean) => void
}) {
  const dragControls = useDragControls()
  const next = NEXT_STATUS[order.status]
  // Gate the popup on whichever transition is actually pending payment
  // confirmation: normally em_rota_de_entrega -> entregue, but also
  // entregue -> concluido as a fallback for orders that somehow got
  // to "entregue" without it (e.g. legacy data).
  const requiresPaymentConfirm =
    (order.status === 'em_rota_de_entrega' || order.status === 'entregue') &&
    order.payment_method !== 'pix' &&
    order.payment_status !== 'pago'

  return (
    <Reorder.Item
      value={order}
      dragListener={false}
      dragControls={dragControls}
      className="bg-son-surface border border-white/5 rounded-2xl p-4 flex items-start gap-3"
    >
      <GripVertical
        onPointerDown={(e) => dragControls.start(e)}
        className="w-4 h-4 text-son-silver-dim mt-1 flex-shrink-0 cursor-grab active:cursor-grabbing touch-none"
      />
      {(tab === 'pedido_pronto' || tab === 'aguardando_localizacao') && (
        <input
          type="checkbox"
          checked={selected.includes(order.id)}
          onChange={() => toggleSelect(order.id)}
          className="w-4 h-4 mt-1 accent-son-pink flex-shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1 gap-2">
          <span className="font-semibold text-white truncate">{order.customer_name}</span>
          {order.customer_lat != null && order.customer_lng != null ? (
            <a
              href={`https://www.google.com/maps?q=${order.customer_lat},${order.customer_lng}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors flex-shrink-0"
            >
              <MapPinned className="w-3 h-3" />
              Localização recebida
            </a>
          ) : (
            <StatusBadge status={order.status} />
          )}
        </div>
        <p className="text-xs text-son-silver-dim mb-1">
          <WhatsAppLink phone={order.customer_whatsapp} />
        </p>
        <p className="text-sm text-son-silver-dim mt-1">
          <MapPin className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
          {order.neighborhood}
        </p>
        <div className="flex items-center justify-between text-sm mt-2">
          <span className="text-son-silver-dim">{order.payment_method}</span>
          <span className="sunset-text font-bold">{currency(order.total)}</span>
        </div>
        {next && (
          <button
            onClick={() => advance(order, requiresPaymentConfirm)}
            disabled={busyId === order.id}
            className="btn-secondary w-full text-sm py-2 mt-3"
          >
            {busyId === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
            {NEXT_LABEL[order.status]}
          </button>
        )}
      </div>
    </Reorder.Item>
  )
}

export default function MotoboyFila() {
  const [tab, setTab] = useState<OrderStatus>('pedido_pronto')
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [confirmingOrder, setConfirmingOrder] = useState<Order | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setSelected([])
    api.motoboy.orders
      .list(tab)
      .then(setOrders)
      .finally(() => setLoading(false))
  }

  useEffect(load, [tab])

  // Enquanto espera o cliente responder com a localização, verifica de
  // tempos em tempos — a atualização chega via webhook, assíncrona.
  useEffect(() => {
    if (tab !== 'aguardando_localizacao') return
    const interval = setInterval(() => {
      api.motoboy.orders.list(tab).then(setOrders)
    }, 15000)
    return () => clearInterval(interval)
  }, [tab])

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const requestLocation = async () => {
    if (selected.length === 0) return
    setRequesting(true)
    try {
      const result = await api.motoboy.orders.requestLocation(selected)
      // O RPC só mexe no banco (marca aguardando_localizacao) — quem manda
      // a mensagem de verdade, a partir do WhatsApp do próprio motoboy, é
      // essa segunda chamada (backend Rust, guarda a chave da Evolution API).
      if (result.updated.length > 0) {
        api.motoboy.whatsapp.notifyLocationRequest(result.updated.map((o) => o.id)).catch(() => {})
      }
      load()
    } finally {
      setRequesting(false)
    }
  }

  const advanceSelected = async () => {
    if (selected.length === 0) return
    setRequesting(true)
    try {
      await Promise.all(selected.map((id) => api.motoboy.orders.updateStatus(id, 'em_rota_de_entrega')))
      for (const id of selected) {
        api.motoboy.whatsapp.notifyEnRoute(id).catch(() => {})
      }
      load()
    } finally {
      setRequesting(false)
    }
  }

  const advance = async (order: Order, requirePayment: boolean) => {
    const next = NEXT_STATUS[order.status]
    if (!next) return
    if (requirePayment) {
      setConfirmingOrder(order)
      return
    }
    setError(null)
    setBusyId(order.id)
    try {
      await api.motoboy.orders.updateStatus(order.id, next)
      if (next === 'em_rota_de_entrega') {
        api.motoboy.whatsapp.notifyEnRoute(order.id).catch(() => {})
      }
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível atualizar o pedido.')
    } finally {
      setBusyId(null)
    }
  }

  const confirmPayment = async () => {
    if (!confirmingOrder) return
    const next = NEXT_STATUS[confirmingOrder.status]
    if (!next) return
    setError(null)
    setBusyId(confirmingOrder.id)
    try {
      await api.motoboy.orders.updateStatus(confirmingOrder.id, next, true)
      setConfirmingOrder(null)
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível confirmar o pagamento.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-black mb-6">Minha fila</h1>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-6 scrollbar-hide">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === t.value ? 'sunset-bg text-white' : 'bg-son-surface border border-white/5 text-son-silver hover:border-son-pink/30'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="error-msg mb-4">{error}</p>}

      {tab === 'pedido_pronto' && selected.length > 0 && (
        <button onClick={requestLocation} disabled={requesting} className="btn-primary w-full mb-4 text-sm py-3">
          {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
          Solicitar localização ({selected.length})
        </button>
      )}

      {tab === 'aguardando_localizacao' && selected.length > 0 && (
        <button onClick={advanceSelected} disabled={requesting} className="btn-primary w-full mb-4 text-sm py-3">
          {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
          Saiu para entrega ({selected.length})
        </button>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-son-pink" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-son-silver-dim">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nenhum pedido aqui.</p>
        </div>
      ) : (
        <Reorder.Group axis="y" values={orders} onReorder={setOrders} className="space-y-3">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              tab={tab}
              selected={selected}
              toggleSelect={toggleSelect}
              busyId={busyId}
              advance={advance}
            />
          ))}
        </Reorder.Group>
      )}

      {confirmingOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setConfirmingOrder(null)}>
          <div className="glass rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <PackageCheck className="w-8 h-8 text-son-gold mb-2" />
            <h3 className="font-bold text-white mb-2">Confirmar pagamento</h3>
            <p className="text-sm text-son-silver-dim mb-5">
              Confirme que recebeu o pagamento em {confirmingOrder.payment_method} de{' '}
              <span className="sunset-text font-bold">{currency(confirmingOrder.total)}</span> para concluir a entrega.
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
