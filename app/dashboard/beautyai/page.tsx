'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

interface Stats {
  total:   number
  entrada: number
  saida:   number
  taxa:    number
}

interface Conversa {
  paciente_id:   string
  paciente_nome: string
  ultimo:        string
  direcao:       string
  created_at:    string
}

interface Paciente {
  id:   string
  nome: string
}

type Tom = 'formal' | 'casual' | 'tecnico'

// ── Helpers ────────────────────────────────────────────────────────────────

const TOM_LABELS: Record<Tom, string> = {
  formal:  'Formal',
  casual:  'Casual',
  tecnico: 'Técnico',
}

const TOM_DESC: Record<Tom, string> = {
  formal:  'Linguagem profissional, sem emojis, uso cuidadoso de "você".',
  casual:  'Tom amigável e próximo, emojis moderados, linguagem leve.',
  tecnico: 'Consultivo e detalhado, menciona procedimentos e mecanismos.',
}

function formatTs(ts: string) {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function initials(nome: string) {
  return nome.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// ── Component ──────────────────────────────────────────────────────────────

export default function BeautyAIPage() {
  const [connected,   setConnected]   = useState(false)
  const [webhookUrl,  setWebhookUrl]  = useState('')
  const [stats,       setStats]       = useState<Stats>({ total: 0, entrada: 0, saida: 0, taxa: 0 })
  const [conversas,   setConversas]   = useState<Conversa[]>([])
  const [pacientes,   setPacientes]   = useState<Paciente[]>([])
  const [loading,     setLoading]     = useState(true)
  const [ativo,       setAtivo]       = useState(true)
  const [tom,         setTom]         = useState<Tom>('casual')

  // test area
  const [testPacId,   setTestPacId]   = useState('')
  const [testMsg,     setTestMsg]     = useState('')
  const [testResp,    setTestResp]    = useState('')
  const [testLoading, setTestLoading] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval>>()

  // ── Load patients ─────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadPacientes() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('pacientes')
        .select('id, nome')
        .eq('clinica_id', user.id)
        .order('nome')
      setPacientes(data ?? [])
    }
    loadPacientes()

    const savedAtivo = localStorage.getItem('beautyai_ativo')
    const savedTom   = localStorage.getItem('beautyai_tom') as Tom | null
    if (savedAtivo !== null) setAtivo(savedAtivo === 'true')
    if (savedTom)            setTom(savedTom)
  }, [])

  // ── Fetch status + conversations ─────────────────────────────────────────

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Status + stats
    const res = await fetch('/api/beautyai')
    if (res.ok) {
      const data = await res.json()
      setConnected(data.connected)
      setWebhookUrl(data.webhookUrl)
      setStats(data.stats)
    }

    // Recent conversations grouped by patient
    const { data: msgs } = await supabase
      .from('mensagens')
      .select('paciente_id, conteudo, direcao, created_at, pacientes(nome)')
      .eq('clinica_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (msgs) {
      const map = new Map<string, Conversa>()
      for (const m of msgs) {
        const pArr = m.pacientes as { nome: string }[] | { nome: string } | null
        const nome = Array.isArray(pArr) ? pArr[0]?.nome : pArr?.nome ?? '—'
        if (!map.has(m.paciente_id)) {
          map.set(m.paciente_id, {
            paciente_id:   m.paciente_id,
            paciente_nome: nome,
            ultimo:        m.conteudo,
            direcao:       m.direcao,
            created_at:    m.created_at,
          })
        }
      }
      setConversas(Array.from(map.values()).slice(0, 10))
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    pollRef.current = setInterval(fetchData, 30000)
    return () => clearInterval(pollRef.current)
  }, [fetchData])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function toggleAtivo() {
    const next = !ativo
    setAtivo(next)
    localStorage.setItem('beautyai_ativo', String(next))
  }

  function changeTom(t: Tom) {
    setTom(t)
    localStorage.setItem('beautyai_tom', t)
  }

  async function handleTest() {
    if (!testPacId || !testMsg.trim()) return
    setTestLoading(true)
    setTestResp('')
    try {
      const res = await fetch('/api/beautyai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ paciente_id: testPacId, mensagem: testMsg, tom }),
      })
      const data = await res.json()
      setTestResp(data.resposta ?? data.error ?? 'Erro ao gerar resposta.')
    } finally {
      setTestLoading(false)
    }
  }

  // ── System prompt preview ─────────────────────────────────────────────────

  const systemPreview = `Você é a assistente virtual da clínica [nome].
Responda em português brasileiro, de forma ${tom === 'formal' ? 'profissional e formal' : tom === 'tecnico' ? 'técnica e consultiva' : 'calorosa e amigável'}.

Regras:
- Nunca mencione que é uma IA
- Se perguntarem sobre procedimentos, explique os benefícios
- Se quiserem agendar, ofereça verificar horários
- Seja consultiva, nunca vendedora agressiva
- Máximo 3 frases por resposta no WhatsApp`

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'rgba(196,163,90,0.4)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="font-serif text-3xl" style={{ color: '#C4A35A' }}>BeautyAI™</h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Assistente virtual via WhatsApp integrada ao perfil de cada paciente
        </p>
      </div>

      {/* ── Status banner ── */}
      <div className="rounded-2xl p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
        style={{
          background:   connected ? 'rgba(34,197,94,0.06)' : 'rgba(196,163,90,0.05)',
          border:       `1px solid ${connected ? 'rgba(34,197,94,0.2)' : 'rgba(196,163,90,0.15)'}`,
        }}>
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ background: connected ? '#22c55e' : '#f59e0b',
              boxShadow: `0 0 8px ${connected ? 'rgba(34,197,94,0.6)' : 'rgba(245,158,11,0.5)'}` }} />
          <div>
            <p className="text-sm font-medium" style={{ color: connected ? '#22c55e' : '#C4A35A' }}>
              {connected ? 'WhatsApp Conectado' : 'Integração Pendente'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {connected
                ? 'BeautyAI está recebendo e respondendo mensagens automaticamente'
                : 'Configure as credenciais Meta Business para ativar o WhatsApp'}
            </p>
          </div>
        </div>

        {!connected && (
          <div className="flex-shrink-0">
            <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>URL do Webhook:</p>
            <code className="text-xs px-3 py-1.5 rounded-lg select-all"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(196,163,90,0.8)' }}>
              https://leadsim-beauty.vercel.app/api/whatsapp
            </code>
          </div>
        )}
      </div>

      {/* ── Setup instructions (when not connected) ── */}
      {!connected && (
        <div className="rounded-2xl p-6 space-y-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-serif text-lg" style={{ color: '#C4A35A' }}>Como configurar</h2>
          <ol className="space-y-3">
            {[
              'Acesse Meta for Developers → Criar app → WhatsApp Business',
              'Adicione o número de telefone da clínica ao WhatsApp Business Account',
              'No painel do app, vá em WhatsApp → Configuração → Webhook',
              `Cole a URL do webhook acima e o token: leadsim_beauty_verify_2026`,
              'Subscreva ao evento: messages',
              'Copie o Token de acesso e o Phone Number ID para as variáveis de ambiente',
            ].map((step, i) => (
              <li key={i} className="flex gap-3 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 font-medium"
                  style={{ background: 'rgba(196,163,90,0.15)', color: '#C4A35A' }}>
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <div className="rounded-xl p-4 mt-2 space-y-1.5"
            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-mono" style={{ color: 'rgba(196,163,90,0.7)' }}>
              WHATSAPP_TOKEN=seu_token_aqui
            </p>
            <p className="text-xs font-mono" style={{ color: 'rgba(196,163,90,0.7)' }}>
              WHATSAPP_PHONE_ID=seu_phone_id_aqui
            </p>
            <p className="text-xs font-mono" style={{ color: 'rgba(196,163,90,0.7)' }}>
              WHATSAPP_CLINICA_ID=seu_user_id_do_supabase
            </p>
          </div>
        </div>
      )}

      {/* ── 3-column grid: toggle+tom / stats / preview ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Config */}
        <div className="rounded-2xl p-5 space-y-5"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-serif text-base" style={{ color: '#C4A35A' }}>Configuração</h2>

          {/* Toggle ativo */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>BeautyAI Ativo</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Responder automaticamente</p>
            </div>
            <button
              onClick={toggleAtivo}
              className="relative w-11 h-6 rounded-full transition-all duration-200"
              style={{ background: ativo ? 'rgba(196,163,90,0.6)' : 'rgba(255,255,255,0.1)' }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full transition-all duration-200"
                style={{
                  left:       ativo ? '1.375rem' : '0.125rem',
                  background: ativo ? '#C4A35A' : 'rgba(255,255,255,0.4)',
                }}
              />
            </button>
          </div>

          {/* Tom */}
          <div>
            <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>Tom da IA</p>
            <div className="space-y-1.5">
              {(['formal', 'casual', 'tecnico'] as Tom[]).map(t => (
                <button
                  key={t}
                  onClick={() => changeTom(t)}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all duration-150"
                  style={{
                    background: tom === t ? 'rgba(196,163,90,0.12)' : 'rgba(255,255,255,0.03)',
                    border:     `1px solid ${tom === t ? 'rgba(196,163,90,0.35)' : 'rgba(255,255,255,0.06)'}`,
                    color:      tom === t ? '#C4A35A' : 'rgba(255,255,255,0.5)',
                  }}
                >
                  <span className="font-medium">{TOM_LABELS[t]}</span>
                  <span className="block text-xs mt-0.5 opacity-70">{TOM_DESC[t]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="rounded-2xl p-5 space-y-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-serif text-base" style={{ color: '#C4A35A' }}>Estatísticas de Hoje</h2>
          {[
            { label: 'Mensagens recebidas',  value: String(stats.entrada) },
            { label: 'Respostas enviadas',    value: String(stats.saida)   },
            { label: 'Total de mensagens',    value: String(stats.total)   },
            { label: 'Taxa de resposta',      value: `${stats.taxa}%`      },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</span>
              <span className="font-serif text-lg" style={{ color: '#C4A35A' }}>{value}</span>
            </div>
          ))}
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Atualizado a cada 30 segundos
          </p>
        </div>

        {/* System prompt preview */}
        <div className="rounded-2xl p-5 space-y-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-serif text-base" style={{ color: '#C4A35A' }}>Preview do Prompt</h2>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Tom: {TOM_LABELS[tom]}</p>
          <pre
            className="text-xs leading-relaxed whitespace-pre-wrap rounded-xl p-3 overflow-y-auto"
            style={{
              background: 'rgba(0,0,0,0.35)',
              color:      'rgba(255,255,255,0.5)',
              maxHeight:  '200px',
              fontFamily: 'monospace',
            }}
          >
            {systemPreview}
          </pre>
        </div>
      </div>

      {/* ── Test area ── */}
      <div className="rounded-2xl p-5 space-y-4"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C4A35A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
          <h2 className="font-serif text-base" style={{ color: '#C4A35A' }}>Testar BeautyAI</h2>
        </div>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Simule uma conversa com o tom configurado atual
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            value={testPacId}
            onChange={e => setTestPacId(e.target.value)}
            className="rounded-xl px-4 py-2.5 text-sm outline-none"
            style={{ background: '#131318', border: '1px solid rgba(255,255,255,0.1)', color: '#F0EDE8' }}
          >
            <option value="" style={{ background: '#131318', color: '#F0EDE8' }}>Selecionar paciente…</option>
            {pacientes.map(p => (
              <option key={p.id} value={p.id} style={{ background: '#131318', color: '#F0EDE8' }}>{p.nome}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              value={testMsg}
              onChange={e => setTestMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleTest()}
              placeholder="Digite uma mensagem da paciente…"
              className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}
            />
            <button
              onClick={handleTest}
              disabled={testLoading || !testPacId || !testMsg.trim()}
              className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 flex-shrink-0"
              style={{
                background: testLoading || !testPacId || !testMsg.trim()
                  ? 'rgba(196,163,90,0.2)'
                  : 'rgba(196,163,90,0.25)',
                color: testLoading || !testPacId || !testMsg.trim()
                  ? 'rgba(196,163,90,0.4)'
                  : '#C4A35A',
                border: '1px solid rgba(196,163,90,0.25)',
              }}
            >
              {testLoading ? '…' : 'Enviar'}
            </button>
          </div>
        </div>

        {testResp && (
          <div className="rounded-xl p-4 flex gap-3"
            style={{ background: 'rgba(196,163,90,0.05)', border: '1px solid rgba(196,163,90,0.15)' }}>
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-serif"
              style={{ background: 'rgba(196,163,90,0.15)', color: '#C4A35A' }}
            >AI</div>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {testResp}
            </p>
          </div>
        )}
      </div>

      {/* ── Last 10 conversations ── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
          <h2 className="font-serif text-base" style={{ color: '#C4A35A' }}>
            Últimas Conversas
          </h2>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Polling a cada 30s
          </span>
        </div>

        {conversas.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Nenhuma conversa ainda
            </p>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
              As mensagens recebidas via WhatsApp aparecerão aqui
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ '--tw-divide-opacity': '1' } as React.CSSProperties}>
            {conversas.map(c => (
              <div key={c.paciente_id}
                className="px-5 py-3.5 flex items-center gap-3 transition-colors duration-100"
                style={{ borderColor: 'rgba(255,255,255,0.04)' }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-serif font-medium"
                  style={{ background: 'rgba(196,163,90,0.12)', color: '#C4A35A' }}
                >
                  {initials(c.paciente_nome)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate" style={{ color: 'rgba(255,255,255,0.8)' }}>
                      {c.paciente_nome}
                    </p>
                    <span className="text-xs flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {formatTs(c.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className="text-xs flex-shrink-0"
                      style={{ color: c.direcao === 'saida' ? 'rgba(196,163,90,0.6)' : 'rgba(255,255,255,0.3)' }}
                    >
                      {c.direcao === 'saida' ? '↑' : '↓'}
                    </span>
                    <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.38)' }}>
                      {c.ultimo}
                    </p>
                  </div>
                </div>
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: c.direcao === 'saida' ? 'rgba(196,163,90,0.5)' : 'rgba(34,197,94,0.6)' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
