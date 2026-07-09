import { useEffect, useState } from 'react'
import { Clock, Loader2, Package, TrendingUp, Truck, Wallet } from 'lucide-react'
import Card from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/Badge'
import { api } from '../../lib/api'
import type { FinanceiroSummary } from '../../lib/types'

function currency(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

export default function AdminFinanceiro() {
  const [data, setData] = useState<FinanceiroSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.admin.financeiro.get().then(setData).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-son-pink" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div>
      <h1 className="text-2xl font-black mb-6">Financeiro</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-son-silver-dim text-xs mb-2">
            <Wallet className="w-3.5 h-3.5" /> Receita paga
          </div>
          <p className="sunset-text font-black text-2xl">{currency(data.total_revenue)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-son-silver-dim text-xs mb-2">
            <Package className="w-3.5 h-3.5" /> Pedidos totais
          </div>
          <p className="font-black text-2xl text-white">{data.total_orders}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-son-silver-dim text-xs mb-2">
            <Clock className="w-3.5 h-3.5" /> Tempo médio de entrega
          </div>
          <p className="font-black text-2xl text-white">
            {data.avg_delivery_minutes > 0 ? `${data.avg_delivery_minutes.toFixed(1).replace('.', ',')} min` : '—'}
          </p>
        </Card>
      </div>

      <Card className="p-5 mb-6">
        <p className="label mb-3">Pedidos por status</p>
        <div className="flex flex-wrap gap-2">
          {data.orders_by_status.map((s) => (
            <div key={s.status} className="flex items-center gap-2 bg-son-surface-light rounded-xl px-3 py-2">
              <StatusBadge status={s.status} />
              <span className="text-sm font-bold text-white">{s.count}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 label mb-3">
          <TrendingUp className="w-3.5 h-3.5" /> Ranking de vendas
        </div>
        {data.top_products.length === 0 ? (
          <p className="text-sm text-son-silver-dim">Nenhuma venda paga ainda.</p>
        ) : (
          <ul className="space-y-2">
            {data.top_products.map((p, i) => (
              <li key={p.product_id} className="flex items-center gap-3">
                <span className="w-6 h-6 flex items-center justify-center rounded-full bg-son-surface-light text-xs font-bold text-son-gold flex-shrink-0">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm text-white truncate">{p.product_name}</span>
                <span className="text-xs text-son-silver-dim">{p.quantity_sold}x</span>
                <span className="sunset-text font-bold text-sm">{currency(p.revenue)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 label mb-3">
          <Truck className="w-3.5 h-3.5" /> Frete dos motoboys (100% é deles)
        </div>
        {data.motoboys.length === 0 ? (
          <p className="text-sm text-son-silver-dim">Nenhum motoboy cadastrado.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {data.motoboys.map((m) => (
              <li key={m.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{m.name}</p>
                  <p className="text-xs text-son-silver-dim">
                    {m.total_deliveries} entrega{m.total_deliveries === 1 ? '' : 's'} · pago {currency(m.total_paid)}
                    {m.avg_delivery_minutes > 0 && ` · ${m.avg_delivery_minutes.toFixed(0)} min/entrega`}
                  </p>
                </div>
                <span className={`font-bold text-sm flex-shrink-0 ${m.pending_amount > 0 ? 'sunset-text' : 'text-son-silver-dim'}`}>
                  {m.pending_amount > 0 ? `a pagar: ${currency(m.pending_amount)}` : 'em dia'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <p className="label mb-3">Histórico recente</p>
        <ul className="divide-y divide-white/5">
          {data.recent_orders.map((o) => (
            <li key={o.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{o.customer_name}</p>
                <p className="text-xs text-son-silver-dim">{o.created_at}</p>
              </div>
              <StatusBadge status={o.status} className="flex-shrink-0" />
              <span className="sunset-text font-bold text-sm flex-shrink-0">{currency(o.total)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
