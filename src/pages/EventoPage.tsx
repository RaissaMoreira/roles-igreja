import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { COLUNAS_PUBLICAS, type Evento, type InscricaoPublica, type Presenca } from '../lib/types'
import {
  capitalizarDigitando,
  capitalizarNome,
  dataCurta,
  digitosTelefone,
  mascararTelefone,
  mensagemErro,
  dataExtenso,
  lerInscricao,
  linhasDeTexto,
  linkMaps,
  moeda,
  salvarInscricao,
  type MinhaInscricao,
} from '../lib/util'
import PixPagamento from '../components/PixPagamento'
import PixMercadoPago from '../components/PixMercadoPago'
import ListasEvento from '../components/ListasEvento'
import { useModal } from '../components/Modal'

const OPCOES_PRESENCA: { valor: Presenca; rotulo: string }[] = [
  { valor: 'confirmado', rotulo: 'Vou! 🙌' },
  { valor: 'talvez', rotulo: 'Talvez 🤔' },
  { valor: 'nao_vou', rotulo: 'Não vou 😢' },
]

export default function EventoPage() {
  const { id } = useParams<{ id: string }>()
  const [evento, setEvento] = useState<Evento | null>(null)
  const [inscricoes, setInscricoes] = useState<InscricaoPublica[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [presenca, setPresenca] = useState<Presenca>('confirmado')
  const [enviando, setEnviando] = useState(false)

  const [minha, setMinha] = useState<MinhaInscricao | null>(null)
  const [mostrarPix, setMostrarPix] = useState(false)
  const [informando, setInformando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [novaPresenca, setNovaPresenca] = useState<Presenca>('confirmado')
  const [salvandoResposta, setSalvandoResposta] = useState(false)
  const [versaoListas, setVersaoListas] = useState(0)
  const { avisar, confirmar: perguntar } = useModal()

  const carregarInscricoes = useCallback(async () => {
    if (!id) return
    const { data } = await supabase
      .from('inscricoes')
      .select(COLUNAS_PUBLICAS)
      .eq('evento_id', id)
      .order('criado_em')
    setInscricoes((data ?? []) as InscricaoPublica[])
  }, [id])

  useEffect(() => {
    if (!id) return
    setMinha(lerInscricao(id))
    supabase
      .from('eventos')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setErro(mensagemErro(error))
        else if (!data) setErro('Rolê não encontrado.')
        else setEvento(data as Evento)
        setCarregando(false)
      })
    carregarInscricoes()
  }, [id, carregarInscricoes])

  const nomes = useMemo(() => new Map(inscricoes.map((i) => [i.id, i.nome])), [inscricoes])

  async function confirmar(e: FormEvent) {
    e.preventDefault()
    if (!evento) return
    const fone = digitosTelefone(telefone)
    const nomeFinal = capitalizarNome(nome)
    if (nomeFinal.length < 2) return avisar('Falta seu nome', 'Coloque seu nome para o pessoal saber quem vai 🙂')
    if (fone.length < 10) {
      return avisar('Confira o WhatsApp', 'Digite o número com DDD, por exemplo (42) 99999-8888.')
    }
    if (fone.length === 11 && fone[2] !== '9') {
      return avisar('Confira o WhatsApp', 'Celular com 11 dígitos precisa começar com 9 depois do DDD.')
    }
    if (evento.status !== 'aberto') return avisar('Inscrições fechadas', 'A organização já fechou a lista desse rolê.')

    setEnviando(true)
    const nova: MinhaInscricao = { id: crypto.randomUUID(), token: crypto.randomUUID(), presenca, pagou: false }
    const { error } = await supabase.from('inscricoes').insert({
      id: nova.id,
      token: nova.token,
      evento_id: evento.id,
      nome: nomeFinal,
      telefone: fone,
      presenca,
    })
    setEnviando(false)

    if (error) {
      if (error.code === '23505') {
        setMostrarPix(true)
        return avisar(
          'Esse WhatsApp já respondeu',
          'Esse número já está na lista desse rolê. Se precisar mudar sua resposta, fale com a organização.',
        )
      }
      if (error.code === '42501') return avisar('Inscrições fechadas', 'A organização já fechou a lista desse rolê.')
      return avisar('Não deu para enviar sua resposta', mensagemErro(error))
    }

    salvarInscricao(evento.id, nova)
    setMinha(nova)
    setNome('')
    setTelefone('')
    carregarInscricoes()
  }

  function comecarEdicao() {
    if (!evento || !minha) return
    if (!minha.token) {
      return avisar('Não dá para mudar por aqui', 'Sua resposta foi feita em outro aparelho ou numa versão antiga do app. Peça para a organização mudar.')
    }
    if (evento.status !== 'aberto') {
      return avisar('Inscrições fechadas', 'A lista desse rolê já foi fechada. Para mudar sua resposta, fale com a organização.')
    }
    setNovaPresenca(minha.presenca ?? 'confirmado')
    setEditando(true)
  }

  async function salvarResposta() {
    if (!evento || !minha?.token) return
    if (novaPresenca === minha.presenca) return setEditando(false)

    if (novaPresenca === 'nao_vou') {
      const seguir = await perguntar({
        titulo: 'Mudar para "Não vou"?',
        mensagem: minha.pagou
          ? 'Você já avisou que pagou o Pix. Fale com a organização sobre o valor. Você também sai das listas de quem leva o quê.'
          : 'Você também sai das listas de quem leva o quê.',
        ok: 'Mudar resposta',
        cancelar: 'Voltar',
      })
      if (!seguir) return
    }

    setSalvandoResposta(true)
    const { error } = await supabase.rpc('alterar_presenca', {
      p_inscricao: minha.id,
      p_token: minha.token,
      p_presenca: novaPresenca,
    })
    setSalvandoResposta(false)
    if (error) {
      if (error.hint === 'fechado') {
        setEditando(false)
        return avisar('Inscrições fechadas', 'A lista desse rolê acabou de ser fechada. Para mudar sua resposta, fale com a organização.')
      }
      return avisar('Não deu para mudar sua resposta', mensagemErro(error))
    }

    const atualizada = { ...minha, presenca: novaPresenca }
    salvarInscricao(evento.id, atualizada)
    setMinha(atualizada)
    setEditando(false)
    setVersaoListas((v) => v + 1)
    carregarInscricoes()
  }

  function pagamentoConfirmado() {
    if (!evento || !minha) return
    const atualizada = { ...minha, pagou: true, confirmado: true }
    salvarInscricao(evento.id, atualizada)
    setMinha(atualizada)
  }

  async function informarPagamento() {
    if (!evento || !minha?.token) return
    if (!(await perguntar({ titulo: 'Já fez o Pix?', mensagem: 'A organização vai receber o aviso e conferir o pagamento.', ok: 'Sim, já paguei', cancelar: 'Ainda não' }))) return
    setInformando(true)
    const { error } = await supabase.rpc('informar_pagamento', { p_inscricao: minha.id, p_token: minha.token })
    setInformando(false)
    if (error) return avisar('Não deu para avisar o pagamento', mensagemErro(error))
    const atualizada = { ...minha, pagou: true }
    salvarInscricao(evento.id, atualizada)
    setMinha(atualizada)
  }

  if (carregando) return <p className="carregando">Carregando…</p>
  if (erro || !evento) {
    return (
      <div className="card">
        <p>{erro || 'Rolê não encontrado.'}</p>
        <Link to="/">Ver todos os rolês</Link>
      </div>
    )
  }

  const maps = linkMaps(evento.local, evento.maps_url)
  const pixAuto = Boolean(evento.pix_automatico)
  const temPix = Boolean(evento.valor && evento.valor > 0 && (evento.chave_pix || pixAuto))
  const pagou = Boolean(minha?.pagou)
  // "talvez" e "não vou" não pagam; inscrição antiga (sem presença salva) ainda vê o Pix
  const deveVerPix = temPix && !pagou && (minha ? minha.presenca === 'confirmado' || minha.presenca === null : true)
  const blocoPagamento = deveVerPix || (temPix && pagou)
  const vao = inscricoes.filter((i) => i.presenca === 'confirmado')
  const talvez = inscricoes.filter((i) => i.presenca === 'talvez')
  const naoVao = inscricoes.filter((i) => i.presenca === 'nao_vou')
  const avisos = evento.avisos ? linhasDeTexto(evento.avisos) : []
  const temLocal = Boolean(evento.local || maps)
  const [localNome, ...localResto] = (evento.local ?? '').split(/\s+[—–-]\s+/)

  return (
    <article className="evento">
      <Link to="/" className="voltar">
        ← Todos os rolês
      </Link>

      <section className="hero">
        {evento.status === 'fechado' ? (
          <p className="selo selo-cinza">Inscrições fechadas</p>
        ) : (
          <p className="selo">Próximo rolê 🔥</p>
        )}
        <h1>{evento.titulo}</h1>
        {evento.descricao && <p className="descricao">{evento.descricao}</p>}

        <div className="stats">
          <div className="stat">
            <p className="stat-rotulo">Quando</p>
            <p className="stat-valor primeira-maiuscula">{dataExtenso(evento.data_hora)}</p>
          </div>
          <div className="stat">
            <p className="stat-rotulo">Horário</p>
            <p className="stat-valor">{dataCurta(evento.data_hora).hora}</p>
          </div>
          <div className="stat">
            <p className="stat-rotulo">Valor</p>
            <p className="stat-valor">{evento.valor ? `${moeda(evento.valor)} por pessoa` : 'Gratuito'}</p>
          </div>
        </div>
      </section>

      <div className="grade">
        {blocoPagamento && (
          <section className="card card-brilho col-2">
            <h3>Pix</h3>
            {pagou ? (
              minha?.confirmado ? (
                <div className="alerta alerta-ok">Pagamento confirmado ✓ Valeu! Te esperamos lá 🎉</div>
              ) : (
                <div className="alerta alerta-ok">Pagamento informado ✓ — a organização vai conferir.</div>
              )
            ) : (mostrarPix || minha) && pixAuto && minha?.token ? (
              <>
                <PixMercadoPago inscricaoId={minha.id} token={minha.token} valor={evento.valor!} onPago={pagamentoConfirmado} />
                <button className="link-simples link-paguei" onClick={informarPagamento} disabled={informando}>
                  Paguei e não confirmou? Avisar a organização
                </button>
              </>
            ) : (mostrarPix || minha) && !evento.chave_pix ? (
              <p className="dica">
                Para pagar, abra este link no mesmo celular em que você respondeu a lista. Se não der, fale com a organização.
              </p>
            ) : mostrarPix || minha ? (
              <>
                <PixPagamento
                  chave={evento.chave_pix!}
                  nome={evento.recebedor_nome || 'Organizacao'}
                  cidade={evento.recebedor_cidade || 'Ponta Grossa'}
                  valor={evento.valor!}
                  txid={minha?.id}
                />
                {minha?.token ? (
                  <button className="btn btn-largo btn-pago" onClick={informarPagamento} disabled={informando}>
                    {informando ? 'Enviando…' : '✅ Já paguei'}
                  </button>
                ) : (
                  <p className="dica">Depois de pagar, avise a organização.</p>
                )}
              </>
            ) : (
              <>
                <p className="dica">Confirme sua presença na lista para ver o Pix.</p>
                <button className="btn btn-largo" onClick={() => setMostrarPix(true)} style={{ marginTop: '1rem' }}>
                  Já estou na lista, quero ver o Pix
                </button>
              </>
            )}
          </section>
        )}

        <section className={`card ${blocoPagamento ? 'col-3' : 'col-5'}`}>
          <div className="card-cabecalho">
            <h3>Lista de presença</h3>
            <span className="contador">
              <b>{vao.length}</b> vão · {talvez.length} talvez · {naoVao.length} não vão
            </span>
          </div>

          {evento.status === 'aberto' && !minha && (
            <form className="form" onSubmit={confirmar} style={{ marginBottom: '1.25rem' }}>
              <div className="linha">
                <input
                  value={nome}
                  onChange={(e) => setNome(capitalizarDigitando(e.target.value))}
                  onBlur={() => setNome((n) => capitalizarNome(n))}
                  placeholder="Seu nome"
                  maxLength={80}
                  aria-label="Seu nome"
                  autoComplete="name"
                  autoCapitalize="words"
                />
                <input
                  value={telefone}
                  onChange={(e) => setTelefone(mascararTelefone(e.target.value, telefone))}
                  placeholder="WhatsApp (42) 99999-8888"
                  aria-label="WhatsApp"
                  inputMode="tel"
                  maxLength={15}
                  autoComplete="tel-national"
                />
              </div>
              <div className="opcoes opcoes-3">
                {OPCOES_PRESENCA.map((o) => (
                  <label key={o.valor} className={`opcao ${presenca === o.valor ? 'ativa' : ''}`}>
                    <input type="radio" name="presenca" checked={presenca === o.valor} onChange={() => setPresenca(o.valor)} />
                    {o.rotulo}
                  </label>
                ))}
              </div>
              <button className="btn btn-destaque btn-largo" disabled={enviando}>
                {enviando ? 'Enviando…' : 'Responder'}
              </button>
              <small className="centro">Só a organização vê seu número.</small>
            </form>
          )}

          {minha && !editando && (
            <div className="minha-resposta">
              <span>
                {minha.presenca === 'nao_vou'
                  ? 'Você respondeu "Não vou". Fica pra próxima! 💛'
                  : minha.presenca === 'talvez'
                    ? 'Você respondeu "Talvez" 🤔'
                    : minha.presenca === 'confirmado'
                      ? 'Você está na lista! 🎉'
                      : 'Você já respondeu 🎉'}
              </span>
              <button className="link-simples" onClick={comecarEdicao}>
                Mudar resposta
              </button>
            </div>
          )}

          {minha && editando && (
            <div className="form editar-resposta">
              <strong>Mudar sua resposta</strong>
              <div className="opcoes opcoes-3">
                {OPCOES_PRESENCA.map((o) => (
                  <label key={o.valor} className={`opcao ${novaPresenca === o.valor ? 'ativa' : ''}`}>
                    <input
                      type="radio"
                      name="nova-presenca"
                      checked={novaPresenca === o.valor}
                      onChange={() => setNovaPresenca(o.valor)}
                    />
                    {o.rotulo}
                  </label>
                ))}
              </div>
              <div className="linha">
                <button className="btn" onClick={() => setEditando(false)} disabled={salvandoResposta}>
                  Cancelar
                </button>
                <button className="btn btn-destaque" onClick={salvarResposta} disabled={salvandoResposta}>
                  {salvandoResposta ? 'Salvando…' : 'Salvar resposta'}
                </button>
              </div>
            </div>
          )}

          <ul className="lista-pessoas">
            {vao.length === 0 && <li className="vazio-lista">Ninguém confirmou ainda. Seja o primeiro!</li>}
            {vao.map((p) => (
              <li key={p.id}>{p.nome}</li>
            ))}
          </ul>
          {talvez.length > 0 && (
            <>
              <h4>Talvez ({talvez.length})</h4>
              <p className="dica">{talvez.map((p) => p.nome).join(', ')}</p>
            </>
          )}
          {naoVao.length > 0 && (
            <>
              <h4>Não vão ({naoVao.length})</h4>
              <p className="dica">{naoVao.map((p) => p.nome).join(', ')}</p>
            </>
          )}
        </section>

        {avisos.length > 0 && (
          <section className={`card ${temLocal ? 'col-3' : 'col-5'}`}>
            <h3>Informações importantes</h3>
            <ul className="bolinhas">
              {avisos.map((a, n) => (
                <li key={n}>{a}</li>
              ))}
            </ul>
          </section>
        )}

        {temLocal && (
          <section className={`card card-secundario ${avisos.length > 0 ? 'col-2' : 'col-5'}`}>
            <h3>Onde é</h3>
            {localNome && <p className="local-nome">{localNome}</p>}
            {localResto.length > 0 && <p className="local-endereco">{localResto.join(' — ')}</p>}
            {maps && (
              <a className="btn-contorno" href={maps} target="_blank" rel="noreferrer">
                Abrir no Maps →
              </a>
            )}
          </section>
        )}

        <ListasEvento key={versaoListas} eventoId={evento.id} nomes={nomes} minha={minha} />
      </div>
    </article>
  )
}
