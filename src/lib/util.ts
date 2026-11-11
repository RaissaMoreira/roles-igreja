import type { Evento, Presenca } from './types'

export function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "sábado, 21 de novembro" */
export function dataExtenso(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
}

/** Texto com uma informação por linha -> lista (tira "-", "•" do começo). */
export function linhasDeTexto(texto: string): string[] {
  return texto
    .split('\n')
    .map((l) => l.replace(/^\s*[-•*●]\s*/, '').trim())
    .filter(Boolean)
}

export function dataCurta(iso: string): { dia: string; mes: string; hora: string } {
  const d = new Date(iso)
  return {
    dia: d.toLocaleDateString('pt-BR', { day: '2-digit' }),
    mes: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
    hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  }
}

export function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** ISO -> valor aceito por <input type="datetime-local"> (no fuso local) */
export function paraInputDataHora(iso: string): string {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function linkMaps(local: string | null, mapsUrl: string | null): string | null {
  if (mapsUrl) return mapsUrl
  if (local) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(local)}`
  return null
}

export function linkWhatsApp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`
}

/** Junta as linhas tirando linhas vazias repetidas (e as do começo/fim). */
export function juntarLinhas(linhas: string[]): string {
  return linhas
    .filter((l, idx, arr) => !(l === '' && (idx === 0 || arr[idx - 1] === '')))
    .join('\n')
    .trim()
}

/** Convite completo para mandar no WhatsApp. */
export function textoConvite(evento: Evento, link: string): string {
  const maps = linkMaps(evento.local, evento.maps_url)
  return juntarLinhas([
    `🔥 *${evento.titulo}*`,
    '',
    evento.descricao ?? '',
    '',
    `📅 ${dataHora(evento.data_hora)}`,
    evento.local ? `📍 ${evento.local}` : '',
    maps ? `🗺️ ${maps}` : '',
    `💰 ${evento.valor ? `${moeda(evento.valor)} por pessoa` : 'Gratuito'}`,
    '',
    evento.avisos ? `📌 *Importante:*\n${evento.avisos}` : '',
    '',
    `Confirma presença aqui 👉 ${link}`,
  ])
}

export async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = texto
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export function lerLocal(chave: string): string | null {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}

export function salvarLocal(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor)
  } catch {
    /* navegador sem storage: tudo bem */
  }
}

/** Inscrição feita neste navegador (o token permite dizer "já paguei" e marcar listas). */
export type MinhaInscricao = {
  id: string
  token: string | null
  presenca: Presenca | null
  pagou: boolean
}

export function lerInscricao(eventoId: string): MinhaInscricao | null {
  const bruto = lerLocal(`inscricao:${eventoId}`)
  if (!bruto) return null
  try {
    const salvo = JSON.parse(bruto)
    if (salvo && typeof salvo.id === 'string') {
      return { id: salvo.id, token: salvo.token ?? null, presenca: salvo.presenca ?? null, pagou: Boolean(salvo.pagou) }
    }
  } catch {
    /* versão antiga: só o id, sem aspas */
  }
  return { id: bruto, token: null, presenca: null, pagou: false }
}

export function salvarInscricao(eventoId: string, inscricao: MinhaInscricao): void {
  salvarLocal(`inscricao:${eventoId}`, JSON.stringify(inscricao))
}

/** Só os dígitos do telefone, no máximo 11 (DDD + número). */
export function digitosTelefone(texto: string): string {
  const d = texto.replace(/\D/g, '')
  // número colado com +55 na frente
  return (d.length > 11 && d.startsWith('55') ? d.slice(2) : d).slice(0, 11)
}

/** "42999998888" -> "(42) 99999-8888" (vai formatando enquanto a pessoa digita). */
export function formatarTelefone(texto: string): string {
  const d = digitosTelefone(texto)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/**
 * Aplica a máscara no onChange. Se a pessoa apagou só um caractere da máscara
 * ("-", ")" ou espaço), apaga também o dígito antes dele — senão o campo "trava".
 */
export function mascararTelefone(novo: string, anterior: string): string {
  let d = digitosTelefone(novo)
  if (novo.length < anterior.length && d === digitosTelefone(anterior)) d = d.slice(0, -1)
  return formatarTelefone(d)
}

const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])

/** Enquanto digita: só deixa maiúscula a primeira letra de cada palavra. */
export function capitalizarDigitando(texto: string): string {
  return texto.replace(/(^|\s)(\p{L})/gu, (_, espaco: string, letra: string) => espaco + letra.toUpperCase())
}

/** Ao salvar: "maria DA silva" -> "Maria da Silva". */
export function capitalizarNome(texto: string): string {
  return texto
    .trim()
    .split(/\s+/)
    .map((p, i) => {
      const min = p.toLocaleLowerCase('pt-BR')
      if (i > 0 && PARTICULAS.has(min)) return min
      return min.charAt(0).toLocaleUpperCase('pt-BR') + min.slice(1)
    })
    .join(' ')
}

/** Traduz os erros mais comuns do Supabase para algo que dá para entender e resolver. */
export function mensagemErro(erro: { message?: string; code?: string } | null | undefined): string {
  const msg = erro?.message ?? ''
  if (msg.includes('schema cache') || erro?.code === 'PGRST204' || erro?.code === '42703') {
    return 'O banco de dados está desatualizado. Rode o arquivo supabase/schema.sql no SQL Editor do Supabase e tente de novo.'
  }
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
    return 'Sem conexão com a internet. Confira sua conexão e tente de novo.'
  }
  if (erro?.code === '42501' || msg.includes('row-level security') || msg.includes('permission denied')) {
    return 'Sem permissão para fazer isso. Se você é da organização, saia e entre de novo.'
  }
  if (msg.includes('JWT')) return 'Sua sessão expirou. Saia e entre de novo.'
  return msg || 'Erro desconhecido. Tente de novo.'
}
