import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useModal } from './Modal'
import { SELECT_LISTAS, type Lista } from '../lib/types'
import { mensagemErro, type MinhaInscricao } from '../lib/util'

type Props = {
  eventoId: string
  /** inscricao_id -> nome */
  nomes: Map<string, string>
  minha: MinhaInscricao | null
}

export async function buscarListas(eventoId: string): Promise<Lista[]> {
  const { data } = await supabase
    .from('listas')
    .select(SELECT_LISTAS)
    .eq('evento_id', eventoId)
    .order('criado_em')
    .order('criado_em', { referencedTable: 'lista_itens' })
  return (data ?? []) as Lista[]
}

/** Listas do tipo "Quem vai levar comida?" na página do evento. */
export default function ListasEvento({ eventoId, nomes, minha }: Props) {
  const [listas, setListas] = useState<Lista[]>([])
  const [salvando, setSalvando] = useState<string | null>(null)
  const { avisar } = useModal()

  const carregar = useCallback(() => buscarListas(eventoId).then(setListas), [eventoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (listas.length === 0) return null

  const podeMarcar = Boolean(minha?.token && minha.presenca !== 'nao_vou')

  async function alternar(itemId: string, marcar: boolean) {
    if (!minha?.token) return
    setSalvando(itemId)
    const { error } = await supabase.rpc('marcar_item', {
      p_inscricao: minha.id,
      p_token: minha.token,
      p_item: itemId,
      p_marcar: marcar,
    })
    setSalvando(null)
    if (error) avisar('Não deu para marcar', mensagemErro(error))
    carregar()
  }

  return (
    <>
      {listas.map((lista) => (
        <section key={lista.id} className="card col-5">
          <h3>{lista.titulo}</h3>
          <ul className="lista-itens">
            {lista.lista_itens.map((item) => {
              const quem = item.lista_marcacoes.map((m) => nomes.get(m.inscricao_id)).filter(Boolean)
              const marcado = Boolean(minha && item.lista_marcacoes.some((m) => m.inscricao_id === minha.id))
              return (
                <li key={item.id}>
                  {podeMarcar ? (
                    <label className={`item-marcavel ${marcado ? 'ativa' : ''}`}>
                      <input
                        type="checkbox"
                        checked={marcado}
                        disabled={salvando === item.id}
                        onChange={() => alternar(item.id, !marcado)}
                      />
                      {item.texto}
                    </label>
                  ) : (
                    <strong>{item.texto}</strong>
                  )}
                  <span className="item-quem">{quem.length ? quem.join(', ') : 'ninguém ainda'}</span>
                </li>
              )
            })}
          </ul>
          {!minha && <p className="dica">Confirme presença para marcar o que você vai levar.</p>}
          {minha && !minha.token && (
            <p className="dica">Para marcar, use o mesmo celular em que você confirmou presença.</p>
          )}
        </section>
      ))}
    </>
  )
}
