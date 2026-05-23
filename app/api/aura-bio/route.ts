import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase-server'

interface AuraBioInput {
  paciente_id:    string
  sono:           number
  estresse:       number
  hidratacao:     string
  alimentacao:    string
  exposicao_solar: string
  protetor_solar: boolean
}

interface AuraBioResult {
  risco:           'baixo' | 'medio' | 'alto'
  score_lifestyle: number
  interpretacao:   string
  ajuste_protocolo: string
  tratamento_mes:  string
  alerta:          string | null
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as AuraBioInput
  const { paciente_id, sono, estresse, hidratacao, alimentacao, exposicao_solar, protetor_solar } = body

  if (!paciente_id) return NextResponse.json({ error: 'paciente_id obrigatório' }, { status: 400 })

  // ── Buscar dados do paciente ──────────────────────────────────────────────

  const { data: paciente, error: pErr } = await supabase
    .from('pacientes')
    .select('id, nome, skinspan_data, aura_bio_history')
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
    .limit(6)

  // ── Montar contexto ───────────────────────────────────────────────────────

  const tratamentosRecentes = planos
    ?.map(p => `• ${p.mes}: ${p.tratamento} (${p.status})`)
    .join('\n') || 'Nenhum tratamento registrado'

  const skinspanInfo = paciente.skinspan_data
    ? `Score Skinspan: ${(paciente.skinspan_data as { score: number }).score}/100`
    : 'Skinspan Score não calculado'

  const sonoDesc     = sono <= 4 ? 'muito insuficiente' : sono <= 6 ? 'insuficiente' : sono <= 8 ? 'adequado' : 'excelente'
  const estresseDesc = estresse >= 8 ? 'muito alto' : estresse >= 6 ? 'alto' : estresse >= 4 ? 'moderado' : 'baixo'

  const hidracaoLabel:   Record<string, string> = { otima: 'ótima', boa: 'boa', regular: 'regular', ruim: 'ruim' }
  const alimentacaoLabel: Record<string, string> = { muito_saudavel: 'muito saudável', saudavel: 'saudável', regular: 'regular', ruim: 'ruim' }
  const exposicaoLabel:  Record<string, string> = { baixa: 'baixa', moderada: 'moderada', alta: 'alta', muito_alta: 'muito alta' }

  // ── Prompt ────────────────────────────────────────────────────────────────

  const prompt = `Você é o Protocolo Aura Bio do LeadSim Beauty.
Com base nos dados de lifestyle e histórico de tratamentos, gere uma recomendação personalizada de ajuste no protocolo estético.

Dados de lifestyle:
- Sono: ${sono}/10 (${sonoDesc})
- Estresse: ${estresse}/10 (${estresseDesc})
- Hidratação: ${hidracaoLabel[hidratacao] ?? hidratacao}
- Alimentação: ${alimentacaoLabel[alimentacao] ?? alimentacao}
- Exposição solar: ${exposicaoLabel[exposicao_solar] ?? exposicao_solar}
- Usa protetor solar: ${protetor_solar ? 'sim' : 'não'}

Dados clínicos:
- ${skinspanInfo}

Histórico de tratamentos:
${tratamentosRecentes}

Critérios de risco:
- baixo: sono ≥7, estresse ≤4, hidratação boa/ótima, alimentação saudável/muito saudável, usa protetor solar
- alto: sono ≤4 OU estresse ≥8 OU não usa protetor com exposição alta/muito alta
- medio: demais casos

Para score_lifestyle: 100 = lifestyle perfeito para a pele. Descontar por sono ruim, estresse alto, hidratação ruim, alimentação ruim, exposição solar sem proteção.

Responda APENAS com JSON válido, sem markdown, sem texto adicional:
{
  "risco": "baixo",
  "score_lifestyle": <número 0-100>,
  "interpretacao": "<2-3 frases explicando o impacto do lifestyle na pele>",
  "ajuste_protocolo": "<1-2 frases com ajuste recomendado no protocolo>",
  "tratamento_mes": "<tratamento específico recomendado para o próximo mês>",
  "alerta": "<alerta importante se houver, ou null>"
}`

  // ── Chamar Claude ─────────────────────────────────────────────────────────

  let result: AuraBioResult

  try {
    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 512,
      messages:   [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : ''
    result = JSON.parse(raw.trim()) as AuraBioResult
    result.score_lifestyle = Math.max(0, Math.min(100, Math.round(result.score_lifestyle)))
  } catch {
    return NextResponse.json(
      { error: 'Erro ao processar resposta da IA. Verifique a ANTHROPIC_API_KEY.' },
      { status: 502 }
    )
  }

  // ── Salvar histórico ──────────────────────────────────────────────────────

  const historyEntry = {
    ...result,
    anamnese: { sono, estresse, hidratacao, alimentacao, exposicao_solar, protetor_solar },
    data: new Date().toISOString(),
  }

  const existingHistory = (paciente.aura_bio_history as typeof historyEntry[] | null) ?? []
  const updatedHistory  = [...existingHistory, historyEntry].slice(-12)

  await supabase
    .from('pacientes')
    .update({ aura_bio_history: updatedHistory })
    .eq('id', paciente_id)
    .eq('clinica_id', user.id)

  return NextResponse.json(result)
}
