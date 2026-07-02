import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditCard, Home, Loader2, QrCode, Wallet } from 'lucide-react'
import SiteHeader from '../components/layout/SiteHeader'
import Autocomplete from '../components/ui/Autocomplete'
import { api, ApiError } from '../lib/api'
import type { PaymentMethod, Product } from '../lib/types'
import { useCart } from '../store/cart'
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

export default function Checkout() {
  const navigate = useNavigate()
  const { items, clear } = useCart()
  const customer = useCustomer()

  const [products, setProducts] = useState<Product[]>([])
  const [neighborhoods, setNeighborhoods] = useState<string[]>([])
  const [pickupAtStore, setPickupAtStore] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.products.list().then(setProducts)
    api.neighborhoods.list().then(setNeighborhoods)
  }, [])

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const lines = items
    .map((item) => ({ item, product: productById.get(item.productId) }))
    .filter((l): l is { item: typeof items[number]; product: Product } => !!l.product)
  const total = lines.reduce((sum, l) => sum + l.product.price * l.item.quantity, 0)

  const handleSubmit = async () => {
    setError(null)
    if (lines.length === 0) {
      setError('Sua sacola está vazia.')
      return
    }
    if (!customer.name.trim()) {
      setError('Informe seu nome.')
      return
    }
    const digits = customer.whatsapp.replace(/\D/g, '')
    if (digits.length < 10) {
      setError('Informe um WhatsApp válido.')
      return
    }
    if (!pickupAtStore && !customer.neighborhood.trim()) {
      setError('Selecione seu bairro ou marque retirada no local.')
      return
    }

    setSubmitting(true)
    try {
      const order = await api.orders.create({
        customer_name: customer.name.trim(),
        customer_whatsapp: `55${digits}`,
        delivery_type: pickupAtStore ? 'retirada' : 'entrega',
        neighborhood: pickupAtStore ? undefined : customer.neighborhood,
        address: pickupAtStore ? undefined : customer.address,
        payment_method: paymentMethod,
        items: lines.map((l) => ({ product_id: l.product.id, quantity: l.item.quantity })),
      })
      clear()
      if (paymentMethod === 'pix') {
        navigate(`/pagamento/${order.id}`)
      } else {
        navigate(`/consultar?order=${order.id}`)
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível enviar seu pedido. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-son-black text-white">
      <SiteHeader />
      <div className="max-w-xl mx-auto px-5 sm:px-10 pb-24">
        <h1 className="text-2xl sm:text-3xl font-black mb-6">Checkout</h1>

        <div className="space-y-5">
          <div>
            <label className="label">Seu nome *</label>
            <input
              className="input-field"
              value={customer.name}
              onChange={(e) => customer.set({ name: e.target.value })}
              placeholder="Nome completo"
            />
          </div>

          <div>
            <label className="label">WhatsApp *</label>
            <input
              className="input-field"
              value={customer.whatsapp}
              onChange={(e) => customer.set({ whatsapp: formatPhone(e.target.value) })}
              type="tel"
              inputMode="numeric"
              placeholder="(83) 99999-9999"
              maxLength={15}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-son-silver">
            <input
              type="checkbox"
              checked={pickupAtStore}
              onChange={(e) => setPickupAtStore(e.target.checked)}
              className="w-4 h-4 accent-son-pink"
            />
            <Home className="w-3.5 h-3.5" />
            Quero retirar no local
          </label>

          {!pickupAtStore && (
            <>
              <div>
                <label className="label">Bairro *</label>
                <Autocomplete
                  value={customer.neighborhood}
                  onChange={(v) => customer.set({ neighborhood: v })}
                  options={neighborhoods}
                  placeholder="Digite para buscar o bairro em João Pessoa..."
                />
              </div>
              <div>
                <label className="label">Endereço (rua, número, referência)</label>
                <input
                  className="input-field"
                  value={customer.address}
                  onChange={(e) => customer.set({ address: e.target.value })}
                  placeholder="Rua, número, ponto de referência"
                />
              </div>
            </>
          )}

          <div>
            <label className="label">Forma de pagamento *</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: 'pix', label: 'Pix', icon: QrCode },
                  { value: 'cartao', label: 'Cartão', icon: CreditCard },
                  { value: 'dinheiro', label: 'Dinheiro', icon: Wallet },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPaymentMethod(value)}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border text-sm font-medium transition-all ${
                    paymentMethod === value
                      ? 'sunset-bg text-white border-transparent'
                      : 'bg-son-surface border-white/10 text-son-silver hover:border-son-pink/30'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
            {paymentMethod !== 'pix' && (
              <p className="text-xs text-son-silver-dim mt-2">
                Pagamento em {paymentMethod === 'cartao' ? 'cartão' : 'dinheiro'} na entrega/retirada.
              </p>
            )}
          </div>

          <div className="border-t border-white/10 pt-4 flex justify-between items-center">
            <span className="font-bold">Total</span>
            <span className="sunset-text font-black text-lg">{currency(total)}</span>
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button onClick={handleSubmit} disabled={submitting} className="btn-primary w-full text-base py-4">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Finalizar pedido
          </button>
        </div>
      </div>
    </main>
  )
}
