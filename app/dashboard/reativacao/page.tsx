'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

interface PacienteRisco {
  id:           string
  nome:         string
  whatsapp:     string | null
  tier:         string | null
  diasInativos: number
  score:        number
  risco:        'baixo' | 'medio' | 'alto'
}

type Filtro = 30 | 60 | 90 | 0

// ── Helpers ────────────────────────────────────────────────────────────────

const TIER_LABEL: Record<string, string> = { member: 'Member', gold: 'Gold', black: 'Black' }

const TIER_COLOR: Record<string, { color: string; bg: string }> = {
  member: { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  gold:   { color: '#C4A35A', bg: 'rgba(196,163,90,0.12)' },
  black:  { color: '#e2e8f0', bg: 'rgba(226,232,240,0.1)' },
}

const RISCO_MAP = {
  baixo: { label: 'Baixo',  color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
  medio: { label: 'Médio',  color: '#facc15', bg: 'rgba(250,204,21,0.1)' },
  alto:  { label: 'Alto',   color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
}

function calcScore(dias: number, tier: string | null): { score: number; risco: 'baixo' | 'medio' | 'alto' } {
  let base: number
  if (dias >= 180)     base = 92
  else if (dias >= 90) base = 78
  else if (dias >= 60) base = 56
  else                 base = 28

  let adj = 0
  if (tier === 'black') adj = -12
  if (tier === 'gold')  adj = -6
  if (!tier)            adj = 8

  const score = Math.max(0, Math.min(100, base + adj))
  const risco: 'baixo' | 'medio' | 'alto' =
    score >= 70 ? 'alto' : score >= 40 ? 'medio' : 'baixo'

  return { score, risco }
}

const TEMPLATES: Record<string, string> = {
  baixo: 'Olá, [nome]! 😊 Sentimos sua falta. Que tal agendar uma visita para cuidar da sua pele nessa estação? Temos novidades que vão te surpreender! 💫',
  medio: 'Oi, [nome]! Faz um tempinho que não conversamos. Gostaríamos de te presentear com uma avaliação gratuita de pele. Bora retomar seus cuidados? ✨',
  alto:  'Olá, [nome]! Há um tempo que não temos o prazer de te receber. Preparamos uma proposta especial para você voltar a brilhar. Podemos conversar? 💛',
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ReativacaoPage() {
  const [pacientes, setPacientes] = useState<PacienteRisco[]>([])
  const [loading,   setLoading]   = useState(true)
  const [filtro,    setFiltro]    = useState<Filtro>(30)
  const [search,    setSearch]    = useState('')
  const [selected,  setSelected]  = useState<Set<string>>(new Set())

  const [modal,     setModal]     = useState<PacienteRisco | null>(null)
  const [batchModal, setBatchModal] = useState(false)
  const [mensagem,  setMensagem]  = useState('')
  const [sending,   setSending]   = useState(false)
  const [toast,     setToast]     = useState('')

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [{ data: pacs }, { data: msgs }] = await Promise.all([
      supabase
        .from('pacientes')
        .select('id, nome, whatsapp, created_at, membros_beautyclub(tier)')
        .eq('clinica_id', user.id)
        .order('nome'),
      supabase
        .from('mensagens')
        .select('paciente_id, created_at')
        .eq('clinica_id', user.id)
        .order('created_at', { ascending: false }),
    ])

    // Build last-message map
    const lastMsg = new Map<string, string>()
    for (const m of msgs ?? []) {
      if (!lastMsg.has(m.paciente_id)) lastMsg.set(m.paciente_id, m.created_at)
    }

    const now = Date.now()

    const scored: PacienteRisco[] = (pacs ?? []).map(p => {
      const tArr = p.membros_beautyclub as { tier: string }[] | null
      const tier = Array.isArray(tArr) ? (tArr[0]?.tier ?? null) : null
      const last = lastMsg.get(p.id) ?? p.created_at
      const diasInativos = Math.floor((now - new Date(last).getTime()) / 86_400_000)
      const { score, risco } = calcScore(diasInativos, tier)
      return { id: p.id, nome: p.nome, whatsapp: p.whatsapp, tier, diasInativos, score, risco }
    })

    // Only include patients inactive >= 30 days
    setPacientes(scored.filter(p => p.diasInativos >= 30).sort((a, b) => b.score - a.score))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Derived ───────────────────────────────────────────────────────────────

  const filtered = pacientes.filter(p => {
    if (filtro > 0 && filtro < 90 && !(p.diasInativos >= filtro && p.diasInativos < filtro + 30)) return false
    if (filtro === 90 && p.diasInativos < 90) return false
    if (search && !p.nome.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const alto  = pacientes.filter(p => p.risco === 'alto').length
  const medio = pacientes.filter(p => p.risco === 'medio').length

  // ── Selection ─────────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(p => p.id)))
    }
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  async function handleSend(pacIds: string[], msg: string) {
    setSending(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSending(false); return }

    for (const paciente_id of pacIds) {
      await supabase.from('mensagens').insert({
        clinica_id:  user.id,
        paciente_id,
        direcao:     'saida',
        conteudo:    msg,
      })
    }

    setSending(false)
    setModal(null)
    setBatchModal(false)
    setSelected(new Set())
    setToast(`${pacIds.length === 1 ? 'Mensagem enviada' : `${pacIds.length} mensagens enviadas`} com sucesso!`)
    setTimeout(() => setToast(''), 3500)
  }

  // ── Open modal ────────────────────────────────────────────────────────────

  function openModal(p: PacienteRisco) {
    setModal(p)
    setMensagem(TEMPLATES[p.risco].replace('[nome]', p.nome.split(' ')[0]))
  }

  function openBatch() {
    const avgRisco = filtered
      .filter(p => selected.has(p.id))
      .reduce((acc, p) => acc + p.score, 0) / (selected.size || 1) >= 70
      ? 'alto' : 'medio'
    setMensagem(TEMPLATES[avgRisco].replace('[nome]', 'você'))
    setBatchModal(true)
  }

  // ── Input style ───────────────────────────────────────────────────────────

  const INPUT: React.CSSProperties = {
    width:        '100%',
    padding:      '10px 14px',
    borderRadius: 10,
    border:       '1px solid rgba(196,163,90,0.2)',
    background:   'rgba(255,255,255,0.04)',
    color:        '#fff',
    fontSize:     14,
    outline:      'none',
  }

  const pill = (active: boolean) => ({
    padding:     '5px 14px',
    borderRadius: 999,
    fontSize:    13,
    cursor:      'pointer' as const,
    border:      '1px solid',
    borderColor: active ? 'rgba(196,163,90,0.55)' : 'rgba(255,255,255,0.1)',
    background:  active ? 'rgba(196,163,90,0.12)' : 'transparent',
    color:       active ? '#C4A35A' : 'rgba(255,255,255,0.4)',
    transition:  'all 0.15s',
  })

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl" style={{ color: '#C4A35A' }}>
            Reativação Preditiva
          </h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Pacientes em risco de perda identificados por inatividade
          </p>
        </div>
        {selected.size > 0 && (
          <button
            onClick={openBatch}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#C4A35A', color: '#0A0A0D' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#D4B87A')}
            onMouseLeave={e => (e.currentTarget.style.background = '#C4A35A')}
          >
            Reativar selecionados ({selected.size})
          </button>
        )}
      </div>

      {/* ── Stats ── */}
      {!loading && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Pacientes em risco', value: pacientes.length, color: '#C4A35A' },
            { label: 'Risco alto',         value: alto,             color: '#f87171' },
            { label: 'Risco médio',        value: medio,            color: '#facc15' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-2xl p-4 text-center"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="font-serif text-3xl" style={{ color }}>{value}</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-widest w-20 flex-shrink-0"
            style={{ color: 'rgba(255,255,255,0.28)' }}>Inatividade</span>
          {([30, 60, 90, 0] as Filtro[]).map(f => (
            <button key={f} style={pill(filtro === f)} onClick={() => setFiltro(f)}>
              {f === 0 ? 'Todos' : f === 90 ? '90+ dias' : `${f}–${f + 29} dias`}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Buscar por nome..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...INPUT, maxWidth: 300 }}
        />
      </div>

      {/* ── Table ── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ border: '1px solid rgba(196,163,90,0.1)', background: 'rgba(255,255,255,0.015)' }}>

        <div className="grid px-5 py-3 text-xs uppercase tracking-widest"
          style={{
            gridTemplateColumns: '40px 1.8fr 90px 120px 90px 100px 110px',
            color:               'rgba(255,255,255,0.28)',
            borderBottom:        '1px solid rgba(196,163,90,0.08)',
          }}>
          <span>
            <input
              type="checkbox"
              checked={selected.size > 0 && selected.size === filtered.length}
              onChange={toggleAll}
              style={{ accentColor: '#C4A35A', cursor: 'pointer' }}
            />
          </span>
          <span>Paciente</span>
          <span>Tier</span>
          <span>Inativo há</span>
          <span>Score</span>
          <span>Risco</span>
          <span>Ação</span>
        </div>

        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-5 py-4 animate-pulse"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <div className="h-4 rounded" style={{ background: 'rgba(255,255,255,0.06)', width: `${50 + i * 7}%` }} />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center" style={{ color: 'rgba(255,255,255,0.22)' }}>
            <p className="text-4xl mb-3">✦</p>
            <p className="font-light">Nenhum paciente inativo neste período.</p>
          </div>
        ) : (
          filtered.map(p => {
            const risco = RISCO_MAP[p.risco]
            const tier  = p.tier ? TIER_COLOR[p.tier] : null
            return (
              <div key={p.id}
                className="grid items-center px-5 py-3.5"
                style={{
                  gridTemplateColumns: '40px 1.8fr 90px 120px 90px 100px 110px',
                  borderBottom:        '1px solid rgba(255,255,255,0.03)',
                  fontSize:            14,
                  color:               'rgba(255,255,255,0.72)',
                  transition:          'background 0.12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(196,163,90,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span>
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    style={{ accentColor: '#C4A35A', cursor: 'pointer' }}
                  />
                </span>
                <span className="font-light truncate pr-3">{p.nome}</span>
                <span>
                  {tier && p.tier ? (
                    <span className="px-2 py-0.5 rounded-full text-xs"
                      style={{ color: tier.color, background: tier.bg }}>
                      {TIER_LABEL[p.tier]}
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
                  )}
                </span>
                <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {p.diasInativos}d
                </span>
                <span>
                  <span className="font-serif text-base" style={{ color: risco.color }}>
                    {p.score}
                  </span>
                  <span className="text-xs ml-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>/100</span>
                </span>
                <span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs"
                    style={{ color: risco.color, background: risco.bg }}>
                    {risco.label}
                  </span>
                </span>
                <span>
                  <button
                    onClick={() => openModal(p)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: 'rgba(196,163,90,0.12)', color: '#C4A35A', border: '1px solid rgba(196,163,90,0.2)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(196,163,90,0.22)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(196,163,90,0.12)')}
                  >
                    Reativar
                  </button>
                </span>
              </div>
            )
          })
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.22)' }}>
          {filtered.length} paciente{filtered.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* ── Single reactivation modal ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="w-full max-w-md rounded-2xl p-8"
            style={{ background: '#131318', border: '1px solid rgba(196,163,90,0.2)' }}>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-2 h-2 rounded-full"
                style={{ background: RISCO_MAP[modal.risco].color }} />
              <h2 className="font-serif text-xl" style={{ color: '#C4A35A' }}>
                Reativar {modal.nome.split(' ')[0]}
              </h2>
            </div>
            <p className="text-xs mb-6" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Inativo há {modal.diasInativos} dias · Score {modal.score}/100
            </p>

            <label className="block text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Mensagem personalizada
            </label>
            <textarea
              value={mensagem}
              onChange={e => setMensagem(e.target.value)}
              rows={5}
              style={{ ...INPUT, resize: 'vertical' as const }}
            />
            <p className="text-xs mt-1 text-right" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {mensagem.length} caracteres
            </p>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal(null)}
                className="flex-1 py-3 rounded-xl text-sm transition-all"
                style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}>
                Cancelar
              </button>
              <button
                onClick={() => handleSend([modal.id], mensagem)}
                disabled={sending || !mensagem.trim()}
                className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
                style={{ background: sending ? 'rgba(196,163,90,0.4)' : '#C4A35A', color: '#0A0A0D' }}
                onMouseEnter={e => { if (!sending) e.currentTarget.style.background = '#D4B87A' }}
                onMouseLeave={e => { if (!sending) e.currentTarget.style.background = '#C4A35A' }}>
                {sending ? 'Enviando…' : 'Enviar Mensagem'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Batch modal ── */}
      {batchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) setBatchModal(false) }}>
          <div className="w-full max-w-md rounded-2xl p-8"
            style={{ background: '#131318', border: '1px solid rgba(196,163,90,0.2)' }}>
            <h2 className="font-serif text-xl mb-1" style={{ color: '#C4A35A' }}>
              Reativar {selected.size} pacientes
            </h2>
            <p className="text-xs mb-6" style={{ color: 'rgba(255,255,255,0.35)' }}>
              A mensagem será enviada para todos os selecionados
            </p>

            <label className="block text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Mensagem em lote
            </label>
            <textarea
              value={mensagem}
              onChange={e => setMensagem(e.target.value)}
              rows={5}
              style={{ ...INPUT, resize: 'vertical' as const }}
            />
            <p className="text-xs mt-1 text-right" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {mensagem.length} caracteres
            </p>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setBatchModal(false)}
                className="flex-1 py-3 rounded-xl text-sm transition-all"
                style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}>
                Cancelar
              </button>
              <button
                onClick={() => handleSend(Array.from(selected), mensagem)}
                disabled={sending || !mensagem.trim()}
                className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
                style={{ background: sending ? 'rgba(196,163,90,0.4)' : '#C4A35A', color: '#0A0A0D' }}>
                {sending ? 'Enviando…' : `Enviar para ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl"
          style={{ background: '#131318', border: '1px solid rgba(74,222,128,0.35)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>{toast}</span>
        </div>
      )}
    </div>
  )
}
