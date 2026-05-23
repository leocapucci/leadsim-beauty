'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

interface PatientTag { id: string; label: string; cor: string; custom?: boolean }
interface ClubInfo { tier: string; status: string; valor: number }
interface Paciente {
  id: string
  nome: string
  whatsapp: string
  skinspan_score: number | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aura_memory: Record<string, any> | null
  tags: PatientTag[] | null
  created_at: string
  membros_beautyclub: ClubInfo[]
}

type TierKey = 'todos' | 'silver' | 'gold' | 'platinum' | 'none'

// ── Constants ──────────────────────────────────────────────────────────────

const TIER_MAP: Record<string, { label: string; color: string; bg: string; border: string }> = {
  silver:   { label: 'Member',   color: '#7FA68A', bg: 'rgba(127,166,138,0.12)', border: 'rgba(127,166,138,0.25)' },
  gold:     { label: 'Gold',     color: '#C4A35A', bg: 'rgba(196,163,90,0.12)',  border: 'rgba(196,163,90,0.28)'  },
  platinum: { label: 'Black',    color: '#9CA3AF', bg: 'rgba(156,163,175,0.1)',  border: 'rgba(156,163,175,0.22)' },
}

const TIER_FILTERS: { key: TierKey; label: string }[] = [
  { key: 'todos',    label: 'Todos'    },
  { key: 'silver',   label: 'Member'   },
  { key: 'gold',     label: 'Gold'     },
  { key: 'platinum', label: 'Black'    },
  { key: 'none',     label: 'Sem plano'},
]

const TAGS_PREDEFINIDAS: PatientTag[] = [
  { id: 'paciente-ativo',   label: 'Paciente Ativo',  cor: '#4CAF50' },
  { id: 'importado',        label: 'Importado',        cor: '#2196F3' },
  { id: 'sem-contato',      label: 'Sem Contato',      cor: '#9E9E9E' },
  { id: 'lead-frio',        label: 'Lead Frio',        cor: '#F44336' },
  { id: 'lead-quente',      label: 'Lead Quente',      cor: '#FF9800' },
  { id: 'paciente-modelo',  label: 'Paciente Modelo',  cor: '#C9A84C' },
]

const TAG_CORES = ['#4CAF50', '#2196F3', '#9E9E9E', '#F44336', '#FF9800', '#C9A84C']

// ── Helpers ────────────────────────────────────────────────────────────────

function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (!d.length) return ''
  if (d.length <= 2)  return `(${d}`
  if (d.length <= 7)  return `(${d.slice(0,2)}) ${d.slice(2)}`
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function initials(name: string) {
  return name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
}

function activeClub(p: Paciente): ClubInfo | undefined {
  return p.membros_beautyclub.find(m => m.status === 'ativo')
}

// ── Sub-components ─────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier?: string }) {
  if (!tier) return <span style={{ color: 'rgba(255,255,255,0.2)' }} className="text-xs">—</span>
  const t = TIER_MAP[tier]
  if (!t) return null
  return (
    <span
      className="text-[11px] font-medium tracking-widest uppercase px-2.5 py-1 rounded-full"
      style={{ color: t.color, background: t.bg, border: `1px solid ${t.border}` }}
    >
      {t.label}
    </span>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span
      className="text-[11px] px-2.5 py-1 rounded-full tracking-wide"
      style={{ color: '#4ADE80', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}
    >
      Ativo
    </span>
  ) : (
    <span
      className="text-[11px] px-2.5 py-1 rounded-full"
      style={{ color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      Sem plano
    </span>
  )
}

function ScoreMini({ score }: { score: number | null }) {
  if (score === null) return <span style={{ color: 'rgba(255,255,255,0.2)' }} className="text-xs">—</span>
  const pct = score
  const color = pct >= 70 ? '#C4A35A' : pct >= 40 ? '#F59E0B' : '#EF4444'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-medium tabular-nums" style={{ color }}>{pct}</span>
    </div>
  )
}

function TagBadge({ tag }: { tag: PatientTag }) {
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap"
      style={{ color: tag.cor, background: `${tag.cor}18`, border: `1px solid ${tag.cor}35` }}
    >
      {tag.label}
    </span>
  )
}

