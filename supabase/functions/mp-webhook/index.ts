// Recebe os avisos do Mercado Pago ("o pagamento X mudou") e marca a inscrição como paga.
// Publicar com --no-verify-jwt: o Mercado Pago não manda o token do Supabase.
//
// Segurança: o status nunca é lido do aviso. A função sempre consulta o pagamento
// direto na API do Mercado Pago com o Access Token, então um aviso falso não marca
// ninguém como pago. Se MP_WEBHOOK_SECRET estiver configurado, a assinatura também é conferida.
import { json, sincronizarPagamento } from '../_shared/mercadopago.ts'

async function assinaturaValida(req: Request, dataId: string): Promise<boolean> {
  const segredo = Deno.env.get('MP_WEBHOOK_SECRET')
  if (!segredo) return true

  const assinatura = req.headers.get('x-signature') ?? ''
  const requestId = req.headers.get('x-request-id') ?? ''
  const partes = Object.fromEntries(assinatura.split(',').map((p) => p.trim().split('=') as [string, string]))
  if (!partes.ts || !partes.v1) return false

  const manifesto = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${partes.ts};`
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const assinado = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(manifesto))
  const hex = [...new Uint8Array(assinado)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex === partes.v1
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const corpo = req.method === 'POST' ? await req.json().catch(() => ({})) : {}

  const tipo = corpo?.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic')
  const dataId = String(corpo?.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '')

  // Outros tipos de aviso (assinaturas, etc.) não interessam: responde 200 para o MP não reenviar
  if (tipo !== 'payment' || !dataId) return json({ ok: true, ignorado: true })

  if (!(await assinaturaValida(req, dataId))) {
    console.warn('Assinatura inválida no webhook', dataId)
    return json({ erro: 'assinatura inválida' }, 401)
  }

  try {
    const resultado = await sincronizarPagamento(dataId)
    return json({ ok: true, ...resultado })
  } catch (e) {
    console.error(e)
    // 500 faz o Mercado Pago tentar de novo mais tarde
    return json({ erro: e instanceof Error ? e.message : 'erro' }, 500)
  }
})
