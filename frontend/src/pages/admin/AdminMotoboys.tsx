import { useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, Truck, Wallet, X } from 'lucide-react'
import Card from '../../components/ui/Card'
import { api, ApiError } from '../../lib/api'
import type { Motoboy, PaymentMethod } from '../../lib/types'

const EMPTY_FORM = { name: '', phone: '', email: '', password: '', whatsapp: '' }

function currency(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

export default function AdminMotoboys() {
  const [motoboys, setMotoboys] = useState<Motoboy[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [payingMotoboy, setPayingMotoboy] = useState<Motoboy | null>(null)
  const [pendingAmount, setPendingAmount] = useState<number | null>(null)
  const [pendingLoading, setPendingLoading] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix')
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    api.admin.motoboys.list().then(setMotoboys).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.admin.motoboys.create(form)
      setShowForm(false)
      setForm(EMPTY_FORM)
      load()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Remover este motoboy?')) return
    await api.admin.motoboys.delete(id)
    load()
  }

  const toggleActive = async (m: Motoboy) => {
    await api.admin.motoboys.update(m.id, { active: !m.active })
    load()
  }

  const openPay = async (m: Motoboy) => {
    setPayingMotoboy(m)
    setPayError(null)
    setPaymentMethod('pix')
    setPendingAmount(null)
    setPendingLoading(true)
    try {
      const data = await api.admin.motoboys.pending(m.id)
      setPendingAmount(data.pending_amount)
    } catch (e) {
      setPayError(e instanceof ApiError ? e.message : 'Não foi possível consultar o valor acumulado.')
    } finally {
      setPendingLoading(false)
    }
  }

  const confirmPay = async () => {
    if (!payingMotoboy) return
    setPaying(true)
    setPayError(null)
    try {
      await api.admin.motoboys.pay(payingMotoboy.id, paymentMethod)
      setPayingMotoboy(null)
    } catch (e) {
      setPayError(e instanceof ApiError ? e.message : 'Não foi possível registrar o pagamento.')
    } finally {
      setPaying(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black">Motoboys</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary text-sm py-2 px-4">
          <Plus className="w-4 h-4" /> Novo motoboy
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-son-pink" />
        </div>
      ) : motoboys.length === 0 ? (
        <div className="text-center py-16 text-son-silver-dim">
          <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nenhum motoboy cadastrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {motoboys.map((m) => (
            <Card key={m.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-white truncate">{m.name}</p>
                <p className="text-xs text-son-silver-dim truncate">{m.email}</p>
                <p className="text-xs text-son-silver-dim">{m.phone}</p>
                {m.whatsapp && <p className="text-xs text-son-silver-dim">WhatsApp: {m.whatsapp}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => openPay(m)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-son-pink/15 text-son-pink hover:bg-son-pink/25 transition-colors"
                  aria-label={`Pagar ${m.name}`}
                >
                  <Wallet className="w-4 h-4" />
                </button>
                <button
                  onClick={() => toggleActive(m)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    m.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/10 text-son-silver-dim'
                  }`}
                >
                  {m.active ? 'Ativo' : 'Inativo'}
                </button>
                <button onClick={() => remove(m.id)} className="text-son-silver-dim hover:text-son-pink">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="glass rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">Novo motoboy</h3>
              <button onClick={() => setShowForm(false)} className="text-son-silver-dim hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Nome</label>
                <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Telefone</label>
                <input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="label">E-mail</label>
                <input className="input-field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="label">WhatsApp (pra conectar a instância dele)</label>
                <input className="input-field" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
              </div>
              <div>
                <label className="label">Senha</label>
                <input
                  className="input-field"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <button onClick={save} disabled={saving} className="btn-primary w-full mt-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {payingMotoboy && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPayingMotoboy(null)}>
          <div className="glass rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">Pagar {payingMotoboy.name}</h3>
              <button onClick={() => setPayingMotoboy(null)} className="text-son-silver-dim hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {pendingLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-son-pink" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center py-3">
                  <p className="text-xs text-son-silver-dim mb-1">Valor acumulado (frete, 100% do motoboy)</p>
                  <p className="sunset-text font-black text-3xl">{currency(pendingAmount ?? 0)}</p>
                </div>

                {payError && <p className="error-msg">{payError}</p>}

                {(pendingAmount ?? 0) > 0 ? (
                  <>
                    <div>
                      <label className="label">Forma de pagamento</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['pix', 'dinheiro'] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setPaymentMethod(value)}
                            className={`py-3 rounded-2xl border text-sm font-medium transition-all capitalize ${
                              paymentMethod === value
                                ? 'sunset-bg text-white border-transparent'
                                : 'bg-son-surface border-white/10 text-son-silver hover:border-son-pink/30'
                            }`}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button onClick={confirmPay} disabled={paying} className="btn-primary w-full">
                      {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Confirmar pagamento
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-son-silver-dim text-center">Nada pendente pra pagar agora.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
