import { useEffect, useState } from 'react'
import { Check, Loader2, Pencil } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import type { ShippingRate } from '../../lib/types'

export default function AdminFrete() {
  const [rates, setRates] = useState<ShippingRate[]>([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.admin.shippingRates.list().then((list) => {
      setRates(list)
      setDrafts(Object.fromEntries(list.map((r) => [r.neighborhood, String(r.price)])))
      setLoading(false)
    })
  }, [])

  const save = async (neighborhood: string) => {
    const value = Number(drafts[neighborhood])
    if (Number.isNaN(value) || value < 0) return
    setError(null)
    setSavingId(neighborhood)
    try {
      await api.admin.shippingRates.update(neighborhood, value)
      setRates((prev) => prev.map((r) => (r.neighborhood === neighborhood ? { ...r, price: value } : r)))
      setSavedId(neighborhood)
      setTimeout(() => setSavedId((cur) => (cur === neighborhood ? null : cur)), 1500)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível salvar o frete.')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-black mb-6">Frete por bairro</h1>

      {error && <p className="error-msg mb-4">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-son-pink" />
        </div>
      ) : (
        <ul className="space-y-2">
          {rates.map((r) => (
            <li
              key={r.neighborhood}
              className="flex items-center gap-3 bg-son-surface border border-white/5 rounded-2xl px-4 py-3"
            >
              <span className="flex-1 text-sm text-white">{r.neighborhood}</span>
              <input
                className="input-field w-28 flex-none py-2 text-sm"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={drafts[r.neighborhood] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [r.neighborhood]: e.target.value }))}
              />
              <button
                onClick={() => save(r.neighborhood)}
                disabled={savingId === r.neighborhood || drafts[r.neighborhood] === String(r.price)}
                className="w-9 h-9 flex-none flex items-center justify-center rounded-xl text-son-silver-dim hover:text-son-pink hover:bg-white/5 disabled:opacity-40 transition-colors"
                aria-label={`Editar frete de ${r.neighborhood}`}
              >
                {savingId === r.neighborhood ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : savedId === r.neighborhood ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Pencil className="w-4 h-4" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
