export type StatusEvento = 'aberto' | 'fechado'
export type Presenca = 'confirmado' | 'talvez' | 'nao_vou'
export type StatusPagamento = 'pendente' | 'informado' | 'pago'

export const ROTULO_PRESENCA: Record<Presenca, string> = {
  confirmado: 'Vou',
  talvez: 'Talvez',
  nao_vou: 'Não vou',
}

export type Evento = {
  id: string
  titulo: string
  descricao: string | null
  data_hora: string
  local: string | null
  maps_url: string | null
  valor: number | null
  chave_pix: string | null
  recebedor_nome: string | null
  recebedor_cidade: string | null
  avisos: string | null
  status: StatusEvento
  /** true = Pix gerado pelo Mercado Pago e confirmado automaticamente */
  pix_automatico: boolean
  criado_em: string
}

/** O que qualquer visitante consegue ver (sem telefone, token nem pagamento). */
export type InscricaoPublica = {
  id: string
  evento_id: string
  nome: string
  presenca: Presenca
  criado_em: string
}

/** Visão completa, só para admins. */
export type Inscricao = InscricaoPublica & {
  telefone: string
  pagamento: StatusPagamento
  token: string
  mp_payment_id: string | null
  pago_em: string | null
}

export const COLUNAS_PUBLICAS = 'id,evento_id,nome,presenca,criado_em'

export type ListaItem = {
  id: string
  lista_id: string
  texto: string
  criado_em: string
  lista_marcacoes: { inscricao_id: string }[]
}

export type Lista = {
  id: string
  evento_id: string
  titulo: string
  criado_em: string
  lista_itens: ListaItem[]
}

/** Lista com itens e quem marcou cada um, numa consulta só. */
export const SELECT_LISTAS = 'id,evento_id,titulo,criado_em,lista_itens(id,lista_id,texto,criado_em,lista_marcacoes(inscricao_id))'

export type TipoNotificacao = 'resposta' | 'pagamento'

export type Notificacao = {
  id: string
  evento_id: string | null
  tipo: TipoNotificacao
  mensagem: string
  lida: boolean
  criado_em: string
}
