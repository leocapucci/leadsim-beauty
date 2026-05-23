import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase-server'
import { sendWhatsAppMessage }       from '@/lib/whatsapp'

// POST — dispatch campaign (/api/beautycast { campanha_id })
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { campanha_id } = await req.json() as { campanha_id: string }
  if (!campanha_id) return NextResponse.json({ error: 'campanha_id obrigatório' }, { status: 400 })

  const { data: campanha } = await supabase
    .from('campanhas')
    .select('*')
    .eq('id', campanha_id)
    .eq('clinica_id', user.id)
    .single()

  if (!campanha) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })
  if (campanha.status === 'enviado') return NextResponse.json({ error: 'Campanha já enviada' }, { status: 409 })

  // Mark as sending
  await supabase.from('campanhas').update({ status: 'enviando' }).eq('id', campanha_id)

  // ── Resolve target patients ───────────────────────────────────────────────

  const { data: todos } = await supabase
    .from('pacientes')
    .select('id, nome, whatsapp, membros_beautyclub(tier), created_at')
    .eq('clinica_id', user.id)

  let targets = todos ?? []

  const tierOpts = ['member', 'gold', 'black']
  if (tierOpts.includes(campanha.publico)) {
    targets = targets.filter(p => {
      const tArr = p.membros_beautyclub as { tier: string }[] | null
      return Array.isArray(tArr) && tArr[0]?.tier === campanha.publico
    })
  } else if (campanha.publico === 'sem_beautyclub') {
    targets = targets.filter(p => {
      const tArr = p.membros_beautyclub as { tier: string }[] | null
      return !Array.isArray(tArr) || tArr.length === 0
    })
  } else if (campanha.publico === 'inativos') {
    const { data: msgs } = await supabase
      .from('mensagens')
      .select('paciente_id, created_at')
      .eq('clinica_id', user.id)
      .order('created_at', { ascending: false })

    const lastMsg = new Map<string, string>()
    for (const m of msgs ?? []) {
      if (!lastMsg.has(m.paciente_id)) lastMsg.set(m.paciente_id, m.created_at)
    }
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 60)

    targets = targets.filter(p => {
      const last = lastMsg.get(p.id)
      return !last || new Date(last) < cutoff
    })
  }
  // 'todos' → no filter

  // ── Send ──────────────────────────────────────────────────────────────────

  let sent = 0

  for (const p of targets) {
    await supabase.from('mensagens').insert({
      clinica_id:  user.id,
      paciente_id: p.id,
      direcao:     'saida',
      conteudo:    campanha.mensagem,
    })

    if (p.whatsapp) {
      await sendWhatsAppMessage(p.whatsapp, campanha.mensagem)
    }

    sent++
  }

  await supabase
    .from('campanhas')
    .update({ status: 'enviado', total_enviado: sent })
    .eq('id', campanha_id)

  return NextResponse.json({ ok: true, sent })
}
