import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase-server'

interface AuraStackTratamento {
  ordem:      number
  nome:       string
  categoria:  string
  frequencia: string
  objetivo:   string
  sinergias:  string
}

interface AuraStackResult {
  estacao:           string
  stack_nome:        string
  tratamentos:       AuraStackTratamento[]
  ticket_estimado:   string
  duracao_protocolo: string
  resultado_esperado: string
  contraindicacoes:  string | null
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

function getEstacaoAtual(): string {
  const month = new Date().getMonth() + 1 // 1-12
  if ([12, 1, 2, 3].includes(month)) return 'Verão'
  if ([4, 5].includes(month))        return 'Outono'
  if ([6, 7, 8].includes(month))     return 'Inverno'
  return 'Primavera'
}

const ESTACAO_DICAS: Record<string, string> = {
  Verão:     'hidratação intensa, fotoproteção, controle de oleosidade e melasma',
  Outono:    'reparação pós-verão, antioxidantes, preparação para o inverno',
  Inverno:   'nutrição profunda, rejuvenescimento, estimulação celular e colágeno',
  Primavera: 'renovação celular, iluminação, controle pigmentar e detox',
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { paciente_id } = await req.json() as { paciente_id: string }
  if (!paciente_id) return NextResponse.json({ error: 'paciente_id obrigatório' }, { status: 400 })

  // ── Buscar dados do paciente ──────────────────────────────────────────────

  const { data: paciente, error: pErr } = await supabase
    .from('pacientes')
    .select('id, nome, aura_memory, skinspan_data, aura_bio_history')
    .eq('id', paciente_id)
    .eq('clinica_id', user.id)
    .single()

  if (pErr || !paciente) {
    return NextResponse.json({ error: 'Paciente não encontrado' }, { status: 404 })
  }

  const { data: planos } = await supabase
    .from('planos_aura')
    .select('mes, tratamento, status')
    .eq('paciente_id', paciente_id)
    .order('mes', { ascending: false })
    .limit(8)

  // ── Montar contexto ───────────────────────────────────────────────────────

  const estacao = getEstacaoAtual()

  const memRaw = paciente.aura_memory as Record<string, unknown> | null
  let memContext = 'Não preenchida'
  if (memRaw) {
    const partes: string[] = []
    if (memRaw.estilo_desejado) partes.push(`Estilo: ${memRaw.estilo_desejado}`)
    if (Array.isArray(memRaw.areas_evitadas) && memRaw.areas_evitadas.length)
      partes.push(`Áreas evitadas: ${(memRaw.areas_evitadas as string[]).join(', ')}`)
    if (Array.isArray(memRaw.preferencias) && memRaw.preferencias.length)
      partes.push(`Preferências: ${(memRaw.preferencias as string[]).join(', ')}`)
    if (Array.isArray(memRaw.medos) && memRaw.medos.length)
      partes.push(`Medos: ${(memRaw.medos as string[]).join(', ')}`)
    if (Array.isArray(memRaw.objetivos) && memRaw.objetivos.length)
      partes.push(`Objetivos: ${(memRaw.objetivos as string[]).join(', ')}`)
    if (memRaw.observacoes) partes.push(`Obs: ${memRaw.observacoes}`)
    memContext = partes.join(' | ')
  }

  const skinspanRaw = paciente.skinspan_data as { score: number; interpretacao: string } | null
  const skinspanContext = skinspanRaw
    ? `Score ${skinspanRaw.score}/100 — ${skinspanRaw.interpretacao}`
    : 'Não calculado'

  const bioHistRaw = paciente.aura_bio_history as { score_lifestyle: number; risco: string; tratamento_mes: string }[] | null
  const bioContext = bioHistRaw?.slice(-2)
    .map(b => `• Lifestyle ${b.score_lifestyle}/100 (${b.risco}) → ${b.tratamento_mes}`)
    .join('\n') || 'Sem histórico Aura Bio'

  const planosContext = planos
    ?.map(p => `• ${p.mes}: ${p.tratamento} (${p.status})`)
    .join('\n') || 'Sem tratamentos anteriores'

  // ── Prompt ────────────────────────────────────────────────────────────────

  const prompt = `Você é o Aura Stack™ do LeadSim Beauty.
Monte um protocolo combinado de tratamentos estéticos para esta paciente com base no perfil completo.

Estação atual: ${estacao} (foco em ${ESTACAO_DICAS[estacao]})
Skinspan Score: ${skinspanContext}
Perfil Aura Memory: ${memContext}
Histórico Aura Bio: ${bioContext}
Tratamentos anteriores: ${planosContext}

Diretrizes obrigatórias:
- RESPEITE as áreas evitadas e medos registrados
- ADAPTE ao estilo desejado (se natural, evite intervenções invasivas desnecessárias)
- Monte entre 3 e 5 tratamentos sinérgicos e complementares
- A ordem deve refletir a sequência lógica de aplicação no mesmo dia OU ao longo do mês
- Considere a sazonalidade: ${estacao} exige foco em ${ESTACAO_DICAS[estacao]}
- O ticket_estimado deve ser realista para clínicas brasileiras de estética premium

Responda APENAS com JSON válido, sem markdown, sem texto adicional:
{
  "estacao": "${estacao}",
  "stack_nome": "<nome criativo e sofisticado do protocolo, ex: 'Protocolo Aurora Boreal'>",
  "tratamentos": [
    {
      "ordem": 1,
      "nome": "<nome do tratamento>",
      "categoria": "<Limpeza | Peeling | Bioestimulação | Preenchimento | Toxina Botulínica | Laser | Hidratação | Massagem | Outro>",
      "frequencia": "<ex: 1x por mês | quinzenal | sessão única>",
      "objetivo": "<objetivo específico deste tratamento no protocolo>",
      "sinergias": "<como potencializa os outros tratamentos do stack>"
    }
  ],
  "ticket_estimado": "<ex: R$ 1.400 — R$ 2.200 por ciclo completo>",
  "duracao_protocolo": "<ex: 3 meses | 6 semanas>",
  "resultado_esperado": "<2-3 frases sobre o resultado após o protocolo completo>",
  "contraindicacoes": "<contraindicações relevantes ou null>"
}`

  // ── Chamar Claude ─────────────────────────────────────────────────────────

  let result: AuraStackResult

  try {
    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      messages:   [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : ''
    result = JSON.parse(raw.trim()) as AuraStackResult
  } catch {
    return NextResponse.json(
      { error: 'Erro ao processar resposta da IA. Verifique a ANTHROPIC_API_KEY.' },
      { status: 502 }
    )
  }

  return NextResponse.json(result)
}
