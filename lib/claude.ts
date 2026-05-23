import Anthropic from '@anthropic-ai/sdk'
import type { Paciente } from '@/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export async function gerarMensagemPersonalizada(
  paciente: Paciente,
  contexto: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: `Você é um assistente especializado em relacionamento com clientes de clínicas de estética.
Crie mensagens personalizadas, calorosas e profissionais para WhatsApp.
Use o nome do paciente. Seja conciso (máximo 3 parágrafos curtos).`,
    messages: [
      {
        role: 'user',
        content: `Paciente: ${paciente.nome}
SkinSpan Score: ${paciente.skinspan_score ?? 'não avaliado'}
Contexto: ${contexto}

Gere uma mensagem personalizada para enviar via WhatsApp.`,
      },
    ],
  })

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Resposta inesperada do Claude')
  return block.text
}
