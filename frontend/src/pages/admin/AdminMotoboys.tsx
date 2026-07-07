import { useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, Truck, X } from 'lucide-react'
import Card from '../../components/ui/Card'
import { api } from '../../lib/api'
import type { Motoboy } from '../../lib/types'

const EMPTY_FORM = { name: '', phone: '', email: '', password: '', whatsapp: '', commission_percent: '' }

export default function AdminMotoboys() {
  const [motoboys, setMotoboys] = useState<Motoboy[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    api.admin.motoboys.list().then(setMotoboys).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.admin.motoboys.create({
        ...form,
        commission_percent: form.commission_percent ? Number(form.commission_percent) : 0,
      })
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
                <p className="text-xs sunset-text font-semibold">{m.commission_percent}% de comissão</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
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
                <label className="label">Comissão (% do frete de cada entrega)</label>
                <input
                  className="input-field"
                  type="number"
                  min={0}
                  max={100}
                  step="1"
                  value={form.commission_percent}
                  onChange={(e) => setForm({ ...form, commission_percent: e.target.value })}
                />
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
    </div>
  )
}
