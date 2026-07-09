import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Loader2, Package, Search } from 'lucide-react'
import SiteHeader from '../components/layout/SiteHeader'
import WhatsAppFab from '../components/WhatsAppFab'
import CartFab from '../components/CartFab'
import { StatusBadge } from '../components/ui/Badge'
import { api } from '../lib/api'
import { TILE_ATTR, TILE_URL, FALLBACK } from '../lib/geo/mapa'
import type { DeliveryPosition, Order } from '../lib/types'
import { useCustomer } from '../store/customer'

function currency(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

const TRACK_POLL_MS = 5000

function motoIcon(heading: number | null) {
  return L.divIcon({
    className: 'icone-limpo',
    html: `<div style="font-size:24px;transform:rotate(${heading ?? 0}deg);transition:transform .3s">🛵</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function destIcon() {
  return L.divIcon({
    className: 'icone-limpo',
    html: `<div style="font-size:26px">📍</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  })
}

// Mapa ao vivo do motoboy a caminho — só aparece quando o pedido está
// em_rota_de_entrega. Faz polling em vez de assinar Realtime (mais simples
// e evita expor sunset.motoboy_runs via RLS pública; a cada poucos
// segundos já dá a sensação de "ao vivo" sem esse risco).
function DeliveryTrackingMap({ order }: { order: Order }) {
  const [position, setPosition] = useState<DeliveryPosition | null>(null)
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const motoMarkerRef = useRef<L.Marker | null>(null)
  const destMarkerRef = useRef<L.Marker | null>(null)

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return
    const map = L.map(mapDivRef.current, { zoomControl: false }).setView([FALLBACK.lat, FALLBACK.lng], 14)
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 20 }).addTo(map)
    if (order.customer_lat != null && order.customer_lng != null) {
      destMarkerRef.current = L.marker([order.customer_lat, order.customer_lng], { icon: destIcon() }).addTo(map)
    }
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    const poll = () => {
      api
        .trackDeliveryPosition(order.id)
        .then((p) => {
          if (!cancelled) setPosition(p)
        })
        .catch(() => {})
    }
    poll()
    const interval = setInterval(poll, TRACK_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [order.id])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !position) return
    if (!motoMarkerRef.current) {
      motoMarkerRef.current = L.marker([position.lat, position.lng], { icon: motoIcon(position.heading) }).addTo(map)
    } else {
      motoMarkerRef.current.setLatLng([position.lat, position.lng])
      motoMarkerRef.current.setIcon(motoIcon(position.heading))
    }
    if (destMarkerRef.current) {
      map.fitBounds(L.latLngBounds([[position.lat, position.lng], destMarkerRef.current.getLatLng()]), {
        padding: [40, 40],
      })
    } else {
      map.setView([position.lat, position.lng], 15)
    }
  }, [position])

  return (
    <div className="mt-3">
      {!position && <p className="text-xs text-son-silver-dim mb-2">Aguardando a localização do motoboy…</p>}
      <div ref={mapDivRef} className="w-full h-48 rounded-xl overflow-hidden border border-white/5" />
    </div>
  )
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
      <WhatsAppFab />
      <CartFab />
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
                  <StatusBadge status={order.status} label={order.status === 'pendente' ? 'Pedido feito' : undefined} />
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
                {order.status === 'em_rota_de_entrega' && <DeliveryTrackingMap order={order} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
