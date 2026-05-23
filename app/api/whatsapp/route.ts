import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'
import Anthropic                     from '@anthropic-ai/sdk'
import { sendWhatsAppMessage }       from '@/lib/whatsapp'

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? 'leadsim_beauty_verify_2026'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── GET — webhook verification ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ── POST — incoming messages ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ status: 'ok' })

  const entry   = body?.entry?.[0]
  const change  = entry?.changes?.[0]?.value
  const message = change?.messages?.[0]

  // Only handle inbound text messages
  if (!message || message.type !== 'text') {
    return NextResponse.json({ status: 'ok' })
  }

  const from      = String(message.from)
  const conteudo  = String(message.text.body)
  const timestamp = parseInt(message.timestamp, 10) * 1000
  const supabase  = serviceClient()

  // ── Find patient by WhatsApp ──────────────────────────────────────────────

  const { data: paciente } = await supabase
    .from('pacientes')
    .select('id, nome, clinica_id, aura_memory, skinspan_data')
    .or(`whatsapp.eq.${from},whatsapp.eq.+${from}`)
    .limit(1)
    .maybeSingle()

  let pacienteId: string
  let clinicaId:  string
  let nomePaciente = change?.contacts?.[0]?.profile?.name ?? 'Lead'

  if (!paciente) {
    // Auto-create lead
    const fallbackClinicaId = process.env.WHATSAPP_CLINICA_ID ?? ''
    if (!fallbackClinicaId || fallbackClinicaId === 'placeholder') {
      return NextResponse.json({ status: 'ok' }) // can't assign without a clinic
    }

    const { data: lead } = await supabase
      .from('pacientes')
      .insert({
        nome:       nomePaciente,
        whatsapp:   from,
        clinica_id: fallbackClinicaId,
        created_at: new Date(timestamp).toISOString(),
      })
      .select('id, clinica_id')
      .single()

    if (!lead) return NextResponse.json({ status: 'ok' })
    pacienteId = lead.id
    clinicaId  = lead.clinica_id
  } else {
    pacienteId   = paciente.id
    clinicaId    = paciente.clinica_id
    nomePaciente = paciente.nome
  }

  // ── Save incoming message ─────────────────────────────────────────────────

  await supabase.from('mensagens').insert({
    paciente_id: pacienteId,
    clinica_id:  clinicaId,
    direcao:     'entrada',
    conteudo,
    created_at:  new Date(timestamp).toISOString(),
  })

  // ── Get recent history for context ───────────────────────────────────────

  const { data: historico } = await supabase
    .from('mensagens')
    .select('direcao, conteudo, created_at')
    .eq('paciente_id', pacienteId)
    .order('created_at', { ascending: false })
    .limit(10)

  const { data: clinica } = await supabase
    .from('clinicas')
    .select('nome')
    .eq('id', clinicaId)
    .single()

  // ── Generate and send AI response ─────────────────────────────────────────

  const resposta = await generateResponse({
    pacienteNome: nomePaciente,
    aura_memory:  paciente?.aura_memory ?? null,
    skinspan_data: paciente?.skinspan_data ?? null,
    mensagem:     conteudo,
    historico:    (historico ?? []).reverse(),
    clinicaNome:  clinica?.nome ?? 'LeadSim Beauty',
  })

  await sendWhatsAppMessage(from, resposta)

  await supabase.from('mensagens').insert({
    paciente_id: pacienteId,
    clinica_id:  clinicaId,
    direcao:     'saida',
    conteudo:    resposta,
    created_at:  new Date().toISOString(),
  })

  return NextResponse.json({ status: 'ok' })
}

// ── BeautyAI response generator ───────────────────────────────────────────

async function generateResponse({
  pacienteNome,
  aura_memory,
  skinspan_data,
  mensagem,
  historico,
  clinicaNome,
}: {
  pacienteNome:  string
  aura_memory:   unknown
  skinspan_data: unknown
  mensagem:      string
  historico:     { direcao: string; conteudo: string }[]
  clinicaNome:   string
}): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const mem = aura_memory as Record<string, unknown> | null
  const memCtx = mem
    ? [
        mem.estilo_desejado && `Estilo: ${mem.estilo_desejado}`,
        Array.isArray(mem.objetivos) && `Objetivos: ${(mem.objetivos as string[]).join(', ')}`,
        Array.isArray(mem.medos)     && `Medos: ${(mem.medos as string[]).join(', ')}`,
      ].filter(Boolean).join(' | ')
    : 'Não disponível'

  const skinCtx = (skinspan_data as { score?: number } | null)?.score
    ? `Score ${(skinspan_data as { score: number }).score}/100`
    : 'Não calculado'

  const systemPrompt = `Você é a assistente virtual da clínica ${clinicaNome}.
Responda sempre em português brasileiro, de forma calorosa e profissional.
Você conhece esta paciente: ${pacienteNome}
Perfil Aura Memory: ${memCtx}
Skinspan Score: ${skinCtx}

Regras:
- Nunca mencione que é uma IA
- Se perguntarem sobre procedimentos, explique os benefícios
- Se quiserem agendar, ofereça-se para verificar horários disponíveis
- Seja consultiva, nunca vendedora agressiva
- Máximo 3 frases por resposta no WhatsApp`

  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    ...historico.slice(-8).map(h => ({
      role:    (h.direcao === 'saida' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: h.conteudo,
    })),
    { role: 'user', content: mensagem },
  ]

  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 256,
      system:     systemPrompt,
      messages,
    })
    return response.content[0].type === 'text'
      ? response.content[0].text
      : 'Olá! Como posso ajudar você hoje?'
  } catch {
    return 'Olá! Recebi sua mensagem. Em breve nossa equipe entrará em contato. 😊'
  }
}
