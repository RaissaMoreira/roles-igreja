import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { gerarPixCopiaECola, normalizarChavePix } from '../lib/pix'
import { copiar, moeda } from '../lib/util'
import { useModal } from './Modal'

type Props = {
  chave: string
  nome: string
  cidade: string
  valor: number
  txid?: string
}

export default function PixPagamento({ chave, nome, cidade, valor, txid }: Props) {
  const codigo = useMemo(
    () => gerarPixCopiaECola({ chave, nome, cidade, valor, txid }),
    [chave, nome, cidade, valor, txid],
  )
  const normalizada = normalizarChavePix(chave)
  const [qr, setQr] = useState('')
  const [copiado, setCopiado] = useState(false)
  const { avisar } = useModal()

  useEffect(() => {
    QRCode.toDataURL(codigo, { margin: 1, width: 240 })
      .then(setQr)
      .catch(() => setQr(''))
  }, [codigo])

  async function aoCopiar() {
    if (await copiar(codigo)) {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } else {
      avisar('Não deu para copiar', 'Seu navegador bloqueou a cópia. Use o QR Code ou a chave Pix que aparece acima.')
    }
  }

  return (
    <div className="pix">
      <p className="pix-info">
        Em nome de <strong>{nome}</strong>
      </p>
      <div className="pix-valor">{moeda(valor)}</div>
      {qr && <img className="pix-qr" src={qr} alt="QR Code do Pix" />}
      <div className="pix-chave mono">{'chave' in normalizada ? normalizada.chave : chave}</div>
      <button className="btn btn-primario btn-largo" onClick={aoCopiar}>
        {copiado ? '✓ Copiado!' : 'Copiar Pix copia e cola'}
      </button>
    </div>
  )
}
