import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutGrid, List, Loader2, Minus, Package, Plus } from 'lucide-react'
import { motion } from 'framer-motion'
import SiteHeader from '../components/layout/SiteHeader'
import { api } from '../lib/api'
import type { Category, Product } from '../lib/types'
import { useCart } from '../store/cart'

function currency(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

export default function Catalogo() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [loading, setLoading] = useState(true)

  const { items, addItem, changeQty } = useCart()

  useEffect(() => {
    Promise.all([api.products.list(), api.categories.list()])
      .then(([p, c]) => {
        setProducts(p)
        setCategories(c)
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (categoryFilter === 'all') return products
    return products.filter((p) => p.category_id === categoryFilter)
  }, [products, categoryFilter])

  const qtyInCart = (id: string) => items.find((i) => i.productId === id)?.quantity ?? 0

  return (
    <main className="min-h-screen bg-son-black text-white">
      <SiteHeader />
      <div className="max-w-6xl mx-auto px-5 sm:px-10 pb-16">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl sm:text-3xl font-black">Catálogo</h1>
          <div className="flex items-center gap-1 bg-son-surface border border-white/10 rounded-xl p-1">
            <button
              onClick={() => setView('grid')}
              className={`p-1.5 rounded-lg ${view === 'grid' ? 'sunset-bg text-white' : 'text-son-silver-dim'}`}
              aria-label="Ver em grade"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`p-1.5 rounded-lg ${view === 'list' ? 'sunset-bg text-white' : 'text-son-silver-dim'}`}
              aria-label="Ver em lista"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
        <p className="text-son-silver-dim text-sm mb-6">Escolha os produtos e finalize seu pedido.</p>

        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 mb-6 scrollbar-hide">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                categoryFilter === 'all' ? 'sunset-bg text-white' : 'bg-son-surface border border-white/5 text-son-silver hover:bg-son-surface-light'
              }`}
            >
              Todos
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryFilter(c.id)}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  categoryFilter === c.id ? 'sunset-bg text-white' : 'bg-son-surface border border-white/5 text-son-silver hover:bg-son-surface-light'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-son-pink" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-son-silver-dim">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum produto disponível no momento.</p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((product, i) => {
              const inCart = qtyInCart(product.id)
              const outOfStock = product.quantity <= 0
              return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: Math.min(i * 0.03, 0.3) }}
                  className="bg-son-surface border border-white/5 rounded-2xl overflow-hidden flex flex-col hover:border-son-pink/30 transition-colors"
                >
                  <Link to={`/produto/${product.id}`} className="flex flex-col flex-1">
                    <div className="aspect-square bg-son-surface-light flex items-center justify-center overflow-hidden">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-10 h-10 text-son-silver-dim/40" />
                      )}
                    </div>
                    <div className="p-3 flex flex-col gap-2 flex-1">
                      <div>
                        <p className="text-sm font-semibold text-white leading-snug">{product.name}</p>
                        {product.category_name && <p className="text-xs text-son-silver-dim">{product.category_name}</p>}
                      </div>
                      <p className="sunset-text font-bold mt-auto">{currency(product.price)}</p>
                    </div>
                  </Link>
                  <div className="px-3 pb-3">
                    {outOfStock ? (
                      <span className="block text-xs font-semibold text-son-silver-dim text-center py-2">Esgotado</span>
                    ) : inCart > 0 ? (
                      <div className="flex items-center justify-between bg-son-surface-light rounded-xl px-2 py-1">
                        <button onClick={() => changeQty(product.id, -1)} className="w-7 h-7 flex items-center justify-center text-son-pink">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-sm font-semibold text-white">{inCart}</span>
                        <button
                          onClick={() => addItem(product)}
                          disabled={inCart >= product.quantity}
                          className="w-7 h-7 flex items-center justify-center text-son-pink disabled:opacity-30"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addItem(product)}
                        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold sunset-bg text-white rounded-xl py-2 hover:brightness-110 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Adicionar
                      </button>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((product, i) => {
              const inCart = qtyInCart(product.id)
              const outOfStock = product.quantity <= 0
              return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.3) }}
                  className="bg-son-surface border border-white/5 rounded-2xl overflow-hidden flex items-center gap-4 p-3 hover:border-son-pink/30 transition-colors"
                >
                  <Link to={`/produto/${product.id}`} className="w-16 h-16 flex-shrink-0 rounded-xl bg-son-surface-light flex items-center justify-center overflow-hidden">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-6 h-6 text-son-silver-dim/40" />
                    )}
                  </Link>
                  <Link to={`/produto/${product.id}`} className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{product.name}</p>
                    {product.category_name && <p className="text-xs text-son-silver-dim">{product.category_name}</p>}
                    <p className="sunset-text font-bold mt-0.5">{currency(product.price)}</p>
                  </Link>
                  {outOfStock ? (
                    <span className="text-xs font-semibold text-son-silver-dim px-3">Esgotado</span>
                  ) : inCart > 0 ? (
                    <div className="flex items-center gap-1.5 bg-son-surface-light rounded-xl px-2 py-1.5">
                      <button onClick={() => changeQty(product.id, -1)} className="w-6 h-6 flex items-center justify-center text-son-pink">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-sm w-4 text-center">{inCart}</span>
                      <button
                        onClick={() => addItem(product)}
                        disabled={inCart >= product.quantity}
                        className="w-6 h-6 flex items-center justify-center text-son-pink disabled:opacity-30"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addItem(product)}
                      className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold sunset-bg text-white rounded-xl px-3 py-2"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar
                    </button>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
