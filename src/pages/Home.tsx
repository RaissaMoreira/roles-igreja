import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Evento } from '../lib/types'
import { dataCurta, moeda } from '../lib/util'

export default function Home() {
  const [eventos, setEventos] = useState<Evento[] | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const inicioDeHoje = new Date()
    inicioDeHoje.setHours(0, 0, 0, 0)

    supabase
      .from('eventos')
      .select('*')
      .gte('data_hora', inicioDeHoje.toISOString())
      .order('data_hora')
      .then(({ data, error }) => {
        if (error) setErro(error.message)
        else setEventos((data ?? []) as Evento[])
      })
  }, [])

  return (
    <>
      <section className="hero">
        <p className="selo">Juventude Alcance 🔥</p>
        <h1>Próximos rolês</h1>
        <p>Confirme presença, veja onde é e pague o Pix sem bagunça no grupo.</p>
      </section>

      {erro && <div className="alerta alerta-erro">{erro}</div>}
      {!eventos && !erro && <p className="carregando">Carregando…</p>}
      {eventos?.length === 0 && (
        <div className="card vazio">Nenhum rolê marcado por enquanto. 🙏</div>
      )}

      <div className="lista-eventos">
        {eventos?.map((ev) => {
          const d = dataCurta(ev.data_hora)
          return (
            <Link key={ev.id} to={`/evento/${ev.id}`} className="card card-evento">
              <div className="data-bloco">
                <span className="data-dia">{d.dia}</span>
                <span className="data-mes">{d.mes}</span>
              </div>
              <div className="card-evento-info">
                <h2>{ev.titulo}</h2>
                <p>
                  {d.hora}
                  {ev.local ? ` · ${ev.local}` : ''}
                </p>
                <div className="tags">
                  <span className="tag">{ev.valor ? moeda(ev.valor) : 'Gratuito'}</span>
                  {ev.status === 'fechado' && <span className="tag tag-cinza">Inscrições fechadas</span>}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </>
  )
}
