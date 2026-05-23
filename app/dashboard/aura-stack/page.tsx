'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

interface AuraStackTratamento {
  ordem:      number
  nome:       string
  categoria:  string
  frequencia: string
  objetivo:   string
  sinergias:  string
}

interface AuraStackResult {
  estacao:            string
  stack_nome:         string
  tratamentos:        AuraStackTratamento[]
  ticket_estimado:    string
  duracao_protocolo:  string
  resultado_esperado: string
  contraindicacoes:   string | null
}

interface PacienteOption { id: string; nome: string }

// ── Constants ──────────────────────────────────────────────────────────────

const ESTACAO_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string; border: string; desc: string }> = {
  Verão: {
    color: '#fb923c', bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.25)',
    desc: 'Hidratação, fotoproteção e controle de oleosidade',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
        <line x1="4.22" y1="4.22" x2="7.05" y2="7.05"/><line x1="16.95" y1="16.95" x2="19.78" y2="19.78"/>
        <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
        <line x1="4.22" y1="19.78" x2="7.05" y2="16.95"/><line x1="16.95" y1="7.05" x2="19.78" y2="4.22"/>
      </svg>
    ),
  },
  Outono: {
    color: '#C4A35A', bg: 'rgba(196,163,90,0.1)', border: 'rgba(196,163,90,0.25)',
    desc: 'Reparação pós-verão, antioxidantes e preparação para o inverno',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
        <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
      </svg>
    ),
  },
  Inverno: {
    color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.25)',
    desc: 'Nutrição profunda, rejuvenescimento e estimulação de colágeno',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/>
        <polyline points="20 16 16 12 20 8"/><polyline points="4 8 8 12 4 16"/>
        <polyline points="16 4 12 8 8 4"/><polyline points="8 20 12 16 16 20"/>
      </svg>
    ),
  },
  Primavera: {
    color: '#f472b6', bg: 'rgba(244,114,182,0.1)', border: 'rgba(244,114,182,0.25)',
    desc: 'Renovação celular, iluminação e controle pigmentar',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
        <path d="M12 9a3 3 0 0 0-3 3c0 1.65 3 5 3 5s3-3.35 3-5a3 3 0 0 0-3-3z"/>
      </svg>
    ),
  },
}

