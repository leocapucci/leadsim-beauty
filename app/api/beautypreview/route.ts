import { NextRequest, NextResponse } from 'next/server'
import Anthropic              from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const TRATAMENTO_LABEL: Record<string, string> = {
  botox:               'Botox',
  lip_filler:          'Preenchimento Labial',
  malar_filler:        'Preenchimento Malar',
  lifting:             'Lifting',
  bichectomy:          'Bichectomia',
  facial_harmonization:'Harmonização Facial',
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { imageBase64, tratamentos, pacienteId, pacienteNome } = await req.json() as {
      imageBase64: string
      tratamentos: string[]
      pacienteId:  string
      pacienteNome:string
    }

    if (!imageBase64 || !tratamentos?.length || !pacienteId) {
      return NextResponse.json({ error: 'imageBase64, tratamentos e pacienteId são obrigatórios' }, { status: 400 })
    }

    // 1. Perfect Corp. Skin Simulation API
    const pcRes = await fetch('https://us-central-api.perfectcorp.com/s2s/v1/task/async/face/skin-simulation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.PERFECTCORP_API_KEY!,
      },
      body: JSON.stringify({
        src_file_url: imageBase64,
        format:       'json',
        dst_actions:  tratamentos.map((t: string) => ({ action: t })),
      }),
    })

    const pcData = await pcRes.json()
    const imagemSimulada: string =
      pcData?.data?.results?.output?.[0]?.result_url ??
      pcData?.data?.output_url ??
      imageBase64

    // 2. Claude — descrição do resultado esperado
    const tratsLabel = tratamentos.map(t => TRATAMENTO_LABEL[t] ?? t).join(', ')

    const msg = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 220,
      messages: [{
        role:    'user',
        content: `Você é especialista em estética facial do LeadSim Beauty. Descreva de forma sofisticada e acolhedora o resultado esperado para ${pacienteNome} após a simulação dos seguintes procedimentos: ${tratsLabel}. Mencione o impacto visual natural, a harmonia facial e os benefícios. Máximo 100 palavras, tom positivo e profissional.`,
      }],
    })

    const descricao = msg.content[0].type === 'text' ? msg.content[0].text : ''

    // 3. Salva histórico no Supabase
    const { data: paciente } = await supabase
      .from('pacientes')
      .select('beautypreview_history')
      .eq('id', pacienteId)
      .single()

    const history = ((paciente?.beautypreview_history as unknown[]) ?? [])
    history.push({
      data:           new Date().toISOString(),
      tratamentos,
      imagemOriginal: imageBase64.slice(0, 80),
      imagemSimulada: imagemSimulada.slice(0, 80),
      descricao,
    })

    await supabase
      .from('pacientes')
      .update({ beautypreview_history: history })
      .eq('id', pacienteId)
      .eq('clinica_id', user.id)

    return NextResponse.json({ imagemSimulada, descricao })

  } catch (err) {
    console.error('BeautyPreview error:', err)
    return NextResponse.json({ error: 'Erro na simulação' }, { status: 500 })
  }
}
