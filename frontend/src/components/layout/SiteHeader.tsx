import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ShoppingBag } from 'lucide-react'
import Logo from '../ui/Logo'
import { useCart } from '../../store/cart'

export default function SiteHeader({ showBack = true }: { showBack?: boolean }) {
  const navigate = useNavigate()
  const count = useCart((s) => s.items.reduce((sum, i) => sum + i.quantity, 0))

  return (
    <header className="px-5 sm:px-10 py-5 flex items-center justify-between max-w-6xl mx-auto">
      <div className="flex items-center gap-4">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm font-medium text-son-silver-dim hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Voltar</span>
          </button>
        )}
        <Link to="/">
          <Logo size="md" />
        </Link>
      </div>
      <Link
        to="/carrinho"
        className="relative flex items-center gap-2 bg-son-surface border border-white/10 rounded-2xl px-4 py-2.5 hover:border-son-pink/40 transition-colors"
      >
        <ShoppingBag className="w-4 h-4 text-son-pink" />
        <span className="text-sm font-medium text-white hidden sm:inline">Sacola</span>
        {count > 0 && (
          <span className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center text-xs font-bold sunset-bg text-white rounded-full">
            {count}
          </span>
        )}
      </Link>
    </header>
  )
}
