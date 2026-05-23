'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

interface SkinspanResult {
  score:                number
  anos_diferenca:       number
  interpretacao:        string
  recomendacao:         string
  idade_biologica:      number
  idade_inflamatoria:   'baixa' | 'media' | 'alta'
  indice_colageno:      number
  risco_envelhecimento: 'baixo' | 'moderado' | 'acelerado'
}

interface HistoryEntry {
  score:          number
  anos_diferenca: number
  data:           string
}

interface Paciente {
  id:               string
  nome:             string
  skinspan_score:   number | null
  skinspan_data:    SkinspanResult | null
  skinspan_history: HistoryEntry[] | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 75) return '#4CAF50'
  if (s >= 56) return '#C4A35A'
  if (s >= 31) return '#FF9800'
  return '#F44336'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const color = scoreColor(score)
  const r = 52
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        <circle cx="65" cy="65" r={r} fill="none"
          stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`}
          transform="rotate(-90 65 65)"
          style={{ transition: 'stroke-dasharray 0.8s ease' }} />
        <text x="65" y="60" textAnchor="middle" fill={color}
          style={{ fontFamily: 'serif', fontSize: 28, fontWeight: 300 }}>
          {score}
        </text>
        <text x="65" y="78" textAnchor="middle" fill="rgba(255,255,255,0.3)"
          style={{ fontSize: 11 }}>
          / 100
        </text>
      </svg>
    </div>
  )
}

function MetricBar({ label, value, max = 100, color }: { label: string; value: number; max?: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] tracking-wide uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
        <span className="text-xs font-medium tabular-nums" style={{ color }}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function BadgePill({ value, map }: { value: string; map: Record<string, { label: string; color: string; bg: string }> }) {
  const s = map[value] ?? { label: value, color: '#888', bg: 'rgba(128,128,128,0.1)' }
  return (
    <span className="text-[10px] px-2.5 py-1 rounded-full tracking-widest uppercase font-medium"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}40` }}>
      {s.label}
    </span>
  )
}

const INFLAMATORIA_MAP = {
  baixa: { label: 'Baixa',  color: '#4CAF50', bg: 'rgba(76,175,80,0.1)'  },
  media: { label: 'Média',  color: '#FF9800', bg: 'rgba(255,152,0,0.1)'  },
  alta:  { label: 'Alta',   color: '#F44336', bg: 'rgba(244,67,54,0.1)'  },
}

