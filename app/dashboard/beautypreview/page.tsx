'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

interface Paciente {
  id:   string
  nome: string
}

interface SimResult {
  imagemSimulada: string
  descricao:      string
}

interface HistoryEntry {
  data:           string
  tratamentos:    string[]
  imagemOriginal: string
  descricao:      string
}

// ── Constants ──────────────────────────────────────────────────────────────

const TRATAMENTOS = [
  { id: 'botox',                label: 'Botox' },
  { id: 'lip_filler',           label: 'Preenchimento Labial' },
  { id: 'malar_filler',         label: 'Preenchimento Malar' },
  { id: 'lifting',              label: 'Lifting' },
  { id: 'bichectomy',           label: 'Bichectomia' },
  { id: 'facial_harmonization', label: 'Harmonização Facial' },
]

// ── Page ───────────────────────────────────────────────────────────────────

export default function BeautyPreviewPage() {
  const [pacientes,    setPacientes]    = useState<Paciente[]>([])
  const [loadingPats,  setLoadingPats]  = useState(true)
  const [selectedId,   setSelectedId]   = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [imageBase64,  setImageBase64]  = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isDragging,   setIsDragging]   = useState(false)
  const [tratamentos,  setTratamentos]  = useState<string[]>([])
  const [simulating,   setSimulating]   = useState(false)
  const [result,       setResult]       = useState<SimResult | null>(null)
  const [history,      setHistory]      = useState<HistoryEntry[]>([])
  const [error,        setError]        = useState('')
  const [saved,        setSaved]        = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Load patients ─────────────────────────────────────────────────────────

  const loadPacientes = useCallback(async () => {
    setLoadingPats(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoadingPats(false); return }
    const { data } = await supabase
      .from('pacientes')
      .select('id, nome, beautypreview_history')
      .eq('clinica_id', user.id)
      .order('nome', { ascending: true })
    setPacientes((data as Paciente[]) ?? [])
    setLoadingPats(false)
    return data
  }, [])

  useEffect(() => { loadPacientes() }, [loadPacientes])

  // ── When patient changes, load their history ──────────────────────────────

  async function handleSelectPatient(id: string) {
    setSelectedId(id)
    const found = pacientes.find(p => p.id === id)
    setSelectedName(found?.nome ?? '')
    setResult(null)
    setSaved(false)
    setError('')

    if (!id) { setHistory([]); return }
    const supabase = createClient()
    const { data } = await supabase
      .from('pacientes')
      .select('beautypreview_history')
      .eq('id', id)
      .single()
    const h = (data?.beautypreview_history as HistoryEntry[] | null) ?? []
    setHistory(h.slice().reverse().slice(0, 6))
  }

  // ── Image handling ────────────────────────────────────────────────────────

  function processImage(file: File) {
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      setError('Use JPEG ou PNG com menos de 10MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      const b64 = e.target?.result as string
      setImageBase64(b64)
      setImagePreview(b64)
      setResult(null)
      setSaved(false)
      setError('')
    }
    reader.readAsDataURL(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processImage(file)
  }

  // ── Toggle tratamento ─────────────────────────────────────────────────────

  function toggleTratamento(id: string) {
    setTratamentos(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
    setResult(null)
    setSaved(false)
  }

  // ── Simulate ──────────────────────────────────────────────────────────────

  async function handleSimulate() {
    if (!selectedId || !imageBase64 || !tratamentos.length) return
    setSimulating(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/beautypreview', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          imageBase64,
          tratamentos,
          pacienteId:   selectedId,
          pacienteNome: selectedName,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro na simulação')
      setResult(data as SimResult)
      await handleSelectPatient(selectedId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setSimulating(false)
    }
  }

  // ── Save simulation ───────────────────────────────────────────────────────

  async function handleSave() {
    if (!result || !selectedId) return
    setSaved(true)
  }

  // ── Share via WhatsApp ────────────────────────────────────────────────────

  function handleShare() {
    if (!result) return
    const text = encodeURIComponent(
      `Olá! Veja a simulação do seu tratamento estético:\n\n${result.descricao}`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  const canSimulate = !!selectedId && !!imageBase64 && tratamentos.length > 0 && !simulating

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">

      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="font-serif text-3xl" style={{ color: '#C4A35A' }}>BeautyPreview™</h1>
          <span
            className="text-[10px] tracking-[0.25em] uppercase px-2.5 py-1 rounded-full font-medium"
            style={{ background: 'rgba(196,163,90,0.12)', color: '#C4A35A', border: '1px solid rgba(196,163,90,0.3)' }}
          >
            IA • SIMULAÇÃO VISUAL
          </span>
        </div>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Simule o resultado de tratamentos estéticos antes de realizá-los
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Left: form ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Patient */}
          <div className="rounded-2xl p-5 space-y-4"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h2 className="font-serif text-base" style={{ color: '#F0EDE8' }}>Configuração</h2>

            <div>
              <label className="block text-[11px] tracking-widest uppercase mb-2"
                style={{ color: 'rgba(196,163,90,0.7)' }}>Paciente</label>
              <select
                value={selectedId}
                onChange={e => handleSelectPatient(e.target.value)}
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
                  <option key={p.id} value={p.id} style={{ background: '#0F0F14' }}>{p.nome}</option>
                ))}
              </select>
            </div>

            {/* Photo upload */}
            <div>
              <label className="block text-[11px] tracking-widest uppercase mb-2"
                style={{ color: 'rgba(196,163,90,0.7)' }}>Foto do paciente</label>

              {imagePreview ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-32 h-32 rounded-full overflow-hidden"
                    style={{ border: '2px solid rgba(196,163,90,0.4)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                  </div>
                  <button
                    onClick={() => { setImageBase64(null); setImagePreview(null); setResult(null) }}
                    className="text-xs px-3 py-1.5 rounded-lg transition-all"
                    style={{ color: 'rgba(239,68,68,0.6)', border: '1px solid rgba(239,68,68,0.2)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'rgba(239,68,68,0.9)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(239,68,68,0.6)')}
                  >
                    Remover foto
                  </button>
                </div>
              ) : (
                <div
                  className="rounded-xl flex flex-col items-center justify-center gap-3 py-8 cursor-pointer transition-all"
                  style={{
                    border: `2px dashed ${isDragging ? 'rgba(196,163,90,0.6)' : 'rgba(196,163,90,0.2)'}`,
                    background: isDragging ? 'rgba(196,163,90,0.06)' : 'transparent',
                  }}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C4A35A"
                    strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.6">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Arraste ou <span style={{ color: '#C4A35A' }}>clique para selecionar</span>
                    <br />
                    <span style={{ color: 'rgba(255,255,255,0.2)' }}>JPEG / PNG · máx 10MB</span>
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) processImage(f) }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Treatments */}
          <div className="rounded-2xl p-5"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h2 className="font-serif text-base mb-4" style={{ color: '#F0EDE8' }}>Tratamentos</h2>
            <div className="grid grid-cols-2 gap-2">
              {TRATAMENTOS.map(t => {
                const active = tratamentos.includes(t.id)
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTratamento(t.id)}
                    className="px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-all"
                    style={{
                      background: active ? 'rgba(196,163,90,0.14)' : 'rgba(255,255,255,0.03)',
                      border:     `1px solid ${active ? 'rgba(196,163,90,0.45)' : 'rgba(255,255,255,0.07)'}`,
                      color:      active ? '#C4A35A' : 'rgba(255,255,255,0.45)',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
                  >
                    <span className="mr-1.5">{active ? '✦' : '○'}</span>
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {error && (
            <p className="text-xs px-3 py-2 rounded-lg"
              style={{ background: 'rgba(244,67,54,0.08)', color: '#f87171', border: '1px solid rgba(244,67,54,0.2)' }}>
              {error}
            </p>
          )}

          <button
            onClick={handleSimulate}
            disabled={!canSimulate}
            className="w-full py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: canSimulate ? '#C4A35A' : 'rgba(196,163,90,0.3)', color: '#0A0A0D' }}
            onMouseEnter={e => { if (canSimulate) e.currentTarget.style.background = '#D4B87A' }}
            onMouseLeave={e => { if (canSimulate) e.currentTarget.style.background = '#C4A35A' }}
          >
            {simulating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                Simulando...
              </span>
            ) : '✦ Simular tratamento'}
          </button>
        </div>

        {/* ── Right: result ── */}
        <div className="lg:col-span-3 space-y-5">

          {result ? (
            <>
              {/* Before / After */}
              <div className="rounded-2xl overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(196,163,90,0.15)' }}>
                <div className="grid grid-cols-2">
                  {[
                    { label: 'Antes', src: imagePreview },
                    { label: 'Depois', src: result.imagemSimulada },
                  ].map(({ label, src }) => (
                    <div key={label} className="relative">
                      <div className="aspect-square overflow-hidden"
                        style={{ background: 'rgba(0,0,0,0.4)' }}>
                        {src && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt={label} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 px-3 py-2"
                        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)' }}>
                        <span className="text-xs tracking-widest uppercase font-medium"
                          style={{ color: '#C4A35A' }}>{label}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Divider line */}
                <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: 'rgba(196,163,90,0.4)' }} />
              </div>

              {/* Description */}
              <div className="rounded-2xl p-5"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[10px] tracking-widest uppercase mb-2" style={{ color: 'rgba(196,163,90,0.6)' }}>
                  Resultado esperado
                </p>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  {result.descricao}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={saved}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-60"
                  style={{ background: saved ? 'rgba(76,175,80,0.15)' : '#C4A35A', color: saved ? '#4CAF50' : '#0A0A0D', border: saved ? '1px solid rgba(76,175,80,0.3)' : 'none' }}
                  onMouseEnter={e => { if (!saved) e.currentTarget.style.background = '#D4B87A' }}
                  onMouseLeave={e => { if (!saved) e.currentTarget.style.background = '#C4A35A' }}
                >
                  {saved ? '✓ Simulação salva' : 'Salvar simulação'}
                </button>
                <button
                  onClick={handleShare}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{ background: 'rgba(37,211,102,0.1)', color: '#25D366', border: '1px solid rgba(37,211,102,0.25)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(37,211,102,0.18)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(37,211,102,0.1)')}
                >
                  Compartilhar via WhatsApp
                </button>
              </div>
            </>
          ) : (
            <div className="min-h-[360px] rounded-2xl flex flex-col items-center justify-center gap-3"
              style={{ border: '1px dashed rgba(196,163,90,0.12)' }}>
              <div className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(196,163,90,0.06)', border: '1px solid rgba(196,163,90,0.15)' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C4A35A"
                  strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity="0.55">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </div>
              <p className="font-serif text-lg" style={{ color: 'rgba(255,255,255,0.18)' }}>
                {!selectedId ? 'Selecione um paciente' : !imageBase64 ? 'Adicione uma foto' : 'Selecione os tratamentos'}
              </p>
              <p className="text-xs text-center max-w-xs" style={{ color: 'rgba(255,255,255,0.12)' }}>
                Configure as opções ao lado e clique em Simular
              </p>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div className="rounded-2xl p-5"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <h2 className="font-serif text-base mb-4" style={{ color: '#F0EDE8' }}>Histórico de simulações</h2>
              <div className="space-y-2">
                {history.map((h, i) => (
                  <div key={i}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div className="w-full h-full flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(196,163,90,0.5)"
                          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>
                        {h.tratamentos?.map(t => TRATAMENTOS.find(x => x.id === t)?.label ?? t).join(', ')}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {new Date(h.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
