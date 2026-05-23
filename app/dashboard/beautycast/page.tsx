'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

interface Campanha {
  id:           string
  nome:         string
  publico:      string
  mensagem:     string
  status:       string
  agendado_para: string | null
  total_enviado: number
  created_at:   string
}

type Publico = 'todos' | 'member' | 'gold' | 'black' | 'inativos' | 'sem_beautyclub'

// ── Constants ──────────────────────────────────────────────────────────────

const PUBLICO_OPTS: { value: Publico; label: string }[] = [
  { value: 'todos',        label: 'Todos os pacientes' },
  { value: 'member',       label: 'BeautyClub Member' },
  { value: 'gold',         label: 'BeautyClub Gold' },
  { value: 'black',        label: 'BeautyClub Black' },
  { value: 'inativos',     label: 'Inativos (60+ dias)' },
  { value: 'sem_beautyclub', label: 'Sem BeautyClub' },
]

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  rascunho:  { label: 'Rascunho',  color: '#facc15', bg: 'rgba(250,204,21,0.1)'  },
  enviando:  { label: 'Enviando',  color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  enviado:   { label: 'Enviado',   color: '#4ade80', bg: 'rgba(74,222,128,0.1)'  },
  arquivado: { label: 'Arquivado', color: '#6b7280', bg: 'rgba(107,114,128,0.12)'},
}

const PUBLICO_LABEL: Record<string, string> = {
  todos:            'Todos',
  member:           'Member',
  gold:             'Gold',
  black:            'Black',
  inativos:         'Inativos',
  sem_beautyclub:   'Sem Club',
  aura_jovem_25_38: 'Aura Jovem',
}

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const INITIAL_FORM = {
  nome:         '',
  publico:      'todos' as Publico,
  mensagem:     '',
  agendamento:  'agora' as 'agora' | 'agendar',
  agendado_para: '',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dt: string) {
  return new Date(dt).toLocaleDateString('pt-BR', {
    day:   '2-digit', month: '2-digit', year: 'numeric',
    hour:  '2-digit', minute: '2-digit',
  })
}

// ── Component ──────────────────────────────────────────────────────────────

