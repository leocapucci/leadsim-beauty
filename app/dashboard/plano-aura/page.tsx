'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

interface PlanoAura {
  id: string
  paciente_id: string
  mes: string
  tratamento: string
  status: 'ativo' | 'pausado' | 'concluido'
  created_at: string
  pacientes: { id: string; nome: string }
}

interface PacienteOption { id: string; nome: string }

type StatusFilter = 'todos' | 'ativo' | 'pausado' | 'concluido'

// ── Constants ──────────────────────────────────────────────────────────────

const SEASONS = [
  { label: 'Todos',     value: 'all',      months: [] as number[] },
  { label: 'Verão',     value: 'verao',    months: [12, 1, 2] },
  { label: 'Outono',    value: 'outono',   months: [3, 4, 5] },
  { label: 'Inverno',   value: 'inverno',  months: [6, 7, 8] },
  { label: 'Primavera', value: 'primavera', months: [9, 10, 11] },
]

const STATUS_OPTS: StatusFilter[] = ['todos', 'ativo', 'pausado', 'concluido']

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  ativo:     { label: 'Ativo',     color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
  pausado:   { label: 'Pausado',   color: '#facc15', bg: 'rgba(250,204,21,0.1)' },
  concluido: { label: 'Concluído', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
}

const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

// ── Helpers ────────────────────────────────────────────────────────────────

function formatMes(mes: string) {
  const [year, month] = mes.split('-')
  return `${MONTHS_PT[parseInt(month) - 1]} ${year}`
}

function getMonthNum(mes: string) {
  return parseInt(mes.split('-')[1])
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, color: '#aaa', bg: 'rgba(255,255,255,0.06)' }
  return (
    <span
      className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ color: s.color, background: s.bg }}
    >
      {s.label}
    </span>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PlanoAuraPage() {
  const router = useRouter()
  const [planos,    setPlanos]    = useState<PlanoAura[]>([])
  const [pacientes, setPacientes] = useState<PacienteOption[]>([])
  const [loading,   setLoading]   = useState(true)
  const [season,    setSeason]    = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')
  const [search,    setSearch]    = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form,      setForm]      = useState({ paciente_id: '', mes: '', tratamento: '', status: 'ativo' })
  const [saving,    setSaving]    = useState(false)
  const [formError, setFormError] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/auth/login'); return }

    // Two-step: get clinic's patient IDs first, then fetch plans for those patients
    const { data: pacData } = await supabase
      .from('pacientes')
      .select('id, nome')
      .eq('clinica_id', user.id)
      .order('nome')

    const pacIds = (pacData ?? []).map(p => p.id)

    const { data: planosData } = pacIds.length > 0
      ? await supabase
          .from('planos_aura')
          .select('*, pacientes(id, nome)')
          .in('paciente_id', pacIds)
          .order('mes', { ascending: false })
      : { data: [] }

    setPlanos((planosData ?? []) as PlanoAura[])
    setPacientes(pacData ?? [])
    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = planos.filter(p => {
    const seasonObj = SEASONS.find(s => s.value === season)
    if (seasonObj && seasonObj.months.length > 0 && !seasonObj.months.includes(getMonthNum(p.mes))) return false
    if (statusFilter !== 'todos' && p.status !== statusFilter) return false
    if (search && !p.pacientes.nome.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    setFormError('')
    if (!form.paciente_id || !form.mes || !form.tratamento.trim()) {
      setFormError('Preencha todos os campos obrigatórios.')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('planos_aura').insert({
      paciente_id: form.paciente_id,
      mes:         form.mes,
      tratamento:  form.tratamento.trim(),
      status:      form.status,
    })
    setSaving(false)
    if (error) { setFormError('Erro ao salvar. Tente novamente.'); return }
    setShowModal(false)
    setForm({ paciente_id: '', mes: '', tratamento: '', status: 'ativo' })
    loadData()
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  const pill = (active: boolean) => ({
    padding: '5px 14px',
    borderRadius: 999,
    fontSize: 13,
    cursor: 'pointer' as const,
    border: '1px solid',
    borderColor: active ? 'rgba(196,163,90,0.55)' : 'rgba(255,255,255,0.1)',
    background: active ? 'rgba(196,163,90,0.12)' : 'transparent',
    color: active ? '#C4A35A' : 'rgba(255,255,255,0.4)',
    transition: 'all 0.15s',
  })

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

  return (
    <div className="min-h-screen p-8" style={{ backgroundColor: '#0A0A0D' }}>

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-serif text-3xl font-light tracking-wide" style={{ color: '#C4A35A' }}>
            Plano Aura 365™
          </h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Tratamentos e protocolos dos pacientes
          </p>
        </div>
        <button
          onClick={() => { setShowModal(true); setFormError('') }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
          style={{ background: '#C4A35A', color: '#0A0A0D' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#D4B87A')}
          onMouseLeave={e => (e.currentTarget.style.background = '#C4A35A')}
        >
          <span style={{ fontSize: 17, lineHeight: 1 }}>+</span>
          Novo Tratamento
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-widest w-16 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.28)' }}>
            Estação
          </span>
          {SEASONS.map(s => (
            <button key={s.value} style={pill(season === s.value)} onClick={() => setSeason(s.value)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-widest w-16 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.28)' }}>
            Status
          </span>
          {STATUS_OPTS.map(s => (
            <button key={s} style={pill(statusFilter === s)} onClick={() => setStatusFilter(s)}>
              {s === 'todos' ? 'Todos' : STATUS_MAP[s]?.label ?? s}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Buscar por paciente..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...INPUT, maxWidth: 320, marginTop: 4 }}
        />
      </div>

      {/* ── Table ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: '1px solid rgba(196,163,90,0.1)', background: 'rgba(255,255,255,0.015)' }}
      >
        <div
          className="grid px-6 py-3 text-xs uppercase tracking-widest"
          style={{
            gridTemplateColumns: '1.6fr 110px 2fr 120px',
            color: 'rgba(255,255,255,0.28)',
            borderBottom: '1px solid rgba(196,163,90,0.08)',
          }}
        >
          <span>Paciente</span>
          <span>Mês</span>
          <span>Tratamento</span>
          <span>Status</span>
        </div>

        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="px-6 py-4 animate-pulse"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
            >
              <div className="h-4 rounded" style={{ background: 'rgba(255,255,255,0.06)', width: `${55 + i * 5}%` }} />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center" style={{ color: 'rgba(255,255,255,0.22)' }}>
            <p className="text-4xl mb-3">✦</p>
            <p className="font-light">Nenhum tratamento encontrado.</p>
          </div>
        ) : (
          filtered.map(p => (
            <div
              key={p.id}
              className="grid items-center px-6 py-4"
              style={{
                gridTemplateColumns: '1.6fr 110px 2fr 120px',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                fontSize: 14,
                color: 'rgba(255,255,255,0.72)',
                cursor: 'default',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(196,163,90,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <button
                className="text-left font-light hover:underline"
                style={{ color: '#C4A35A' }}
                onClick={() => router.push(`/dashboard/pacientes/${p.pacientes.id}`)}
              >
                {p.pacientes.nome}
              </button>
              <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 13 }}>
                {formatMes(p.mes)}
              </span>
              <span className="font-light pr-4 truncate">{p.tratamento}</span>
              <StatusBadge status={p.status} />
            </div>
          ))
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-xs mt-3" style={{ color: 'rgba(255,255,255,0.22)' }}>
          {filtered.length} tratamento{filtered.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-8"
            style={{ background: '#131318', border: '1px solid rgba(196,163,90,0.2)' }}
          >
            <h2 className="font-serif text-xl font-light mb-6" style={{ color: '#C4A35A' }}>
              Novo Tratamento
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Paciente *
                </label>
                <select
                  value={form.paciente_id}
                  onChange={e => setForm(f => ({ ...f, paciente_id: e.target.value }))}
                  style={{ ...INPUT, appearance: 'none' as const }}
                >
                  <option value="" style={{ background: '#131318' }}>Selecione o paciente</option>
                  {pacientes.map(p => (
                    <option key={p.id} value={p.id} style={{ background: '#131318' }}>{p.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Mês *
                </label>
                <input
                  type="month"
                  value={form.mes}
                  onChange={e => setForm(f => ({ ...f, mes: e.target.value }))}
                  style={{ ...INPUT, colorScheme: 'dark' as const }}
                />
              </div>

              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Tratamento *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Limpeza de Pele Profunda"
                  value={form.tratamento}
                  onChange={e => setForm(f => ({ ...f, tratamento: e.target.value }))}
                  style={INPUT}
                />
              </div>

              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  style={{ ...INPUT, appearance: 'none' as const }}
                >
                  <option value="ativo"     style={{ background: '#131318' }}>Ativo</option>
                  <option value="pausado"   style={{ background: '#131318' }}>Pausado</option>
                  <option value="concluido" style={{ background: '#131318' }}>Concluído</option>
                </select>
              </div>
            </div>

            {formError && (
              <p className="mt-3 text-xs" style={{ color: '#f87171' }}>{formError}</p>
            )}

            <div className="flex gap-3 mt-7">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 rounded-xl text-sm transition-all"
                style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
                style={{ background: saving ? 'rgba(196,163,90,0.5)' : '#C4A35A', color: '#0A0A0D' }}
                onMouseEnter={e => { if (!saving) e.currentTarget.style.background = '#D4B87A' }}
                onMouseLeave={e => { if (!saving) e.currentTarget.style.background = '#C4A35A' }}
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
