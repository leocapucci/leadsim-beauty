'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { createClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

interface PatientTag { id: string; label: string; cor: string; custom?: boolean }
interface ClubInfo { id: string; tier: string; status: string; valor: number; created_at: string }
interface SkinspanResult {
  score:                number
  anos_diferenca:       number
  interpretacao:        string
  recomendacao:         string
  idade_biologica?:     number
  idade_inflamatoria?:  'baixa' | 'media' | 'alta'
  indice_colageno?:     number
  risco_envelhecimento?: 'baixo' | 'moderado' | 'acelerado'
}
interface HistoryEntry { score: number; anos_diferenca: number; data: string }

interface AuraMemory {
  estilo_desejado: string
  areas_evitadas:  string[]
  preferencias:    string[]
  medos:           string[]
  objetivos:       string[]
  observacoes:     string
}

interface PatientDetail {
  id: string
  nome: string
  whatsapp: string
  skinspan_score:   number | null
  skinspan_data:    SkinspanResult | null
  skinspan_history: HistoryEntry[] | null
  aura_memory:      AuraMemory | null
  tags:             PatientTag[] | null
  created_at: string
  membros_beautyclub: ClubInfo[]
}
interface PlanoAura { id: string; mes: string; tratamento: string; status: string; created_at: string }
interface Mensagem  { id: string; conteudo: string; direcao: string; created_at: string }

type PlanoStatus = 'ativo' | 'pausado' | 'concluido'

// ── Constants ──────────────────────────────────────────────────────────────

const TIER_MAP: Record<string, { label: string; color: string; bg: string; border: string }> = {
  silver:   { label: 'Member', color: '#7FA68A', bg: 'rgba(127,166,138,0.12)', border: 'rgba(127,166,138,0.25)' },
  gold:     { label: 'Gold',   color: '#C4A35A', bg: 'rgba(196,163,90,0.12)',  border: 'rgba(196,163,90,0.28)'  },
  platinum: { label: 'Black',  color: '#9CA3AF', bg: 'rgba(156,163,175,0.1)',  border: 'rgba(156,163,175,0.22)' },
}

const TAGS_PREDEFINIDAS: PatientTag[] = [
  { id: 'paciente-ativo',  label: 'Paciente Ativo',  cor: '#4CAF50' },
  { id: 'importado',       label: 'Importado',        cor: '#2196F3' },
  { id: 'sem-contato',     label: 'Sem Contato',      cor: '#9E9E9E' },
  { id: 'lead-frio',       label: 'Lead Frio',        cor: '#F44336' },
  { id: 'lead-quente',     label: 'Lead Quente',      cor: '#FF9800' },
  { id: 'paciente-modelo', label: 'Paciente Modelo',  cor: '#C9A84C' },
]

const TAG_CORES = ['#4CAF50', '#2196F3', '#9E9E9E', '#F44336', '#FF9800', '#C9A84C']

const SEASONS = [
  { key: 'verao',     label: 'Verão',     months: [12,1,2]  },
  { key: 'outono',    label: 'Outono',    months: [3,4,5]   },
  { key: 'inverno',   label: 'Inverno',   months: [6,7,8]   },
  { key: 'primavera', label: 'Primavera', months: [9,10,11] },
]

const PLANO_STATUS_MAP: Record<PlanoStatus, { label: string; color: string }> = {
  ativo:     { label: 'Em andamento', color: '#4ADE80' },
  pausado:   { label: 'Pausado',      color: '#F59E0B' },
  concluido: { label: 'Concluído',    color: '#C4A35A' },
}

const AREAS_OPCOES = ['Testa', 'Olhos', 'Nariz', 'Lábios', 'Bochechas', 'Queixo', 'Pescoço']

const ESTILO_OPCOES = [
  { value: 'natural',        label: 'Natural e discreto' },
  { value: 'moderado',       label: 'Moderado' },
  { value: 'transformador',  label: 'Transformador' },
  { value: 'sem_preferencia', label: 'Sem preferência' },
]

const EMPTY_MEMORY: AuraMemory = {
  estilo_desejado: '',
  areas_evitadas:  [],
  preferencias:    [],
  medos:           [],
  objetivos:       [],
  observacoes:     '',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getSeason(mes: string) {
  const m = parseInt(mes.split('-')[1])
  return SEASONS.find(s => s.months.includes(m))?.key ?? 'primavera'
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function fmtMonth(mes: string) {
  const [y, m] = mes.split('-')
  return new Date(parseInt(y), parseInt(m)-1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}
function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}
function initials(name: string) {
  return name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
}
function maskPhone(raw: string) {
  const d = raw.replace(/\D/g,'').slice(0,11)
  if (!d.length) return ''
  if (d.length<=2) return `(${d}`
  if (d.length<=7) return `(${d.slice(0,2)}) ${d.slice(2)}`
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
}
function scoreColor(s: number | null) {
  if (s === null) return 'rgba(255,255,255,0.2)'
  return s >= 70 ? '#C4A35A' : s >= 40 ? '#F59E0B' : '#EF4444'
}

// ── Shared styles ──────────────────────────────────────────────────────────

const inputBase: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(196,163,90,0.2)',
  color: '#F0EDE8', borderRadius: 8,
  padding: '10px 14px', width: '100%', fontSize: 14, outline: 'none',
}

// ── Recharts: Skinspan History Mini-Chart ──────────────────────────────────

function SkinspanChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: '#141418', border: '1px solid rgba(196,163,90,0.25)' }}>
      <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</p>
      <p className="text-sm font-semibold" style={{ color: '#C4A35A' }}>{payload[0].value}</p>
    </div>
  )
}

