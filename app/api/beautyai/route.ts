import { NextRequest, NextResponse } from 'next/server'
import Anthropic                     from '@anthropic-ai/sdk'
import { createServerClient }        from '@/lib/supabase-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ── GET — status + stats ───────────────────────────────────────────────────

export async function GET() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const connected = !!(
    process.env.WHATSAPP_TOKEN    && process.env.WHATSAPP_TOKEN    !== 'placeholder' &&
    process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_PHONE_ID !== 'placeholder'
  )

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  const { data: msgs } = await supabase
    .from('mensagens')
    .select('direcao, created_at')
    .eq('clinica_id', user.id)
    .gte('created_at', hoje.toISOString())

  const total   = msgs?.length ?? 0
  const entrada = msgs?.filter(m => m.direcao === 'entrada').length ?? 0
  const saida   = msgs?.filter(m => m.direcao === 'saida').length   ?? 0
  const taxa    = entrada > 0 ? Math.round((saida / entrada) * 100) : 0

  const webhookUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL
    ? 'https://leadsim-beauty.vercel.app'
    : 'http://localhost:3000'}/api/whatsapp`

  return NextResponse.json({ connected, webhookUrl, stats: { total, entrada, saida, taxa } })
}

// ── POST — generate BeautyAI response ────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { paciente_id, mensagem, historico, tom } = await req.json() as {
    paciente_id: string
    mensagem:    string
    historico?:  { direcao: string; conteudo: string }[]
    tom?:        'formal' | 'casual' | 'tecnico'
  }

  if (!paciente_id || !mensagem) {
    return NextResponse.json({ error: 'paciente_id e mensagem são obrigatórios' }, { status: 400 })
  }

  const { data: paciente } = await supabase
    .from('pacientes')
    .select('nome, aura_memory, skinspan_data')
    .eq('id', paciente_id)
    .eq('clinica_id', user.id)
    .single()

  if (!paciente) return NextResponse.json({ error: 'Paciente não encontrado' }, { status: 404 })

  const { data: clinica } = await supabase
    .from('clinicas')
    .select('nome')
    .eq('id', user.id)
    .single()

  const { data: planos } = await supabase
    .from('planos_aura')
    .select('mes, tratamento, status')
    .eq('paciente_id', paciente_id)
    .order('mes', { ascending: false })
    .limit(3)

  const { data: beautyclub } = await supabase
    .from('membros_beautyclub')
    .select('tier')
    .eq('paciente_id', paciente_id)
    .single()

  const mem = paciente.aura_memory as Record<string, unknown> | null
  const memCtx = mem
    ? [
        mem.estilo_desejado && `Estilo: ${mem.estilo_desejado}`,
        Array.isArray(mem.objetivos) && `Objetivos: ${(mem.objetivos as string[]).join(', ')}`,
        Array.isArray(mem.medos)     && `Medos: ${(mem.medos as string[]).join(', ')}`,
        Array.isArray(mem.preferencias) && `Preferências: ${(mem.preferencias as string[]).join(', ')}`,
      ].filter(Boolean).join(' | ')
    : 'Não disponível'

  const skinCtx = (paciente.skinspan_data as { score?: number } | null)?.score
    ? `Score ${(paciente.skinspan_data as { score: number }).score}/100`
    : 'Não calculado'

  const planosCtx = planos?.map(p => `${p.mes}: ${p.tratamento} (${p.status})`).join(', ') || 'Nenhum'

  const tomDesc = {
    formal:   'profissional e formal. Use linguagem cuidadosa, evite gírias e emojis.',
    casual:   'descontraído e amigável. Use emojis moderadamente, seja próxima.',
    tecnico:  'técnico e consultivo. Mencione nomes de procedimentos e explique mecanismos de ação.',
  }[tom ?? 'casual']

  const systemPrompt = `Você é a assistente virtual da clínica ${clinica?.nome ?? 'LeadSim Beauty'}.
Responda sempre em português brasileiro, de forma ${tomDesc}
Você conhece esta paciente: ${paciente.nome}
Perfil Aura Memory: ${memCtx}
Skinspan Score: ${skinCtx}
Tier BeautyClub: ${beautyclub?.tier ?? 'não membro'}
Próximos tratamentos no plano: ${planosCtx}

Regras:
- Nunca mencione que é uma IA
- Se perguntarem sobre procedimentos, explique os benefícios
- Se quiserem agendar, ofereça-se para verificar horários disponíveis
- Seja consultiva, nunca vendedora agressiva
- Máximo 3 frases por resposta no WhatsApp`

  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    ...(historico ?? []).slice(-8).map(h => ({
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

    const resposta = response.content[0].type === 'text'
      ? response.content[0].text
      : 'Olá! Como posso ajudar você hoje?'

    return NextResponse.json({ resposta })
  } catch {
    return NextResponse.json(
      { error: 'Erro ao gerar resposta da IA.' },
      { status: 502 }
    )
  }
}
