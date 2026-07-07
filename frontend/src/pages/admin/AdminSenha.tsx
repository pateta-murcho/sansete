import { useEffect, useState } from 'react'
import { KeyRound, Loader2, MessageCircle, Smartphone, Unplug } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import type { EvolutionConnect } from '../../lib/types'

function extractState(status: unknown): string {
  const s = status as { instance?: { state?: string }; state?: string } | null
  return s?.instance?.state ?? s?.state ?? 'desconhecido'
}

function extractQrImage(data: EvolutionConnect): string | null {
  const b64 = data.base64 ?? data.qrcode?.base64
  if (!b64) return null
  return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`
}

function extractPairingCode(data: EvolutionConnect): string | null {
  return data.pairingCode ?? data.code ?? data.qrcode?.pairingCode ?? data.qrcode?.code ?? null
}

function WhatsAppConnection() {
  const [status, setStatus] = useState<string | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [qr, setQr] = useState<EvolutionConnect | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadStatus = async () => {
    setLoadingStatus(true)
    setError(null)
    try {
      const data = await api.admin.whatsapp.status()
      setStatus(extractState(data))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível consultar o status.')
      setStatus(null)
    } finally {
      setLoadingStatus(false)
    }
  }

  useEffect(() => {
    loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connect = async () => {
    setConnecting(true)
    setError(null)
    setQr(null)
    try {
      const data = await api.admin.whatsapp.connect()
      setQr(data)
      await loadStatus()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível gerar o QR code.')
    } finally {
      setConnecting(false)
    }
  }

  const disconnect = async () => {
    setDisconnecting(true)
    setError(null)
    try {
      await api.admin.whatsapp.logout()
      setQr(null)
      await loadStatus()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível desconectar.')
    } finally {
      setDisconnecting(false)
    }
  }

  const connected = status === 'open'
  const qrImage = qr ? extractQrImage(qr) : null
  const pairingCode = qr ? extractPairingCode(qr) : null

  return (
    <div className="max-w-sm bg-son-surface border border-white/5 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-son-silver-dim">Status</span>
        {loadingStatus ? (
          <Loader2 className="w-4 h-4 animate-spin text-son-silver-dim" />
        ) : (
          <span className={`text-sm font-semibold ${connected ? 'text-green-500' : 'text-son-silver-dim'}`}>
            {connected ? 'Conectado' : status === 'connecting' ? 'Conectando…' : 'Desconectado'}
          </span>
        )}
      </div>

      {error && <p className="error-msg">{error}</p>}

      {qrImage && (
        <div className="text-center">
          <img src={qrImage} alt="QR Code do WhatsApp" className="mx-auto rounded-lg border border-white/10" />
          <p className="text-xs text-son-silver-dim mt-2">
            Escaneie pelo WhatsApp do celular: Aparelhos conectados → Conectar um aparelho.
          </p>
        </div>
      )}
      {!qrImage && pairingCode && (
        <p className="text-center text-sm text-son-silver">
          Código de pareamento: <span className="font-mono font-bold">{pairingCode}</span>
        </p>
      )}

      <div className="flex gap-2">
        <button onClick={connect} disabled={connecting} className="btn-secondary flex-1 text-sm py-2">
          {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5" />}
          {connected ? 'Gerar novo QR' : 'Conectar'}
        </button>
        <button
          onClick={disconnect}
          disabled={disconnecting || !connected}
          className="btn-secondary flex-1 text-sm py-2"
        >
          {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
          Desconectar
        </button>
      </div>
    </div>
  )
}

export default function AdminSenha() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (newPassword !== confirmPassword) {
      setError('A confirmação não confere com a nova senha.')
      return
    }
    if (newPassword.length < 6) {
      setError('A nova senha precisa ter pelo menos 6 caracteres.')
      return
    }

    setLoading(true)
    try {
      await api.auth.setAdminPassword(newPassword)
      setSuccess(true)
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao trocar a senha.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-black mb-1 flex items-center gap-2">
          <KeyRound className="w-5 h-5" /> Trocar senha
        </h1>
        <p className="text-son-silver-dim text-sm mb-6">Defina uma nova senha de login do admin.</p>

        <form onSubmit={handleSubmit} className="max-w-sm bg-son-surface border border-white/5 rounded-2xl p-6 space-y-4">
          <div>
            <label className="label">Nova senha</label>
            <input
              className="input-field"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <div>
            <label className="label">Repetir nova senha</label>
            <input
              className="input-field"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          {error && <p className="error-msg">{error}</p>}
          {success && <p className="text-green-500 text-sm">Senha alterada com sucesso.</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Salvar
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-2xl font-black mb-1 flex items-center gap-2">
          <MessageCircle className="w-5 h-5" /> WhatsApp
        </h2>
        <p className="text-son-silver-dim text-sm mb-6">Conecte o número da loja pra disparar as notificações automáticas.</p>
        <WhatsAppConnection />
      </div>
    </div>
  )
}
