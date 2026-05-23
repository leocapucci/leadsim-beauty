import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'

interface PatientTag { id: string; label: string; cor: string; custom?: boolean }

// PATCH — update tags for a patient
export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { paciente_id, tags } = await req.json() as { paciente_id: string; tags: PatientTag[] }

  const { data, error } = await supabase
    .from('pacientes')
    .update({ tags })
    .eq('id', paciente_id)
    .eq('clinica_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// GET — return unique custom tags used across all clinic patients
export async function GET() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: patients } = await supabase
    .from('pacientes')
    .select('tags')
    .eq('clinica_id', user.id)

  const customTagsMap = new Map<string, PatientTag>()
  for (const p of (patients ?? [])) {
    for (const tag of ((p.tags as PatientTag[] | null) ?? [])) {
      if (tag.custom && !customTagsMap.has(tag.id)) customTagsMap.set(tag.id, tag)
    }
  }

  return NextResponse.json({ customTags: Array.from(customTagsMap.values()) })
}
