import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pacienteId = req.nextUrl.searchParams.get('paciente_id')
  let query = supabase
    .from('mensagens')
    .select('*')
    .eq('clinica_id', user.id)
    .order('created_at', { ascending: true })

  if (pacienteId) query = query.eq('paciente_id', pacienteId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { paciente_id, conteudo, direcao } = body

  const { data, error } = await supabase
    .from('mensagens')
    .insert({ clinica_id: user.id, paciente_id, conteudo, direcao })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
