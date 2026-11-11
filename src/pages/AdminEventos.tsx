import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Evento } from '../lib/types'
import { dataCurta, mensagemErro } from '../lib/util'

export default function AdminEventos() {
  const [eventos, setEventos] = useState<Evento[] | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase
      .from('eventos')
      .select('*')
      .order('data_hora', { ascending: false })
      .then(({ data, error }) => {
        if (error) setErro(mensagemErro(error))
        else setEventos((data ?? []) as Evento[])
      })
  }, [])

  const agora = Date.now()

  return (
    <>
      <div className="barra-admin">
        <h1>Rolês</h1>
        <div className="acoes">
          <Link to="/admin/evento/novo" className="btn btn-primario">
            + Novo rolê
          </Link>
          <button className="btn" onClick={() => supabase.auth.signOut()}>
            Sair
          </button>
        </div>
      </div>

      {erro && <div className="alerta alerta-aviso">⚠ Não deu para carregar os rolês. {erro}</div>}
      {!eventos && !erro && <p className="carregando">Carregando…</p>}
      {eventos?.length === 0 && <div className="card vazio">Nenhum rolê criado ainda.</div>}

      <div className="lista-eventos">
        {eventos?.map((ev) => {
          const d = dataCurta(ev.data_hora)
          const passou = new Date(ev.data_hora).getTime() < agora
          return (
            <Link key={ev.id} to={`/admin/evento/${ev.id}`} className={`card card-evento ${passou ? 'passado' : ''}`}>
              <div className="data-bloco">
                <span className="data-dia">{d.dia}</span>
                <span className="data-mes">{d.mes}</span>
              </div>
              <div className="card-evento-info">
                <h2>{ev.titulo}</h2>
                <div className="tags">
                  <span className={`tag ${ev.status === 'aberto' ? 'tag-verde' : 'tag-cinza'}`}>
                    {ev.status === 'aberto' ? 'aberto' : '🔒 fechado'}
                  </span>
                  {passou && ev.status === 'aberto' && <span className="tag tag-cinza">já aconteceu</span>}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </>
  )
}
