import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { gerarMensagemPersonalizada } from '@/lib/claude'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { paciente_id, contexto } = body

  const { data: paciente, error } = await supabase
    .from('pacientes')
    .select('*')
    .eq('id', paciente_id)
    .eq('clinica_id', user.id)
    .single()

  if (error || !paciente) return NextResponse.json({ error: 'Paciente não encontrado' }, { status: 404 })

  const mensagem = await gerarMensagemPersonalizada(paciente, contexto)
  return NextResponse.json({ mensagem })
}