export default function BeautyCastPage() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [form,      setForm]      = useState(INITIAL_FORM)
  const [formError, setFormError] = useState('')
  const [toast,     setToast]     = useState('')
  const [dispatching, setDispatching] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  // ── Aura Jovem state ──────────────────────────────────────────────────────
  const [modo, setModo] = useState<'livre' | 'aura-jovem'>('livre')
  const [auNome, setAuNome] = useState(() => {
    const d = new Date()
    return `Protocolo Aura Jovem™ — ${MESES_PT[d.getMonth()]} ${d.getFullYear()}`
  })
  const [auMensagem,    setAuMensagem]    = useState('')
  const [auAgendamento, setAuAgendamento] = useState<'agora' | 'agendar'>('agora')
  const [auAgendadoPara, setAuAgendadoPara] = useState('')
  const [auGenerating,  setAuGenerating]  = useState(false)
  const [auSaving,      setAuSaving]      = useState(false)
  const [auError,       setAuError]       = useState('')

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('campanhas')
      .select('*')
      .eq('clinica_id', user.id)
      .order('created_at', { ascending: false })

    setCampanhas(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Create ────────────────────────────────────────────────────────────────

  async function handleCreate() {
    setFormError('')
    if (!form.nome.trim())     return setFormError('Nome da campanha é obrigatório.')
    if (!form.mensagem.trim()) return setFormError('Mensagem é obrigatória.')
    if (form.agendamento === 'agendar' && !form.agendado_para)
      return setFormError('Informe a data/hora de agendamento.')

    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { error } = await supabase.from('campanhas').insert({
      clinica_id:    user.id,
      nome:          form.nome.trim(),
      publico:       form.publico,
      mensagem:      form.mensagem.trim(),
      status:        'rascunho',
      agendado_para: form.agendamento === 'agendar' ? new Date(form.agendado_para).toISOString() : null,
    })

    setSaving(false)
    if (error) { setFormError('Erro ao criar campanha. Verifique se a tabela campanhas existe.'); return }

    setForm(INITIAL_FORM)
    showToast('Campanha criada com sucesso!')
    load()
  }

  // ── Dispatch ─────────────────────────────────────────────────────────────

  async function handleDispatch(id: string) {
    setDispatching(id)
    try {
      const res = await fetch('/api/beautycast', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ campanha_id: id }),
      })
      const data = await res.json()
      if (res.ok) {
        showToast(`Campanha disparada — ${data.sent} mensagem${data.sent !== 1 ? 's' : ''} enviada${data.sent !== 1 ? 's' : ''}!`)
        load()
      } else {
        showToast(data.error ?? 'Erro ao disparar campanha.')
      }
    } finally {
      setDispatching(null)
    }
  }

  // ── Duplicate ─────────────────────────────────────────────────────────────

  async function handleDuplicate(c: Campanha) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('campanhas').insert({
      clinica_id: user.id,
      nome:       `${c.nome} (cópia)`,
      publico:    c.publico,
      mensagem:   c.mensagem,
      status:     'rascunho',
    })
    showToast('Campanha duplicada!')
    load()
  }

  // ── Archive ───────────────────────────────────────────────────────────────

  async function handleArchive(id: string) {
    const supabase = createClient()
    await supabase.from('campanhas').update({ status: 'arquivado' }).eq('id', id)
    showToast('Campanha arquivada.')
    load()
  }

  // ── Aura Jovem — generate message ────────────────────────────────────────

  async function generateAuraJovemMsg() {
    setAuGenerating(true)
    await new Promise(r => setTimeout(r, 1400))
    setAuMensagem(
`Olá, [nome]! 🌿

Aqui é da clínica! Tenho uma novidade especialmente para você: o *Protocolo Aura Jovem™*.

Para quem está entre 25 e 38 anos, este é o momento ideal para a *prejuvenação* — cuidar da pele com ciência e prevenção, antes que o tempo deixe marcas visíveis.

O protocolo é dividido em 3 fases:

🧬 *Fase 1 — Baseline Regenerativa*
Polinucleotídeos e exossomos para ativar a renovação celular da pele.

🎯 *Fase 2 — Tratamento Específico*
Protocolo personalizado para textura, pigmentação e os primeiros sinais de flacidez.

✨ *Fase 3 — Manutenção Trimestral*
Sessões de reforço a cada 3–6 meses para preservar e evoluir os resultados.

Que tal agendar uma avaliação gratuita? 💛`)
    setAuGenerating(false)
  }

  // ── Aura Jovem — create campaign ─────────────────────────────────────────

  async function handleCreateAuraJovem() {
    setAuError('')
    if (!auNome.trim())     return setAuError('Nome da campanha é obrigatório.')
    if (!auMensagem.trim()) return setAuError('Gere ou escreva a mensagem antes de criar.')
    if (auAgendamento === 'agendar' && !auAgendadoPara)
      return setAuError('Informe a data/hora de agendamento.')

    setAuSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setAuSaving(false); return }

    const { error } = await supabase.from('campanhas').insert({
      clinica_id:    user.id,
      nome:          auNome.trim(),
      publico:       'aura_jovem_25_38',
      mensagem:      auMensagem.trim(),
      status:        'rascunho',
      agendado_para: auAgendamento === 'agendar' ? new Date(auAgendadoPara).toISOString() : null,
    })

    setAuSaving(false)
    if (error) { setAuError('Erro ao criar campanha.'); return }

    const d = new Date()
    setAuNome(`Protocolo Aura Jovem™ — ${MESES_PT[d.getMonth()]} ${d.getFullYear()}`)
    setAuMensagem('')
    setAuAgendamento('agora')
    setAuAgendadoPara('')
    showToast('Protocolo Aura Jovem™ criado com sucesso!')
    load()
  }

  // ── Toast ─────────────────────────────────────────────────────────────────

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  // ── Shared styles ─────────────────────────────────────────────────────────

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

  // ── Derived ───────────────────────────────────────────────────────────────

  const visible = campanhas.filter(c => showArchived || c.status !== 'arquivado')

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="font-serif text-3xl" style={{ color: '#C4A35A' }}>BeautyCast™</h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Campanhas de mensagens segmentadas para sua base de pacientes
        </p>
      </div>

      {/* ── Mode toggle ── */}
      <div className="flex items-center gap-2 p-1 rounded-xl w-fit"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {([
          { key: 'livre',      label: 'Campanha Livre' },
          { key: 'aura-jovem', label: '✦ Protocolo Aura Jovem™' },
        ] as const).map(opt => (
          <button
            key={opt.key}
            onClick={() => setModo(opt.key)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: modo === opt.key
                ? opt.key === 'aura-jovem' ? 'rgba(196,163,90,0.18)' : 'rgba(255,255,255,0.07)'
                : 'transparent',
              border: modo === opt.key
                ? opt.key === 'aura-jovem' ? '1px solid rgba(196,163,90,0.45)' : '1px solid rgba(255,255,255,0.1)'
                : '1px solid transparent',
              color: modo === opt.key
                ? opt.key === 'aura-jovem' ? '#C4A35A' : '#F0EDE8'
                : 'rgba(255,255,255,0.35)',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Main grid: form + preview (Campanha Livre) ── */}
      {modo === 'livre' && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Form */}
        <div className="rounded-2xl p-6 space-y-5"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-serif text-lg" style={{ color: '#C4A35A' }}>Nova Campanha</h2>

          {/* Nome */}
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Nome da campanha *
            </label>
            <input
              type="text"
              placeholder="Ex: Verão Radiante — Janeiro 2026"
              value={form.nome}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              style={INPUT}
            />
          </div>

          {/* Público */}
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Público-alvo *
            </label>
            <select
              value={form.publico}
              onChange={e => setForm(f => ({ ...f, publico: e.target.value as Publico }))}
              style={{ ...INPUT, appearance: 'none' as const }}
            >
              {PUBLICO_OPTS.map(o => (
                <option key={o.value} value={o.value} style={{ background: '#131318' }}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Mensagem */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Mensagem *
              </label>
              <span className="text-xs" style={{ color: form.mensagem.length > 3500 ? '#f87171' : 'rgba(255,255,255,0.25)' }}>
                {form.mensagem.length}/4096
              </span>
            </div>
            <textarea
              value={form.mensagem}
              onChange={e => setForm(f => ({ ...f, mensagem: e.target.value.slice(0, 4096) }))}
              rows={5}
              placeholder="Olá, [nome]! 😊 ..."
              style={{ ...INPUT, resize: 'vertical' as const }}
            />
          </div>

          {/* Agendamento */}
          <div>
            <label className="block text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Envio
            </label>
            <div className="flex gap-3 mb-3">
              {(['agora', 'agendar'] as const).map(opt => (
                <button
                  key={opt}
                  onClick={() => setForm(f => ({ ...f, agendamento: opt }))}
                  className="flex-1 py-2.5 rounded-xl text-sm transition-all"
                  style={{
                    background: form.agendamento === opt ? 'rgba(196,163,90,0.15)' : 'rgba(255,255,255,0.03)',
                    border:     `1px solid ${form.agendamento === opt ? 'rgba(196,163,90,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    color:      form.agendamento === opt ? '#C4A35A' : 'rgba(255,255,255,0.45)',
                  }}
                >
                  {opt === 'agora' ? 'Disparar agora' : 'Agendar'}
                </button>
              ))}
            </div>
            {form.agendamento === 'agendar' && (
              <input
                type="datetime-local"
                value={form.agendado_para}
                onChange={e => setForm(f => ({ ...f, agendado_para: e.target.value }))}
                style={{ ...INPUT, colorScheme: 'dark' as const }}
              />
            )}
          </div>

          {formError && (
            <p className="text-xs" style={{ color: '#f87171' }}>{formError}</p>
          )}

          <button
            onClick={handleCreate}
            disabled={saving}
            className="w-full py-3 rounded-xl text-sm font-medium transition-all"
            style={{ background: saving ? 'rgba(196,163,90,0.4)' : '#C4A35A', color: '#0A0A0D' }}
            onMouseEnter={e => { if (!saving) e.currentTarget.style.background = '#D4B87A' }}
            onMouseLeave={e => { if (!saving) e.currentTarget.style.background = saving ? 'rgba(196,163,90,0.4)' : '#C4A35A' }}
          >
            {saving ? 'Criando...' : 'Criar campanha'}
          </button>
        </div>

        {/* WhatsApp Preview */}
        <div className="rounded-2xl p-6 flex flex-col"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-serif text-lg mb-4" style={{ color: '#C4A35A' }}>Preview WhatsApp</h2>

          {/* Phone frame */}
          <div className="flex-1 flex flex-col rounded-2xl overflow-hidden"
            style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.08)', minHeight: 320 }}>
            {/* Status bar */}
            <div className="px-4 py-2 flex items-center gap-2"
              style={{ background: '#1f2c34', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-serif"
                style={{ background: 'rgba(196,163,90,0.2)', color: '#C4A35A' }}>C</div>
              <div>
                <p className="text-xs font-medium" style={{ color: '#e9e9e9' }}>Clínica</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>online</p>
              </div>
            </div>

            {/* Chat area */}
            <div className="flex-1 p-4 flex flex-col justify-end"
              style={{ background: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3C/svg%3E") #0d1b22' }}>
              {form.mensagem ? (
                <div className="flex justify-end">
                  <div className="max-w-[80%] px-3 py-2 rounded-xl rounded-tr-sm text-sm leading-relaxed"
                    style={{ background: '#005c4b', color: '#e9e9e9', fontSize: 13 }}>
                    {form.mensagem}
                    <div className="text-right mt-1">
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                        Agora ✓✓
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
                    Digite uma mensagem para ver o preview
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Audience estimate */}
          <div className="mt-4 rounded-xl px-4 py-3 flex items-center gap-2"
            style={{ background: 'rgba(196,163,90,0.05)', border: '1px solid rgba(196,163,90,0.1)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4A35A" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Público: <span style={{ color: '#C4A35A' }}>
                {PUBLICO_OPTS.find(o => o.value === form.publico)?.label ?? '—'}
              </span>
            </p>
          </div>
        </div>
      </div>}

      {/* ── Protocolo Aura Jovem™ panel ── */}
      {modo === 'aura-jovem' && (
        <div className="space-y-5">

          {/* Info header */}
          <div className="rounded-2xl p-6"
            style={{ background: 'rgba(196,163,90,0.04)', border: '1px solid rgba(196,163,90,0.18)' }}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] tracking-[0.3em] uppercase font-medium px-3 py-1 rounded-full"
                style={{ background: 'rgba(196,163,90,0.15)', color: '#C4A35A', border: '1px solid rgba(196,163,90,0.35)' }}>
                Prejuvenation • 25–38 Anos
              </span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Segmenta automaticamente pacientes entre 25 e 38 anos e gera comunicação orientada à prevenção — não à correção.
            </p>
          </div>

          {/* Phase cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { fase: 'Fase 1', titulo: 'Baseline Regenerativa', desc: 'Estabeleça a saúde celular base com polinucleotídeos e exossomos', num: '01' },
              { fase: 'Fase 2', titulo: 'Tratamento Específico',  desc: 'Protocolo personalizado por textura, pigmentação e flacidez inicial', num: '02' },
              { fase: 'Fase 3', titulo: 'Manutenção Trimestral',  desc: 'Sessões de reforço a cada 3–6 meses para preservar os resultados', num: '03' },
            ].map(card => (
              <div key={card.num} className="rounded-2xl p-5"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(196,163,90,0.12)' }}>
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[10px] tracking-widest uppercase font-medium"
                    style={{ color: 'rgba(196,163,90,0.6)' }}>{card.fase}</span>
                  <span className="font-serif text-3xl font-light" style={{ color: 'rgba(196,163,90,0.15)' }}>{card.num}</span>
                </div>
                <p className="text-sm font-medium mb-1.5" style={{ color: '#F0EDE8' }}>{card.titulo}</p>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>{card.desc}</p>
              </div>
            ))}
          </div>

          {/* Form + preview grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Form */}
            <div className="rounded-2xl p-6 space-y-5"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(196,163,90,0.15)' }}>
              <h2 className="font-serif text-lg" style={{ color: '#C4A35A' }}>Criar Campanha Aura Jovem™</h2>

              {/* Nome */}
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Nome da campanha</label>
                <input
                  type="text"
                  value={auNome}
                  onChange={e => setAuNome(e.target.value)}
                  style={INPUT}
                />
              </div>

              {/* Público bloqueado */}
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Público-alvo</label>
                <input
                  type="text"
                  value="Pacientes entre 25 e 38 anos"
                  readOnly
                  style={{ ...INPUT, color: 'rgba(255,255,255,0.35)', cursor: 'not-allowed' }}
                />
              </div>

              {/* Mensagem */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Mensagem</label>
                  <button
                    onClick={generateAuraJovemMsg}
                    disabled={auGenerating}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                    style={{ background: 'rgba(196,163,90,0.12)', color: '#C4A35A', border: '1px solid rgba(196,163,90,0.3)' }}
                    onMouseEnter={e => { if (!auGenerating) e.currentTarget.style.background = 'rgba(196,163,90,0.22)' }}
                    onMouseLeave={e => { if (!auGenerating) e.currentTarget.style.background = 'rgba(196,163,90,0.12)' }}
                  >
                    {auGenerating ? (
                      <>
                        <span className="inline-block w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
                        Gerando...
                      </>
                    ) : '✨ Gerar mensagem Aura Jovem'}
                  </button>
                </div>
                <textarea
                  value={auMensagem}
                  onChange={e => setAuMensagem(e.target.value.slice(0, 4096))}
                  rows={7}
                  placeholder="Clique em ✨ Gerar mensagem ou escreva manualmente..."
                  style={{ ...INPUT, resize: 'vertical' as const }}
                />
              </div>

              {/* Envio */}
              <div>
                <label className="block text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>Envio</label>
                <div className="flex gap-3 mb-3">
                  {(['agora', 'agendar'] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={() => setAuAgendamento(opt)}
                      className="flex-1 py-2.5 rounded-xl text-sm transition-all"
                      style={{
                        background: auAgendamento === opt ? 'rgba(196,163,90,0.15)' : 'rgba(255,255,255,0.03)',
                        border:     `1px solid ${auAgendamento === opt ? 'rgba(196,163,90,0.4)' : 'rgba(255,255,255,0.08)'}`,
                        color:      auAgendamento === opt ? '#C4A35A' : 'rgba(255,255,255,0.45)',
                      }}
                    >
                      {opt === 'agora' ? 'Disparar agora' : 'Agendar'}
                    </button>
                  ))}
                </div>
                {auAgendamento === 'agendar' && (
                  <input
                    type="datetime-local"
                    value={auAgendadoPara}
                    onChange={e => setAuAgendadoPara(e.target.value)}
                    style={{ ...INPUT, colorScheme: 'dark' as const }}
                  />
                )}
              </div>

              {auError && <p className="text-xs" style={{ color: '#f87171' }}>{auError}</p>}

              <button
                onClick={handleCreateAuraJovem}
                disabled={auSaving}
                className="w-full py-3 rounded-xl text-sm font-medium transition-all"
                style={{ background: auSaving ? 'rgba(196,163,90,0.4)' : '#C4A35A', color: '#0A0A0D' }}
                onMouseEnter={e => { if (!auSaving) e.currentTarget.style.background = '#D4B87A' }}
                onMouseLeave={e => { if (!auSaving) e.currentTarget.style.background = auSaving ? 'rgba(196,163,90,0.4)' : '#C4A35A' }}
              >
                {auSaving ? 'Criando...' : 'Criar campanha Aura Jovem™'}
              </button>
            </div>

            {/* WhatsApp Preview */}
            <div className="rounded-2xl p-6 flex flex-col"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <h2 className="font-serif text-lg mb-4" style={{ color: '#C4A35A' }}>Preview WhatsApp</h2>
              <div className="flex-1 flex flex-col rounded-2xl overflow-hidden"
                style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.08)', minHeight: 320 }}>
                <div className="px-4 py-2 flex items-center gap-2"
                  style={{ background: '#1f2c34', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-serif"
                    style={{ background: 'rgba(196,163,90,0.2)', color: '#C4A35A' }}>C</div>
                  <div>
                    <p className="text-xs font-medium" style={{ color: '#e9e9e9' }}>Clínica</p>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>online</p>
                  </div>
                </div>
                <div className="flex-1 p-4 flex flex-col justify-end" style={{ background: '#0d1b22' }}>
                  {auMensagem ? (
                    <div className="flex justify-end">
                      <div className="max-w-[80%] px-3 py-2 rounded-xl rounded-tr-sm text-sm leading-relaxed whitespace-pre-wrap"
                        style={{ background: '#005c4b', color: '#e9e9e9', fontSize: 13 }}>
                        {auMensagem}
                        <div className="text-right mt-1">
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Agora ✓✓</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
                        Gere a mensagem para ver o preview
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4 rounded-xl px-4 py-3 flex items-center gap-2"
                style={{ background: 'rgba(196,163,90,0.05)', border: '1px solid rgba(196,163,90,0.1)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4A35A" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Público: <span style={{ color: '#C4A35A' }}>Pacientes entre 25 e 38 anos</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Campaign list ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-xl" style={{ color: '#C4A35A' }}>Campanhas</h2>
          <button
            onClick={() => setShowArchived(v => !v)}
            className="text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{
              color:      showArchived ? '#C4A35A' : 'rgba(255,255,255,0.35)',
              background: showArchived ? 'rgba(196,163,90,0.1)' : 'transparent',
              border:     '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {showArchived ? 'Ocultar arquivadas' : 'Mostrar arquivadas'}
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl animate-pulse"
                style={{ background: 'rgba(255,255,255,0.03)' }} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl py-14 text-center"
            style={{ border: '1px dashed rgba(196,163,90,0.15)' }}>
            <p className="text-3xl mb-3">📡</p>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Nenhuma campanha criada ainda.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden"
            style={{ border: '1px solid rgba(196,163,90,0.1)', background: 'rgba(255,255,255,0.015)' }}>
            <div className="grid px-5 py-3 text-xs uppercase tracking-widest"
              style={{
                gridTemplateColumns: '2fr 110px 110px 90px 140px 200px',
                color:               'rgba(255,255,255,0.28)',
                borderBottom:        '1px solid rgba(196,163,90,0.08)',
              }}>
              <span>Nome</span>
              <span>Público</span>
              <span>Status</span>
              <span>Enviados</span>
              <span>Criada em</span>
              <span>Ações</span>
            </div>

            {visible.map(c => {
              const st = STATUS_MAP[c.status] ?? STATUS_MAP.rascunho
              return (
                <div key={c.id}
                  className="grid items-center px-5 py-4"
                  style={{
                    gridTemplateColumns: '2fr 110px 110px 90px 140px 200px',
                    borderBottom:        '1px solid rgba(255,255,255,0.03)',
                    fontSize:            14,
                    color:               'rgba(255,255,255,0.7)',
                    transition:          'background 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(196,163,90,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div className="pr-4 min-w-0">
                    <p className="truncate font-medium text-sm" style={{ color: 'rgba(255,255,255,0.85)' }}>
                      {c.nome}
                    </p>
                    {c.agendado_para && (
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        Agendado: {formatDate(c.agendado_para)}
                      </p>
                    )}
                  </div>

                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {PUBLICO_LABEL[c.publico] ?? c.publico}
                  </span>

                  <span className="px-2.5 py-0.5 rounded-full text-xs w-fit"
                    style={{ color: st.color, background: st.bg }}>
                    {st.label}
                  </span>

                  <span className="font-serif text-base" style={{ color: '#C4A35A' }}>
                    {c.total_enviado}
                  </span>

                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {formatDate(c.created_at)}
                  </span>

                  <div className="flex items-center gap-2">
                    {c.status === 'rascunho' && (
                      <button
                        onClick={() => handleDispatch(c.id)}
                        disabled={dispatching === c.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{ background: '#C4A35A', color: '#0A0A0D' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#D4B87A')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#C4A35A')}
                      >
                        {dispatching === c.id ? '…' : 'Disparar'}
                      </button>
                    )}

                    <button
                      onClick={() => handleDuplicate(c)}
                      className="px-3 py-1.5 rounded-lg text-xs transition-all"
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        color:      'rgba(255,255,255,0.5)',
                        border:     '1px solid rgba(255,255,255,0.08)',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.75)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
                    >
                      Duplicar
                    </button>

                    {c.status !== 'arquivado' && (
                      <button
                        onClick={() => handleArchive(c.id)}
                        className="px-3 py-1.5 rounded-lg text-xs transition-all"
                        style={{
                          background: 'rgba(239,68,68,0.05)',
                          color:      'rgba(239,68,68,0.5)',
                          border:     '1px solid rgba(239,68,68,0.1)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(239,68,68,0.8)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(239,68,68,0.5)')}
                      >
                        Arquivar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

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
