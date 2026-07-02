import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Loader2, Lock } from 'lucide-react'
import Logo from '../../components/ui/Logo'
import { api, ApiError } from '../../lib/api'
import { useAdminAuth } from '../../store/adminAuth'

export default function AdminLogin() {
  const { token, login } = useAdminAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('admin@sonset.com')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (token) return <Navigate to="/admin/pedidos" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await api.auth.adminLogin(email, password)
      login(res.token, res.name)
      navigate('/admin/pedidos')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao entrar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-son-black text-white flex items-center justify-center px-5">
      <form onSubmit={handleSubmit} className="w-full max-w-sm glass rounded-2xl p-8">
        <div className="text-center mb-6">
          <Logo size="lg" />
          <p className="text-son-silver-dim text-sm mt-2 flex items-center justify-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Painel administrativo
          </p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">E-mail</label>
            <input className="input-field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Senha</label>
            <input className="input-field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Entrar
          </button>
        </div>
      </form>
    </main>
  )
}
