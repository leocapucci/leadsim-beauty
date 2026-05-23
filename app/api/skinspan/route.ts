import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, imageUrl, idade, pacienteId, pacienteNome } = await req.json()

    // 1. Chama Perfect Corp. API
    const pcPayload = {
      src_file_url: imageUrl ?? imageBase64,
      format: 'json',
      pf_camera_kit: false,
      miniserver_args: { enable_mask_overlay: false },
      dst_actions: [
        {
          action: 'skin_concern_sd',
          args: {
            concerns: ['wrinkle', 'firmness', 'oiliness', 'texture', 'pore', 'dark_circle', 'redness', 'radiance']
          }
        }
      ]
    }

    const pcRes = await fetch('https://us-central-api.perfectcorp.com/s2s/v1/task/async/face/skin-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.PERFECTCORP_API_KEY!,
      },
      body: JSON.stringify(pcPayload)
    })

    const pcData = await pcRes.json()
    const output = pcData?.data?.results?.output?.[0] ?? {}

    // 2. Extrai métricas
    const metricas: Record<string, number> = {
      rugas:       output.wrinkle?.ui_score       ?? 50,
      firmeza:     output.firmness?.ui_score      ?? 50,
      oleosidade:  output.oiliness?.ui_score      ?? 50,
      textura:     output.texture?.ui_score       ?? 50,
      poros:       output.pore?.ui_score          ?? 50,
      olheiras:    output.dark_circle?.ui_score   ?? 50,
      vermelhidao: output.redness?.ui_score       ?? 50,
      radiancia:   output.radiance?.ui_score      ?? 50,
    }

    // 3. Calcula skinspanAge
    const mediaScore = Object.values(metricas).reduce((a, b) => a + b, 0) / Object.values(metricas).length
    const skinspanAge = Math.round(idade + ((50 - mediaScore) / 5))
    const diferenca = idade - skinspanAge

    // 4. Gera texto personalizado via Claude
    const metricasTexto = Object.entries(metricas)
      .map(([k, v]) => `${k}: ${v}/100`)
      .join(', ')

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Você é a IA do LeadSim Beauty. Gere uma mensagem personalizada e sofisticada para ${pacienteNome}, ${idade} anos, cujo Skinspan Score™ indica que sua pele tem comportamento de ${skinspanAge} anos (${diferenca >= 0 ? `${diferenca} anos mais jovem` : `${Math.abs(diferenca)} anos mais velha`} que a idade cronológica). Métricas da análise: ${metricasTexto}. Máximo 120 palavras, tom acolhedor e motivador. Mencione 2 pontos fortes e 1 área de atenção.`
      }]
    })

    const texto = msg.content[0].type === 'text' ? msg.content[0].text : ''

    // 5. Salva no Supabase
    const supabase = createServerClient()
    const { data: paciente } = await supabase
      .from('pacientes')
      .select('beautyscore_history')
      .eq('id', pacienteId)
      .single()

    const history = (paciente?.beautyscore_history as unknown[]) ?? []
    history.push({
      data: new Date().toISOString(),
      skinspanAge,
      diferenca,
      metricas,
      texto
    })

    await supabase
      .from('pacientes')
      .update({ beautyscore_history: history })
      .eq('id', pacienteId)

    return NextResponse.json({ skinspanAge, diferenca, metricas, texto })

  } catch (err) {
    console.error('Skinspan error:', err)
    return NextResponse.json({ error: 'Erro na análise' }, { status: 500 })
  }
}
