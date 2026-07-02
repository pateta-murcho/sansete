import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import Logo from '../ui/Logo'
import { useMotoboyAuth } from '../../store/motoboyAuth'

export default function MotoboyLayout() {
  const { token, name, logout } = useMotoboyAuth()
  const location = useLocation()
  const navigate = useNavigate()

  if (!token) return <Navigate to="/motoboy/login" state={{ from: location }} replace />

  const handleLogout = () => {
    logout()
    navigate('/motoboy/login')
  }

  return (
    <div className="min-h-screen bg-son-black text-white">
      <header className="bg-son-surface border-b border-white/5 px-4 sm:px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <Logo size="sm" />
          <p className="text-xs text-son-silver-dim mt-0.5">Olá, {name}</p>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-1.5 text-son-silver-dim hover:text-son-pink text-sm">
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </header>
      <main className="p-4 sm:p-8 max-w-4xl mx-auto">
        <Outlet />
      </main>
    </div>
  )
}
