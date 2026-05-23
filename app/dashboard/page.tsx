'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer,
} from 'recharts'

// ── Types ──────────────────────────────────────────────────────────────────

interface Metrics {
  mrr:            number
  totalPacientes: number
  membrosAtivos:  number
  ticketMedio:    number
}

interface WeeklyEntry {
  semana:  string
  data:    string
  score:   number
  status:  string
  detalhes?: {
    captacao:    number
    retencao:    number
    recorrencia: number
    engajamento: number
  }
}

interface BeautyScoreData {
  score:       number
  captacao:    number
  conversao:   number
  retencao:    number
  faturamento: number
  acoes:       string[]
  semana?:     string
  status?:     string
  history:     WeeklyEntry[]
}

interface AICFOBriefing {
  data:      string
  briefing:  string
  gerado_em: string
}

interface PacienteRow {
  id:   string
  nome: string
  whatsapp:   string
  created_at: string
  membros_beautyclub: { tier: string; status: string }[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}
function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return raw
}
function initials(name: string) {
  return name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
}
function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

// ── Sub-components ─────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier?: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    silver:   { label: 'Member',   color: '#A0AEC0', bg: 'rgba(160,174,192,0.1)' },
    gold:     { label: 'Gold',     color: '#C4A35A', bg: 'rgba(196,163,90,0.12)' },
    platinum: { label: 'Platinum', color: '#90CDF4', bg: 'rgba(144,205,244,0.1)' },
    member:   { label: 'Member',   color: '#7FA68A', bg: 'rgba(127,166,138,0.12)' },
    black:    { label: 'Black',    color: '#e2e8f0', bg: 'rgba(226,232,240,0.1)' },
  }
  if (!tier) return <span style={{ color: 'rgba(255,255,255,0.2)' }} className="text-xs">—</span>
  const s = map[tier] ?? map.silver
  return (
    <span className="text-[11px] font-medium tracking-widest uppercase px-2.5 py-1 rounded-full"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}30` }}>
      {s.label}
    </span>
  )
}

function MetricCard({ label, value, sub, icon, accent = false }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; accent?: boolean
}) {
  return (
    <div className="rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: accent ? '1px solid rgba(196,163,90,0.35)' : '1px solid rgba(255,255,255,0.06)',
      }}>
      {accent && (
        <div aria-hidden className="absolute -top-8 -left-8 w-32 h-32 rounded-full blur-2xl opacity-20"
          style={{ background: '#C4A35A' }} />
      )}
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: accent ? 'rgba(196,163,90,0.12)' : 'rgba(255,255,255,0.04)',
          border:     accent ? '1px solid rgba(196,163,90,0.2)' : '1px solid rgba(255,255,255,0.06)',
          color:      accent ? '#C4A35A' : 'rgba(255,255,255,0.35)',
        }}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-semibold tracking-tight" style={{ color: accent ? '#C4A35A' : '#F0EDE8' }}>
          {value}
        </p>
        <p className="text-xs mt-1 font-light tracking-wide" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
        {sub && <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.22)' }}>{sub}</p>}
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl p-6 animate-pulse"
      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="w-10 h-10 rounded-xl mb-4" style={{ background: 'rgba(255,255,255,0.05)' }} />
      <div className="h-7 w-28 rounded mb-2" style={{ background: 'rgba(255,255,255,0.05)' }} />
      <div className="h-3 w-20 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
    </div>
  )
}

function ScoreChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: '#141418', border: '1px solid rgba(196,163,90,0.25)' }}>
      <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</p>
      <p className="text-sm font-semibold" style={{ color: '#C4A35A' }}>{payload[0].value}</p>
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────

function IconTrend() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
}
function IconUsers() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
}
function IconStar() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
}
function IconTicket() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
}
function IconBell() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>
}
function IconRefresh({ spinning }: { spinning?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      className={spinning ? 'animate-spin' : ''}>
      <polyline points="23 4 23 10 17 10"/>
      <polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  )
}
function IconBriefcase() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
}

// ── Week timeline ─────────────────────────────────────────────────────────

const WEEK_STATUS: Record<string, { color: string; bg: string }> = {
  excelente: { color: '#4ade80', bg: 'rgba(74,222,128,0.1)'   },
  bom:       { color: '#86efac', bg: 'rgba(134,239,172,0.1)'  },
  regular:   { color: '#facc15', bg: 'rgba(250,204,21,0.1)'   },
  'atenção': { color: '#f87171', bg: 'rgba(248,113,113,0.1)'  },
}

function WeekTimeline({ history }: { history: WeeklyEntry[] }) {
  const last4 = history.slice(-4)
  if (last4.length === 0) return null
  return (
    <div className="rounded-2xl p-6"
      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-[11px] tracking-widest uppercase font-light mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>
        Histórico das últimas semanas
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {last4.map((entry, i) => {
          const prev  = last4[i - 1]
          const trend = prev ? (entry.score > prev.score ? 'up' : entry.score < prev.score ? 'down' : 'flat') : null
          const st    = WEEK_STATUS[entry.status] ?? WEEK_STATUS['regular']
          const weekNum = entry.semana?.split('-W')[1] ?? entry.semana ?? '—'
          return (
            <div key={entry.semana ?? i} className="rounded-xl p-4 flex flex-col gap-2"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  Sem. {weekNum}
                </span>
                {trend && (
                  <span className="text-sm" style={{ color: trend === 'up' ? '#4ade80' : trend === 'down' ? '#f87171' : 'rgba(255,255,255,0.25)' }}>
                    {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
                  </span>
                )}
              </div>
              <p className="font-serif text-2xl font-semibold" style={{ color: st.color }}>{entry.score}</p>
              <span className="text-[10px] px-2 py-0.5 rounded-full w-fit"
                style={{ color: st.color, background: st.bg }}>
                {entry.status}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Sub-score bar ─────────────────────────────────────────────────────────

function SubScoreBar({ label, value, max = 25 }: { label: string; value: number; max?: number }) {
  const pct = (value / max) * 100
  const color = pct >= 70 ? '#4ade80' : pct >= 40 ? '#facc15' : '#f87171'
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
        <span className="text-xs font-medium" style={{ color }}>{value}/{max}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }} />
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()

  const [metrics,    setMetrics]    = useState<Metrics | null>(null)
  const [patients,   setPatients]   = useState<PacienteRow[] | null>(null)
  const [loading,    setLoading]    = useState(true)

  const [bsData,     setBsData]     = useState<BeautyScoreData | null>(null)
  const [bsLoading,  setBsLoading]  = useState(true)
  const [bsError,    setBsError]    = useState(false)
  const [mounted,    setMounted]    = useState(false)

  const [animScore,  setAnimScore]  = useState(0)
  const rafRef = useRef<number>(0)

  const [cfoData,    setCfoData]    = useState<AICFOBriefing | null>(null)
  const [cfoLoading, setCfoLoading] = useState(true)

  useEffect(() => { setMounted(true) }, [])

  // ── Animate score ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!bsData) return
    const target    = bsData.score
    const startTime = performance.now()
    const duration  = 1200
    function tick(now: number) {
      const p = Math.min((now - startTime) / duration, 1)
      const e = 1 - Math.pow(1 - p, 3)
      setAnimScore(Math.round(e * target))
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [bsData])

  // ── Fetch AI CFO™ ─────────────────────────────────────────────────────────

  const fetchCFO = useCallback(async (force = false) => {
    setCfoLoading(true)
    try {
      let res: Response
      if (force) {
        res = await fetch('/api/aicfo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true }) })
        const data = await res.json() as AICFOBriefing
        setCfoData(data)
      } else {
        res = await fetch('/api/aicfo')
        const data = await res.json() as { briefing: AICFOBriefing | null }
        if (data.briefing) {
          setCfoData(data.briefing)
        } else {
          // No briefing yet — generate one
          res = await fetch('/api/aicfo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
          const generated = await res.json() as AICFOBriefing
          setCfoData(generated)
        }
      }
    } catch { /* silent */ } finally {
      setCfoLoading(false)
    }
  }, [])

  // ── Fetch BeautyScore ─────────────────────────────────────────────────────

  const fetchBeautyScore = useCallback(async () => {
    setBsLoading(true)
    setBsError(false)
    try {
      const res = await fetch('/api/beautyscore')
      if (!res.ok) throw new Error()
      const data = await res.json() as BeautyScoreData
      setBsData(data)
      setAnimScore(0)
    } catch {
      setBsError(true)
    } finally {
      setBsLoading(false)
    }
  }, [])

  // ── Fetch clinic metrics + recent patients ─────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/auth/login'); return }

        // Single parallel fetch — avoids .in() with hundreds of IDs
        const [
          { data: allPacientes, count: totalCount },
          { data: recentPatients },
          { data: allMembros },
        ] = await Promise.all([
          supabase
            .from('pacientes')
            .select('id', { count: 'exact' })
            .eq('clinica_id', user.id),
          supabase
            .from('pacientes')
            .select('id, nome, whatsapp, created_at, membros_beautyclub(tier, status)')
            .eq('clinica_id', user.id)
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('membros_beautyclub')
            .select('paciente_id, valor, status')
            .eq('status', 'ativo'),
        ])

        const idSet = new Set((allPacientes ?? []).map((p: { id: string }) => p.id))
        console.log('DEBUG idSet:', Array.from(idSet))
        console.log('DEBUG allMembros:', allMembros)
        const activeMembros = (allMembros ?? []).filter(
          (m: { paciente_id: string; valor?: number; status: string }) => idSet.has(m.paciente_id)
        )
        console.log('DEBUG activeMembros:', activeMembros)
        const membrosAtivos = activeMembros.length
        const mrr           = activeMembros.reduce((s: number, m: { valor?: number }) => s + (m.valor ?? 0), 0)
        const ticketMedio   = membrosAtivos > 0 ? mrr / membrosAtivos : 0

        setMetrics({ mrr, totalPacientes: totalCount ?? 0, membrosAtivos, ticketMedio })
        setPatients((recentPatients as PacienteRow[]) ?? [])
      } catch { /* silent — metrics stay in skeleton */ } finally {
        setLoading(false)
      }
    }
    load()
    fetchBeautyScore()
    fetchCFO()
  }, [router, fetchBeautyScore, fetchCFO])

  // ── Score color ────────────────────────────────────────────────────────────

  const scoreColor = bsData
    ? bsData.score >= 70 ? '#4ade80' : bsData.score >= 40 ? '#facc15' : '#f87171'
    : '#C4A35A'

  const chartData = (bsData?.history ?? []).slice(-8).map(h => ({
    data:  fmtShortDate(h.data),
    score: h.score,
  }))

  return (
    <div className="flex flex-col flex-1 min-h-screen">

      {/* ── Header ── */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-8 h-16"
        style={{ background: 'rgba(10,10,13,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(196,163,90,0.1)' }}>
        <div>
          <h1 className="font-serif text-xl tracking-wide" style={{ color: '#F0EDE8' }}>Dashboard</h1>
          <p className="text-[11px] font-light tracking-widest uppercase mt-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
            BeautyIntel™
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* BeautyScore widget */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>BeautyScore™</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>desta semana</p>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center font-serif text-xl font-semibold"
              style={{ background: 'rgba(196,163,90,0.1)', border: '1px solid rgba(196,163,90,0.3)', color: scoreColor }}>
              {bsLoading ? '—' : animScore}
            </div>
          </div>

          {/* Bell */}
          <button className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
            style={{ color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.07)' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#C4A35A'; e.currentTarget.style.border = '1px solid rgba(196,163,90,0.25)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; e.currentTarget.style.border = '1px solid rgba(255,255,255,0.07)' }}>
            <IconBell />
          </button>
        </div>
      </header>

      <main className="flex-1 px-8 py-8 space-y-8">

        {/* Ambient glow */}
        <div aria-hidden className="pointer-events-none fixed top-20 right-20 w-80 h-80 rounded-full blur-3xl opacity-10"
          style={{ background: 'radial-gradient(circle, rgba(196,163,90,0.5) 0%, transparent 70%)' }} />

        {/* ── AI CFO™ ── */}
        <section>
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.2)' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid rgba(201,168,76,0.1)' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(201,168,76,0.12)', color: '#C9A84C', border: '1px solid rgba(201,168,76,0.2)' }}>
                  <IconBriefcase />
                </div>
                <span className="font-serif text-base tracking-wide" style={{ color: '#C9A84C' }}>AI CFO™</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full tracking-widest uppercase font-medium"
                  style={{ background: 'rgba(201,168,76,0.15)', color: '#C9A84C' }}>HOJE</span>
              </div>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
              </span>
            </div>

            {/* Body */}
            <div className="px-6 py-5 min-h-[80px]">
              {cfoLoading ? (
                <div className="space-y-3 animate-pulse">
                  {[100, 85, 70, 55].map(w => (
                    <div key={w} className="h-3 rounded" style={{ width: `${w}%`, background: 'rgba(201,168,76,0.08)' }} />
                  ))}
                </div>
              ) : cfoData?.briefing ? (
                <div className="space-y-3">
                  {cfoData.briefing.split('\n').filter(l => l.trim()).map((line, i) => (
                    <p key={i} className="text-sm font-light leading-relaxed" style={{ color: '#F0EDE8' }}>{line}</p>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full border-2 animate-spin flex-shrink-0"
                    style={{ borderColor: 'rgba(201,168,76,0.2)', borderTopColor: '#C9A84C' }} />
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Gerando seu briefing do dia...</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-3"
              style={{ borderTop: '1px solid rgba(201,168,76,0.08)' }}>
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.22)' }}>
                Atualizado automaticamente às 7h
              </p>
              <button
                onClick={() => fetchCFO(true)}
                disabled={cfoLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-all"
                style={{
                  color:      cfoLoading ? 'rgba(201,168,76,0.35)' : '#C9A84C',
                  background: 'rgba(201,168,76,0.08)',
                  border:     '1px solid rgba(201,168,76,0.15)',
                }}
                onMouseEnter={e => { if (!cfoLoading) e.currentTarget.style.background = 'rgba(201,168,76,0.14)' }}
                onMouseLeave={e => { if (!cfoLoading) e.currentTarget.style.background = 'rgba(201,168,76,0.08)' }}
              >
                <IconRefresh spinning={cfoLoading} />
                Atualizar agora
              </button>
            </div>
          </div>
        </section>

        {/* ── Metrics ── */}
        <section>
          <p className="text-[11px] tracking-widest uppercase mb-4 font-light" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Métricas do mês
          </p>
          {loading ? (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {[0,1,2,3].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <MetricCard label="MRR Atual"           value={formatBRL(metrics?.mrr ?? 0)}           sub="Receita mensal recorrente"  icon={<IconTrend />} accent />
              <MetricCard label="Pacientes Ativos"    value={String(metrics?.totalPacientes ?? 0)}   sub="Cadastros na plataforma"    icon={<IconUsers />} />
              <MetricCard label="Beauty Club Ativos"  value={String(metrics?.membrosAtivos ?? 0)}    sub="Status: ativo"              icon={<IconStar />} />
              <MetricCard label="Ticket Médio"        value={formatBRL(metrics?.ticketMedio ?? 0)}   sub="MRR ÷ membros ativos"       icon={<IconTicket />} />
            </div>
          )}
        </section>

        {/* ── BeautyScore™ section ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] tracking-widest uppercase font-light" style={{ color: 'rgba(255,255,255,0.25)' }}>
              BeautyScore™ Semanal
            </p>
            <button
              onClick={fetchBeautyScore}
              disabled={bsLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs transition-all"
              style={{
                color:      bsLoading ? 'rgba(196,163,90,0.4)' : '#C4A35A',
                background: 'rgba(196,163,90,0.08)',
                border:     '1px solid rgba(196,163,90,0.2)',
              }}
              onMouseEnter={e => { if (!bsLoading) e.currentTarget.style.background = 'rgba(196,163,90,0.15)' }}
              onMouseLeave={e => { if (!bsLoading) e.currentTarget.style.background = 'rgba(196,163,90,0.08)' }}
            >
              <IconRefresh spinning={bsLoading} />
              {bsLoading ? 'Calculando...' : 'Recalcular agora'}
            </button>
          </div>

          {bsError ? (
            <div className="rounded-2xl p-6 text-center"
              style={{ border: '1px dashed rgba(248,113,113,0.2)', background: 'rgba(248,113,113,0.04)' }}>
              <p className="text-sm" style={{ color: 'rgba(248,113,113,0.7)' }}>Erro ao calcular BeautyScore™</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Verifique sua ANTHROPIC_API_KEY</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Score + sub-scores */}
              <div className="rounded-2xl p-6 space-y-5 relative overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(196,163,90,0.18)' }}>
                <div aria-hidden className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-15"
                  style={{ background: scoreColor }} />

                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-serif text-5xl font-semibold leading-none" style={{ color: scoreColor }}>
                      {bsLoading ? '—' : animScore}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>/100 desta semana</p>
                  </div>
                  {bsData && (
                    <div className="text-xs px-2.5 py-1 rounded-full"
                      style={{
                        color:      bsData.score >= 70 ? '#4ade80' : bsData.score >= 40 ? '#facc15' : '#f87171',
                        background: bsData.score >= 70 ? 'rgba(74,222,128,0.1)' : bsData.score >= 40 ? 'rgba(250,204,21,0.1)' : 'rgba(248,113,113,0.1)',
                      }}>
                      {bsData.score >= 70 ? 'Excelente' : bsData.score >= 40 ? 'Em crescimento' : 'Atenção necessária'}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {bsLoading ? (
                    Array.from({length: 4}).map((_,i) => (
                      <div key={i} className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
                    ))
                  ) : bsData ? (
                    <>
                      <SubScoreBar label="Captação"    value={bsData.captacao}    />
                      <SubScoreBar label="Conversão"   value={bsData.conversao}   />
                      <SubScoreBar label="Retenção"    value={bsData.retencao}    />
                      <SubScoreBar label="Faturamento" value={bsData.faturamento} />
                    </>
                  ) : null}
                </div>
              </div>

              {/* Priority actions */}
              <div className="rounded-2xl p-6 space-y-4"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[11px] tracking-widest uppercase font-light" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  Ações prioritárias
                </p>
                {bsLoading ? (
                  Array.from({length: 3}).map((_,i) => (
                    <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
                  ))
                ) : bsData?.acoes ? (
                  <div className="space-y-3">
                    {bsData.acoes.map((acao, i) => (
                      <div key={i} className="flex gap-3 px-4 py-3 rounded-xl"
                        style={{ background: 'rgba(196,163,90,0.05)', border: '1px solid rgba(196,163,90,0.1)' }}>
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0"
                          style={{ background: 'rgba(196,163,90,0.15)', color: '#C4A35A' }}>
                          {i + 1}
                        </span>
                        <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>{acao}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Evolution chart */}
              <div className="rounded-2xl p-6 flex flex-col"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[11px] tracking-widest uppercase font-light mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  Evolução (últimas semanas)
                </p>
                {bsLoading ? (
                  <div className="flex-1 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)', minHeight: 100 }} />
                ) : chartData.length < 2 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.2)' }}>
                      Recalcule mais vezes para ver a evolução
                    </p>
                  </div>
                ) : mounted ? (
                  <ResponsiveContainer width="100%" height={110}>
                    <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                      <XAxis dataKey="data" tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: 'rgba(255,255,255,0.18)', fontSize: 9 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ScoreChartTooltip />} cursor={{ stroke: 'rgba(196,163,90,0.12)' }} />
                      <Line type="monotone" dataKey="score" stroke="#C4A35A" strokeWidth={1.5}
                        dot={{ r: 2.5, fill: '#C4A35A', strokeWidth: 0 }}
                        activeDot={{ r: 4, fill: '#D4B87A', strokeWidth: 0 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : null}
              </div>
            </div>
          )}

          {/* ── Week timeline ── */}
          {!bsLoading && !bsError && bsData && bsData.history.length > 0 && (
            <div className="mt-4">
              <WeekTimeline history={bsData.history} />
            </div>
          )}
        </section>

        {/* ── Recent Patients ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] tracking-widest uppercase font-light" style={{ color: 'rgba(255,255,255,0.25)' }}>
              Últimos pacientes cadastrados
            </p>
            <a href="/dashboard/pacientes" className="text-[11px] tracking-wide transition-colors"
              style={{ color: 'rgba(196,163,90,0.5)' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#C4A35A')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(196,163,90,0.5)')}>
              Ver todos →
            </a>
          </div>

          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-4 px-6 py-3 text-[10px] tracking-widest uppercase"
              style={{ color: 'rgba(255,255,255,0.22)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span>Paciente</span><span>WhatsApp</span><span>Cadastro</span><span>Tier</span>
            </div>

            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-4 px-6 py-4 animate-pulse"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
                    <div className="h-3 w-24 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
                  </div>
                  <div className="h-3 w-28 rounded my-auto" style={{ background: 'rgba(255,255,255,0.04)' }} />
                  <div className="h-3 w-20 rounded my-auto" style={{ background: 'rgba(255,255,255,0.04)' }} />
                  <div className="h-5 w-14 rounded-full my-auto" style={{ background: 'rgba(255,255,255,0.04)' }} />
                </div>
              ))
            ) : patients?.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="font-serif text-lg mb-1" style={{ color: 'rgba(255,255,255,0.2)' }}>Nenhum paciente cadastrado</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.12)' }}>Adicione o primeiro paciente em Pacientes →</p>
              </div>
            ) : (
              patients?.map((p, idx) => {
                const tier = p.membros_beautyclub?.[0]?.tier
                return (
                  <div key={p.id}
                    className="grid grid-cols-[1fr_1fr_1fr_auto] gap-4 px-6 py-4 transition-colors"
                    style={{ borderBottom: idx < (patients.length-1) ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 font-serif"
                        style={{ background: 'rgba(196,163,90,0.1)', color: '#C4A35A', border: '1px solid rgba(196,163,90,0.2)' }}>
                        {initials(p.nome)}
                      </div>
                      <span className="text-sm font-light" style={{ color: '#F0EDE8' }}>{p.nome}</span>
                    </div>
                    <span className="text-sm font-light self-center" style={{ color: 'rgba(255,255,255,0.45)' }}>{formatPhone(p.whatsapp)}</span>
                    <span className="text-sm font-light self-center" style={{ color: 'rgba(255,255,255,0.3)' }}>{formatDate(p.created_at)}</span>
                    <div className="self-center"><TierBadge tier={tier} /></div>
                  </div>
                )
              })
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
