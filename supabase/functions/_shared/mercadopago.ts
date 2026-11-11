// Código compartilhado pelas Edge Functions do Mercado Pago.
import { createClient } from 'jsr:@supabase/supabase-js@2'

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/** Cliente com a service role: ignora RLS, por isso só roda aqui no servidor. */
export function supabaseAdmin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
}

function tokenMp(): string {
  const token = Deno.env.get('MP_ACCESS_TOKEN')
  if (!token) throw new Error('MP_ACCESS_TOKEN não configurado nos secrets do Supabase')
  return token
}

export type PagamentoMp = {
  id: number
  status: string // pending | approved | rejected | cancelled | expired ...
  external_reference: string | null
  transaction_amount: number
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string }
  }
}

export async function chamarMp<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(`https://api.mercadopago.com${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${tokenMp()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const corpo = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    console.error('Mercado Pago respondeu', resp.status, JSON.stringify(corpo))
    throw new Error(corpo?.message ?? `Mercado Pago respondeu ${resp.status}`)
  }
  return corpo as T
}

/** Data no formato que o Mercado Pago aceita, no horário de Brasília. */
export function dataMp(ms: number): string {
  return new Date(ms - 3 * 3600_000).toISOString().replace('Z', '-03:00')
}

/**
 * Se o pagamento foi aprovado, marca a inscrição como paga.
 * Sempre consulta o Mercado Pago antes (nunca confia só no que chegou no webhook).
 */
export async function sincronizarPagamento(paymentId: string): Promise<{ pago: boolean; inscricaoId: string | null }> {
  const pagamento = await chamarMp<PagamentoMp>(`/v1/payments/${paymentId}`)
  const inscricaoId = pagamento.external_reference
  if (!inscricaoId || pagamento.status !== 'approved') return { pago: false, inscricaoId }

  const db = supabaseAdmin()
  const { error } = await db
    .from('inscricoes')
    .update({ pagamento: 'pago', pago_em: new Date().toISOString(), mp_payment_id: String(pagamento.id) })
    .eq('id', inscricaoId)
    .neq('pagamento', 'pago')
  if (error) throw error
  return { pago: true, inscricaoId }
}
