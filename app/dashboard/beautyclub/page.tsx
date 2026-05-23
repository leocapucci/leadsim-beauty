'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { createClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

interface Member {
  id: string
  tier: string
  valor: number
  status: string
  created_at: string
  pacientes: { id: string; nome: string; whatsapp: string }
}

interface Opportunity {
  id: string
  nome: string
  whatsapp: string
}

type MStatus = 'all' | 'ativo' | 'pausado' | 'cancelado'

// ── Constants ──────────────────────────────────────────────────────────────

const TIERS: Record<string, { label: string; color: string; bg: string; border: string; default: number }> = {
  silver:   { label: 'Aura Member', color: '#6D9470', bg: 'rgba(109,148,112,0.12)', border: 'rgba(109,148,112,0.25)', default: 199 },
  gold:     { label: 'Aura Gold',   color: '#C4A35A', bg: 'rgba(196,163,90,0.12)',  border: 'rgba(196,163,90,0.28)',  default: 399 },
  platinum: { label: 'Aura Black',  color: '#A0A0B0', bg: 'rgba(160,160,176,0.1)',  border: 'rgba(160,160,176,0.22)', default: 699 },
}

const CANCEL_REASONS = [
  { value: 'preco',                label: 'Preço' },
  { value: 'mudanca_clinica',      label: 'Mudança de clínica' },
  { value: 'resultado_insuficiente', label: 'Resultado insuficiente' },
  { value: 'outro',                label: 'Outro' },
]

const STATUS_FILTERS: { key: MStatus; label: string }[] = [
  { key: 'all',       label: 'Todos' },
  { key: 'ativo',     label: 'Ativos' },
  { key: 'pausado',   label: 'Pausados' },
  { key: 'cancelado', label: 'Cancelados' },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}
function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function buildMRRData(currentMRR: number) {
  const base = currentMRR > 0 ? currentMRR : 4800
  const now = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    const factor = 0.28 + i * 0.144
    return {
      mes: d.toLocaleDateString('pt-BR', { month: 'short' }),
      mrr: Math.round(base * factor),
    }
  })
}

// ── Shared input style ─────────────────────────────────────────────────────

const inputBase: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(196,163,90,0.2)',
  color: '#F0EDE8',
  borderRadius: 8,
  padding: '10px 14px',
  width: '100%',
  fontSize: 14,
  outline: 'none',
}
function focusGold(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.currentTarget.style.border = '1px solid rgba(196,163,90,0.6)'
}
function blurGold(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.currentTarget.style.border = '1px solid rgba(196,163,90,0.2)'
}

// ── Sub-components ─────────────────────────────────────────────────────────

function TierBadge({ tier, size = 'sm' }: { tier: string; size?: 'sm' | 'md' }) {
  const t = TIERS[tier]
  if (!t) return null
  const pad = size === 'md' ? 'px-3 py-1.5 text-xs' : 'px-2.5 py-1 text-[11px]'
  return (
    <span
      className={`${pad} font-medium tracking-widest uppercase rounded-full`}
      style={{ color: t.color, background: t.bg, border: `1px solid ${t.border}` }}
    >
      {t.label}
    </span>
  )
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    ativo:     { color: '#4ADE80', label: 'Ativo'     },
    pausado:   { color: '#F59E0B', label: 'Pausado'   },
    cancelado: { color: '#EF4444', label: 'Cancelado' },
  }
  const s = map[status] ?? map.ativo
  return (
    <span className="flex items-center gap-1.5 text-xs font-light" style={{ color: s.color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
      {s.label}
    </span>
  )
}

function TierCard({
  tier, members, accent,
}: {
  tier: string; members: Member[]; accent?: boolean
}) {
  const t = TIERS[tier]
  const mrr   = members.filter(m => m.status === 'ativo').reduce((s, m) => s + m.valor, 0)
  const total = members.filter(m => m.status === 'ativo').length
  return (
    <div
      className="rounded-2xl p-5 relative overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: accent ? `1px solid ${t.border}` : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {accent && (
        <div
          aria-hidden
          className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-25"
          style={{ background: t.color }}
        />
      )}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
        style={{ background: t.bg, border: `1px solid ${t.border}` }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={t.color} strokeWidth="1.8">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </div>
      <p className="text-xl font-semibold tabular-nums" style={{ color: t.color }}>{fmtBRL(mrr)}</p>
      <p className="text-xs mt-0.5 font-light tracking-wide" style={{ color: 'rgba(255,255,255,0.35)' }}>
        {t.label}
      </p>
      <p className="text-[11px] mt-2" style={{ color: 'rgba(255,255,255,0.2)' }}>
        {total} membro{total !== 1 ? 's' : ''} ativo{total !== 1 ? 's' : ''}
      </p>
    </div>
  )
}

