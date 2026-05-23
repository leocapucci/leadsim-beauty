import { NextResponse }         from 'next/server'
import Anthropic                from '@anthropic-ai/sdk'
import { createServerClient }   from '@/lib/supabase-server'

interface WeeklySnapshot {
  semana:   string
  data:     string
  score:    number
  detalhes: {
    captacao:    number
    retencao:    number
    recorrencia: number
    engajamento: number
  }
  status: 'excelente' | 'bom' | 'regular' | 'atenção'
}

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function scoreStatus(s: number): WeeklySnapshot['status'] {
  if (s >= 75) return 'excelente'
  if (s >= 50) return 'bom'
  if (s >= 30) return 'regular'
  return 'atenção'
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function GET() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Collect metrics ───────────────────────────────────────────────────────

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data: patIds } = await supabase
    .from('pacientes')
    .select('id, created_at')
    .eq('clinica_id', user.id)

  const idSet = new Set((patIds ?? []).map(p => p.id))
  const total = idSet.size
  const novos = (patIds ?? []).filter(p => new Date(p.created_at) >= sevenDaysAgo).length

  const { data: membros } = await supabase
    .from('membros_beautyclub')
    .select('valor, status, paciente_id')
    .eq('status', 'ativo')

  const membrosClinica = (membros ?? []).filter(m => idSet.has(m.paciente_id))
  const mrr            = membrosClinica.reduce((s, m) => s + (m.valor ?? 0), 0)
  const membrosAtivos  = membrosClinica.length

  // ── Sub-scores (0-25 each → 0-100 total) ─────────────────────────────────

  const captacao    = Math.min(25, Math.round((novos / 5) * 25))
  const conversao   = total > 0 ? Math.min(25, Math.round((membrosAtivos / total) * 25)) : 0
  const retencao    = membrosAtivos > 0 ? Math.min(25, Math.round((mrr / (membrosAtivos * 200)) * 25)) : 0
  const faturamento = Math.min(25, Math.round((mrr / 1000) * 25))
  const score       = captacao + conversao + retencao + faturamento

  // ── Fetch clinic info + existing history ──────────────────────────────────

  const { data: clinica } = await supabase
    .from('clinicas')
    .select('nome, beautyscore_history')
    .eq('id', user.id)
    .single()

  // ── Claude: 3 priority actions ────────────────────────────────────────────

  const FALLBACK_ACOES = [
    captacao  < 15 ? `Cadastre novos pacientes: meta de ${Math.max(1, 5 - novos)} esta semana para subir o score de captação` : `Mantenha o ritmo de captação — ${novos} novos pacientes em 7 dias`,
    conversao < 15 ? `Converta ${Math.max(1, Math.round(total * 0.1))} pacientes para o BeautyClub esta semana` : `Faça upsell de tier nos ${membrosAtivos} membros atuais do BeautyClub`,
    retencao  < 15 ? `Aumente o ticket médio: encoraje upgrades de tier para elevar o MRR atual de R$${mrr.toFixed(0)}` : `MRR saudável em R$${mrr.toFixed(0)} — foque em reter os membros atuais`,
  ]

  let acoes: string[] = FALLBACK_ACOES

  try {
    const prompt = `Você é o BeautyScore™ do LeadSim Beauty.

Dados da clínica "${clinica?.nome ?? 'Clínica'}":
- BeautyScore™: ${score}/100
- Captação: ${captacao}/25 (${novos} novos pacientes em 7 dias)
- Conversão: ${conversao}/25 (${membrosAtivos}/${total} pacientes convertidos ao BeautyClub)
- Retenção: ${retencao}/25 (ticket médio BeautyClub: R$${membrosAtivos > 0 ? (mrr / membrosAtivos).toFixed(0) : 0}/membro)
- Faturamento: ${faturamento}/25 (MRR: R$${mrr.toFixed(0)})

Gere 3 ações prioritárias concretas e específicas para esta semana. Foque nos scores mais baixos. Seja direto, prático, máximo 15 palavras por ação.

Responda APENAS com JSON válido, sem markdown:
{"acoes":["<ação 1>","<ação 2>","<ação 3>"]}`

    const msg = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 200,
      messages:   [{ role: 'user', content: prompt }],
    })
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
    acoes = (JSON.parse(raw.trim()) as { acoes: string[] }).acoes
  } catch { /* use fallback */ }

  // ── Build weekly snapshot ─────────────────────────────────────────────────

  const now      = new Date()
  const semana   = getISOWeek(now)
  const snapshot: WeeklySnapshot = {
    semana,
    data:     now.toISOString().slice(0, 10),
    score,
    detalhes: { captacao, retencao, recorrencia: conversao, engajamento: faturamento },
    status:   scoreStatus(score),
  }

  const raw      = (clinica?.beautyscore_history as WeeklySnapshot[] | null) ?? []
  const valid    = raw.filter(h => typeof h.semana === 'string' && h.semana.includes('-W'))
  const filtered = valid.filter(h => h.semana !== semana)
  const updated  = [...filtered, snapshot].slice(-12)

  await supabase.from('clinicas').update({ beautyscore_history: updated }).eq('id', user.id)

  return NextResponse.json({
    score, captacao, conversao, retencao, faturamento, acoes,
    semana, status: snapshot.status,
    history: updated,
  })
}
