'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

interface Mensagem {
  id: string
  paciente_id: string
  conteudo: string
  direcao: 'entrada' | 'saida'
  created_at: string
}

interface Conversa {
  pacienteId: string
  pacienteNome: string
  mensagens: Mensagem[]
  ultimaMensagem: Mensagem
}

interface PacienteOption { id: string; nome: string }

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  const d = new Date(iso)
  const hoje = new Date()
  if (d.toDateString() === hoje.toDateString()) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function fmtDateFull(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function MensagensPage() {
  const router   = useRouter()
  const [conversas,  setConversas]  = useState<Conversa[]>([])
  const [pacientes,  setPacientes]  = useState<PacienteOption[]>([])
  const [selected,   setSelected]   = useState<string | null>(null)
  const [search,     setSearch]     = useState('')
  const [loading,    setLoading]    = useState(true)
  const [showModal,  setShowModal]  = useState(false)
  const [form,       setForm]       = useState({ paciente_id: '', conteudo: '', direcao: 'saida' as 'entrada' | 'saida' })
  const [saving,     setSaving]     = useState(false)
  const [formError,  setFormError]  = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/auth/login'); return }

    const [{ data: msgs }, { data: pacs }] = await Promise.all([
      supabase
        .from('mensagens')
        .select('id, paciente_id, conteudo, direcao, created_at, pacientes(nome)')
        .eq('clinica_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('pacientes')
        .select('id, nome')
        .eq('clinica_id', user.id)
        .order('nome'),
    ])

    setPacientes(pacs ?? [])

    // Group by patient
    const map = new Map<string, Conversa>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of (msgs ?? []) as any[]) {
      if (!map.has(m.paciente_id)) {
        map.set(m.paciente_id, {
          pacienteId:    m.paciente_id,
          pacienteNome:  (Array.isArray(m.pacientes) ? m.pacientes[0]?.nome : m.pacientes?.nome) ?? '—',
          mensagens:     [],
          ultimaMensagem: m,
        })
      }
      map.get(m.paciente_id)!.mensagens.push(m)
    }
    setConversas(Array.from(map.values()))
    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  const filteredConversas = conversas.filter(c =>
    c.pacienteNome.toLowerCase().includes(search.toLowerCase())
  )

  const activeConversa = selected ? conversas.find(c => c.pacienteId === selected) : null

  async function handleSend() {
    setFormError('')
    if (!form.paciente_id || !form.conteudo.trim()) {
      setFormError('Selecione um paciente e escreva a mensagem.')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('mensagens').insert({
      clinica_id:  user.id,
      paciente_id: form.paciente_id,
      conteudo:    form.conteudo.trim(),
      direcao:     form.direcao,
    })
    setSaving(false)
    if (error) { setFormError('Erro ao enviar. Tente novamente.'); return }
    setShowModal(false)
    setForm({ paciente_id: '', conteudo: '', direcao: 'saida' })
    loadData()
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

  return (
    <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh)', backgroundColor: '#0A0A0D' }}>

      {/* ── Left panel: conversation list ── */}
      <div
        className="flex flex-col flex-shrink-0 border-r"
        style={{ width: 320, borderColor: 'rgba(196,163,90,0.1)' }}
      >
        {/* Panel header */}
        <div className="px-6 pt-8 pb-5" style={{ borderBottom: '1px solid rgba(196,163,90,0.08)' }}>
          <div className="flex items-center justify-between mb-4">
            <h1 className="font-serif text-2xl font-light" style={{ color: '#C4A35A' }}>
              Mensagens
            </h1>
            <button
              onClick={() => { setShowModal(true); setFormError('') }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-lg leading-none transition-all"
              style={{ background: 'rgba(196,163,90,0.15)', color: '#C4A35A' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(196,163,90,0.25)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(196,163,90,0.15)')}
              title="Nova mensagem"
            >
              +
            </button>
          </div>
          <input
            type="text"
            placeholder="Buscar paciente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...INPUT, padding: '8px 12px', fontSize: 13 }}
          />
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-5 py-4 animate-pulse" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <div className="flex gap-3 items-center">
                  <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 rounded" style={{ background: 'rgba(255,255,255,0.07)', width: '60%' }} />
                    <div className="h-3 rounded" style={{ background: 'rgba(255,255,255,0.04)', width: '80%' }} />
                  </div>
                </div>
              </div>
            ))
          ) : filteredConversas.length === 0 ? (
            <div className="py-12 text-center px-6" style={{ color: 'rgba(255,255,255,0.25)' }}>
              <p className="text-3xl mb-2">✉</p>
              <p className="text-sm font-light">
                {search ? 'Nenhum paciente encontrado.' : 'Nenhuma mensagem ainda.'}
              </p>
            </div>
          ) : (
            filteredConversas.map(c => {
              const isActive = selected === c.pacienteId
              return (
                <button
                  key={c.pacienteId}
                  onClick={() => setSelected(c.pacienteId)}
                  className="w-full px-5 py-4 text-left flex gap-3 items-start transition-colors"
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    background: isActive ? 'rgba(196,163,90,0.08)' : 'transparent',
                    borderLeft: isActive ? '3px solid #C4A35A' : '3px solid transparent',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                >
                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-serif text-xs font-medium"
                    style={{
                      background: isActive ? 'rgba(196,163,90,0.2)' : 'rgba(255,255,255,0.07)',
                      color: isActive ? '#C4A35A' : 'rgba(255,255,255,0.5)',
                    }}
                  >
                    {initials(c.pacienteNome)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline gap-1 mb-0.5">
                      <span className="text-sm font-medium truncate" style={{ color: isActive ? '#C4A35A' : 'rgba(255,255,255,0.75)' }}>
                        {c.pacienteNome}
                      </span>
                      <span className="text-[11px] flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {fmtTime(c.ultimaMensagem.created_at)}
                      </span>
                    </div>
                    <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {c.ultimaMensagem.direcao === 'saida' ? '→ ' : '← '}{c.ultimaMensagem.conteudo}
                    </p>
                    <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.22)' }}>
                      {c.mensagens.length} mensagem{c.mensagens.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Right panel: message thread ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeConversa ? (
          <>
            {/* Thread header */}
            <div
              className="px-8 py-5 flex items-center gap-4 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(196,163,90,0.1)' }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-sm font-medium"
                style={{ background: 'rgba(196,163,90,0.15)', color: '#C4A35A' }}
              >
                {initials(activeConversa.pacienteNome)}
              </div>
              <div>
                <p className="font-medium" style={{ color: 'rgba(255,255,255,0.88)' }}>
                  {activeConversa.pacienteNome}
                </p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {activeConversa.mensagens.length} mensagem{activeConversa.mensagens.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => router.push(`/dashboard/pacientes/${activeConversa.pacienteId}`)}
                className="ml-auto text-xs px-3 py-1.5 rounded-lg transition-all"
                style={{ border: '1px solid rgba(196,163,90,0.25)', color: '#C4A35A' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(196,163,90,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                Ver paciente →
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
              {[...activeConversa.mensagens].reverse().map(m => {
                const isSaida = m.direcao === 'saida'
                return (
                  <div key={m.id} className={`flex ${isSaida ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className="max-w-[75%] px-4 py-3 rounded-2xl text-sm font-light"
                      style={{
                        background: isSaida ? 'rgba(196,163,90,0.15)' : 'rgba(255,255,255,0.06)',
                        color: isSaida ? '#e8d8a8' : 'rgba(255,255,255,0.75)',
                        borderRadius: isSaida ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      }}
                    >
                      <p className="leading-relaxed whitespace-pre-wrap">{m.conteudo}</p>
                      <p className="text-[11px] mt-1.5 text-right" style={{ color: isSaida ? 'rgba(232,216,168,0.5)' : 'rgba(255,255,255,0.25)' }}>
                        {fmtDateFull(m.created_at)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center" style={{ color: 'rgba(255,255,255,0.2)' }}>
            <p style={{ fontSize: 48, lineHeight: 1 }}>✉</p>
            <p className="mt-4 font-serif text-lg font-light">Selecione uma conversa</p>
            <p className="text-sm mt-1">ou envie uma nova mensagem</p>
          </div>
        )}
      </div>

      {/* ── Modal: Nova Mensagem ── */}
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
              Nova Mensagem
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Paciente *</label>
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
                <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Direção</label>
                <div className="flex gap-2">
                  {(['saida', 'entrada'] as const).map(d => (
                    <button
                      key={d}
                      onClick={() => setForm(f => ({ ...f, direcao: d }))}
                      className="flex-1 py-2 rounded-lg text-sm transition-all"
                      style={{
                        border: '1px solid',
                        borderColor: form.direcao === d ? 'rgba(196,163,90,0.55)' : 'rgba(255,255,255,0.1)',
                        background: form.direcao === d ? 'rgba(196,163,90,0.12)' : 'transparent',
                        color: form.direcao === d ? '#C4A35A' : 'rgba(255,255,255,0.4)',
                      }}
                    >
                      {d === 'saida' ? '→ Enviada' : '← Recebida'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Mensagem *</label>
                <textarea
                  rows={4}
                  placeholder="Escreva a mensagem..."
                  value={form.conteudo}
                  onChange={e => setForm(f => ({ ...f, conteudo: e.target.value }))}
                  style={{ ...INPUT, resize: 'vertical' as const, minHeight: 96 }}
                />
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
                onClick={handleSend}
                disabled={saving}
                className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
                style={{ background: saving ? 'rgba(196,163,90,0.5)' : '#C4A35A', color: '#0A0A0D' }}
                onMouseEnter={e => { if (!saving) e.currentTarget.style.background = '#D4B87A' }}
                onMouseLeave={e => { if (!saving) e.currentTarget.style.background = '#C4A35A' }}
              >
                {saving ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
