import { useCallback, useEffect, useRef, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { copiar, moeda } from '../lib/util'
import { useModal } from './Modal'

type Props = {
  inscricaoId: string
  token: string
  valor: number
  /** chamado quando o Mercado Pago confirma o pagamento */
  onPago: () => void
}

type RespostaPix = { pago: boolean; qr_code?: string; qr_base64?: string | null; expira_em?: string; erro?: string }

const INTERVALO_CONFERENCIA_MS = 6000

async function chamar(acao: 'criar' | 'status', inscricao: string, token: string): Promise<RespostaPix> {
  const { data, error } = await supabase.functions.invoke<RespostaPix>('mp-pix', { body: { acao, inscricao, token } })
  if (error) {
    // A função devolve { erro } com a explicação; tenta ler antes de cair na mensagem genérica
    if (error instanceof FunctionsHttpError) {
      const corpo = await error.context.json().catch(() => null)
      if (corpo?.erro) throw new Error(corpo.erro)
    }
    throw new Error('Não deu para falar com o servidor de pagamento. Confira sua internet e tente de novo.')
  }
  return data!
}

/** Pix gerado pelo Mercado Pago: quando a pessoa paga, o app confirma sozinho. */
export default function PixMercadoPago({ inscricaoId, token, valor, onPago }: Props) {
  const [pix, setPix] = useState<RespostaPix | null>(null)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  const { avisar } = useModal()
  const onPagoRef = useRef(onPago)
  onPagoRef.current = onPago

  const gerar = useCallback(async () => {
    setErro('')
    setPix(null)
    try {
      const r = await chamar('criar', inscricaoId, token)
      if (r.pago) return onPagoRef.current()
      setPix(r)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado.')
    }
  }, [inscricaoId, token])

  useEffect(() => {
    gerar()
  }, [gerar, tentativa])

  // Enquanto o Pix está na tela, confere de tempos em tempos se já caiu
  useEffect(() => {
    if (!pix?.qr_code) return
    let ativo = true
    const id = setInterval(async () => {
      if (document.hidden) return
      try {
        const r = await chamar('status', inscricaoId, token)
        if (ativo && r.pago) onPagoRef.current()
      } catch {
        /* tenta de novo no próximo ciclo */
      }
    }, INTERVALO_CONFERENCIA_MS)
    return () => {
      ativo = false
      clearInterval(id)
    }
  }, [pix?.qr_code, inscricaoId, token])

  async function aoCopiar() {
    if (!pix?.qr_code) return
    if (await copiar(pix.qr_code)) {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } else {
      avisar('Não deu para copiar', 'Seu navegador bloqueou a cópia. Use o QR Code acima.')
    }
  }

  if (erro) {
    return (
      <div className="pix">
        <div className="alerta alerta-aviso">⚠ {erro}</div>
        <button className="btn btn-largo" onClick={() => setTentativa((t) => t + 1)}>
          Tentar de novo
        </button>
      </div>
    )
  }

  if (!pix) return <p className="carregando">Gerando seu Pix…</p>

  return (
    <div className="pix">
      <div className="pix-valor">{moeda(valor)}</div>
      {pix.qr_base64 && <img className="pix-qr" src={`data:image/png;base64,${pix.qr_base64}`} alt="QR Code do Pix" />}
      <div className="pix-chave mono pix-codigo">{pix.qr_code}</div>
      <button className="btn btn-primario btn-largo" onClick={aoCopiar}>
        {copiado ? '✓ Copiado!' : 'Copiar Pix copia e cola'}
      </button>
      <p className="pix-aguardando">
        <span className="ponto-pulsando" /> Assim que você pagar, a confirmação aparece aqui sozinha.
      </p>
      {pix.expira_em && (
        <p className="pix-info centro">
          Este Pix vale até{' '}
          {new Date(pix.expira_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.
        </p>
      )}
    </div>
  )
}