const CATEGORIA_STYLE: Record<string, { color: string; bg: string }> = {
  'Limpeza':           { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)'   },
  'Peeling':           { color: '#fb923c', bg: 'rgba(251,146,60,0.1)'   },
  'Bioestimulação':    { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)'  },
  'Preenchimento':     { color: '#f472b6', bg: 'rgba(244,114,182,0.1)'  },
  'Toxina Botulínica': { color: '#e2e8f0', bg: 'rgba(226,232,240,0.08)' },
  'Laser':             { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)'   },
  'Hidratação':        { color: '#34d399', bg: 'rgba(52,211,153,0.1)'   },
  'Massagem':          { color: '#c084fc', bg: 'rgba(192,132,252,0.1)'  },
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getEstacaoAtual(): string {
  const m = new Date().getMonth() + 1
  if ([12, 1, 2, 3].includes(m)) return 'Verão'
  if ([4, 5].includes(m))        return 'Outono'
  if ([6, 7, 8].includes(m))     return 'Inverno'
  return 'Primavera'
}

function getMesAtual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function categoriaStyle(cat: string) {
  return CATEGORIA_STYLE[cat] ?? { color: '#C4A35A', bg: 'rgba(196,163,90,0.1)' }
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AuraStackPage() {
  const router = useRouter()

  const [pacientes,    setPacientes]    = useState<PacienteOption[]>([])
  const [selectedId,   setSelectedId]   = useState('')
  const [loading,      setLoading]      = useState(true)
  const [generating,   setGenerating]   = useState(false)
  const [result,       setResult]       = useState<AuraStackResult | null>(null)
  const [apiError,     setApiError]     = useState('')
  const [showModal,    setShowModal]    = useState(false)
  const [addMes,       setAddMes]       = useState(getMesAtual())
  const [addingPlano,  setAddingPlano]  = useState(false)
  const [addSuccess,   setAddSuccess]   = useState(false)

  const estacaoAtual = getEstacaoAtual()
  const estCfg       = ESTACAO_CONFIG[estacaoAtual]

  const loadPacientes = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/auth/login'); return }

    const { data } = await supabase
      .from('pacientes')
      .select('id, nome')
      .eq('clinica_id', user.id)
      .order('nome')

    setPacientes(data ?? [])
    setLoading(false)
  }, [router])

  useEffect(() => { loadPacientes() }, [loadPacientes])

  async function handleGenerate() {
    if (!selectedId) return
    setGenerating(true)
    setResult(null)
    setApiError('')
    setAddSuccess(false)

    const res  = await fetch('/api/aura-stack', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ paciente_id: selectedId }),
    })
    const data = await res.json()
    setGenerating(false)

    if (!res.ok) { setApiError(data.error ?? 'Erro desconhecido.'); return }
    setResult(data as AuraStackResult)
  }

  async function handleAddToPlano() {
    if (!result || !selectedId) return
    setAddingPlano(true)
    const supabase = createClient()

    const inserts = result.tratamentos.map(t => ({
      paciente_id: selectedId,
      mes:         addMes,
      tratamento:  `[${t.categoria}] ${t.nome} · ${t.frequencia}`,
      status:      'ativo',
    }))

    await supabase.from('planos_aura').insert(inserts)
    setAddingPlano(false)
    setShowModal(false)
    setAddSuccess(true)
    setTimeout(() => setAddSuccess(false), 4000)
  }

  const INPUT: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid rgba(196,163,90,0.2)',
    background: 'rgba(255,255,255,0.04)',
    color: '#fff', fontSize: 14, outline: 'none', appearance: 'none',
  }

  return (
    <div className="min-h-screen p-8" style={{ backgroundColor: '#0A0A0D' }}>

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-serif text-3xl font-light tracking-wide" style={{ color: '#C4A35A' }}>
              Aura Stack™
            </h1>
            <span
              className="px-2.5 py-0.5 rounded-full text-[11px] font-medium tracking-widest uppercase"
              style={{ background: 'rgba(196,163,90,0.12)', color: 'rgba(196,163,90,0.7)', border: '1px solid rgba(196,163,90,0.2)' }}
            >
              IA
            </span>
          </div>
          <p className="text-sm font-light" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Protocolo combinado inteligente por estação e perfil do paciente
          </p>
        </div>
      </div>

      {/* ── Controls row ── */}
      <div className="flex flex-wrap gap-4 mb-8 items-end">
        {/* Patient select */}
        <div className="flex-1 min-w-[200px] max-w-xs">
          <label className="block text-xs mb-2 uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Paciente
          </label>
          {loading ? (
            <div className="h-11 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
          ) : (
            <select
              value={selectedId}
              onChange={e => { setSelectedId(e.target.value); setResult(null); setApiError(''); setAddSuccess(false) }}
              style={INPUT}
            >
              <option value="" style={{ background: '#0A0A0D' }}>Selecione o paciente</option>
              {pacientes.map(p => (
                <option key={p.id} value={p.id} style={{ background: '#0A0A0D' }}>{p.nome}</option>
              ))}
            </select>
          )}
        </div>

        {/* Season card */}
        <div
          className="flex items-center gap-3 px-5 py-3 rounded-xl"
          style={{ border: `1px solid ${estCfg.border}`, background: estCfg.bg }}
        >
          <span style={{ color: estCfg.color }}>{estCfg.icon}</span>
          <div>
            <p className="text-xs uppercase tracking-widest font-medium" style={{ color: estCfg.color }}>
              {estacaoAtual}
            </p>
            <p className="text-[11px] font-light max-w-[220px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {estCfg.desc}
            </p>
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={generating || !selectedId}
          className="flex items-center gap-2.5 px-7 py-3 rounded-xl text-sm font-medium transition-all"
          style={{
            background: generating || !selectedId ? 'rgba(196,163,90,0.4)' : '#C4A35A',
            color: '#0A0A0D',
            cursor: !selectedId ? 'not-allowed' : 'pointer',
          }}
          onMouseEnter={e => { if (!generating && selectedId) e.currentTarget.style.background = '#D4B87A' }}
          onMouseLeave={e => { if (!generating && selectedId) e.currentTarget.style.background = '#C4A35A' }}
        >
          {generating ? (
            <>
              <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Montando protocolo...
            </>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                <polyline points="2 17 12 22 22 17"/>
                <polyline points="2 12 12 17 22 12"/>
              </svg>
              Gerar Aura Stack™
            </>
          )}
        </button>
      </div>

      {apiError && (
        <div className="mb-6 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171' }}>
          {apiError}
        </div>
      )}

      {addSuccess && (
        <div
          className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {result?.tratamentos.length} tratamentos adicionados ao Plano Aura com sucesso!
        </div>
      )}

      {/* ── Empty state ── */}
      {!result && !generating && (
        <div
          className="flex flex-col items-center justify-center py-24 rounded-2xl"
          style={{ border: '1px dashed rgba(196,163,90,0.15)' }}
        >
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="rgba(196,163,90,0.3)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="mb-4">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
          </svg>
          <p className="font-serif text-lg font-light" style={{ color: 'rgba(255,255,255,0.28)' }}>
            {selectedId ? 'Clique em "Gerar Aura Stack™"' : 'Selecione um paciente para começar'}
          </p>
        </div>
      )}

      {/* ── Result ── */}
      {result && (
        <div className="space-y-5" style={{ animation: 'fadeIn 0.4s ease' }}>
          <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:none } }`}</style>

          {/* Protocol name */}
          <div
            className="rounded-2xl p-7"
            style={{ border: `1px solid ${estCfg.border}`, background: estCfg.bg }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest mb-2 font-medium" style={{ color: estCfg.color }}>
                  Protocolo gerado para o {result.estacao}
                </p>
                <h2 className="font-serif text-3xl font-light leading-tight" style={{ color: '#F0EDE8' }}>
                  {result.stack_nome}
                </h2>
                <div className="flex items-center gap-4 mt-3 text-sm font-light" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <span>{result.tratamentos.length} tratamentos</span>
                  <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
                  <span>{result.duracao_protocolo}</span>
                  <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
                  <span style={{ color: estCfg.color, fontWeight: 500 }}>{result.ticket_estimado}</span>
                </div>
              </div>
              <span style={{ color: estCfg.color, flexShrink: 0 }}>{estCfg.icon}</span>
            </div>
          </div>

          {/* Treatment timeline */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.015)' }}
          >
            <div className="px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="font-serif text-base" style={{ color: '#F0EDE8' }}>Protocolo de Tratamentos</p>
            </div>

            <div className="p-6">
              {result.tratamentos.map((t, idx) => {
                const catStyle = categoriaStyle(t.categoria)
                const isLast   = idx === result.tratamentos.length - 1
                return (
                  <div key={t.ordem} className="flex gap-5">
                    {/* Timeline line + circle */}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-serif font-medium flex-shrink-0"
                        style={{ background: 'rgba(196,163,90,0.15)', color: '#C4A35A', border: '1px solid rgba(196,163,90,0.35)' }}
                      >
                        {t.ordem}
                      </div>
                      {!isLast && (
                        <div className="w-px flex-1 my-2" style={{ background: 'rgba(196,163,90,0.15)', minHeight: 24 }} />
                      )}
                    </div>

                    {/* Treatment card */}
                    <div className={`flex-1 pb-6 ${isLast ? '' : ''}`}>
                      <div
                        className="rounded-xl p-5"
                        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        {/* Treatment header */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1">
                            <p className="font-medium text-sm" style={{ color: '#F0EDE8' }}>{t.nome}</p>
                            <p className="text-xs mt-0.5 font-light" style={{ color: 'rgba(255,255,255,0.35)' }}>
                              {t.frequencia}
                            </p>
                          </div>
                          <span
                            className="text-[11px] px-2.5 py-1 rounded-full font-medium flex-shrink-0"
                            style={{ color: catStyle.color, background: catStyle.bg }}
                          >
                            {t.categoria}
                          </span>
                        </div>

                        <div className="space-y-2">
                          <div>
                            <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'rgba(255,255,255,0.22)' }}>
                              Objetivo
                            </p>
                            <p className="text-xs font-light leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                              {t.objetivo}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'rgba(196,163,90,0.4)' }}>
                              Sinergia
                            </p>
                            <p className="text-xs font-light leading-relaxed" style={{ color: 'rgba(196,163,90,0.7)' }}>
                              {t.sinergias}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Resultado esperado + contraindicações */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div
              className="rounded-2xl p-6"
              style={{ border: '1px solid rgba(196,163,90,0.12)', background: 'rgba(196,163,90,0.04)' }}
            >
              <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'rgba(196,163,90,0.6)' }}>
                Resultado Esperado
              </p>
              <p className="text-sm font-light leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>
                {result.resultado_esperado}
              </p>
            </div>

            {result.contraindicacoes ? (
              <div
                className="rounded-2xl p-6"
                style={{ border: '1px solid rgba(248,113,113,0.2)', background: 'rgba(248,113,113,0.05)' }}
              >
                <p className="text-[10px] uppercase tracking-widest mb-3 flex items-center gap-1.5" style={{ color: 'rgba(248,113,113,0.7)' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  Contraindicações
                </p>
                <p className="text-sm font-light leading-relaxed" style={{ color: '#f87171' }}>
                  {result.contraindicacoes}
                </p>
              </div>
            ) : (
              <div
                className="rounded-2xl p-6 flex items-center gap-3"
                style={{ border: '1px solid rgba(74,222,128,0.15)', background: 'rgba(74,222,128,0.04)' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <p className="text-sm font-light" style={{ color: 'rgba(74,222,128,0.75)' }}>
                  Sem contraindicações identificadas para este protocolo.
                </p>
              </div>
            )}
          </div>

          {/* IA badge + Add to Plano Aura button */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'rgba(196,163,90,0.4)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>
                <circle cx="12" cy="12" r="4"/>
              </svg>
              Gerado por Aura Stack™ IA
            </span>

            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all"
              style={{ background: '#C4A35A', color: '#0A0A0D' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#D4B87A')}
              onMouseLeave={e => (e.currentTarget.style.background = '#C4A35A')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Adicionar ao Plano Aura
            </button>
          </div>
        </div>
      )}

      {/* ── Modal: Adicionar ao Plano Aura ── */}
      {showModal && result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div
            className="w-full max-w-lg rounded-2xl p-8"
            style={{ background: '#131318', border: '1px solid rgba(196,163,90,0.2)' }}
          >
            <h2 className="font-serif text-xl font-light mb-2" style={{ color: '#C4A35A' }}>
              Adicionar ao Plano Aura
            </h2>
            <p className="text-sm font-light mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Os {result.tratamentos.length} tratamentos do {result.stack_nome} serão inseridos no mês selecionado.
            </p>

            {/* Month selector */}
            <div className="mb-5">
              <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(196,163,90,0.7)' }}>
                Mês de início
              </label>
              <input
                type="month"
                value={addMes}
                onChange={e => setAddMes(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1px solid rgba(196,163,90,0.2)',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#fff', fontSize: 14, outline: 'none', colorScheme: 'dark',
                }}
              />
            </div>

            {/* Preview */}
            <div
              className="rounded-xl p-4 mb-6 space-y-2"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {result.tratamentos.map(t => (
                <div key={t.ordem} className="flex items-center gap-2 text-xs">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(196,163,90,0.15)', color: '#C4A35A', fontSize: 10 }}>
                    {t.ordem}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.65)' }}>{t.nome}</span>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
                  <span style={{ color: 'rgba(255,255,255,0.35)' }}>{t.frequencia}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
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
                onClick={handleAddToPlano}
                disabled={addingPlano}
                className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
                style={{ background: addingPlano ? 'rgba(196,163,90,0.5)' : '#C4A35A', color: '#0A0A0D' }}
                onMouseEnter={e => { if (!addingPlano) e.currentTarget.style.background = '#D4B87A' }}
                onMouseLeave={e => { if (!addingPlano) e.currentTarget.style.background = '#C4A35A' }}
              >
                {addingPlano ? 'Adicionando...' : `Confirmar (${result.tratamentos.length} tratamentos)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
