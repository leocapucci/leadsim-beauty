'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

interface AuraBioResult {
  risco:            'baixo' | 'medio' | 'alto'
  score_lifestyle:  number
  interpretacao:    string
  ajuste_protocolo: string
  tratamento_mes:   string
  alerta:           string | null
}

interface HistoryEntry extends AuraBioResult {
  anamnese: {
    sono: number; estresse: number; hidratacao: string
    alimentacao: string; exposicao_solar: string; protetor_solar: boolean
  }
  data: string
}

interface PacienteOption {
  id:               string
  nome:             string
  aura_bio_history: HistoryEntry[] | null
}

// ── Constants ──────────────────────────────────────────────────────────────

const RISCO_MAP = {
  baixo: { label: 'Risco Baixo', color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.3)'  },
  medio: { label: 'Risco Médio', color: '#facc15', bg: 'rgba(250,204,21,0.12)',  border: 'rgba(250,204,21,0.3)'  },
  alto:  { label: 'Risco Alto',  color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function scoreColor(s: number) {
  if (s >= 75) return '#4ade80'
  if (s >= 50) return '#C4A35A'
  return '#f87171'
}

// ── Sub-components ─────────────────────────────────────────────────────────

function RiscoBadge({ risco }: { risco: 'baixo' | 'medio' | 'alto' }) {
  const r = RISCO_MAP[risco]
  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
      style={{ color: r.color, background: r.bg, border: `1px solid ${r.border}` }}
    >
      {r.label}
    </span>
  )
}

function Slider({
  label, value, onChange, min = 1, max = 10,
  formatLabel,
}: {
  label: string; value: number; onChange: (v: number) => void
  min?: number; max?: number; formatLabel?: (v: number) => string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <label className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</label>
        <span className="text-sm font-medium" style={{ color: '#C4A35A' }}>
          {formatLabel ? formatLabel(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="aura-slider w-full"
        style={{
          background: `linear-gradient(to right, #C4A35A ${pct}%, rgba(255,255,255,0.1) ${pct}%)`,
        }}
      />
      <div className="flex justify-between mt-1">
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>{min}</span>
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>{max}</span>
      </div>
    </div>
  )
}

function Select({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  const INPUT: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid rgba(196,163,90,0.2)',
    background: 'rgba(255,255,255,0.04)',
    color: '#fff', fontSize: 14, outline: 'none', appearance: 'none',
  }
  return (
    <div>
      <label className="block text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={INPUT}>
        {options.map(o => (
          <option key={o.value} value={o.value} style={{ background: '#131318' }}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AuraBioPage() {
  const router = useRouter()
  const rafRef = useRef<number>(0)

  const [pacientes,   setPacientes]   = useState<PacienteOption[]>([])
  const [selectedPac, setSelectedPac] = useState<PacienteOption | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [analyzing,   setAnalyzing]   = useState(false)
  const [result,      setResult]      = useState<AuraBioResult | null>(null)
  const [animScore,   setAnimScore]   = useState(0)
  const [apiError,    setApiError]    = useState('')

  // Anamnese form state
  const [sono,         setSono]        = useState(7)
  const [estresse,     setEstresse]    = useState(5)
  const [hidratacao,   setHidratacao]  = useState('boa')
  const [alimentacao,  setAlimentacao] = useState('saudavel')
  const [exposicaoSol, setExposicaoSol] = useState('moderada')
  const [protetorSol,  setProtetorSol] = useState(true)

  const loadPacientes = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/auth/login'); return }

    const { data } = await supabase
      .from('pacientes')
      .select('id, nome, aura_bio_history')
      .eq('clinica_id', user.id)
      .order('nome')

    setPacientes((data ?? []) as PacienteOption[])
    setLoading(false)
  }, [router])

  useEffect(() => { loadPacientes() }, [loadPacientes])

  // ── Score animation ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!result) return
    const target   = result.score_lifestyle
    const duration = 1400
    const startTime = performance.now()
    cancelAnimationFrame(rafRef.current)

    function tick(now: number) {
      const progress = Math.min((now - startTime) / duration, 1)
      const eased    = 1 - Math.pow(1 - progress, 3)
      setAnimScore(Math.round(eased * target))
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [result])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSelectPaciente(id: string) {
    const pac = pacientes.find(p => p.id === id) ?? null
    setSelectedPac(pac)
    setResult(null)
    setAnimScore(0)
    setApiError('')
  }

  async function handleAnalyze() {
    if (!selectedPac) return
    setAnalyzing(true)
    setResult(null)
    setAnimScore(0)
    setApiError('')

    const res = await fetch('/api/aura-bio', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        paciente_id:    selectedPac.id,
        sono, estresse, hidratacao, alimentacao,
        exposicao_solar: exposicaoSol,
        protetor_solar:  protetorSol,
      }),
    })

    const data = await res.json()
    setAnalyzing(false)

    if (!res.ok) { setApiError(data.error ?? 'Erro desconhecido.'); return }

    setResult(data as AuraBioResult)

    // Atualiza histórico local sem refetch
    const newEntry: HistoryEntry = {
      ...data,
      anamnese: { sono, estresse, hidratacao, alimentacao, exposicao_solar: exposicaoSol, protetor_solar: protetorSol },
      data: new Date().toISOString(),
    }
    const updatedPac: PacienteOption = {
      ...selectedPac,
      aura_bio_history: [...(selectedPac.aura_bio_history ?? []), newEntry].slice(-12),
    }
    setSelectedPac(updatedPac)
    setPacientes(pacs => pacs.map(p => p.id === selectedPac.id ? updatedPac : p))
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const history = (selectedPac?.aura_bio_history ?? []).slice(-3).reverse()

  const SELECT_INPUT: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid rgba(196,163,90,0.2)',
    background: 'rgba(255,255,255,0.04)',
    color: result ? 'rgba(255,255,255,0.6)' : '#fff',
    fontSize: 14, outline: 'none', appearance: 'none',
  }

  return (
    <>
      {/* Global slider styles */}
      <style>{`
        .aura-slider { -webkit-appearance: none; appearance: none; height: 4px; border-radius: 2px; outline: none; cursor: pointer; }
        .aura-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #C4A35A; border: 2px solid #0A0A0D; box-shadow: 0 0 8px rgba(196,163,90,0.5); cursor: pointer; }
        .aura-slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #C4A35A; border: 2px solid #0A0A0D; cursor: pointer; }
      `}</style>

      <div className="min-h-screen p-8" style={{ backgroundColor: '#0A0A0D' }}>

        {/* ── Header ── */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-serif text-3xl font-light tracking-wide" style={{ color: '#C4A35A' }}>
              Protocolo Aura Bio™
            </h1>
            <span
              className="px-2.5 py-0.5 rounded-full text-[11px] font-medium tracking-widest uppercase"
              style={{ background: 'rgba(196,163,90,0.12)', color: 'rgba(196,163,90,0.7)', border: '1px solid rgba(196,163,90,0.2)' }}
            >
              IA
            </span>
          </div>
          <p className="text-sm font-light" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Análise de lifestyle e recomendação personalizada de protocolo
          </p>
        </div>

        {/* ── Patient select ── */}
        <div className="mb-8 max-w-sm">
          <label className="block text-xs mb-2 uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Paciente
          </label>
          {loading ? (
            <div className="h-11 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
          ) : (
            <select
              value={selectedPac?.id ?? ''}
              onChange={e => handleSelectPaciente(e.target.value)}
              style={SELECT_INPUT}
            >
              <option value="" style={{ background: '#0A0A0D' }}>Selecione o paciente</option>
              {pacientes.map(p => (
                <option key={p.id} value={p.id} style={{ background: '#0A0A0D' }}>{p.nome}</option>
              ))}
            </select>
          )}
        </div>

        {selectedPac && (
          <>
            {/* ── Anamnese form ── */}
            <div
              className="rounded-2xl p-7 mb-6"
              style={{ border: '1px solid rgba(196,163,90,0.12)', background: 'rgba(255,255,255,0.02)' }}
            >
              <h2 className="font-serif text-lg font-light mb-6" style={{ color: 'rgba(255,255,255,0.85)' }}>
                Anamnese de Lifestyle
              </h2>

              <div className="grid grid-cols-1 gap-7 md:grid-cols-2">
                {/* Sliders */}
                <Slider
                  label="Sono"
                  value={sono}
                  onChange={setSono}
                  formatLabel={v => `${v} horas/noite`}
                />
                <Slider
                  label="Nível de estresse"
                  value={estresse}
                  onChange={setEstresse}
                  formatLabel={v => `Nível ${v}`}
                />

                {/* Selects */}
                <Select
                  label="Hidratação"
                  value={hidratacao}
                  onChange={setHidratacao}
                  options={[
                    { value: 'otima',   label: 'Ótima (bebe bastante água)' },
                    { value: 'boa',     label: 'Boa (hidratação adequada)' },
                    { value: 'regular', label: 'Regular (poderia melhorar)' },
                    { value: 'ruim',    label: 'Ruim (raramente bebe água)' },
                  ]}
                />

                <Select
                  label="Alimentação"
                  value={alimentacao}
                  onChange={setAlimentacao}
                  options={[
                    { value: 'muito_saudavel', label: 'Muito saudável' },
                    { value: 'saudavel',       label: 'Saudável' },
                    { value: 'regular',        label: 'Regular' },
                    { value: 'ruim',           label: 'Ruim (muita gordura/açúcar)' },
                  ]}
                />

                <Select
                  label="Exposição solar"
                  value={exposicaoSol}
                  onChange={setExposicaoSol}
                  options={[
                    { value: 'baixa',      label: 'Baixa (ambiente fechado)' },
                    { value: 'moderada',   label: 'Moderada (ao ar livre às vezes)' },
                    { value: 'alta',       label: 'Alta (frequentemente ao sol)' },
                    { value: 'muito_alta', label: 'Muito alta (exposição intensa)' },
                  ]}
                />

                {/* Protetor solar toggle */}
                <div>
                  <label className="block text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Usa protetor solar diariamente?
                  </label>
                  <div className="flex gap-3 mt-1">
                    {[true, false].map(v => (
                      <button
                        key={String(v)}
                        onClick={() => setProtetorSol(v)}
                        className="flex-1 py-2.5 rounded-xl text-sm transition-all"
                        style={{
                          border: '1px solid',
                          borderColor: protetorSol === v ? 'rgba(196,163,90,0.55)' : 'rgba(255,255,255,0.1)',
                          background:  protetorSol === v ? 'rgba(196,163,90,0.12)' : 'transparent',
                          color:       protetorSol === v ? '#C4A35A' : 'rgba(255,255,255,0.4)',
                        }}
                      >
                        {v ? 'Sim' : 'Não'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Generate button ── */}
            <div className="mb-8">
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="flex items-center gap-3 px-8 py-3.5 rounded-xl text-sm font-medium transition-all"
                style={{ background: analyzing ? 'rgba(196,163,90,0.5)' : '#C4A35A', color: '#0A0A0D' }}
                onMouseEnter={e => { if (!analyzing) e.currentTarget.style.background = '#D4B87A' }}
                onMouseLeave={e => { if (!analyzing) e.currentTarget.style.background = '#C4A35A' }}
              >
                {analyzing ? (
                  <>
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Analisando lifestyle...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
                      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
                    </svg>
                    Gerar Análise Aura Bio™
                  </>
                )}
              </button>

              {apiError && (
                <p className="mt-3 text-sm" style={{ color: '#f87171' }}>{apiError}</p>
              )}
            </div>

            {/* ── Result card ── */}
            {result && (
              <div
                className="rounded-2xl p-7 mb-8"
                style={{
                  border: `1px solid ${RISCO_MAP[result.risco].border}`,
                  background: 'rgba(255,255,255,0.02)',
                  animation: 'fadeIn 0.4s ease',
                }}
              >
                <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:none } }`}</style>

                {/* Score row */}
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      Score Lifestyle
                    </p>
                    <div className="flex items-end gap-3">
                      <span
                        className="font-serif text-6xl font-light leading-none"
                        style={{ color: scoreColor(animScore) }}
                      >
                        {animScore}
                      </span>
                      <span className="text-2xl mb-1 font-light" style={{ color: 'rgba(255,255,255,0.3)' }}>/100</span>
                    </div>
                  </div>
                  <RiscoBadge risco={result.risco} />
                </div>

                {/* Progress bar */}
                <div className="h-1.5 rounded-full mb-7 overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ width: `${animScore}%`, background: scoreColor(animScore) }}
                  />
                </div>

                {/* Info grid */}
                <div className="space-y-5">
                  <div>
                    <p className="text-xs uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
                      Interpretação
                    </p>
                    <p className="text-sm font-light leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>
                      {result.interpretacao}
                    </p>
                  </div>

                  <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

                  <div>
                    <p className="text-xs uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
                      Ajuste no Protocolo
                    </p>
                    <p className="text-sm font-light leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>
                      {result.ajuste_protocolo}
                    </p>
                  </div>

                  <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

                  <div>
                    <p className="text-xs uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
                      Tratamento Sugerido — Próximo Mês
                    </p>
                    <p
                      className="inline-flex px-4 py-2 rounded-xl text-sm font-light"
                      style={{ background: 'rgba(196,163,90,0.1)', color: '#C4A35A', border: '1px solid rgba(196,163,90,0.2)' }}
                    >
                      {result.tratamento_mes}
                    </p>
                  </div>

                  {result.alerta && (
                    <>
                      <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                      <div
                        className="flex gap-3 p-4 rounded-xl"
                        style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}
                      >
                        <span style={{ fontSize: 18, lineHeight: 1.4 }}>⚠</span>
                        <p className="text-sm font-light leading-relaxed" style={{ color: '#f87171' }}>
                          {result.alerta}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* IA badge */}
                <div className="flex justify-end mt-5">
                  <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'rgba(196,163,90,0.45)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
                      <circle cx="12" cy="12" r="4" />
                    </svg>
                    Gerado por Aura Bio IA
                  </span>
                </div>
              </div>
            )}

            {/* ── History ── */}
            {history.length > 0 && (
              <div>
                <h2 className="font-serif text-lg font-light mb-4" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Histórico de Análises
                </h2>
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                  {history.map((h, i) => {
                    const r = RISCO_MAP[h.risco]
                    return (
                      <div
                        key={i}
                        className="rounded-xl p-5"
                        style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            {fmtDate(h.data)}
                          </span>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{ color: r.color, background: r.bg }}
                          >
                            {r.label}
                          </span>
                        </div>
                        <div className="flex items-end gap-2 mb-3">
                          <span
                            className="font-serif text-4xl font-light leading-none"
                            style={{ color: scoreColor(h.score_lifestyle) }}
                          >
                            {h.score_lifestyle}
                          </span>
                          <span className="text-sm mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>/100</span>
                        </div>
                        <p className="text-xs font-light line-clamp-2 mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          {h.tratamento_mes}
                        </p>
                        <div className="flex gap-3 text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                          <span>Sono {h.anamnese.sono}/10</span>
                          <span>·</span>
                          <span>Estresse {h.anamnese.estresse}/10</span>
                          <span>·</span>
                          <span>{h.anamnese.protetor_solar ? 'FPS ✓' : 'Sem FPS'}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {!selectedPac && !loading && (
          <div
            className="flex flex-col items-center justify-center py-24 rounded-2xl"
            style={{ border: '1px dashed rgba(196,163,90,0.15)' }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(196,163,90,0.3)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="mb-4">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
              <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
            </svg>
            <p className="font-serif text-lg font-light" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Selecione um paciente para começar
            </p>
          </div>
        )}

      </div>
    </>
  )
}
