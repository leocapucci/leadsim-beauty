import { NextRequest, NextResponse }   from 'next/server'
import Anthropic                        from '@anthropic-ai/sdk'
import { createClient as supabaseJs }   from '@supabase/supabase-js'
import { createServerClient }           from '@/lib/supabase-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

function adminClient() {
  return supabaseJs(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function todayStr() { return new Date().toISOString().slice(0, 10) }

// ── Build briefing via Claude ─────────────────────────────────────────────────

async function buildBriefing(clinicaId: string): Promise<string> {
  const admin = adminClient()

  const [
    { data: clinica },
    { data: pacientes },
    { data: membros },
    { data: campanhas },
  ] = await Promise.all([
    admin.from('clinicas').select('nome, beautyscore_history').eq('id', clinicaId).single(),
    admin.from('pacientes').select('id, created_at').eq('clinica_id', clinicaId),
    admin.from('membros_beautyclub').select('tier, status, paciente_id'),
    admin.from('campanhas').select('nome, status, created_at').order('created_at', { ascending: false }).limit(3),
  ])

  const now           = new Date()
  const sevenDaysAgo  = new Date(now.getTime() - 7  * 86400000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)

  const pacs   = pacientes ?? []
  const pacIds = new Set(pacs.map(p => p.id))
  const novos      = pacs.filter(p => new Date(p.created_at) >= sevenDaysAgo).length
  const semRetorno = pacs.filter(p => new Date(p.created_at) <= thirtyDaysAgo).length

  const membActive = (membros ?? []).filter(m => pacIds.has(m.paciente_id) && m.status === 'ativo')
  const memberN = membActive.filter(m => ['silver', 'member'].includes(m.tier ?? '')).length
  const goldN   = membActive.filter(m => m.tier === 'gold').length
  const blackN  = membActive.filter(m => ['black', 'platinum'].includes(m.tier ?? '')).length

  const bsHistory = (clinica?.beautyscore_history as { score: number; status?: string }[] | null) ?? []
  const lastScore = bsHistory[bsHistory.length - 1]

  const msg = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 500,
    system: `Você é o AI CFO™ do LeadSim Beauty — diretor financeiro e estratégico de uma clínica de estética premium.
Analise os dados operacionais da clínica e gere um briefing executivo diário em português brasileiro.

O briefing deve ter exatamente esta estrutura:
1. Saudação personalizada com o nome da clínica
2. Situação atual (2-3 frases sobre o momento da clínica baseado nos dados)
3. Alertas críticos (se houver — pacientes em risco, queda de score, campanhas paradas)
4. Top 3 recomendações priorizadas com ação clara e direta
5. Frase motivacional curta e elegante para fechar

Tom: executivo, direto, sofisticado. Sem enrolação. Máximo 250 palavras.`,
    messages: [{
      role: 'user',
      content: `Clínica: ${clinica?.nome ?? 'Clínica'}
Data: ${todayStr()}

DADOS OPERACIONAIS:
- Total de pacientes: ${pacs.length}
- Novos nos últimos 7 dias: ${novos}
- Sem retorno há 30+ dias: ${semRetorno}
- Beauty Club: ${memberN} Member | ${goldN} Gold | ${blackN} Black
- BeautyScore™ atual: ${lastScore ? `${lastScore.score}/100 (${lastScore.status ?? ''})` : 'sem dados'}
- Últimas campanhas: ${(campanhas ?? []).map(c => `${c.nome} (${c.status})`).join(', ') || 'nenhuma'}

Gere o briefing executivo diário seguindo exatamente a estrutura solicitada. Máximo 250 palavras.`,
    }],
  })

  return msg.content[0].type === 'text' ? msg.content[0].text : ''
}

// ── GET — authenticated: return saved briefing | cron: generate for all ──────

export async function GET() {
  try {
    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data: clinica } = await supabase
        .from('clinicas')
        .select('aicfo_briefing')
        .eq('id', user.id)
        .single()
      return NextResponse.json({ briefing: clinica?.aicfo_briefing ?? null })
    }
  } catch { /* cron context — no session */ }

  // Cron path: generate for every clinica that doesn't have today's briefing
  const admin = adminClient()
  const { data: clinicas } = await admin.from('clinicas').select('id, aicfo_briefing')
  const results: { id: string; status: string; error?: string }[] = []

  for (const c of (clinicas ?? [])) {
    const saved = c.aicfo_briefing as { data?: string } | null
    if (saved?.data === todayStr()) { results.push({ id: c.id, status: 'skipped' }); continue }
    try {
      const text  = await buildBriefing(c.id)
      const entry = { data: todayStr(), briefing: text, gerado_em: new Date().toISOString() }
      await admin.from('clinicas').update({ aicfo_briefing: entry }).eq('id', c.id)
      results.push({ id: c.id, status: 'generated' })
    } catch (err) {
      results.push({ id: c.id, status: 'error', error: String(err) })
    }
  }

  return NextResponse.json({ results })
}

// ── POST — generate (or return cached) briefing for authenticated user ────────

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = adminClient()
  const body  = await req.json().catch(() => ({})) as { force?: boolean }

  // Return today's cached briefing unless force=true
  if (!body.force) {
    const { data: existing } = await admin
      .from('clinicas')
      .select('aicfo_briefing')
      .eq('id', user.id)
      .single()
    const saved = existing?.aicfo_briefing as { data?: string; briefing?: string; gerado_em?: string } | null
    if (saved?.data === todayStr() && saved?.briefing) return NextResponse.json(saved)
  }

  const text  = await buildBriefing(user.id)
  const entry = { data: todayStr(), briefing: text, gerado_em: new Date().toISOString() }
  await admin.from('clinicas').update({ aicfo_briefing: entry }).eq('id', user.id)

  return NextResponse.json(entry)
}