function TagPopover({
  patient, clinicCustomTags, onSave, onClose, onCustomTagCreated,
}: {
  patient: Paciente
  clinicCustomTags: PatientTag[]
  onSave: (patientId: string, tags: PatientTag[]) => void
  onClose: () => void
  onCustomTagCreated: (tag: PatientTag) => void
}) {
  const [selected, setSelected] = useState<PatientTag[]>(
    (patient.tags ?? []).map(t => TAGS_PREDEFINIDAS.find(p => p.id === t.id) ?? t)
  )
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
    if (res.ok) { onSave(patient.id, selected); onClose() }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[9998]"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      />
      <div
        className="fixed z-[9999] w-72 rounded-2xl"
        style={{
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          background: '#0F0F14',
          border: '1px solid rgba(196,163,90,0.22)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 pt-3.5 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-sm font-serif" style={{ color: '#F0EDE8' }}>Tags do paciente</p>
        </div>

        <div className="p-3 space-y-3 max-h-72 overflow-y-auto">
          {/* Predefined */}
          <div className="space-y-1">
            <p className="text-[10px] tracking-widest uppercase px-1" style={{ color: 'rgba(255,255,255,0.25)' }}>Predefinidas</p>
            {TAGS_PREDEFINIDAS.map(tag => {
              const active = selected.some(t => t.id === tag.id)
              return (
                <button key={tag.id} onClick={() => toggle(tag)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all"
                  style={{ background: active ? `${tag.cor}14` : 'transparent', border: `1px solid ${active ? tag.cor + '38' : 'rgba(255,255,255,0.06)'}` }}>
                  <div className="w-3.5 h-3.5 rounded-sm flex items-center justify-center flex-shrink-0"
                    style={{ background: active ? tag.cor : 'transparent', border: `1.5px solid ${active ? tag.cor : 'rgba(255,255,255,0.2)'}` }}>
                    {active && <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><polyline points="2 6 5 9 10 3" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <span className="flex-1 text-left text-xs" style={{ color: active ? tag.cor : 'rgba(255,255,255,0.55)' }}>{tag.label}</span>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tag.cor }} />
                </button>
              )
            })}
          </div>

          {/* Clinic custom tags */}
          {clinicCustomTags.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] tracking-widest uppercase px-1" style={{ color: 'rgba(255,255,255,0.25)' }}>Da clínica</p>
              {clinicCustomTags.map(tag => {
                const active = selected.some(t => t.id === tag.id)
                return (
                  <button key={tag.id} onClick={() => toggle(tag)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all"
                    style={{ background: active ? `${tag.cor}14` : 'transparent', border: `1px solid ${active ? tag.cor + '38' : 'rgba(255,255,255,0.06)'}` }}>
                    <div className="w-3.5 h-3.5 rounded-sm flex items-center justify-center flex-shrink-0"
                      style={{ background: active ? tag.cor : 'transparent', border: `1.5px solid ${active ? tag.cor : 'rgba(255,255,255,0.2)'}` }}>
                      {active && <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><polyline points="2 6 5 9 10 3" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <span className="flex-1 text-left text-xs" style={{ color: active ? tag.cor : 'rgba(255,255,255,0.55)' }}>{tag.label}</span>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tag.cor }} />
                  </button>
                )
              })}
            </div>
          )}

          {/* New custom tag */}
          <div className="pt-2 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[10px] tracking-widest uppercase px-1" style={{ color: 'rgba(255,255,255,0.25)' }}>Nova tag</p>
            <input
              type="text" placeholder="Nome da tag..." value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
              className="w-full px-3 py-2 rounded-xl text-xs outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#F0EDE8' }}
            />
            <div className="flex items-center gap-1.5">
              {TAG_CORES.map(cor => (
                <button key={cor} onClick={() => setNewCor(cor)} className="rounded-full flex-shrink-0 transition-all"
                  style={{ width: 18, height: 18, background: cor, outline: newCor === cor ? `2px solid ${cor}` : 'none', outlineOffset: 2 }} />
              ))}
              <button onClick={addCustom} disabled={!newLabel.trim()}
                className="ml-auto text-[11px] px-2.5 py-1 rounded-lg transition-all disabled:opacity-40"
                style={{ background: 'rgba(196,163,90,0.12)', color: '#C4A35A', border: '1px solid rgba(196,163,90,0.28)' }}>
                + Criar
              </button>
            </div>
          </div>
        </div>

        <div className="px-3 pb-3 pt-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={handleSave} disabled={saving}
            className="w-full py-2 rounded-xl text-xs font-medium tracking-wider uppercase transition-all disabled:opacity-50"
            style={{ background: '#C4A35A', color: '#0A0A0D', letterSpacing: '0.1em' }}
            onMouseEnter={e => { if (!saving) e.currentTarget.style.background = '#D4B87A' }}
            onMouseLeave={e => { if (!saving) e.currentTarget.style.background = '#C4A35A' }}>
            {saving ? 'Salvando...' : 'Salvar tags'}
          </button>
        </div>
      </div>
    </>
  )
}

