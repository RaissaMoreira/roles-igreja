import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Notificacao, TipoNotificacao } from '../lib/types'
import { mensagemErro } from '../lib/util'
import { useModal } from './Modal'

type Preferencias = Record<TipoNotificacao, boolean>

const COLUNA_PREFERENCIA: Record<TipoNotificacao, string> = {
  resposta: 'notificar_respostas',
  pagamento: 'notificar_pagamentos',
}

function tempoRelativo(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  if (min < 60 * 24) return `${Math.round(min / 60)} h`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function avisarNoNavegador(n: Notificacao) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification(n.tipo === 'pagamento' ? '💸 Pagamento informado' : '🙋 Nova resposta', { body: n.mensagem })
  } catch {
    /* alguns celulares só permitem notificação via service worker */
  }
}

/** Sino no topo da área de admin: avisa quando alguém responde ou diz que pagou. */
export default function Notificacoes() {
  const [lista, setLista] = useState<Notificacao[]>([])
  const [prefs, setPrefs] = useState<Preferencias>({ resposta: true, pagamento: true })
  const [userId, setUserId] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)
  const { avisar } = useModal()
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('notificacoes')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(40)
    setLista((data ?? []) as Notificacao[])
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const id = data.session?.user.id
      if (!id) return
      setUserId(id)
      const { data: admin } = await supabase
        .from('admins')
        .select('notificar_respostas,notificar_pagamentos')
        .eq('user_id', id)
        .maybeSingle()
      if (admin) setPrefs({ resposta: admin.notificar_respostas, pagamento: admin.notificar_pagamentos })
    })
    carregar()

    const canal = supabase
      .channel('notificacoes-admin')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes' }, (payload) => {
        const n = payload.new as Notificacao
        setLista((l) => [n, ...l.filter((x) => x.id !== n.id)])
        if (prefsRef.current[n.tipo]) avisarNoNavegador(n)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [carregar])

  async function alterarPreferencia(tipo: TipoNotificacao, ativo: boolean) {
    setPrefs((p) => ({ ...p, [tipo]: ativo }))
    if (ativo && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    if (userId) {
      const { error } = await supabase.from('admins').update({ [COLUNA_PREFERENCIA[tipo]]: ativo }).eq('user_id', userId)
      if (error) avisar('Não deu para salvar a preferência', mensagemErro(error))
    }
  }

  async function marcarLidas() {
    setLista((l) => l.map((n) => ({ ...n, lida: true })))
    const { error } = await supabase.from('notificacoes').update({ lida: true }).eq('lida', false)
    if (error) {
      avisar('Não deu para marcar como lidas', mensagemErro(error))
      carregar()
    }
  }

  async function marcarLida(id: string) {
    setLista((l) => l.map((n) => (n.id === id ? { ...n, lida: true } : n)))
    const { error } = await supabase.from('notificacoes').update({ lida: true }).eq('id', id)
    if (error) {
      avisar('Não deu para marcar como lida', mensagemErro(error))
      carregar()
    }
  }

  async function abrirFechar() {
    const abrir = !aberto
    setAberto(abrir)
    if (abrir && (prefs.resposta || prefs.pagamento) && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }

  const visiveis = lista.filter((n) => prefs[n.tipo])
  const naoLidas = visiveis.filter((n) => !n.lida).length

  return (
    <div className="sino">
      <button className="sino-botao" onClick={abrirFechar} aria-label="Notificações">
        🔔{naoLidas > 0 && <span className="sino-contador">{naoLidas > 9 ? '9+' : naoLidas}</span>}
      </button>

      {aberto && <div className="sino-fundo" onClick={() => setAberto(false)} />}
      {aberto && (
        <div className="sino-painel">
          <div className="sino-topo">
            <strong>Notificações</strong>
            <div className="sino-topo-acoes">
              {naoLidas > 0 && (
                <button className="link-simples" onClick={marcarLidas}>
                  marcar todas como lidas
                </button>
              )}
              <button className="sino-fechar" onClick={() => setAberto(false)} aria-label="Fechar notificações">
                ✕
              </button>
            </div>
          </div>

          <div className="sino-prefs">
            <label>
              <input type="checkbox" checked={prefs.resposta} onChange={(e) => alterarPreferencia('resposta', e.target.checked)} />
              Quando alguém responder
            </label>
            <label>
              <input type="checkbox" checked={prefs.pagamento} onChange={(e) => alterarPreferencia('pagamento', e.target.checked)} />
              Quando alguém disser que pagou
            </label>
          </div>

          {visiveis.length === 0 ? (
            <p className="dica sino-vazio">
              {prefs.resposta || prefs.pagamento ? 'Nada por aqui ainda.' : 'Notificações desativadas.'}
            </p>
          ) : (
            <ul className="sino-lista">
              {visiveis.map((n) => (
                <li key={n.id} className={n.lida ? '' : 'nao-lida'}>
                  <Link
                    to={n.evento_id ? `/admin/evento/${n.evento_id}` : '/admin'}
                    onClick={() => {
                      if (!n.lida) marcarLida(n.id)
                      setAberto(false)
                    }}
                  >
                    <span>{n.tipo === 'pagamento' ? '💸' : '🙋'}</span>
                    <span className="sino-msg">
                      {n.mensagem}
                      <span className="sino-tempo">{tempoRelativo(n.criado_em)}</span>
                    </span>
                  </Link>
                  {!n.lida && (
                    <button className="sino-ler" onClick={() => marcarLida(n.id)} title="Marcar como lida" aria-label="Marcar como lida">
                      ✓
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
