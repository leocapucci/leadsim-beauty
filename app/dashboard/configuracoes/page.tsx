'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

interface Clinica {
  nome:     string
  whatsapp: string
  plano:    'free' | 'starter' | 'pro' | 'enterprise'
}

// ── Constants ──────────────────────────────────────────────────────────────

const PLANO_MAP: Record<string, { label: string; color: string; bg: string }> = {
  free:       { label: 'Free',       color: 'rgba(255,255,255,0.5)', bg: 'rgba(255,255,255,0.07)' },
  starter:    { label: 'Starter',    color: '#60a5fa',               bg: 'rgba(96,165,250,0.1)'   },
  pro:        { label: 'Pro',        color: '#C4A35A',               bg: 'rgba(196,163,90,0.12)'  },
  enterprise: { label: 'Enterprise', color: '#c084fc',               bg: 'rgba(192,132,252,0.1)'  },
}

// ── Helpers ────────────────────────────────────────────────────────────────

function maskPhone(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (!d.length) return ''
  if (d.length <= 2)  return `(${d}`
  if (d.length <= 7)  return `(${d.slice(0,2)}) ${d.slice(2)}`
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
}

// ── Toggle ─────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="relative w-10 h-5 rounded-full flex-shrink-0 transition-all duration-200"
      style={{ background: checked ? '#C4A35A' : 'rgba(255,255,255,0.15)' }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200"
        style={{
          background: '#fff',
          left: checked ? '22px' : '2px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ConfiguracoesPage() {
  const router = useRouter()

  // Clinic data
  const [clinica,      setClinica]      = useState<Clinica | null>(null)
  const [nome,         setNome]         = useState('')
  const [whatsapp,     setWhatsapp]     = useState('')
  const [savingClinica, setSavingClinica] = useState(false)
  const [clinicaMsg,   setClinicaMsg]   = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Password
  const [newPass,      setNewPass]      = useState('')
  const [confirmPass,  setConfirmPass]  = useState('')
  const [savingPass,   setSavingPass]   = useState(false)
  const [passMsg,      setPassMsg]      = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Notifications (UI only)
  const [notifEmail,   setNotifEmail]   = useState(true)
  const [notifWhats,   setNotifWhats]   = useState(false)
  const [notifRelat,   setNotifRelat]   = useState(true)

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login'); return }

      const { data } = await supabase
        .from('clinicas')
        .select('nome, whatsapp, plano')
        .eq('id', user.id)
        .single()

      if (data) {
        setClinica(data as Clinica)
        setNome(data.nome ?? '')
        setWhatsapp(data.whatsapp ?? '')
      }
      setLoading(false)
    }
    load()
  }, [router])

  async function handleSaveClinica() {
    setClinicaMsg(null)
    setSavingClinica(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase
      .from('clinicas')
      .update({ nome: nome.trim(), whatsapp: whatsapp.replace(/\D/g, '') })
      .eq('id', user.id)
    setSavingClinica(false)
    if (error) {
      setClinicaMsg({ type: 'err', text: 'Erro ao salvar. Tente novamente.' })
    } else {
      setClinica(c => c ? { ...c, nome: nome.trim(), whatsapp: whatsapp.replace(/\D/g, '') } : c)
      setClinicaMsg({ type: 'ok', text: 'Dados salvos com sucesso.' })
      setTimeout(() => setClinicaMsg(null), 3000)
    }
  }

  async function handleChangePassword() {
    setPassMsg(null)
    if (!newPass || newPass.length < 6) {
      setPassMsg({ type: 'err', text: 'A senha precisa ter ao menos 6 caracteres.' })
      return
    }
    if (newPass !== confirmPass) {
      setPassMsg({ type: 'err', text: 'As senhas não coincidem.' })
      return
    }
    setSavingPass(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPass })
    setSavingPass(false)
    if (error) {
      setPassMsg({ type: 'err', text: error.message })
    } else {
      setNewPass('')
      setConfirmPass('')
      setPassMsg({ type: 'ok', text: 'Senha alterada com sucesso.' })
      setTimeout(() => setPassMsg(null), 3000)
    }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  const CARD: React.CSSProperties = {
    borderRadius: 18,
    border: '1px solid rgba(196,163,90,0.12)',
    background: 'rgba(255,255,255,0.02)',
    padding: '28px 32px',
    marginBottom: 20,
  }

  const INPUT: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid rgba(196,163,90,0.2)',
    background: 'rgba(255,255,255,0.04)',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
  }

  const LABEL: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    marginBottom: 6,
    color: 'rgba(255,255,255,0.4)',
  }

  if (loading) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center" style={{ backgroundColor: '#0A0A0D' }}>
        <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(196,163,90,0.3)', borderTopColor: '#C4A35A' }} />
      </div>
    )
  }

  const plano = PLANO_MAP[clinica?.plano ?? 'free'] ?? PLANO_MAP.free

  return (
    <div className="min-h-screen p-8" style={{ backgroundColor: '#0A0A0D' }}>

      {/* ── Header ── */}
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-light tracking-wide" style={{ color: '#C4A35A' }}>
          Configurações
        </h1>
        <p className="text-sm mt-1 font-light" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Gerencie sua clínica e preferências
        </p>
      </div>

      <div className="max-w-2xl">

        {/* ── Dados da Clínica ── */}
        <div style={CARD}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-serif text-lg font-light" style={{ color: 'rgba(255,255,255,0.88)' }}>
              Dados da Clínica
            </h2>
            <span
              className="px-3 py-1 rounded-full text-xs font-medium"
              style={{ color: plano.color, background: plano.bg }}
            >
              Plano {plano.label}
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <label style={LABEL}>Nome da clínica</label>
              <input
                type="text"
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Nome da sua clínica"
                style={INPUT}
              />
            </div>

            <div>
              <label style={LABEL}>WhatsApp</label>
              <input
                type="tel"
                value={maskPhone(whatsapp)}
                onChange={e => setWhatsapp(e.target.value.replace(/\D/g, ''))}
                placeholder="(XX) XXXXX-XXXX"
                style={INPUT}
              />
            </div>
          </div>

          {clinicaMsg && (
            <p className="mt-3 text-xs" style={{ color: clinicaMsg.type === 'ok' ? '#4ade80' : '#f87171' }}>
              {clinicaMsg.text}
            </p>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSaveClinica}
              disabled={savingClinica}
              className="px-6 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: savingClinica ? 'rgba(196,163,90,0.5)' : '#C4A35A',
                color: '#0A0A0D',
              }}
              onMouseEnter={e => { if (!savingClinica) e.currentTarget.style.background = '#D4B87A' }}
              onMouseLeave={e => { if (!savingClinica) e.currentTarget.style.background = '#C4A35A' }}
            >
              {savingClinica ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </div>

        {/* ── Segurança ── */}
        <div style={CARD}>
          <h2 className="font-serif text-lg font-light mb-6" style={{ color: 'rgba(255,255,255,0.88)' }}>
            Segurança
          </h2>

          <div className="space-y-4">
            <div>
              <label style={LABEL}>Nova senha</label>
              <input
                type="password"
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                style={INPUT}
              />
            </div>
            <div>
              <label style={LABEL}>Confirmar nova senha</label>
              <input
                type="password"
                value={confirmPass}
                onChange={e => setConfirmPass(e.target.value)}
                placeholder="Repita a nova senha"
                style={INPUT}
              />
            </div>
          </div>

          {passMsg && (
            <p className="mt-3 text-xs" style={{ color: passMsg.type === 'ok' ? '#4ade80' : '#f87171' }}>
              {passMsg.text}
            </p>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={handleChangePassword}
              disabled={savingPass || !newPass}
              className="px-6 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: savingPass || !newPass ? 'rgba(196,163,90,0.4)' : '#C4A35A',
                color: '#0A0A0D',
              }}
              onMouseEnter={e => { if (!savingPass && newPass) e.currentTarget.style.background = '#D4B87A' }}
              onMouseLeave={e => { if (!savingPass && newPass) e.currentTarget.style.background = '#C4A35A' }}
            >
              {savingPass ? 'Salvando...' : 'Alterar senha'}
            </button>
          </div>
        </div>

        {/* ── Notificações ── */}
        <div style={CARD}>
          <h2 className="font-serif text-lg font-light mb-6" style={{ color: 'rgba(255,255,255,0.88)' }}>
            Notificações
          </h2>

          <div className="space-y-5">
            {[
              { id: 'email', label: 'Notificações por e-mail', desc: 'Receba resumos diários da clínica no seu e-mail', checked: notifEmail, toggle: () => setNotifEmail(v => !v) },
              { id: 'whats', label: 'Alertas via WhatsApp', desc: 'Avisos sobre novos pacientes e renovações', checked: notifWhats, toggle: () => setNotifWhats(v => !v) },
              { id: 'relat', label: 'Relatório mensal', desc: 'Receba o relatório BeautyIntel todo mês', checked: notifRelat, toggle: () => setNotifRelat(v => !v) },
            ].map(item => (
              <div key={item.id} className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-light" style={{ color: 'rgba(255,255,255,0.78)' }}>
                    {item.label}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {item.desc}
                  </p>
                </div>
                <Toggle checked={item.checked} onChange={item.toggle} />
              </div>
            ))}
          </div>

          <p className="text-xs mt-5" style={{ color: 'rgba(255,255,255,0.2)' }}>
            As preferências de notificação são salvas localmente.
          </p>
        </div>

        {/* ── Zona de perigo ── */}
        <div style={{ ...CARD, borderColor: 'rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.03)' }}>
          <h2 className="font-serif text-lg font-light mb-2" style={{ color: 'rgba(239,68,68,0.7)' }}>
            Zona de risco
          </h2>
          <p className="text-sm font-light mb-5" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Ações irreversíveis relacionadas à sua conta.
          </p>
          <button
            onClick={async () => {
              const supabase = createClient()
              await supabase.auth.signOut()
              router.push('/auth/login')
            }}
            className="px-5 py-2.5 rounded-xl text-sm transition-all"
            style={{ border: '1px solid rgba(239,68,68,0.3)', color: 'rgba(239,68,68,0.65)' }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(239,68,68,0.08)'
              e.currentTarget.style.color = 'rgba(239,68,68,0.9)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'rgba(239,68,68,0.65)'
            }}
          >
            Encerrar sessão
          </button>
        </div>

      </div>
    </div>
  )
}