const RISCO_MAP = {
  baixo:     { label: 'Baixo',      color: '#4CAF50', bg: 'rgba(76,175,80,0.1)'  },
  moderado:  { label: 'Moderado',   color: '#FF9800', bg: 'rgba(255,152,0,0.1)'  },
  acelerado: { label: 'Acelerado',  color: '#F44336', bg: 'rgba(244,67,54,0.1)'  },
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SkinspanPage() {
  const [pacientes,   setPacientes]   = useState<Paciente[]>([])
  const [loadingPats, setLoadingPats] = useState(true)
  const [selectedId,  setSelectedId]  = useState('')
  const [analyzing,   setAnalyzing]   = useState(false)
  const [result,      setResult]      = useState<SkinspanResult | null>(null)
  const [history,     setHistory]     = useState<HistoryEntry[]>([])
  const [error,       setError]       = useState('')

  const loadPacientes = useCallback(async () => {
    setLoadingPats(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoadingPats(false); return }
    const { data } = await supabase
      .from('pacientes')
      .select('id, nome, skinspan_score, skinspan_data, skinspan_history')
      .eq('clinica_id', user.id)
      .order('nome', { ascending: true })
    setPacientes((data as Paciente[]) ?? [])
    setLoadingPats(false)
  }, [])

  useEffect(() => { loadPacientes() }, [loadPacientes])

  useEffect(() => {
    const p = pacientes.find(x => x.id === selectedId)
    if (p?.skinspan_data) {
      setResult(p.skinspan_data)
      setHistory((p.skinspan_history ?? []).slice().reverse())
    } else {
      setResult(null)
      setHistory([])
    }
    setError('')
  }, [selectedId, pacientes])

  async function handleAnalyze() {
    if (!selectedId) return
    setAnalyzing(true)
    setError('')
    try {
      const res = await fetch('/api/skinspan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ paciente_id: selectedId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao analisar')
      setResult(data as SkinspanResult)
      await loadPacientes()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setAnalyzing(false)
    }
  }

  const selected = pacientes.find(p => p.id === selectedId)
  const canAnalyze = !!selectedId && !analyzing

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">

      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="font-serif text-3xl" style={{ color: '#C4A35A' }}>Skinspan Score™</h1>
          <span className="text-[10px] tracking-[0.25em] uppercase px-2.5 py-1 rounded-full font-medium"
            style={{ background: 'rgba(196,163,90,0.12)', color: '#C4A35A', border: '1px solid rgba(196,163,90,0.3)' }}>
            IA • ANÁLISE CLÍNICA
          </span>
        </div>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Descubra quantos anos a pele do seu paciente está à frente ou atrás da idade cronológica
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Left: form ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Patient select */}
          <div className="rounded-2xl p-5 space-y-4"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h2 className="font-serif text-base" style={{ color: '#F0EDE8' }}>Selecionar paciente</h2>

            <div>
              <label className="block text-[11px] tracking-widest uppercase mb-2"
                style={{ color: 'rgba(196,163,90,0.7)' }}>Paciente</label>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                disabled={loadingPats}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1px solid rgba(196,163,90,0.2)',
                  background: 'rgba(255,255,255,0.04)', color: '#F0EDE8',
                  fontSize: 14, outline: 'none',
                  opacity: loadingPats ? 0.5 : 1,
                }}
              >
                <option value="" style={{ background: '#0F0F14' }}>
                  {loadingPats ? 'Carregando...' : 'Selecione o paciente'}
                </option>
                {pacientes.map(p => (
                  <option key={p.id} value={p.id} style={{ background: '#0F0F14' }}>
                    {p.nome}{p.skinspan_score ? ` — ${p.skinspan_score}/100` : ''}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p className="text-xs px-3 py-2 rounded-lg"
                style={{ background: 'rgba(244,67,54,0.08)', color: '#f87171', border: '1px solid rgba(244,67,54,0.2)' }}>
                {error}
              </p>
            )}

            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className="w-full py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: canAnalyze ? '#C4A35A' : 'rgba(196,163,90,0.3)', color: '#0A0A0D' }}
              onMouseEnter={e => { if (canAnalyze) e.currentTarget.style.background = '#D4B87A' }}
              onMouseLeave={e => { if (canAnalyze) e.currentTarget.style.background = '#C4A35A' }}
            >
              {analyzing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  Analisando...
                </span>
              ) : '✦ Analisar Skinspan'}
            </button>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="rounded-2xl p-5"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <h2 className="font-serif text-base mb-4" style={{ color: '#F0EDE8' }}>Histórico</h2>
              <div className="space-y-2">
                {history.map((h, i) => {
                  const color = scoreColor(h.score)
                  return (
                    <div key={i}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {fmtDate(h.data)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-serif text-base font-light" style={{ color }}>{h.score}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{
                            color:       h.anos_diferenca >= 0 ? '#4CAF50' : '#F44336',
                            background:  h.anos_diferenca >= 0 ? 'rgba(76,175,80,0.1)'  : 'rgba(244,67,54,0.1)',
                            border: `1px solid ${h.anos_diferenca >= 0 ? 'rgba(76,175,80,0.3)' : 'rgba(244,67,54,0.3)'}`,
                          }}>
                          {h.anos_diferenca >= 0 ? '+' : ''}{h.anos_diferenca}a
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: result ── */}
        <div className="lg:col-span-3">
          {result ? (
            <div className="space-y-5">

              {/* Score card */}
              <div className="rounded-2xl p-6"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(196,163,90,0.15)' }}>
                <div className="flex items-center gap-6">
                  <ScoreGauge score={result.score} />
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="text-xs tracking-widest uppercase mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        Idade biológica da pele
                      </p>
                      <p className="font-serif text-2xl font-light" style={{ color: '#F0EDE8' }}>
                        {result.idade_biologica} anos
                      </p>
                    </div>
                    <span
                      className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full font-medium"
                      style={{
                        color:      result.anos_diferenca >= 0 ? '#4CAF50' : '#F44336',
                        background: result.anos_diferenca >= 0 ? 'rgba(76,175,80,0.1)' : 'rgba(244,67,54,0.1)',
                        border:    `1px solid ${result.anos_diferenca >= 0 ? 'rgba(76,175,80,0.3)' : 'rgba(244,67,54,0.3)'}`,
                      }}>
                      {result.anos_diferenca >= 0
                        ? `+${result.anos_diferenca} anos mais jovem`
                        : `${Math.abs(result.anos_diferenca)} anos mais velha`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Metrics grid */}
              <div className="rounded-2xl p-5"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <h3 className="text-xs tracking-widest uppercase mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  Métricas de análise
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <MetricBar label="Score Geral"        value={result.score}           color={scoreColor(result.score)} />
                  <MetricBar label="Índice de Colágeno" value={result.indice_colageno} color={scoreColor(result.indice_colageno)} />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <p className="text-[10px] tracking-widest uppercase mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      Estado Inflamatório
                    </p>
                    <BadgePill value={result.idade_inflamatoria} map={INFLAMATORIA_MAP} />
                  </div>
                  <div>
                    <p className="text-[10px] tracking-widest uppercase mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      Risco de Envelhecimento
                    </p>
                    <BadgePill value={result.risco_envelhecimento} map={RISCO_MAP} />
                  </div>
                </div>
              </div>

              {/* Interpretation */}
              <div className="rounded-2xl p-5 space-y-4"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <p className="text-[10px] tracking-widest uppercase mb-2" style={{ color: 'rgba(196,163,90,0.6)' }}>
                    Interpretação
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>
                    {selected && `${selected.nome}: `}{result.interpretacao}
                  </p>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
                  <p className="text-[10px] tracking-widest uppercase mb-2" style={{ color: 'rgba(196,163,90,0.6)' }}>
                    Recomendação
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>
                    {result.recomendacao}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[320px] rounded-2xl flex flex-col items-center justify-center gap-3"
              style={{ border: '1px dashed rgba(196,163,90,0.12)' }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(196,163,90,0.06)', border: '1px solid rgba(196,163,90,0.15)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C4A35A"
                  strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.6">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <p className="font-serif text-lg" style={{ color: 'rgba(255,255,255,0.18)' }}>
                {selectedId ? 'Nenhuma análise ainda' : 'Selecione um paciente'}
              </p>
              <p className="text-xs text-center max-w-xs" style={{ color: 'rgba(255,255,255,0.12)' }}>
                {selectedId
                  ? 'Clique em "Analisar Skinspan" para gerar o score'
                  : 'Escolha um paciente para ver o Skinspan Score™'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