function TotalCard({ members }: { members: Member[] }) {
  const active    = members.filter(m => m.status === 'ativo')
  const cancelled = members.filter(m => m.status === 'cancelado').length
  const totalMRR  = active.reduce((s, m) => s + m.valor, 0)
  return (
    <div
      className="rounded-2xl p-5 relative overflow-hidden"
      style={{ background: 'rgba(196,163,90,0.06)', border: '1px solid rgba(196,163,90,0.22)' }}
    >
      <div aria-hidden className="absolute -top-8 -left-8 w-32 h-32 rounded-full blur-3xl opacity-15" style={{ background: '#C4A35A' }} />
      <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-4" style={{ background: 'rgba(196,163,90,0.12)', border: '1px solid rgba(196,163,90,0.3)' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C4A35A" strokeWidth="1.8">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
        </svg>
      </div>
      <p className="text-2xl font-bold tabular-nums" style={{ color: '#C4A35A' }}>{fmtBRL(totalMRR)}</p>
      <p className="text-xs mt-0.5 font-light tracking-wide" style={{ color: 'rgba(255,255,255,0.35)' }}>MRR Total</p>
      <div className="flex gap-4 mt-3">
        <div>
          <p className="text-sm font-medium" style={{ color: '#4ADE80' }}>{active.length}</p>
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>ativos</p>
        </div>
        <div>
          <p className="text-sm font-medium" style={{ color: '#EF4444' }}>{cancelled}</p>
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>cancelados</p>
        </div>
      </div>
    </div>
  )
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-4 py-2.5" style={{ background: '#141418', border: '1px solid rgba(196,163,90,0.25)' }}>
      <p className="text-[10px] tracking-widest uppercase mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</p>
      <p className="text-base font-semibold tabular-nums" style={{ color: '#C4A35A' }}>{fmtBRL(payload[0].value)}</p>
    </div>
  )
}

