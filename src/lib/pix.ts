/**
 * Gera o código Pix "copia e cola" (BR Code / padrão EMV do Banco Central).
 * Não depende de banco nem de API: usa só a chave Pix do recebedor.
 *
 * Formatos de chave aceitos (normalizarChavePix arruma pontuação e o +55):
 *  - CPF/CNPJ: com ou sem pontuação
 *  - E-mail: como está
 *  - Telefone: +55 + DDD + número (ex.: +5542999998888)
 *  - Chave aleatória: o UUID completo
 */

function campo(id: string, valor: string): string {
  return id + valor.length.toString().padStart(2, '0') + valor
}

function normalizar(texto: string, max: number): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase()
    .trim()
    .slice(0, max)
}

export function crc16(payload: string): string {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  const digito = (ate: number) => {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (ate + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10])
}

export type ChavePix = { chave: string; tipo: string } | { erro: string }

/** Deixa a chave no formato que os bancos esperam e diz qual tipo foi detectado. */
export function normalizarChavePix(bruta: string): ChavePix {
  const texto = bruta.trim()
  if (!texto) return { erro: 'Informe a chave Pix.' }

  if (texto.includes('@')) return { chave: texto.toLowerCase(), tipo: 'E-mail' }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto)) {
    return { chave: texto.toLowerCase(), tipo: 'Chave aleatória' }
  }

  if (/[a-z]/i.test(texto)) return { erro: 'Chave não reconhecida. Confira se digitou certo.' }

  const digitos = texto.replace(/\D/g, '')
  const erroTelefone = 'Telefone precisa ter +55, DDD e número (ex.: +5542999998888).'

  if (texto.startsWith('+')) {
    return /^55\d{10,11}$/.test(digitos) ? { chave: '+' + digitos, tipo: 'Telefone' } : { erro: erroTelefone }
  }
  if (digitos.length === 11 && cpfValido(digitos)) return { chave: digitos, tipo: 'CPF' }
  if (digitos.length === 11 || digitos.length === 10) return { chave: '+55' + digitos, tipo: 'Telefone' }
  if (digitos.length === 13 && digitos.startsWith('55')) return { chave: '+' + digitos, tipo: 'Telefone' }
  if (digitos.length === 14) return { chave: digitos, tipo: 'CNPJ' }

  return { erro: 'Chave não reconhecida. Use CPF, CNPJ, e-mail, telefone com +55 ou chave aleatória.' }
}

export type DadosPix = {
  chave: string
  nome: string
  cidade: string
  valor?: number | null
  /** Identificador da cobrança (até 25 letras/números). Ajuda a conferir no extrato. */
  txid?: string
}

export function gerarPixCopiaECola({ chave, nome, cidade, valor, txid }: DadosPix): string {
  const normalizada = normalizarChavePix(chave)
  const chaveFinal = 'chave' in normalizada ? normalizada.chave : chave.replace(/\s/g, '')
  const contaPix = campo('00', 'br.gov.bcb.pix') + campo('01', chaveFinal)
  const tx = txid ? txid.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***' : '***'

  const semCrc =
    campo('00', '01') +
    campo('26', contaPix) +
    campo('52', '0000') +
    campo('53', '986') +
    (valor && valor > 0 ? campo('54', valor.toFixed(2)) : '') +
    campo('58', 'BR') +
    campo('59', normalizar(nome, 25) || 'RECEBEDOR') +
    campo('60', normalizar(cidade, 15) || 'CIDADE') +
    campo('62', campo('05', tx)) +
    '6304'

  return semCrc + crc16(semCrc)
}