function SkinspanHistoryChart({ history }: { history: HistoryEntry[] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const data = history.map(h => ({ data: fmtShortDate(h.data), score: h.score }))

  if (!mounted) return <div className="h-24 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }} />

  return (
    <ResponsiveContainer width="100%" height={90}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
        <XAxis dataKey="data" tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fill: 'rgba(255,255,255,0.18)', fontSize: 9 }} axisLine={false} tickLine={false} />
        <Tooltip content={<SkinspanChartTooltip />} cursor={{ stroke: 'rgba(196,163,90,0.12)' }} />
        <Line type="monotone" dataKey="score" stroke="#C4A35A" strokeWidth={1.5}
          dot={{ r: 2.5, fill: '#C4A35A', strokeWidth: 0 }}
          activeDot={{ r: 4, fill: '#D4B87A', strokeWidth: 0 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Modal shell ────────────────────────────────────────────────────────────

function Modal({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-2xl p-8" style={{ background: '#0F0F14', border: '1px solid rgba(196,163,90,0.2)' }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="font-serif text-xl" style={{ color: '#F0EDE8' }}>{title}</h2>
            {sub && <p className="text-xs mt-0.5 tracking-wide" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</p>}
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
            style={{ color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#F0EDE8')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] tracking-widest uppercase mb-2" style={{ color: 'rgba(196,163,90,0.7)' }}>{label}</label>
      {children}
    </div>
  )
}

// ── TagInput ───────────────────────────────────────────────────────────────

function TagInput({
  label, placeholder, tags, setTags,
}: { label: string; placeholder: string; tags: string[]; setTags: (t: string[]) => void }) {
  const [input, setInput] = useState('')

  function addTag() {
    const t = input.trim()
    if (t && !tags.includes(t)) setTags([...tags, t])
    setInput('')
  }

  return (
    <div>
      <label className="block text-[11px] tracking-widest uppercase mb-2" style={{ color: 'rgba(196,163,90,0.7)' }}>
        {label}
      </label>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map(t => (
            <span
              key={t}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-light"
              style={{ background: 'rgba(196,163,90,0.1)', color: '#C4A35A', border: '1px solid rgba(196,163,90,0.2)' }}
            >
              {t}
              <button
                onClick={() => setTags(tags.filter(x => x !== t))}
                className="leading-none opacity-60 hover:opacity-100"
                style={{ fontSize: 14, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={input}
        placeholder={placeholder}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
        style={{ ...inputBase, fontSize: 13 }}
      />
      <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
        Pressione Enter para adicionar
      </p>
    </div>
  )
}

// ── Tags Modal ─────────────────────────────────────────────────────────────

function TagsModal({
  patient, clinicCustomTags, onSave, onClose, onCustomTagCreated,
}: {
  patient: PatientDetail
  clinicCustomTags: PatientTag[]
  onSave: (tags: PatientTag[]) => void
  onClose: () => void
  onCustomTagCreated: (tag: PatientTag) => void
}) {
  const [selected, setSelected] = useState<PatientTag[]>(patient.tags ?? [])
  const [newLabel, setNewLabel] = useState('')
  const [newCor,   setNewCor]   = useState(TAG_CORES[0])
  const [saving,   setSaving]   = useState(false)

  function toggle(tag: PatientTag) {
    setSelected(prev =>
      prev.some(t => t.id === tag.id)
        ? prev.filter(t => t.id !== tag.id)
        : [...prev, tag]
    )
  }

  function addCustom() {
    const label = newLabel.trim()
    if (!label) return
    const tag: PatientTag = { id: `custom_${Date.now()}`, label, cor: newCor, custom: true }
    setSelected(prev => [...prev, tag])
    onCustomTagCreated(tag)
    setNewLabel('')
  }

  async function handleSave() {
    setSaving(true)
    const res = await fetch('/api/pacientes/tags', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paciente_id: patient.id, tags: selected }),
    })
    setSaving(false)
    if (res.ok) { onSave(selected); onClose() }
  }

  function TagRow({ tag }: { tag: PatientTag }) {
    const active = selected.some(t => t.id === tag.id)
    return (
      <button onClick={() => toggle(tag)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
        style={{ background: active ? `${tag.cor}14` : 'transparent', border: `1px solid ${active ? tag.cor + '38' : 'rgba(255,255,255,0.06)'}` }}>
        <div className="w-3 h-3 rounded-sm flex items-center justify-center flex-shrink-0"
          style={{ background: active ? tag.cor : 'transparent', border: `1.5px solid ${active ? tag.cor : 'rgba(255,255,255,0.2)'}` }}>
          {active && <svg width="7" height="7" viewBox="0 0 12 12" fill="none"><polyline points="2 6 5 9 10 3" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
        <span className="text-xs" style={{ color: active ? tag.cor : 'rgba(255,255,255,0.55)' }}>{tag.label}</span>
        <span className="w-1.5 h-1.5 rounded-full ml-auto flex-shrink-0" style={{ background: tag.cor }} />
      </button>
    )
  }

  return (
    <Modal title="Tags do Paciente" sub="Gerencie as tags de identificação" onClose={onClose}>
      <div className="space-y-4">

        {/* Predefined */}
        <div className="space-y-1.5">
          <p className="text-[10px] tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.25)' }}>Predefinidas</p>
          <div className="grid grid-cols-2 gap-1.5">
            {TAGS_PREDEFINIDAS.map(tag => <TagRow key={tag.id} tag={tag} />)}
          </div>
        </div>

        {/* Clinic custom tags */}
        {clinicCustomTags.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.25)' }}>Da clínica</p>
            <div className="grid grid-cols-2 gap-1.5">
              {clinicCustomTags.map(tag => <TagRow key={tag.id} tag={tag} />)}
            </div>
          </div>
        )}

        {/* New custom tag */}
        <div className="pt-3 space-y-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.25)' }}>Nova tag personalizada</p>
          <input
            type="text" placeholder="Nome da tag..." value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(196,163,90,0.2)', color: '#F0EDE8' }}
            onFocus={e => (e.currentTarget.style.border = '1px solid rgba(196,163,90,0.5)')}
            onBlur={e  => (e.currentTarget.style.border = '1px solid rgba(196,163,90,0.2)')}
          />
          <div className="flex items-center gap-2">
            {TAG_CORES.map(cor => (
              <button key={cor} onClick={() => setNewCor(cor)} className="rounded-full flex-shrink-0 transition-all"
                style={{ width: 20, height: 20, background: cor, outline: newCor === cor ? `2px solid ${cor}` : 'none', outlineOffset: 2 }} />
            ))}
            <button onClick={addCustom} disabled={!newLabel.trim()}
              className="ml-auto text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
              style={{ background: 'rgba(196,163,90,0.12)', color: '#C4A35A', border: '1px solid rgba(196,163,90,0.28)' }}>
              + Criar tag
            </button>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm"
            style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#F0EDE8')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium tracking-widest uppercase disabled:opacity-50"
            style={{ background: '#C4A35A', color: '#0A0A0D', letterSpacing: '0.1em' }}
            onMouseEnter={e => { if (!saving) e.currentTarget.style.background = '#D4B87A' }}
            onMouseLeave={e => { if (!saving) e.currentTarget.style.background = '#C4A35A' }}>
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Add Treatment Modal ────────────────────────────────────────────────────

function AddTreatmentModal({ pacienteId, onClose, onSuccess }: { pacienteId: string; onClose: () => void; onSuccess: () => void }) {
  const now = new Date()
  const defaultMes = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const [mes, setMes]               = useState(defaultMes)
  const [tratamento, setTratamento] = useState('')
  const [status, setStatus]         = useState<PlanoStatus>('ativo')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tratamento.trim()) { setError('Descreva o tratamento.'); return }
    setLoading(true); setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.from('planos_aura').insert({ paciente_id: pacienteId, mes, tratamento: tratamento.trim(), status })
    if (err) { setError(err.message); setLoading(false); return }
    onSuccess()
  }

  return (
    <Modal title="Adicionar Tratamento" sub="Plano Aura 365" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Mês / Ano">
          <input type="month" value={mes} onChange={e => setMes(e.target.value)} style={inputBase}
            onFocus={e => (e.currentTarget.style.border='1px solid rgba(196,163,90,0.6)')}
            onBlur={e  => (e.currentTarget.style.border='1px solid rgba(196,163,90,0.2)')} />
        </Field>
        <Field label="Tratamento">
          <textarea value={tratamento} onChange={e => setTratamento(e.target.value)} placeholder="Descreva o tratamento..." rows={3}
            style={{ ...inputBase, resize: 'none' }}
            onFocus={e => (e.currentTarget.style.border='1px solid rgba(196,163,90,0.6)')}
            onBlur={e  => (e.currentTarget.style.border='1px solid rgba(196,163,90,0.2)')} />
        </Field>
        <Field label="Status">
          <select value={status} onChange={e => setStatus(e.target.value as PlanoStatus)} style={inputBase}
            onFocus={e => (e.currentTarget.style.border='1px solid rgba(196,163,90,0.6)')}
            onBlur={e  => (e.currentTarget.style.border='1px solid rgba(196,163,90,0.2)')}>
            <option value="ativo"     style={{ background: '#0F0F14' }}>Em andamento</option>
            <option value="pausado"   style={{ background: '#0F0F14' }}>Pausado</option>
            <option value="concluido" style={{ background: '#0F0F14' }}>Concluído</option>
          </select>
        </Field>
        {error && <p className="text-sm py-2 px-3 rounded-lg" style={{ color: '#FCA5A5', background: 'rgba(239,68,68,0.08)' }}>{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm"
            style={{ border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.4)' }}
            onMouseEnter={e=>(e.currentTarget.style.color='#F0EDE8')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.4)')}>
            Cancelar
          </button>
          <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl text-sm font-medium tracking-widest uppercase disabled:opacity-50"
            style={{ background:'#C4A35A', color:'#0A0A0D', letterSpacing:'0.1em' }}
            onMouseEnter={e=>{if(!loading)e.currentTarget.style.background='#D4B87A'}} onMouseLeave={e=>{if(!loading)e.currentTarget.style.background='#C4A35A'}}>
            {loading ? 'Salvando...' : 'Adicionar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Send Message Modal ─────────────────────────────────────────────────────

function SendMessageModal({ clinicaId, pacienteId, onClose, onSuccess }: { clinicaId: string; pacienteId: string; onClose: () => void; onSuccess: () => void }) {
  const [conteudo, setConteudo] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!conteudo.trim()) { setError('A mensagem não pode estar vazia.'); return }
    setLoading(true); setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.from('mensagens').insert({ clinica_id: clinicaId, paciente_id: pacienteId, conteudo: conteudo.trim(), direcao: 'saida' })
    if (err) { setError(err.message); setLoading(false); return }
    onSuccess()
  }

  return (
    <Modal title="Enviar Mensagem" sub="Via WhatsApp" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Mensagem">
          <textarea value={conteudo} onChange={e => setConteudo(e.target.value)} placeholder="Digite a mensagem..." rows={5}
            style={{ ...inputBase, resize: 'none' }}
            onFocus={e => (e.currentTarget.style.border='1px solid rgba(196,163,90,0.6)')}
            onBlur={e  => (e.currentTarget.style.border='1px solid rgba(196,163,90,0.2)')} />
        </Field>
        {error && <p className="text-sm py-2 px-3 rounded-lg" style={{ color:'#FCA5A5', background:'rgba(239,68,68,0.08)' }}>{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm"
            style={{ border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.4)' }}
            onMouseEnter={e=>(e.currentTarget.style.color='#F0EDE8')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.4)')}>
            Cancelar
          </button>
          <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl text-sm font-medium tracking-widest uppercase disabled:opacity-50"
            style={{ background:'#C4A35A', color:'#0A0A0D', letterSpacing:'0.1em' }}
            onMouseEnter={e=>{if(!loading)e.currentTarget.style.background='#D4B87A'}} onMouseLeave={e=>{if(!loading)e.currentTarget.style.background='#C4A35A'}}>
            {loading ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PatientDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [clinicaId,        setClinicaId]        = useState('')
  const [patient,          setPatient]           = useState<PatientDetail | null>(null)
  const [planos,           setPlanos]            = useState<PlanoAura[]>([])
  const [mensagens,        setMensagens]         = useState<Mensagem[]>([])
  const [loading,          setLoading]           = useState(true)
  const [addTreatmentOpen, setAddTreatmentOpen]  = useState(false)
  const [sendMsgOpen,      setSendMsgOpen]       = useState(false)
  const [tagsModalOpen,    setTagsModalOpen]     = useState(false)
  const [patientTags,      setPatientTags]       = useState<PatientTag[]>([])
  const [clinicCustomTags, setClinicCustomTags]  = useState<PatientTag[]>([])

  // Skinspan IA state
  const [skinspanResult,   setSkinspanResult]    = useState<SkinspanResult | null>(null)
  const [skinspanHistory,  setSkinspanHistory]   = useState<HistoryEntry[]>([])
  const [calculating,      setCalculating]       = useState(false)
  const [skinspanError,    setSkinspanError]     = useState<string | null>(null)
  const [animatedScore,    setAnimatedScore]     = useState(0)
  const rafRef = useRef<number>(0)

  // Aura Memory state
  const [auraMem,   setAuraMem]   = useState<AuraMemory>(EMPTY_MEMORY)
  const [savingMem, setSavingMem] = useState(false)
  const [toast,     setToast]     = useState<string | null>(null)
  const toastTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // TagInput per-field input state
  const [prefInput, setPrefInput] = useState('')
  const [medoInput, setMedoInput] = useState('')
  const [objInput,  setObjInput]  = useState('')

  // Animate counter when result arrives
  useEffect(() => {
    if (!skinspanResult) return
    const target = skinspanResult.score
    const startTime = performance.now()
    const duration  = 1100

    function tick(now: number) {
      const progress = Math.min((now - startTime) / duration, 1)
      const eased    = 1 - Math.pow(1 - progress, 3)
      setAnimatedScore(Math.round(eased * target))
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [skinspanResult])

  const loadPlanos = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('planos_aura').select('*').eq('paciente_id', id).order('mes', { ascending: true })
    setPlanos((data as PlanoAura[]) ?? [])
  }, [id])

  const loadMensagens = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('mensagens').select('*').eq('paciente_id', id).order('created_at', { ascending: true })
    setMensagens((data as Mensagem[]) ?? [])
  }, [id])

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login'); return }
      setClinicaId(user.id)

      const { data: p } = await supabase
        .from('pacientes')
        .select('*, membros_beautyclub(id, tier, status, valor, created_at)')
        .eq('id', id)
        .eq('clinica_id', user.id)
        .single()

      if (!p) { router.replace('/dashboard/pacientes'); return }
      const pat = p as PatientDetail
      setPatient(pat)

      // Load existing skinspan data
      if (pat.skinspan_data) setSkinspanResult(pat.skinspan_data)
      if (pat.skinspan_history?.length) {
        setSkinspanHistory(pat.skinspan_history)
        if (pat.skinspan_data) setAnimatedScore(pat.skinspan_data.score)
      }

      // Load existing Aura Memory
      if (pat.aura_memory) setAuraMem(pat.aura_memory)

      // Load tags
      if (pat.tags?.length) setPatientTags(pat.tags)

      // Load clinic custom tags
      fetch('/api/pacientes/tags').then(r => r.ok ? r.json() : null).then(d => {
        if (d?.customTags) setClinicCustomTags(d.customTags)
      })

      await Promise.all([loadPlanos(), loadMensagens()])
      setLoading(false)
    }
    init()
  }, [id, router, loadPlanos, loadMensagens])

  async function handleCalculateSkinspan() {
    if (!patient) return
    setCalculating(true)
    setSkinspanError(null)

    try {
      const res = await fetch('/api/skinspan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paciente_id: patient.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro desconhecido')
      setSkinspanResult(data as SkinspanResult)
      const newEntry: HistoryEntry = {
        score: (data as SkinspanResult).score,
        anos_diferenca: (data as SkinspanResult).anos_diferenca,
        data: new Date().toISOString(),
      }
      setSkinspanHistory(prev => [...prev, newEntry].slice(-12))
    } catch (err) {
      setSkinspanError(String(err))
    } finally {
      setCalculating(false)
    }
  }

  async function handleSaveAuraMemory() {
    if (!patient) return
    setSavingMem(true)
    const res = await fetch('/api/aura-memory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paciente_id: patient.id, ...auraMem }),
    })
    setSavingMem(false)
    if (res.ok) {
      if (toastTimer.current) clearTimeout(toastTimer.current)
      setToast('Aura Memory™ salva com sucesso')
      toastTimer.current = setTimeout(() => setToast(null), 3000)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen">
        <div className="animate-pulse text-center space-y-3">
          <div className="w-16 h-16 rounded-full mx-auto" style={{ background: 'rgba(196,163,90,0.1)' }} />
          <div className="h-4 w-32 rounded mx-auto" style={{ background: 'rgba(255,255,255,0.06)' }} />
        </div>
      </div>
    )
  }

  if (!patient) return null

  const club     = patient.membros_beautyclub.find(m => m.status === 'ativo')
  const tier     = club?.tier
  const tierInfo = tier ? TIER_MAP[tier] : null

  const currentScore = skinspanResult?.score ?? patient.skinspan_score
  const currentColor = scoreColor(currentScore ?? null)
  const anosDif      = skinspanResult?.anos_diferenca

  const bySeasonMap: Record<string, PlanoAura[]> = {}
  planos.forEach(p => {
    const s = getSeason(p.mes)
    if (!bySeasonMap[s]) bySeasonMap[s] = []
    bySeasonMap[s].push(p)
  })

  function toggleArea(area: string) {
    const lower = area.toLowerCase()
    setAuraMem(m => ({
      ...m,
      areas_evitadas: m.areas_evitadas.includes(lower)
        ? m.areas_evitadas.filter(a => a !== lower)
        : [...m.areas_evitadas, lower],
    }))
  }

  function addTag(field: 'preferencias' | 'medos' | 'objetivos', value: string) {
    const t = value.trim()
    if (!t || auraMem[field].includes(t)) return
    setAuraMem(m => ({ ...m, [field]: [...m[field], t] }))
  }

  function removeTag(field: 'preferencias' | 'medos' | 'objetivos', tag: string) {
    setAuraMem(m => ({ ...m, [field]: m[field].filter(x => x !== tag) }))
  }

  return (
    <div className="flex flex-col flex-1 min-h-screen">

      {/* ── Header ── */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-8 h-16"
        style={{ background: 'rgba(10,10,13,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(196,163,90,0.1)' }}>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/pacientes" className="flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: 'rgba(255,255,255,0.3)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#C4A35A')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            Pacientes
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.12)' }}>/</span>
          <span className="font-serif text-base" style={{ color: '#F0EDE8' }}>{patient.nome}</span>
        </div>
        {tierInfo && (
          <span className="text-[11px] font-medium tracking-widest uppercase px-3 py-1.5 rounded-full"
            style={{ color: tierInfo.color, background: tierInfo.bg, border: `1px solid ${tierInfo.border}` }}>
            {tierInfo.label}
          </span>
        )}
      </header>

      <main className="flex-1 px-8 py-8 grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Left column ── */}
        <div className="xl:col-span-1 space-y-5">

          {/* Patient card */}
          <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-full flex items-center justify-center font-serif text-xl font-medium flex-shrink-0"
                style={{ background: 'rgba(196,163,90,0.1)', color: '#C4A35A', border: '1px solid rgba(196,163,90,0.25)' }}>
                {initials(patient.nome)}
              </div>
              <div>
                <p className="font-serif text-lg leading-tight" style={{ color: '#F0EDE8' }}>{patient.nome}</p>
                <p className="text-sm mt-0.5 font-light" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {maskPhone(patient.whatsapp)}
                </p>
              </div>
            </div>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>Cadastro</span>
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>{fmtDate(patient.created_at)}</span>
              </div>
              {club && (
                <div className="flex justify-between">
                  <span style={{ color: 'rgba(255,255,255,0.3)' }}>Mensalidade</span>
                  <span style={{ color: '#C4A35A' }}>
                    {club.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              )}
            </div>

            {/* Tags block */}
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.25)' }}>Tags</span>
                <button
                  onClick={() => setTagsModalOpen(true)}
                  className="text-[11px] transition-colors"
                  style={{ color: 'rgba(196,163,90,0.6)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#C4A35A')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(196,163,90,0.6)')}
                >
                  Gerenciar
                </button>
              </div>
              {patientTags.length === 0 ? (
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>Nenhuma tag aplicada</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {patientTags.map(tag => (
                    <span key={tag.id} className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ color: tag.cor, background: `${tag.cor}18`, border: `1px solid ${tag.cor}35` }}>
                      {tag.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── AuraAge™ card ── */}
          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <div>
                <p className="text-[11px] tracking-widest uppercase font-light" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  AuraAge™
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.15)' }}>idade biológica da pele por IA</p>
              </div>
              <span className="flex items-center gap-1.5 text-[10px] tracking-widest uppercase px-2.5 py-1 rounded-full"
                style={{ color: '#C4A35A', background: 'rgba(196,163,90,0.08)', border: '1px solid rgba(196,163,90,0.18)' }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>
                </svg>
                Powered by IA
              </span>
            </div>

            <div className="px-5 pb-5 space-y-4">
              <div>
                <div className="flex items-end gap-3 mb-2">
                  <span className="font-serif text-5xl font-semibold tabular-nums leading-none transition-all"
                    style={{ color: currentColor }}>
                    {skinspanResult ? animatedScore : (currentScore ?? '—')}
                  </span>
                  <span className="text-lg font-light mb-1" style={{ color: 'rgba(255,255,255,0.2)' }}>/100</span>
                  {anosDif !== undefined && anosDif !== null && (
                    <span className="mb-1 text-xs px-2 py-1 rounded-full font-medium"
                      style={{
                        color: anosDif >= 0 ? '#4ADE80' : '#F59E0B',
                        background: anosDif >= 0 ? 'rgba(74,222,128,0.1)' : 'rgba(245,158,11,0.1)',
                        border: `1px solid ${anosDif >= 0 ? 'rgba(74,222,128,0.2)' : 'rgba(245,158,11,0.2)'}`,
                      }}>
                      {anosDif >= 0 ? `+${anosDif}` : anosDif} anos
                    </span>
                  )}
                </div>

                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${skinspanResult ? animatedScore : (currentScore ?? 0)}%`,
                      background: `linear-gradient(90deg, ${currentColor}88, ${currentColor})`,
                    }} />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.18)' }}>0</span>
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.18)' }}>
                    {currentScore !== null
                      ? (currentScore! >= 75 ? 'Excelente' : currentScore! >= 55 ? 'Bom' : currentScore! >= 35 ? 'Regular' : 'Crítico')
                      : 'Não calculado'}
                  </span>
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.18)' }}>100</span>
                </div>
              </div>

              {skinspanResult && (
                <div className="space-y-3 pt-1">
                  <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <p className="text-xs font-light leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      {skinspanResult.interpretacao}
                    </p>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: 'rgba(196,163,90,0.05)', border: '1px solid rgba(196,163,90,0.12)' }}>
                    <p className="text-[10px] tracking-widest uppercase mb-1.5" style={{ color: 'rgba(196,163,90,0.6)' }}>
                      Recomendação do mês
                    </p>
                    <p className="text-xs font-light leading-relaxed" style={{ color: '#F0EDE8' }}>
                      {skinspanResult.recomendacao}
                    </p>
                  </div>

                  {/* AuraAge™ extended metrics */}
                  {(skinspanResult.idade_biologica !== undefined ||
                    skinspanResult.idade_inflamatoria ||
                    skinspanResult.indice_colageno !== undefined ||
                    skinspanResult.risco_envelhecimento) && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {skinspanResult.idade_biologica !== undefined && (
                        <div className="rounded-xl p-3 text-center"
                          style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)' }}>
                          <p className="text-[10px] tracking-widest uppercase mb-1" style={{ color: 'rgba(96,165,250,0.6)' }}>Idade Biológica</p>
                          <p className="font-serif text-lg font-semibold" style={{ color: '#60a5fa' }}>
                            {skinspanResult.idade_biologica}<span className="text-xs font-light ml-0.5">anos</span>
                          </p>
                        </div>
                      )}
                      {skinspanResult.indice_colageno !== undefined && (
                        <div className="rounded-xl p-3 text-center"
                          style={{ background: 'rgba(196,163,90,0.06)', border: '1px solid rgba(196,163,90,0.15)' }}>
                          <p className="text-[10px] tracking-widest uppercase mb-1" style={{ color: 'rgba(196,163,90,0.6)' }}>Índice Colágeno</p>
                          <p className="font-serif text-lg font-semibold" style={{ color: '#C4A35A' }}>
                            {skinspanResult.indice_colageno}<span className="text-xs font-light ml-0.5">/100</span>
                          </p>
                        </div>
                      )}
                      {skinspanResult.idade_inflamatoria && (
                        <div className="rounded-xl p-3 text-center"
                          style={{
                            background: skinspanResult.idade_inflamatoria === 'baixa' ? 'rgba(74,222,128,0.06)' : skinspanResult.idade_inflamatoria === 'media' ? 'rgba(250,204,21,0.06)' : 'rgba(248,113,113,0.06)',
                            border:     skinspanResult.idade_inflamatoria === 'baixa' ? '1px solid rgba(74,222,128,0.18)' : skinspanResult.idade_inflamatoria === 'media' ? '1px solid rgba(250,204,21,0.18)' : '1px solid rgba(248,113,113,0.18)',
                          }}>
                          <p className="text-[10px] tracking-widest uppercase mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Inflamação</p>
                          <p className="text-sm font-medium capitalize" style={{
                            color: skinspanResult.idade_inflamatoria === 'baixa' ? '#4ade80' : skinspanResult.idade_inflamatoria === 'media' ? '#facc15' : '#f87171',
                          }}>
                            {skinspanResult.idade_inflamatoria === 'baixa' ? 'Baixa' : skinspanResult.idade_inflamatoria === 'media' ? 'Média' : 'Alta'}
                          </p>
                        </div>
                      )}
                      {skinspanResult.risco_envelhecimento && (
                        <div className="rounded-xl p-3 text-center"
                          style={{
                            background: skinspanResult.risco_envelhecimento === 'baixo' ? 'rgba(74,222,128,0.06)' : skinspanResult.risco_envelhecimento === 'moderado' ? 'rgba(250,204,21,0.06)' : 'rgba(248,113,113,0.06)',
                            border:     skinspanResult.risco_envelhecimento === 'baixo' ? '1px solid rgba(74,222,128,0.18)' : skinspanResult.risco_envelhecimento === 'moderado' ? '1px solid rgba(250,204,21,0.18)' : '1px solid rgba(248,113,113,0.18)',
                          }}>
                          <p className="text-[10px] tracking-widest uppercase mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Risco Envelhec.</p>
                          <p className="text-sm font-medium capitalize" style={{
                            color: skinspanResult.risco_envelhecimento === 'baixo' ? '#4ade80' : skinspanResult.risco_envelhecimento === 'moderado' ? '#facc15' : '#f87171',
                          }}>
                            {skinspanResult.risco_envelhecimento === 'baixo' ? 'Baixo' : skinspanResult.risco_envelhecimento === 'moderado' ? 'Moderado' : 'Acelerado'}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {skinspanError && (
                <div className="rounded-lg px-3 py-2 text-xs" style={{ color: '#FCA5A5', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  {skinspanError}
                </div>
              )}

              {skinspanHistory.length > 1 && (
                <div>
                  <p className="text-[10px] tracking-widest uppercase mb-2" style={{ color: 'rgba(255,255,255,0.2)' }}>
                    Evolução ({skinspanHistory.length} cálculos)
                  </p>
                  <SkinspanHistoryChart history={skinspanHistory} />
                </div>
              )}

              <button
                onClick={handleCalculateSkinspan}
                disabled={calculating}
                className="w-full py-3 rounded-xl text-sm font-medium tracking-wider uppercase transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                style={{
                  background: calculating ? 'rgba(196,163,90,0.15)' : 'rgba(196,163,90,0.1)',
                  border: '1px solid rgba(196,163,90,0.3)',
                  color: '#C4A35A',
                  letterSpacing: '0.12em',
                }}
                onMouseEnter={e => { if (!calculating) e.currentTarget.style.background = 'rgba(196,163,90,0.2)' }}
                onMouseLeave={e => { if (!calculating) e.currentTarget.style.background = 'rgba(196,163,90,0.1)' }}
              >
                {calculating ? (
                  <>
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Calculando...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>
                    </svg>
                    {skinspanResult ? 'Recalcular' : 'Calcular'} AuraAge™
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="xl:col-span-2 space-y-6">

          {/* Plano Aura 365 */}
          <section className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <p className="font-serif text-lg" style={{ color: '#F0EDE8' }}>Plano Aura 365</p>
                <p className="text-[11px] tracking-wide mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>Tratamentos por estação</p>
              </div>
              <button onClick={() => setAddTreatmentOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium tracking-wider transition-all"
                style={{ background: 'rgba(196,163,90,0.1)', color: '#C4A35A', border: '1px solid rgba(196,163,90,0.25)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(196,163,90,0.18)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(196,163,90,0.1)')}>
                <span className="text-sm">+</span> Adicionar tratamento
              </button>
            </div>
            <div className="p-6">
              {planos.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="font-serif text-base" style={{ color: 'rgba(255,255,255,0.18)' }}>Nenhum tratamento registrado</p>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.1)' }}>Adicione o primeiro ao plano</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {SEASONS.filter(s => bySeasonMap[s.key]?.length).map(season => (
                    <div key={season.key}>
                      <p className="text-[10px] tracking-widest uppercase mb-3 font-light" style={{ color: 'rgba(196,163,90,0.5)' }}>{season.label}</p>
                      <div className="space-y-2">
                        {bySeasonMap[season.key].map(plano => {
                          const st = PLANO_STATUS_MAP[plano.status as PlanoStatus]
                          return (
                            <div key={plano.id} className="flex items-start gap-4 px-4 py-3 rounded-xl"
                              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-light" style={{ color: '#F0EDE8' }}>{plano.tratamento}</p>
                                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{fmtMonth(plano.mes)}</p>
                              </div>
                              <span className="text-[10px] px-2.5 py-1 rounded-full flex-shrink-0 mt-0.5"
                                style={{ color: st.color, background: `${st.color}18`, border: `1px solid ${st.color}30` }}>
                                {st.label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Messages */}
          <section className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <p className="font-serif text-lg" style={{ color: '#F0EDE8' }}>Histórico de Mensagens</p>
                <p className="text-[11px] tracking-wide mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  {mensagens.length} mensagem{mensagens.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={() => setSendMsgOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium tracking-wider transition-all"
                style={{ background: 'rgba(196,163,90,0.1)', color: '#C4A35A', border: '1px solid rgba(196,163,90,0.25)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(196,163,90,0.18)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(196,163,90,0.1)')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                Enviar mensagem
              </button>
            </div>
            <div className="p-6 max-h-72 overflow-y-auto space-y-3">
              {mensagens.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="font-serif text-base" style={{ color: 'rgba(255,255,255,0.18)' }}>Nenhuma mensagem ainda</p>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.1)' }}>Inicie a conversa com o paciente</p>
                </div>
              ) : (
                mensagens.map(m => {
                  const out = m.direcao === 'saida'
                  return (
                    <div key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[75%] px-4 py-2.5 rounded-2xl text-sm font-light"
                        style={out
                          ? { background: 'rgba(196,163,90,0.15)', color: '#F0EDE8', border: '1px solid rgba(196,163,90,0.2)', borderBottomRightRadius: 4 }
                          : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.08)', borderBottomLeftRadius: 4 }}>
                        <p>{m.conteudo}</p>
                        <p className="text-[10px] mt-1.5 text-right" style={{ color: out ? 'rgba(196,163,90,0.5)' : 'rgba(255,255,255,0.25)' }}>
                          {fmtDate(m.created_at)} · {fmtTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </section>
        </div>

        {/* ── Aura Memory™ — full-width ── */}
        <div className="xl:col-span-3">
          <section className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(196,163,90,0.15)' }}>

            {/* Section header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(196,163,90,0.08)' }}>
              <div className="flex items-center gap-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C4A35A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
                  <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
                </svg>
                <div>
                  <p className="font-serif text-lg" style={{ color: '#F0EDE8' }}>Aura Memory™</p>
                  <p className="text-[11px] tracking-wide mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                    Preferências, medos e objetivos do paciente
                  </p>
                </div>
              </div>
              {patient.aura_memory && (
                <span className="text-[10px] tracking-widest uppercase px-2.5 py-1 rounded-full"
                  style={{ color: '#C4A35A', background: 'rgba(196,163,90,0.1)', border: '1px solid rgba(196,163,90,0.2)' }}>
                  Preenchida
                </span>
              )}
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

              {/* Estilo desejado */}
              <div>
                <label className="block text-[11px] tracking-widest uppercase mb-2" style={{ color: 'rgba(196,163,90,0.7)' }}>
                  Estilo desejado
                </label>
                <div className="space-y-2">
                  {ESTILO_OPCOES.map(opt => {
                    const active = auraMem.estilo_desejado === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setAuraMem(m => ({ ...m, estilo_desejado: active ? '' : opt.value }))}
                        className="w-full text-left px-4 py-2.5 rounded-xl text-sm transition-all"
                        style={{
                          border: '1px solid',
                          borderColor: active ? 'rgba(196,163,90,0.55)' : 'rgba(255,255,255,0.08)',
                          background: active ? 'rgba(196,163,90,0.1)' : 'transparent',
                          color: active ? '#C4A35A' : 'rgba(255,255,255,0.45)',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Áreas evitadas */}
              <div>
                <label className="block text-[11px] tracking-widest uppercase mb-2" style={{ color: 'rgba(196,163,90,0.7)' }}>
                  Áreas evitadas
                </label>
                <div className="flex flex-wrap gap-2">
                  {AREAS_OPCOES.map(area => {
                    const active = auraMem.areas_evitadas.includes(area.toLowerCase())
                    return (
                      <button
                        key={area}
                        onClick={() => toggleArea(area)}
                        className="px-3 py-1.5 rounded-full text-xs transition-all"
                        style={{
                          border: '1px solid',
                          borderColor: active ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.1)',
                          background: active ? 'rgba(248,113,113,0.1)' : 'transparent',
                          color: active ? '#f87171' : 'rgba(255,255,255,0.45)',
                        }}
                      >
                        {area}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Tags: Preferências */}
              <div>
                <label className="block text-[11px] tracking-widest uppercase mb-2" style={{ color: 'rgba(196,163,90,0.7)' }}>
                  Preferências
                </label>
                {auraMem.preferencias.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {auraMem.preferencias.map(t => (
                      <span key={t} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-light"
                        style={{ background: 'rgba(196,163,90,0.1)', color: '#C4A35A', border: '1px solid rgba(196,163,90,0.2)' }}>
                        {t}
                        <button onClick={() => removeTag('preferencias', t)} style={{ fontSize: 14, lineHeight: 1, opacity: 0.7 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  value={prefInput}
                  placeholder='Ex: "odeia resultado artificial"'
                  onChange={e => setPrefInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag('preferencias', prefInput); setPrefInput('') } }}
                  style={{ ...inputBase, fontSize: 13 }}
                />
                <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>Enter para adicionar</p>
              </div>

              {/* Tags: Medos */}
              <div>
                <label className="block text-[11px] tracking-widest uppercase mb-2" style={{ color: 'rgba(196,163,90,0.7)' }}>
                  Medos
                </label>
                {auraMem.medos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {auraMem.medos.map(t => (
                      <span key={t} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-light"
                        style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}>
                        {t}
                        <button onClick={() => removeTag('medos', t)} style={{ fontSize: 14, lineHeight: 1, opacity: 0.7 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  value={medoInput}
                  placeholder='Ex: "medo de agulha"'
                  onChange={e => setMedoInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag('medos', medoInput); setMedoInput('') } }}
                  style={{ ...inputBase, fontSize: 13 }}
                />
                <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>Enter para adicionar</p>
              </div>

              {/* Tags: Objetivos */}
              <div>
                <label className="block text-[11px] tracking-widest uppercase mb-2" style={{ color: 'rgba(196,163,90,0.7)' }}>
                  Objetivos
                </label>
                {auraMem.objetivos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {auraMem.objetivos.map(t => (
                      <span key={t} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-light"
                        style={{ background: 'rgba(74,222,128,0.08)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)' }}>
                        {t}
                        <button onClick={() => removeTag('objetivos', t)} style={{ fontSize: 14, lineHeight: 1, opacity: 0.7 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  value={objInput}
                  placeholder='Ex: "parecer descansada"'
                  onChange={e => setObjInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag('objetivos', objInput); setObjInput('') } }}
                  style={{ ...inputBase, fontSize: 13 }}
                />
                <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>Enter para adicionar</p>
              </div>

              {/* Observações livres */}
              <div>
                <label className="block text-[11px] tracking-widest uppercase mb-2" style={{ color: 'rgba(196,163,90,0.7)' }}>
                  Observações livres
                </label>
                <textarea
                  rows={5}
                  placeholder="Anotações importantes sobre o paciente, comportamentos, histórico relevante..."
                  value={auraMem.observacoes}
                  onChange={e => setAuraMem(m => ({ ...m, observacoes: e.target.value }))}
                  style={{ ...inputBase, resize: 'vertical', minHeight: 100 }}
                />
              </div>
            </div>

            {/* Save button */}
            <div className="flex justify-end px-6 pb-6">
              <button
                onClick={handleSaveAuraMemory}
                disabled={savingMem}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{ background: savingMem ? 'rgba(196,163,90,0.5)' : '#C4A35A', color: '#0A0A0D' }}
                onMouseEnter={e => { if (!savingMem) e.currentTarget.style.background = '#D4B87A' }}
                onMouseLeave={e => { if (!savingMem) e.currentTarget.style.background = '#C4A35A' }}
              >
                {savingMem ? (
                  <>
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Salvando...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                    </svg>
                    Salvar Aura Memory™
                  </>
                )}
              </button>
            </div>
          </section>
        </div>
      </main>

      {/* ── Modals ── */}
      {addTreatmentOpen && (
        <AddTreatmentModal pacienteId={patient.id} onClose={() => setAddTreatmentOpen(false)}
          onSuccess={() => { setAddTreatmentOpen(false); loadPlanos() }} />
      )}
      {sendMsgOpen && (
        <SendMessageModal clinicaId={clinicaId} pacienteId={patient.id} onClose={() => setSendMsgOpen(false)}
          onSuccess={() => { setSendMsgOpen(false); loadMensagens() }} />
      )}
      {tagsModalOpen && (
        <TagsModal
          patient={patient}
          clinicCustomTags={clinicCustomTags}
          onSave={tags => setPatientTags(tags)}
          onClose={() => setTagsModalOpen(false)}
          onCustomTagCreated={tag => setClinicCustomTags(prev => [...prev, tag])}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-medium"
          style={{
            background: '#131318',
            border: '1px solid rgba(74,222,128,0.35)',
            color: '#4ade80',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            animation: 'slideUp 0.3s ease',
          }}
        >
          <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:none } }`}</style>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {toast}
        </div>
      )}
    </div>
  )
}