function SkeletonRow() {
  return (
    <div
      className="grid gap-4 px-6 py-4 animate-pulse"
      style={{ gridTemplateColumns: '1fr 1fr 120px 80px 100px 80px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
    >
      {[1,2,3,4,5,6].map(i => (
        <div key={i} className="h-3 rounded my-auto" style={{ background: 'rgba(255,255,255,0.06)', width: i===1 ? '70%' : '80%' }} />
      ))}
    </div>
  )
}

// ── Input style helper ─────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(196,163,90,0.2)',
  color: '#F0EDE8',
  borderRadius: 8,
  padding: '10px 14px',
  width: '100%',
  fontSize: 14,
  outline: 'none',
}

function FormInput({
  label, value, onChange, type = 'text', placeholder, required,
}: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; required?: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label className="block text-[11px] tracking-widest uppercase mb-2" style={{ color: 'rgba(196,163,90,0.7)' }}>
        {label}{required && <span style={{ color: '#EF4444' }}> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{ ...inputStyle, border: `1px solid ${focused ? 'rgba(196,163,90,0.6)' : 'rgba(196,163,90,0.2)'}` }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  )
}

// ── Column detection for import ────────────────────────────────────────────

function detectField(header: string): string | null {
  const h = header.toLowerCase().trim()
  if (/nome|paciente|cliente/.test(h)) return 'nome'
  if (/whats|zap|telefone|celular|fone|phone|numero|cel\b/.test(h)) return 'whatsapp'
  if (/e.?mail/.test(h)) return 'email'
  if (/procedimento|servi[cç]|tratamento|interesse/.test(h)) return 'procedimento_interesse'
  if (/cidade|city|munic/.test(h)) return 'cidade'
  if (/endere[cç]|address|rua|logradouro/.test(h)) return 'endereco'
  return null
}

const FIELD_LABELS: Record<string, string> = {
  nome: 'Nome', whatsapp: 'WhatsApp', email: 'E-mail',
  procedimento_interesse: 'Procedimento', cidade: 'Cidade', endereco: 'Endereço',
}

// ── Import Modal ────────────────────────────────────────────────────────────

function ImportModal({
  onClose, onSuccess, userId,
}: { onClose: () => void; onSuccess: () => void; userId: string }) {
  const [step,       setStep]       = useState<'upload' | 'preview' | 'importing' | 'done'>('upload')
  const [isDragging, setIsDragging] = useState(false)
  const [fileName,   setFileName]   = useState('')
  const [rows,       setRows]       = useState<Record<string, string>[]>([])
  const [colMap,     setColMap]     = useState<Record<string, string>>({})
  const [result,     setResult]     = useState<{ importados: number; duplicados: number; erros: number } | null>(null)
  const [importTagSelecionada, setImportTagSelecionada] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function processFile(file: File) {
    setFileName(file.name)
    const { read, utils } = await import('xlsx')
    const buf  = await file.arrayBuffer()
    const wb   = read(buf, { type: 'array' })
    const ws   = wb.Sheets[wb.SheetNames[0]]
    const data = utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false })
    if (!data.length) return
    const headers = Object.keys(data[0])
    const map: Record<string, string> = {}
    for (const h of headers) {
      const field = detectField(h)
      if (field && !map[field]) map[field] = h
    }
    setRows(data)
    setColMap(map)
    setStep('preview')
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  async function handleConfirm() {
    setStep('importing')
    const pacientes = rows.map(r => ({
      nome:                   colMap.nome                   ? r[colMap.nome]                   : '',
      whatsapp:               colMap.whatsapp               ? r[colMap.whatsapp]               : '',
      email:                  colMap.email                  ? r[colMap.email]                  : '',
      procedimento_interesse: colMap.procedimento_interesse ? r[colMap.procedimento_interesse] : '',
      cidade:                 colMap.cidade                 ? r[colMap.cidade]                 : '',
      endereco:               colMap.endereco               ? r[colMap.endereco]               : '',
    }))
    try {
      const res  = await fetch('/api/pacientes/importar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pacientes }),
      })
      const data = await res.json() as { importados: number; duplicados: number; erros: number }
      setResult(data)
      setStep('done')
      onSuccess()

      // Apply tags to newly imported patients
      if (data.importados > 0) {
        const phones = rows
          .map(r => colMap.whatsapp ? (r[colMap.whatsapp] ?? '').replace(/\D/g, '') : '')
          .filter(Boolean)

        if (phones.length > 0) {
          const supabase = createClient()
          const cutoff = new Date(Date.now() - 120_000).toISOString()
          const { data: newPatients } = await supabase
            .from('pacientes')
            .select('id')
            .in('whatsapp', phones)
            .gte('created_at', cutoff)

          const autoTag: PatientTag = { id: 'importado', label: 'Importado', cor: '#2196F3' }
          const extraTag = importTagSelecionada && importTagSelecionada !== 'importado'
            ? TAGS_PREDEFINIDAS.find(t => t.id === importTagSelecionada)
            : undefined
          const tagsToApply: PatientTag[] = [autoTag, ...(extraTag ? [extraTag] : [])]

          if (newPatients?.length) {
            await Promise.all(
              newPatients.map(p =>
                fetch('/api/pacientes/tags', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ paciente_id: p.id, tags: tagsToApply }),
                })
              )
            )
          }
        }
      }
    } catch {
      setResult({ importados: 0, duplicados: 0, erros: rows.length })
      setStep('done')
    }
  }

  const detectedFields = Object.keys(colMap)
  const preview = rows.slice(0, 5)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden"
        style={{ background: '#0F0F14', border: '1px solid rgba(196,163,90,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="font-serif text-2xl" style={{ color: '#F0EDE8' }}>Importar Pacientes</h2>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Excel (.xlsx) ou CSV</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#F0EDE8')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}>✕</button>
        </div>

        <div className="px-8 py-6 space-y-5">

          {/* ── Upload step ── */}
          {step === 'upload' && (
            <div
              className="rounded-xl flex flex-col items-center justify-center gap-4 py-14 cursor-pointer transition-all"
              style={{
                border: `2px dashed ${isDragging ? 'rgba(196,163,90,0.6)' : 'rgba(196,163,90,0.2)'}`,
                background: isDragging ? 'rgba(196,163,90,0.06)' : 'transparent',
              }}
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#C4A35A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.6">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <div className="text-center">
                <p className="text-sm font-light" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Arraste o arquivo aqui ou <span style={{ color: '#C4A35A' }}>clique para selecionar</span>
                </p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>.xlsx, .xls, .csv</p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }} />
            </div>
          )}

          {/* ── Preview step ── */}
          {step === 'preview' && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-light" style={{ color: '#F0EDE8' }}>{fileName}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {rows.length} paciente{rows.length !== 1 ? 's' : ''} encontrado{rows.length !== 1 ? 's' : ''} na planilha
                  </p>
                </div>
                {detectedFields.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap justify-end max-w-xs">
                    {detectedFields.map(f => (
                      <span key={f} className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(196,163,90,0.1)', color: '#C4A35A', border: '1px solid rgba(196,163,90,0.2)' }}>
                        {FIELD_LABELS[f] ?? f}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Preview table */}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)' }}>
                        {detectedFields.map(f => (
                          <th key={f} className="px-4 py-2.5 text-left tracking-widest uppercase font-medium"
                            style={{ color: 'rgba(196,163,90,0.7)', whiteSpace: 'nowrap' }}>
                            {FIELD_LABELS[f] ?? f}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i} style={{ borderBottom: i < preview.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                          {detectedFields.map(f => (
                            <td key={f} className="px-4 py-2.5 font-light"
                              style={{ color: 'rgba(255,255,255,0.55)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {colMap[f] ? row[colMap[f]] || '—' : '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > 5 && (
                  <p className="px-4 py-2 text-[10px]" style={{ color: 'rgba(255,255,255,0.2)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    + {rows.length - 5} linhas adicionais
                  </p>
                )}
              </div>

              {/* Tag selection */}
              <div>
                <label className="block text-[11px] tracking-widest uppercase mb-2" style={{ color: 'rgba(196,163,90,0.7)' }}>
                  Aplicar Tag a Todos os Contatos
                </label>
                <select
                  value={importTagSelecionada}
                  onChange={e => setImportTagSelecionada(e.target.value)}
                  style={{ ...inputStyle }}
                  onFocus={e => (e.currentTarget.style.border = '1px solid rgba(196,163,90,0.6)')}
                  onBlur={e  => (e.currentTarget.style.border = '1px solid rgba(196,163,90,0.2)')}
                >
                  <option value="" style={{ background: '#0F0F14' }}>Sem tag</option>
                  {TAGS_PREDEFINIDAS.map(t => (
                    <option key={t.id} value={t.id} style={{ background: '#0F0F14' }}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl text-sm font-light transition-colors"
                  style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#F0EDE8')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}>
                  Cancelar
                </button>
                <button onClick={handleConfirm}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium tracking-widest uppercase transition-all"
                  style={{ background: '#C4A35A', color: '#0A0A0D', letterSpacing: '0.1em' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#D4B87A')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#C4A35A')}>
                  Confirmar Importação
                </button>
              </div>
            </>
          )}

          {/* ── Importing step ── */}
          {step === 'importing' && (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="w-8 h-8 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(196,163,90,0.2)', borderTopColor: '#C4A35A' }} />
              <p className="text-sm font-light" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Importando {rows.length} pacientes...
              </p>
            </div>
          )}

          {/* ── Done step ── */}
          {step === 'done' && result && (
            <div className="space-y-5 py-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Importados',  value: result.importados,  color: '#4ade80' },
                  { label: 'Duplicados',  value: result.duplicados,  color: '#facc15' },
                  { label: 'Erros',       value: result.erros,       color: result.erros > 0 ? '#f87171' : 'rgba(255,255,255,0.3)' },
                ].map(item => (
                  <div key={item.label} className="rounded-xl p-4 text-center"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="font-serif text-3xl font-semibold" style={{ color: item.color }}>{item.value}</p>
                    <p className="text-[10px] tracking-widest uppercase mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{item.label}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-center font-light" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {result.importados > 0
                  ? `${result.importados} paciente${result.importados !== 1 ? 's' : ''} importado${result.importados !== 1 ? 's' : ''} com sucesso.${result.duplicados > 0 ? ` ${result.duplicados} duplicado${result.duplicados !== 1 ? 's' : ''} ignorado${result.duplicados !== 1 ? 's' : ''}.` : ''}`
                  : 'Nenhum paciente novo importado.'}
              </p>
              <button onClick={onClose}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{ background: '#C4A35A', color: '#0A0A0D' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#D4B87A')}
                onMouseLeave={e => (e.currentTarget.style.background = '#C4A35A')}>
                Fechar
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── New Patient Modal ──────────────────────────────────────────────────────

function NewPatientModal({
  onClose,
  onSuccess,
  userId,
}: {
  onClose: () => void
  onSuccess: () => void
  userId: string
}) {
  const [nome,               setNome]               = useState('')
  const [whatsapp,           setWhatsapp]           = useState('')
  const [tier,               setTier]               = useState('')
  const [novoTagSelecionada, setNovoTagSelecionada] = useState('')
  const [loading,            setLoading]            = useState(false)
  const [error,              setError]              = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()

    const { data: newPaciente, error: pErr } = await supabase
      .from('pacientes')
      .insert({ clinica_id: userId, nome: nome.trim(), whatsapp })
      .select('id')
      .single()

    if (pErr || !newPaciente) {
      setError(pErr?.message ?? 'Erro ao cadastrar paciente.')
      setLoading(false)
      return
    }

    if (tier) {
      const { error: cErr } = await supabase
        .from('membros_beautyclub')
        .insert({ paciente_id: newPaciente.id, tier, valor: 0, status: 'ativo' })
      if (cErr) {
        setError(`Paciente criado, mas erro no clube: ${cErr.message}`)
        setLoading(false)
        return
      }
    }

    if (novoTagSelecionada) {
      const tag = TAGS_PREDEFINIDAS.find(t => t.id === novoTagSelecionada)
      if (tag) {
        await fetch('/api/pacientes/tags', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paciente_id: newPaciente.id, tags: [tag] }),
        })
      }
    }

    onSuccess()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{ background: '#0F0F14', border: '1px solid rgba(196,163,90,0.2)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-7">
          <div>
            <h2 className="font-serif text-2xl" style={{ color: '#F0EDE8' }}>Novo Paciente</h2>
            <p className="text-xs mt-0.5 tracking-wide" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Preencha os dados para cadastrar
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#F0EDE8')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormInput label="Nome completo" value={nome} onChange={setNome} placeholder="Ex: Maria Oliveira" required />

          <FormInput
            label="WhatsApp"
            value={whatsapp}
            onChange={v => setWhatsapp(maskPhone(v))}
            placeholder="(11) 99999-9999"
            required
          />

          {/* Tier */}
          <div>
            <label className="block text-[11px] tracking-widest uppercase mb-2" style={{ color: 'rgba(196,163,90,0.7)' }}>
              Tier Beauty Club
            </label>
            <select
              value={tier}
              onChange={e => setTier(e.target.value)}
              style={{ ...inputStyle }}
              onFocus={e => (e.currentTarget.style.border = '1px solid rgba(196,163,90,0.6)')}
              onBlur={e  => (e.currentTarget.style.border = '1px solid rgba(196,163,90,0.2)')}
            >
              <option value="" style={{ background: '#0F0F14' }}>Nenhum</option>
              <option value="silver"   style={{ background: '#0F0F14' }}>Member</option>
              <option value="gold"     style={{ background: '#0F0F14' }}>Gold</option>
              <option value="platinum" style={{ background: '#0F0F14' }}>Black</option>
            </select>
          </div>

          {/* Tag inicial */}
          <div>
            <label className="block text-[11px] tracking-widest uppercase mb-2" style={{ color: 'rgba(196,163,90,0.7)' }}>
              Tag Inicial
            </label>
            <select
              value={novoTagSelecionada}
              onChange={e => setNovoTagSelecionada(e.target.value)}
              style={{ ...inputStyle }}
              onFocus={e => (e.currentTarget.style.border = '1px solid rgba(196,163,90,0.6)')}
              onBlur={e  => (e.currentTarget.style.border = '1px solid rgba(196,163,90,0.2)')}
            >
              <option value="" style={{ background: '#0F0F14' }}>Sem tag</option>
              {TAGS_PREDEFINIDAS.map(t => (
                <option key={t.id} value={t.id} style={{ background: '#0F0F14' }}>{t.label}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5' }}>
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-light transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#F0EDE8')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium tracking-widest uppercase transition-all disabled:opacity-50"
              style={{ background: '#C4A35A', color: '#0A0A0D', letterSpacing: '0.12em' }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#D4B87A' }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#C4A35A' }}
            >
              {loading ? 'Salvando...' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PacientesPage() {
  const router = useRouter()
  const [userId,           setUserId]          = useState<string>('')
  const [patients,         setPatients]         = useState<Paciente[]>([])
  const [loading,          setLoading]          = useState(true)
  const [search,           setSearch]           = useState('')
  const [tierFilter,       setTierFilter]       = useState<TierKey>('todos')
  const [tagFilter,        setTagFilter]        = useState('')
  const [clinicCustomTags, setClinicCustomTags] = useState<PatientTag[]>([])
  const [modalOpen,        setModalOpen]        = useState(false)
  const [importOpen,       setImportOpen]       = useState(false)
  const [popoverPatientId, setPopoverPatientId] = useState<string | null>(null)

  const loadPatients = useCallback(async (uid: string, term = '') => {
    setLoading(true)
    const supabase = createClient()
    let query = supabase
      .from('pacientes')
      .select('*, membros_beautyclub(tier, status, valor)')
      .eq('clinica_id', uid)
      .order('nome', { ascending: true })

    const t = term.trim()
    if (t) {
      const digits = t.replace(/\D/g, '')
      query = digits.length >= 3
        ? query.or(`nome.ilike.%${t}%,whatsapp.ilike.%${digits}%`)
        : query.ilike('nome', `%${t}%`)
    }

    const { data } = await query
    setPatients((data as Paciente[]) ?? [])
    setLoading(false)
  }, [])

  const loadCustomTags = useCallback(async () => {
    const res = await fetch('/api/pacientes/tags')
    if (res.ok) {
      const data = await res.json() as { customTags: PatientTag[] }
      setClinicCustomTags(data.customTags ?? [])
    }
  }, [])

  // Auth — just set userId; data loading is handled by the effect below
  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login'); return }
      setUserId(user.id)
      loadCustomTags()
    }
    init()
  }, [router, loadCustomTags])

  // Reload whenever userId is set or search changes (debounced)
  useEffect(() => {
    if (!userId) return
    const delay = search ? 300 : 0
    const timer = setTimeout(() => loadPatients(userId, search), delay)
    return () => clearTimeout(timer)
  }, [search, userId, loadPatients])

  // Tier + tag filters — search is handled server-side
  const filtered = patients
    .filter(p => {
      const club = activeClub(p)
      if (tierFilter === 'none')  return !club
      if (tierFilter !== 'todos') return club?.tier === tierFilter
      return true
    })
    .filter(p => {
      if (!tagFilter) return true
      return (p.tags ?? []).some(t => t.id === tagFilter)
    })

  return (
    <div className="flex flex-col flex-1 min-h-screen">
      {/* Header */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-8 h-16"
        style={{ background: 'rgba(10,10,13,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(196,163,90,0.1)' }}
      >
        <div>
          <h1 className="font-serif text-xl tracking-wide" style={{ color: '#F0EDE8' }}>Pacientes</h1>
          <p className="text-[11px] font-light tracking-widest uppercase mt-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
            {loading ? '...' : `${patients.length} cadastro${patients.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium tracking-wider transition-all"
            style={{ background: '#C4A35A', color: '#0A0A0D', letterSpacing: '0.1em' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#D4B87A')}
            onMouseLeave={e => (e.currentTarget.style.background = '#C4A35A')}
          >
            <span className="text-base leading-none">+</span>
            Novo Paciente
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'transparent', border: '1px solid rgba(201,168,76,0.45)', color: '#C9A84C' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(201,168,76,0.08)'; e.currentTarget.style.borderColor = 'rgba(201,168,76,0.7)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(201,168,76,0.45)' }}
          >
            ↑ Importar Excel
          </button>
        </div>
      </header>

      <main className="flex-1 px-8 py-8 space-y-5">

        {/* Filters row */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4A35A" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por nome ou WhatsApp..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm font-light outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#F0EDE8' }}
              onFocus={e => (e.currentTarget.style.border = '1px solid rgba(196,163,90,0.35)')}
              onBlur={e  => (e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)')}
            />
          </div>

          {/* Tier filter pills */}
          <div className="flex items-center gap-2">
            {TIER_FILTERS.map(f => {
              const active = tierFilter === f.key
              return (
                <button
                  key={f.key}
                  onClick={() => setTierFilter(f.key)}
                  className="px-3.5 py-1.5 rounded-full text-[11px] tracking-widest uppercase font-medium transition-all"
                  style={{
                    background: active ? 'rgba(196,163,90,0.15)' : 'rgba(255,255,255,0.04)',
                    border: active ? '1px solid rgba(196,163,90,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    color: active ? '#C4A35A' : 'rgba(255,255,255,0.35)',
                  }}
                >
                  {f.label}
                </button>
              )
            })}
          </div>

          {/* Tag filter */}
          <select
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
            className="rounded-full text-[11px] tracking-widest uppercase font-medium outline-none px-3.5 py-1.5 transition-all"
            style={{
              background: tagFilter ? 'rgba(196,163,90,0.15)' : 'rgba(255,255,255,0.04)',
              border: tagFilter ? '1px solid rgba(196,163,90,0.4)' : '1px solid rgba(255,255,255,0.08)',
              color: tagFilter ? '#C4A35A' : 'rgba(255,255,255,0.35)',
            }}
          >
            <option value="" style={{ background: '#0F0F14' }}>Todas as tags</option>
            {[...TAGS_PREDEFINIDAS, ...clinicCustomTags].map(t => (
              <option key={t.id} value={t.id} style={{ background: '#0F0F14' }}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Table head */}
          <div
            className="grid gap-4 px-6 py-3 text-[10px] tracking-widest uppercase"
            style={{ gridTemplateColumns: '1fr 140px 140px 90px 120px 90px', color: 'rgba(255,255,255,0.22)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
          >
            <span>Paciente</span>
            <span>WhatsApp</span>
            <span>Skinspan Score™</span>
            <span>Tier</span>
            <span>Cadastro</span>
            <span>Status</span>
          </div>

          {/* Rows */}
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
          ) : filtered.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="font-serif text-xl mb-1" style={{ color: 'rgba(255,255,255,0.18)' }}>
                {search || tierFilter !== 'todos' || tagFilter ? 'Nenhum resultado encontrado' : 'Nenhum paciente cadastrado'}
              </p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.1)' }}>
                {search || tierFilter !== 'todos' || tagFilter ? 'Tente ajustar os filtros' : 'Clique em "Novo Paciente" para começar'}
              </p>
            </div>
          ) : (
            filtered.map((p, idx) => {
              const club = activeClub(p)
              return (
                <div
                  key={p.id}
                  className="grid gap-4 px-6 py-4 cursor-pointer transition-colors"
                  style={{
                    gridTemplateColumns: '1fr 140px 140px 90px 120px 90px',
                    borderBottom: idx < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  }}
                  onClick={() => router.push(`/dashboard/pacientes/${p.id}`)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(196,163,90,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Nome */}
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 font-serif"
                      style={{ background: 'rgba(196,163,90,0.1)', color: '#C4A35A', border: '1px solid rgba(196,163,90,0.2)' }}
                    >
                      {initials(p.nome)}
                    </div>
                    <span className="text-sm font-light truncate" style={{ color: '#F0EDE8' }}>{p.nome}</span>
                    {p.aura_memory && (
                      <span
                        title="Aura Memory preenchida"
                        className="flex-shrink-0"
                        style={{ color: '#C4A35A', opacity: 0.7 }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
                          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
                        </svg>
                      </span>
                    )}
                    {(p.tags ?? []).length > 0 && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {(p.tags ?? []).slice(0, 4).map(tag => (
                          <div
                            key={tag.id}
                            title={tag.label}
                            style={{ width: 10, height: 10, borderRadius: '50%', background: tag.cor, flexShrink: 0, cursor: 'default' }}
                          />
                        ))}
                        {(p.tags ?? []).length > 4 && (
                          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>+{(p.tags ?? []).length - 4}</span>
                        )}
                      </div>
                    )}
                    <button
                      title="Gerenciar tags"
                      onClick={e => {
                        e.stopPropagation()
                        setPopoverPatientId(p.id)
                      }}
                      className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all"
                      style={{ background: 'rgba(196,163,90,0.08)', border: '1px solid rgba(196,163,90,0.2)', color: '#C4A35A' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(196,163,90,0.2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(196,163,90,0.08)')}
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                    </button>
                  </div>

                  <span className="text-sm font-light self-center" style={{ color: 'rgba(255,255,255,0.4)' }}>{p.whatsapp || '—'}</span>
                  <div className="self-center"><ScoreMini score={p.skinspan_score} /></div>
                  <div className="self-center"><TierBadge tier={club?.tier} /></div>
                  <span className="text-sm font-light self-center" style={{ color: 'rgba(255,255,255,0.28)' }}>{fmtDate(p.created_at)}</span>
                  <div className="self-center"><StatusBadge active={!!club} /></div>
                </div>
              )
            })
          )}
        </div>

        {!loading && filtered.length > 0 && (
          <p className="text-[11px] text-right" style={{ color: 'rgba(255,255,255,0.18)' }}>
            {filtered.length} de {patients.length} paciente{patients.length !== 1 ? 's' : ''}
          </p>
        )}
      </main>

      {/* Tag popover */}
      {popoverPatientId && (() => {
        const pop = patients.find(p => p.id === popoverPatientId)
        return pop ? (
          <TagPopover
            patient={pop}
            clinicCustomTags={clinicCustomTags}
            onSave={(patientId, tags) => {
              setPatients(prev => prev.map(p => p.id === patientId ? { ...p, tags } : p))
            }}
            onClose={() => setPopoverPatientId(null)}
            onCustomTagCreated={tag => setClinicCustomTags(prev => [...prev, tag])}
          />
        ) : null
      })()}

      {/* New patient modal */}
      {modalOpen && (
        <NewPatientModal
          userId={userId}
          onClose={() => setModalOpen(false)}
          onSuccess={() => {
            setModalOpen(false)
            if (userId) loadPatients(userId, search)
          }}
        />
      )}

      {/* Import modal */}
      {importOpen && (
        <ImportModal
          userId={userId}
          onClose={() => setImportOpen(false)}
          onSuccess={() => {
            if (userId) loadPatients(userId, search)
          }}
        />
      )}
    </div>
  )
}
