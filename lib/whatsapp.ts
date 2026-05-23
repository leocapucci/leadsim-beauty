const WHATSAPP_API_URL = 'https://graph.facebook.com/v19.0'

function isConfigured(): boolean {
  const token   = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_ID
  return !!(token && phoneId && token !== 'placeholder' && phoneId !== 'placeholder')
}

export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  if (!isConfigured()) {
    console.warn('[WhatsApp] Credenciais não configuradas — mensagem não enviada para', to)
    return
  }

  const res = await fetch(`${WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method:  'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => null)
    console.error('[WhatsApp] Erro ao enviar mensagem:', err)
  }
}

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode = 'pt_BR',
  components: unknown[] = []
): Promise<void> {
  if (!isConfigured()) {
    console.warn('[WhatsApp] Credenciais não configuradas — template não enviado para', to)
    return
  }

  const res = await fetch(`${WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method:  'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => null)
    console.error('[WhatsApp] Erro ao enviar template:', err)
  }
}
