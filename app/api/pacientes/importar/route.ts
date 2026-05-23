import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'

interface PacienteImport {
  nome?:                   string
  whatsapp?:               string
  email?:                  string
  procedimento_interesse?: string
  cidade?:                 string
  endereco?:               string
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { pacientes: PacienteImport[] }
  const { pacientes } = body

  if (!Array.isArray(pacientes) || pacientes.length === 0) {
    return NextResponse.json({ importados: 0, duplicados: 0, erros: 0 })
  }

  // Fetch existing phones to detect duplicates
  const { data: existing } = await supabase
    .from('pacientes')
    .select('whatsapp')
    .eq('clinica_id', user.id)

  const existingPhones = new Set(
    (existing ?? []).map(p => (p.whatsapp ?? '').replace(/\D/g, '')).filter(Boolean)
  )

  let importados = 0
  let duplicados = 0
  let erros = 0

  for (const p of pacientes) {
    const phone = (p.whatsapp ?? '').replace(/\D/g, '')
    const nome  = p.nome?.trim() || 'Lead Importado'

    // Phone is required — skip if missing
    if (!phone) { erros++; continue }

    // Skip duplicate phone
    if (existingPhones.has(phone)) { duplicados++; continue }

    const row: Record<string, string> = { clinica_id: user.id, nome, status: 'lead' }
    if (phone)                    row.whatsapp               = phone
    if (p.email?.trim())          row.email                  = p.email.trim()
    if (p.procedimento_interesse?.trim()) row.procedimento_interesse = p.procedimento_interesse.trim()
    if (p.cidade?.trim())         row.cidade                 = p.cidade.trim()
    if (p.endereco?.trim())       row.endereco               = p.endereco.trim()

    const { error } = await supabase.from('pacientes').insert(row)
    if (error) {
      // Retry with only guaranteed-safe columns if unknown field caused error
      const safe = { clinica_id: user.id, nome, whatsapp: row.whatsapp ?? '' }
      const { error: e2 } = await supabase.from('pacientes').insert(safe)
      if (e2) { erros++; continue }
    }

    importados++
    if (phone) existingPhones.add(phone)
  }

  return NextResponse.json({ importados, duplicados, erros })
}
