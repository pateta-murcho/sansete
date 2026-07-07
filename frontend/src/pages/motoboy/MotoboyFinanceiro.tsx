import { useEffect, useState } from 'react'
import { Loader2, MapPin, Package, Wallet } from 'lucide-react'
import Card from '../../components/ui/Card'
import { api } from '../../lib/api'
import type { MotoboyFinanceiro as MotoboyFinanceiroData } from '../../lib/types'

function currency(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

export default function MotoboyFinanceiro() {
  const [data, setData] = useState<MotoboyFinanceiroData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.motoboy.financeiro.get().then(setData).finally(() => setLoading(false))
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

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-son-silver-dim text-xs mb-2">
            <Wallet className="w-3.5 h-3.5" /> Meu ganho
          </div>
          <p className="sunset-text font-black text-2xl">{currency(data.total_earnings)}</p>
          <p className="text-xs text-son-silver-dim mt-1">{data.commission_percent}% do frete de cada entrega</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-son-silver-dim text-xs mb-2">
            <Package className="w-3.5 h-3.5" /> Entregas concluídas
          </div>
          <p className="font-black text-2xl text-white">{data.total_deliveries}</p>
        </Card>
      </div>

      <Card className="p-5">
        <p className="label mb-3">Histórico de entregas</p>
        {data.deliveries.length === 0 ? (
          <p className="text-sm text-son-silver-dim">Nenhuma entrega concluída ainda.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {data.deliveries.map((d) => (
              <li key={d.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{d.customer_name}</p>
                  <p className="text-xs text-son-silver-dim flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {d.neighborhood ?? '-'}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="sunset-text font-bold text-sm">{currency(d.earned)}</p>
                  <p className="text-xs text-son-silver-dim">frete {currency(d.shipping_price)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