function MRRChart({ data }: { data: { mes: string; mrr: number }[] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) {
    return <div className="h-48 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }} />
  }
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis
          dataKey="mes"
          tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => `R$${(v/1000).toFixed(0)}k`}
          width={44}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(196,163,90,0.15)', strokeWidth: 1 }} />
        <Line
          type="monotone"
          dataKey="mrr"
          stroke="#C4A35A"
          strokeWidth={2}
          dot={{ r: 3, fill: '#C4A35A', strokeWidth: 0 }}
          activeDot={{ r: 5, fill: '#D4B87A', strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Modal shell ────────────────────────────────────────────────────────────

function Modal({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md rounded-2xl p-8" style={{ background: '#0F0F14', border: '1px solid rgba(196,163,90,0.2)' }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="font-serif text-xl" style={{ color: '#F0EDE8' }}>{title}</h2>
            {sub && <p className="text-xs mt-0.5 tracking-wide" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</p>}
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors"
            style={{ color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#F0EDE8')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ActionRow({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-3 pt-2">{children}</div>
}

function CancelBtn({ onClick, label = 'Cancelar' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="flex-1 py-2.5 rounded-xl text-sm transition-colors"
      style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
      onMouseEnter={e => (e.currentTarget.style.color = '#F0EDE8')}
      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}>
      {label}
    </button>
  )
}

function SubmitBtn({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel?: string }) {
  return (
    <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl text-sm font-medium tracking-widest uppercase transition-all disabled:opacity-50"
      style={{ background: '#C4A35A', color: '#0A0A0D', letterSpacing: '0.1em' }}
      onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#D4B87A' }}
      onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#C4A35A' }}>
      {loading ? (loadingLabel ?? 'Salvando...') : label}
    </button>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] tracking-widest uppercase mb-2" style={{ color: 'rgba(196,163,90,0.7)' }}>{children}</label>
}

function ErrMsg({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <p className="text-sm py-2 px-3 rounded-lg" style={{ color: '#FCA5A5', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>{msg}</p>
}

// ── Upgrade Modal ──────────────────────────────────────────────────────────

function UpgradeModal({ member, onClose, onSuccess }: { member: Member; onClose: () => void; onSuccess: () => void }) {
  const currentT = TIERS[member.tier]
  const [tier,    setTier]    = useState(member.tier)
  const [valor,   setValor]   = useState(String(member.valor || TIERS[member.tier]?.default || 0))
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  function handleTierChange(t: string) {
    setTier(t)
    setValor(String(TIERS[t]?.default ?? 0))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('membros_beautyclub')
      .update({ tier, valor: parseFloat(valor) || 0 })
      .eq('id', member.id)
    if (err) { setError(err.message); setLoading(false); return }
    onSuccess()
  }

  return (
    <Modal title="Upgrade de Tier" sub={member.pacientes.nome} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-xl mb-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Tier atual:</div>
          {currentT && <TierBadge tier={member.tier} />}
        </div>
        <div>
          <FieldLabel>Novo tier</FieldLabel>
          <select value={tier} onChange={e => handleTierChange(e.target.value)} style={inputBase} onFocus={focusGold} onBlur={blurGold}>
            {Object.entries(TIERS).map(([k, t]) => (
              <option key={k} value={k} style={{ background: '#0F0F14' }}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Valor mensal (R$)</FieldLabel>
          <input
            type="number"
            min="0"
            step="0.01"
            value={valor}
            onChange={e => setValor(e.target.value)}
            style={inputBase}
            onFocus={focusGold}
            onBlur={blurGold}
          />
        </div>
        <ErrMsg msg={error} />
        <ActionRow>
          <CancelBtn onClick={onClose} />
          <SubmitBtn loading={loading} label="Confirmar Upgrade" />
        </ActionRow>
      </form>
    </Modal>
  )
}

// ── Cancel Modal ───────────────────────────────────────────────────────────

function CancelModal({ member, clinicaId, onClose, onSuccess }: { member: Member; clinicaId: string; onClose: () => void; onSuccess: () => void }) {
  const [motivo,  setMotivo]  = useState('preco')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const supabase = createClient()

    const { error: updErr } = await supabase
      .from('membros_beautyclub')
      .update({ status: 'cancelado' })
      .eq('id', member.id)

    if (updErr) { setError(updErr.message); setLoading(false); return }

    const motivoLabel = CANCEL_REASONS.find(r => r.value === motivo)?.label ?? motivo
    await supabase.from('mensagens').insert({
      clinica_id: clinicaId,
      paciente_id: member.pacientes.id,
      conteudo: `[Cancelamento Beauty Club] Motivo: ${motivoLabel}`,
      direcao: 'entrada',
    })

    onSuccess()
  }

  return (
    <Modal title="Cancelar Assinatura" sub={member.pacientes.nome} onClose={onClose}>
      <div className="mb-5 p-3 rounded-xl flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="1.8">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <p className="text-xs font-light" style={{ color: 'rgba(239,68,68,0.8)' }}>
          Esta ação cancela a assinatura e não pode ser desfeita automaticamente.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <FieldLabel>Motivo do cancelamento</FieldLabel>
          <select value={motivo} onChange={e => setMotivo(e.target.value)} style={inputBase} onFocus={focusGold} onBlur={blurGold}>
            {CANCEL_REASONS.map(r => (
              <option key={r.value} value={r.value} style={{ background: '#0F0F14' }}>{r.label}</option>
            ))}
          </select>
        </div>
        <ErrMsg msg={error} />
        <ActionRow>
          <CancelBtn onClick={onClose} label="Voltar" />
          <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl text-sm font-medium tracking-widest uppercase transition-all disabled:opacity-50"
            style={{ background: 'rgba(239,68,68,0.9)', color: '#fff', letterSpacing: '0.1em' }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'rgba(239,68,68,1)' }}
            onMouseLeave={e => { if (!loading) e.currentTarget.style.background = 'rgba(239,68,68,0.9)' }}>
            {loading ? 'Cancelando...' : 'Confirmar Cancelamento'}
          </button>
        </ActionRow>
      </form>
    </Modal>
  )
}

// ── Invite Modal ───────────────────────────────────────────────────────────

function InviteModal({ patient, onClose, onSuccess }: { patient: Opportunity; onClose: () => void; onSuccess: () => void }) {
  const [tier,    setTier]    = useState('silver')
  const [valor,   setValor]   = useState(String(TIERS.silver.default))
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  function handleTierChange(t: string) {
    setTier(t)
    setValor(String(TIERS[t]?.default ?? 0))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('membros_beautyclub')
      .insert({ paciente_id: patient.id, tier, valor: parseFloat(valor) || 0, status: 'ativo' })
    if (err) { setError(err.message); setLoading(false); return }
    onSuccess()
  }

  return (
    <Modal title="Convidar para Beauty Club" sub={patient.nome} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{patient.whatsapp}</p>
        </div>
        <div>
          <FieldLabel>Tier inicial</FieldLabel>
          <select value={tier} onChange={e => handleTierChange(e.target.value)} style={inputBase} onFocus={focusGold} onBlur={blurGold}>
            {Object.entries(TIERS).map(([k, t]) => (
              <option key={k} value={k} style={{ background: '#0F0F14' }}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Valor mensal (R$)</FieldLabel>
          <input type="number" min="0" step="0.01" value={valor} onChange={e => setValor(e.target.value)}
            style={inputBase} onFocus={focusGold} onBlur={blurGold} />
        </div>
        <ErrMsg msg={error} />
        <ActionRow>
          <CancelBtn onClick={onClose} />
          <SubmitBtn loading={loading} label="Adicionar ao Clube" />
        </ActionRow>
      </form>
    </Modal>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function BeautyClubPage() {
  const router = useRouter()

  const [clinicaId,     setClinicaId]     = useState('')
  const [members,       setMembers]       = useState<Member[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading,       setLoading]       = useState(true)
  const [statusFilter,  setStatusFilter]  = useState<MStatus>('ativo')

  // Modal targets
  const [upgradeTarget, setUpgradeTarget] = useState<Member | null>(null)
  const [cancelTarget,  setCancelTarget]  = useState<Member | null>(null)
  const [inviteTarget,  setInviteTarget]  = useState<Opportunity | null>(null)

  const loadData = useCallback(async (uid: string) => {
    const supabase = createClient()

    // Members with patient info
    const { data: raw } = await supabase
      .from('membros_beautyclub')
      .select('id, tier, valor, status, created_at, pacientes!inner(id, nome, whatsapp, clinica_id)')
      .eq('pacientes.clinica_id', uid)
      .order('created_at', { ascending: false })

    const membersData = (raw as Member[] | null) ?? []
    setMembers(membersData)

    // Opportunities: patients WITHOUT active club
    const activePacIds = new Set(
      membersData.filter(m => m.status === 'ativo').map(m => m.pacientes.id)
    )
    const { data: allPats } = await supabase
      .from('pacientes')
      .select('id, nome, whatsapp')
      .eq('clinica_id', uid)

    setOpportunities(
      ((allPats ?? []) as Opportunity[]).filter(p => !activePacIds.has(p.id))
    )
  }, [])

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login'); return }
      setClinicaId(user.id)
      await loadData(user.id)
      setLoading(false)
    }
    init()
  }, [router, loadData])

  async function togglePause(m: Member) {
    const supabase = createClient()
    const next = m.status === 'ativo' ? 'pausado' : 'ativo'
    await supabase.from('membros_beautyclub').update({ status: next }).eq('id', m.id)
    if (clinicaId) await loadData(clinicaId)
  }

  const filtered = members.filter(m => statusFilter === 'all' || m.status === statusFilter)
  const active   = members.filter(m => m.status === 'ativo')
  const totalMRR = active.reduce((s, m) => s + m.valor, 0)
  const chartData = buildMRRData(totalMRR)

  function refreshAll() {
    setUpgradeTarget(null)
    setCancelTarget(null)
    setInviteTarget(null)
    if (clinicaId) loadData(clinicaId)
  }

  return (
    <div className="flex flex-col flex-1 min-h-screen">

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-8 h-16"
        style={{ background: 'rgba(10,10,13,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(196,163,90,0.1)' }}
      >
        <div>
          <h1 className="font-serif text-xl tracking-wide" style={{ color: '#F0EDE8' }}>Beauty Club</h1>
          <p className="text-[11px] font-light tracking-widest uppercase mt-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
            {loading ? '...' : `${active.length} membro${active.length !== 1 ? 's' : ''} ativo${active.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </header>

      <main className="flex-1 px-8 py-8 space-y-8">

        {/* ── Tier Overview + Chart ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* Tier cards */}
          <div className="xl:col-span-2 grid grid-cols-2 xl:grid-cols-4 gap-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl p-5 animate-pulse" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="w-9 h-9 rounded-xl mb-4" style={{ background: 'rgba(255,255,255,0.05)' }} />
                  <div className="h-5 w-24 rounded mb-2" style={{ background: 'rgba(255,255,255,0.05)' }} />
                  <div className="h-3 w-16 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
                </div>
              ))
            ) : (
              <>
                <TierCard tier="silver"   members={members} />
                <TierCard tier="gold"     members={members} accent />
                <TierCard tier="platinum" members={members} />
                <TotalCard members={members} />
              </>
            )}
          </div>

          {/* MRR Chart */}
          <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] tracking-widest uppercase font-light" style={{ color: 'rgba(255,255,255,0.3)' }}>
                MRR — últimos 6 meses
              </p>
              <span className="text-[10px] px-2 py-1 rounded-full" style={{ color: 'rgba(196,163,90,0.6)', background: 'rgba(196,163,90,0.08)', border: '1px solid rgba(196,163,90,0.12)' }}>
                Simulado
              </span>
            </div>
            <MRRChart data={chartData} />
          </div>
        </div>

        {/* ── Members Table ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] tracking-widest uppercase font-light" style={{ color: 'rgba(255,255,255,0.25)' }}>
              Membros
            </p>
            {/* Status filter */}
            <div className="flex items-center gap-2">
              {STATUS_FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className="px-3 py-1.5 rounded-full text-[11px] tracking-widest uppercase transition-all"
                  style={{
                    background: statusFilter === f.key ? 'rgba(196,163,90,0.12)' : 'rgba(255,255,255,0.03)',
                    border: statusFilter === f.key ? '1px solid rgba(196,163,90,0.35)' : '1px solid rgba(255,255,255,0.07)',
                    color: statusFilter === f.key ? '#C4A35A' : 'rgba(255,255,255,0.3)',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {/* Head */}
            <div
              className="grid gap-4 px-6 py-3 text-[10px] tracking-widest uppercase"
              style={{ gridTemplateColumns: '1fr 100px 120px 130px 90px 180px', color: 'rgba(255,255,255,0.22)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
            >
              <span>Paciente</span>
              <span>Tier</span>
              <span>Mensalidade</span>
              <span>Início</span>
              <span>Status</span>
              <span>Ações</span>
            </div>

            {/* Rows */}
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="grid gap-4 px-6 py-4 animate-pulse"
                  style={{ gridTemplateColumns: '1fr 100px 120px 130px 90px 180px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {[1,2,3,4,5,6].map(j => <div key={j} className="h-3 rounded my-auto" style={{ background: 'rgba(255,255,255,0.06)' }} />)}
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="py-14 text-center">
                <p className="font-serif text-lg" style={{ color: 'rgba(255,255,255,0.18)' }}>Nenhum membro encontrado</p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.1)' }}>Ajuste os filtros ou convide pacientes abaixo</p>
              </div>
            ) : (
              filtered.map((m, idx) => (
                <div
                  key={m.id}
                  className="grid gap-4 px-6 py-4 transition-colors"
                  style={{
                    gridTemplateColumns: '1fr 100px 120px 130px 90px 180px',
                    borderBottom: idx < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.015)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-serif flex-shrink-0"
                      style={{ background: 'rgba(196,163,90,0.1)', color: '#C4A35A', border: '1px solid rgba(196,163,90,0.2)' }}>
                      {initials(m.pacientes.nome)}
                    </div>
                    <Link
                      href={`/dashboard/pacientes/${m.pacientes.id}`}
                      className="text-sm font-light truncate hover:underline"
                      style={{ color: '#F0EDE8' }}
                    >
                      {m.pacientes.nome}
                    </Link>
                  </div>
                  <div className="self-center"><TierBadge tier={m.tier} /></div>
                  <span className="text-sm font-light self-center tabular-nums" style={{ color: '#C4A35A' }}>
                    {fmtBRL(m.valor)}
                  </span>
                  <span className="text-sm font-light self-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {fmtDate(m.created_at)}
                  </span>
                  <div className="self-center"><StatusDot status={m.status} /></div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 self-center">
                    {m.status !== 'cancelado' && (
                      <button
                        onClick={() => setUpgradeTarget(m)}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] tracking-wide transition-all"
                        style={{ color: '#C4A35A', background: 'rgba(196,163,90,0.08)', border: '1px solid rgba(196,163,90,0.18)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(196,163,90,0.16)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(196,163,90,0.08)')}
                      >
                        Upgrade
                      </button>
                    )}
                    {m.status !== 'cancelado' && (
                      <button
                        onClick={() => togglePause(m)}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] tracking-wide transition-all"
                        style={{ color: m.status === 'ativo' ? '#F59E0B' : '#4ADE80', background: m.status === 'ativo' ? 'rgba(245,158,11,0.08)' : 'rgba(74,222,128,0.08)', border: `1px solid ${m.status === 'ativo' ? 'rgba(245,158,11,0.2)' : 'rgba(74,222,128,0.2)'}` }}
                      >
                        {m.status === 'ativo' ? 'Pausar' : 'Reativar'}
                      </button>
                    )}
                    {m.status === 'cancelado' && (
                      <button
                        onClick={() => togglePause(m)}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] tracking-wide transition-all"
                        style={{ color: '#4ADE80', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}
                      >
                        Reativar
                      </button>
                    )}
                    {m.status !== 'cancelado' && (
                      <button
                        onClick={() => setCancelTarget(m)}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] tracking-wide transition-all"
                        style={{ color: 'rgba(239,68,68,0.7)', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(239,68,68,0.7)')}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ── Opportunities ── */}
        {!loading && opportunities.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] tracking-widest uppercase font-light" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  Oportunidades de Upgrade
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.15)' }}>
                  Pacientes sem plano Beauty Club ativo
                </p>
              </div>
              <span className="text-[11px] px-3 py-1 rounded-full" style={{ color: 'rgba(196,163,90,0.6)', background: 'rgba(196,163,90,0.08)', border: '1px solid rgba(196,163,90,0.15)' }}>
                {opportunities.length} potencial{opportunities.length !== 1 ? 'is' : ''}
              </span>
            </div>

            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {opportunities.slice(0, 8).map((p, idx) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-6 py-4 transition-colors"
                  style={{ borderBottom: idx < Math.min(opportunities.length, 8) - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.015)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-serif"
                      style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      {initials(p.nome)}
                    </div>
                    <div>
                      <Link href={`/dashboard/pacientes/${p.id}`} className="text-sm font-light hover:underline" style={{ color: '#F0EDE8' }}>
                        {p.nome}
                      </Link>
                      <p className="text-xs font-light" style={{ color: 'rgba(255,255,255,0.3)' }}>{p.whatsapp}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setInviteTarget(p)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium tracking-wider transition-all"
                    style={{ background: 'rgba(109,148,112,0.1)', color: '#6D9470', border: '1px solid rgba(109,148,112,0.22)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(109,148,112,0.18)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(109,148,112,0.1)')}
                  >
                    <span>+</span> Convidar para Member
                  </button>
                </div>
              ))}
              {opportunities.length > 8 && (
                <div className="px-6 py-3 text-center text-xs" style={{ color: 'rgba(255,255,255,0.2)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  +{opportunities.length - 8} pacientes adicionais em{' '}
                  <Link href="/dashboard/pacientes" className="underline" style={{ color: 'rgba(196,163,90,0.5)' }}>Pacientes →</Link>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* ── Modals ── */}
      {upgradeTarget && (
        <UpgradeModal member={upgradeTarget} onClose={() => setUpgradeTarget(null)} onSuccess={refreshAll} />
      )}
      {cancelTarget && (
        <CancelModal member={cancelTarget} clinicaId={clinicaId} onClose={() => setCancelTarget(null)} onSuccess={refreshAll} />
      )}
      {inviteTarget && (
        <InviteModal patient={inviteTarget} onClose={() => setInviteTarget(null)} onSuccess={refreshAll} />
      )}
    </div>
  )
}
