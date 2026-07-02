import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Search } from 'lucide-react'
import Card from '../../components/ui/Card'
import { api } from '../../lib/api'
import type { ShippingRate } from '../../lib/types'

export default function AdminFrete() {
  const [rates, setRates] = useState<ShippingRate[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    api.admin.shippingRates
      .list()
      .then((list) => {
        setRates(list)
        setDrafts(Object.fromEntries(list.map((r) => [r.neighborhood, String(r.price)])))
      })
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rates
    return rates.filter((r) => r.neighborhood.toLowerCase().includes(q))
  }, [rates, query])

  const save = async (neighborhood: string) => {
    const value = Number(drafts[neighborhood])
    if (Number.isNaN(value) || value < 0) return
    setSavingId(neighborhood)
    try {
      await api.admin.shippingRates.update(neighborhood, value)
      setRates((prev) => prev.map((r) => (r.neighborhood === neighborhood ? { ...r, price: value } : r)))
      setSavedId(neighborhood)
      setTimeout(() => setSavedId((cur) => (cur === neighborhood ? null : cur)), 1500)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-black mb-1">Frete por bairro</h1>
      <p className="text-son-silver-dim text-sm mb-6">
        Defina o valor da entrega para cada bairro de João Pessoa. O cliente vê esse valor automaticamente no checkout.
      </p>

      <div className="relative mb-4 max-w-sm">
        <Search className="w-4 h-4 text-son-silver-dim absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          className="input-field pl-10"
          placeholder="Buscar bairro..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-son-pink" />
        </div>
      ) : (
        <Card className="p-2">
          <ul className="divide-y divide-white/5">
            {filtered.map((r) => (
              <li key={r.neighborhood} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex-1 text-sm text-white truncate">{r.neighborhood}</span>
                <span className="text-son-silver-dim text-sm">R$</span>
                <input
                  className="input-field w-24 py-1.5 text-sm"
                  type="number"
                  step="0.01"
                  min="0"
                  value={drafts[r.neighborhood] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [r.neighborhood]: e.target.value }))}
                />
                <button
                  onClick={() => save(r.neighborhood)}
                  disabled={savingId === r.neighborhood || drafts[r.neighborhood] === String(r.price)}
                  className="btn-secondary py-1.5 px-3 text-xs flex-shrink-0"
                >
                  {savingId === r.neighborhood ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : savedId === r.neighborhood ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    'Salvar'
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
