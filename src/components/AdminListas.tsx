import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Lista } from '../lib/types'
import { mensagemErro } from '../lib/util'
import { buscarListas } from './ListasEvento'
import { useModal } from './Modal'

type Props = {
  eventoId: string
  /** inscricao_id -> nome */
  nomes: Map<string, string>
}

const separarItens = (texto: string) =>
  texto
    .split(/\n|,/)
    .map((t) => t.trim())
    .filter(Boolean)

export default function AdminListas({ eventoId, nomes }: Props) {
  const [listas, setListas] = useState<Lista[]>([])
  const [titulo, setTitulo] = useState('')
  const [itens, setItens] = useState('')
  const [novoItem, setNovoItem] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const { avisar, confirmar } = useModal()

  const carregar = useCallback(() => buscarListas(eventoId).then(setListas), [eventoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function criarLista(e: FormEvent) {
    e.preventDefault()
    const textos = separarItens(itens)
    if (!titulo.trim()) return avisar('Falta a pergunta', 'Escreva a pergunta da lista, por exemplo "Quem vai levar comida?".')
    if (textos.length === 0) return avisar('Faltam as opções', 'Coloque pelo menos uma opção, por exemplo Salgado, Refrigerante, Doce.')
    setSalvando(true)
    const { data, error } = await supabase
      .from('listas')
      .insert({ evento_id: eventoId, titulo: titulo.trim() })
      .select('id')
      .single()
    if (error) {
      setSalvando(false)
      return avisar('Não deu para criar a lista', mensagemErro(error))
    }
    const res = await supabase.from('lista_itens').insert(textos.map((texto) => ({ lista_id: data.id, texto })))
    setSalvando(false)
    if (res.error) avisar('A lista foi criada, mas as opções não', mensagemErro(res.error))
    setTitulo('')
    setItens('')
    carregar()
  }

  async function adicionarItem(listaId: string) {
    const textos = separarItens(novoItem[listaId] ?? '')
    if (textos.length === 0) return avisar('Falta a opção', 'Digite o nome da opção antes de adicionar.')
    const { error } = await supabase.from('lista_itens').insert(textos.map((texto) => ({ lista_id: listaId, texto })))
    if (error) return avisar('Não deu para adicionar', mensagemErro(error))
    setNovoItem((n) => ({ ...n, [listaId]: '' }))
    carregar()
  }

  async function removerItem(id: string, texto: string) {
    if (!(await confirmar({ titulo: `Remover "${texto}"?`, mensagem: 'Quem marcou essa opção também sai da lista.', ok: 'Remover', perigo: true }))) return
    const { error } = await supabase.from('lista_itens').delete().eq('id', id)
    if (error) avisar('Não deu para remover', mensagemErro(error))
    carregar()
  }

  async function excluirLista(lista: Lista) {
    if (!(await confirmar({ titulo: `Excluir a lista "${lista.titulo}"?`, mensagem: 'As opções e as marcações serão apagadas.', ok: 'Excluir', perigo: true }))) return
    const { error } = await supabase.from('listas').delete().eq('id', lista.id)
    if (error) avisar('Não deu para excluir a lista', mensagemErro(error))
    carregar()
  }

  return (
    <section className="card">
      <h3>📝 Listas</h3>

      {listas.map((lista) => (
        <div key={lista.id} className="admin-lista">
          <div className="admin-lista-topo">
            <strong>{lista.titulo}</strong>
            <button className="link-perigo" onClick={() => excluirLista(lista)}>
              excluir lista
            </button>
          </div>
          <ul className="lista-itens">
            {lista.lista_itens.map((item) => {
              const quem = item.lista_marcacoes.map((m) => nomes.get(m.inscricao_id)).filter(Boolean)
              return (
                <li key={item.id}>
                  <strong>{item.texto}</strong>
                  <span className="item-quem">
                    {quem.length ? quem.join(', ') : 'ninguém ainda'}
                    <button className="link-perigo" onClick={() => removerItem(item.id, item.texto)}>
                      remover
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="linha-inline">
            <input
              value={novoItem[lista.id] ?? ''}
              onChange={(e) => setNovoItem((n) => ({ ...n, [lista.id]: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && adicionarItem(lista.id)}
              placeholder="Nova opção"
            />
            <button className="btn" onClick={() => adicionarItem(lista.id)}>
              + Adicionar
            </button>
          </div>
        </div>
      ))}

      <form className="form" onSubmit={criarLista}>
        <label>
          Nova lista
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Quem vai levar comida?" maxLength={120} />
        </label>
        <label>
          Opções (uma por linha ou separadas por vírgula)
          <textarea value={itens} onChange={(e) => setItens(e.target.value)} rows={3} placeholder={'Salgado\nRefrigerante\nDoce'} />
        </label>
        <button className="btn" disabled={salvando}>
          {salvando ? 'Criando…' : 'Criar lista'}
        </button>
      </form>
    </section>
  )
}
