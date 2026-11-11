// Gera o Pix de uma inscrição no Mercado Pago e informa se já foi pago.
//
// POST { acao: 'criar' | 'status', inscricao: uuid, token: uuid }
//  - criar  -> { pago, qr_code, qr_base64, expira_em }
//  - status -> { pago }
//
// O token é o segredo salvo no celular de quem se inscreveu: sem ele ninguém
// consegue gerar ou consultar o Pix de outra pessoa.
import { chamarMp, cors, dataMp, json, sincronizarPagamento, supabaseAdmin, type PagamentoMp } from '../_shared/mercadopago.ts'

const VALIDADE_MS = 24 * 3600_000 // o Pix vale 24 horas; depois gera outro

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405)

  try {
    const { acao, inscricao: inscricaoId, token } = await req.json()
    if (!inscricaoId || !token) return json({ erro: 'Inscrição não informada.' }, 400)

    const db = supabaseAdmin()
    const { data: inscricao, error } = await db
      .from('inscricoes')
      .select('id, nome, presenca, pagamento, token, mp_payment_id, mp_qr_code, mp_qr_base64, mp_expira_em, eventos(id, titulo, valor, pix_automatico)')
      .eq('id', inscricaoId)
      .maybeSingle()
    if (error) throw error
    if (!inscricao || inscricao.token !== token) return json({ erro: 'Inscrição não encontrada neste aparelho.' }, 403)

    const evento = inscricao.eventos as unknown as {
      id: string
      titulo: string
      valor: number | null
      pix_automatico: boolean
    }
    if (inscricao.pagamento === 'pago') return json({ pago: true })

    if (acao === 'status') {
      // Se o webhook atrasar, confere direto no Mercado Pago
      if (inscricao.mp_payment_id) {
        const { pago } = await sincronizarPagamento(inscricao.mp_payment_id)
        return json({ pago })
      }
      return json({ pago: false })
    }

    if (acao !== 'criar') return json({ erro: 'Ação inválida.' }, 400)
    if (!evento?.pix_automatico) return json({ erro: 'Este rolê não usa Pix automático.' }, 400)
    if (!evento.valor || evento.valor <= 0) return json({ erro: 'Este rolê é gratuito.' }, 400)
    if (inscricao.presenca !== 'confirmado') return json({ erro: 'Só quem respondeu "Vou" paga o Pix.' }, 400)

    // Reaproveita o Pix gerado antes, enquanto ainda vale (com 10 min de folga)
    const aindaVale = inscricao.mp_expira_em && new Date(inscricao.mp_expira_em).getTime() - Date.now() > 10 * 60_000
    if (inscricao.mp_payment_id && inscricao.mp_qr_code && aindaVale) {
      return json({
        pago: false,
        qr_code: inscricao.mp_qr_code,
        qr_base64: inscricao.mp_qr_base64,
        expira_em: inscricao.mp_expira_em,
      })
    }

    const emailPagador = Deno.env.get('MP_EMAIL_PAGADOR')
    if (!emailPagador) throw new Error('MP_EMAIL_PAGADOR não configurado nos secrets do Supabase')

    const expiraMs = Date.now() + VALIDADE_MS
    const urlWebhook = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-webhook`
    const pagamento = await chamarMp<PagamentoMp>('/v1/payments', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        transaction_amount: Number(evento.valor),
        description: `${evento.titulo} — ${inscricao.nome}`.slice(0, 200),
        payment_method_id: 'pix',
        external_reference: inscricao.id,
        notification_url: urlWebhook,
        date_of_expiration: dataMp(expiraMs),
        payer: {
          // O Mercado Pago exige um e-mail do pagador; como o app não pede e-mail,
          // usa um endereço fixo da organização (não pode ser o da conta que recebe).
          email: emailPagador,
          first_name: inscricao.nome.split(' ')[0],
        },
      }),
    })

    const dados = pagamento.point_of_interaction?.transaction_data
    if (!dados?.qr_code) throw new Error('O Mercado Pago não devolveu o código Pix.')

    const expiraEm = new Date(expiraMs).toISOString()
    await db
      .from('inscricoes')
      .update({
        mp_payment_id: String(pagamento.id),
        mp_qr_code: dados.qr_code,
        mp_qr_base64: dados.qr_code_base64 ?? null,
        mp_expira_em: expiraEm,
      })
      .eq('id', inscricao.id)

    return json({ pago: false, qr_code: dados.qr_code, qr_base64: dados.qr_code_base64 ?? null, expira_em: expiraEm })
  } catch (e) {
    console.error(e)
    return json({ erro: e instanceof Error ? e.message : 'Erro inesperado.' }, 500)
  }
})
