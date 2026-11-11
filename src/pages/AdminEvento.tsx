import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { normalizarChavePix } from '../lib/pix'
import {
  ROTULO_PRESENCA,
  type Evento,
  type Inscricao,
  type Presenca,
  type StatusEvento,
  type StatusPagamento,
} from '../lib/types'
import {
  copiar,
  dataHora,
  formatarTelefone,
  juntarLinhas,
  lerLocal,
  linkWhatsApp,
  mensagemErro,
  moeda,
  paraInputDataHora,
  salvarLocal,
  textoConvite,
} from '../lib/util'
import AdminListas from '../components/AdminListas'
import { useModal } from '../components/Modal'

const ROTULO_PAGAMENTO: Record<StatusPagamento, string> = {
  pendente: 'pendente',
  informado: '⚠ disse que pagou',
  pago: '✓ pago',
}

const CLASSE_PAGAMENTO: Record<StatusPagamento, string> = {
  pendente: 'tag-cinza',
  informado: 'tag-amarela',
  pago: 'tag-verde',
}

type Form = {
  titulo: string
  descricao: string
  data_hora: string
  local: string
  maps_url: string
  valor: string
  chave_pix: string
  recebedor_nome: string
  recebedor_cidade: string
  avisos: string
  status: StatusEvento
  pix_automatico: boolean
}

const FORM_VAZIO: Form = {
  titulo: '',
  descricao: '',
  data_hora: '',
  local: '',
  maps_url: '',
  valor: '',
  chave_pix: '',
  recebedor_nome: '',
  recebedor_cidade: '',
  avisos: '',
  status: 'aberto',
  pix_automatico: false,
}

const vazioParaNull = (v: string) => (v.trim() === '' ? null : v.trim())

export default function AdminEvento() {
  const { id } = useParams<{ id: string }>()
  const novo = id === 'novo'
  const navigate = useNavigate()

  const [form, setForm] = useState<Form>(FORM_VAZIO)
  const [evento, setEvento] = useState<Evento | null>(null)
  const [inscricoes, setInscricoes] = useState<Inscricao[]>([])
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const { avisar, confirmar } = useModal()

  // Mensagem verde de sucesso some sozinha; erros e pendências vão para a modal
  useEffect(() => {
    if (!mensagem) return
    const t = setTimeout(() => setMensagem(''), 3500)
    return () => clearTimeout(t)
  }, [mensagem])

  const carregarInscricoes = useCallback(async () => {
    if (!id || novo) return
    const { data, error } = await supabase.from('inscricoes').select('*').eq('evento_id', id).order('criado_em')
    if (error) return avisar('Não deu para carregar a lista de inscritos', mensagemErro(error))
    setInscricoes((data ?? []) as Inscricao[])
  }, [id, novo, avisar])

  useEffect(() => {
    if (novo) {
      // Reaproveita os dados de Pix do último rolê criado
      const ultimo = lerLocal('ultimo-pix')
      if (ultimo) {
        try {
          setForm({ ...FORM_VAZIO, ...JSON.parse(ultimo) })
        } catch {
          /* ignora */
        }
      }
      return
    }
    supabase
      .from('eventos')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return avisar('Não deu para carregar o rolê', mensagemErro(error))
        if (!data) {
          avisar('Rolê não encontrado', 'Ele pode ter sido excluído.')
          return navigate('/admin', { replace: true })
        }
        const ev = data as Evento
        setEvento(ev)
        setForm({
          titulo: ev.titulo,
          descricao: ev.descricao ?? '',
          data_hora: paraInputDataHora(ev.data_hora),
          local: ev.local ?? '',
          maps_url: ev.maps_url ?? '',
          valor: ev.valor ? String(ev.valor).replace('.', ',') : '',
          chave_pix: ev.chave_pix ?? '',
          recebedor_nome: ev.recebedor_nome ?? '',
          recebedor_cidade: ev.recebedor_cidade ?? '',
          avisos: ev.avisos ?? '',
          status: ev.status,
          pix_automatico: ev.pix_automatico ?? false,
        })
      })
    carregarInscricoes()
  }, [id, novo, carregarInscricoes, avisar, navigate])

  const set = (campo: keyof Form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }))

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const faltando = [!form.titulo.trim() && 'título', !form.data_hora && 'data e hora'].filter(Boolean)
    if (faltando.length) return avisar('Falta informação', `Preencha ${faltando.join(' e ')} antes de salvar.`)

    const valor = parseFloat(form.valor.replace(',', '.'))
    if (form.valor.trim() && (isNaN(valor) || valor < 0)) {
      return avisar('Valor inválido', 'Use só números, por exemplo 25,00. Deixe vazio se for gratuito.')
    }
    const chave = form.chave_pix.trim() ? normalizarChavePix(form.chave_pix) : null
    if (chave && 'erro' in chave) return avisar('Chave Pix inválida', chave.erro)

    if (valor > 0 && !chave && !form.pix_automatico) {
      const seguir = await confirmar({
        titulo: 'Rolê pago sem chave Pix',
        mensagem: 'Sem a chave Pix o pessoal não vai conseguir pagar pelo app. Salvar mesmo assim?',
        ok: 'Salvar sem Pix',
        cancelar: 'Voltar e preencher',
      })
      if (!seguir) return
    }
    if (valor > 0 && chave && !form.recebedor_nome.trim()) {
      return avisar('Falta o nome do recebedor', 'Preencha o nome de quem recebe o Pix (aparece no app do banco na hora de pagar).')
    }
    if (novo && new Date(form.data_hora).getTime() < Date.now()) {
      const seguir = await confirmar({
        titulo: 'Data no passado',
        mensagem: 'A data escolhida já passou, então o rolê não vai aparecer na página inicial. Criar mesmo assim?',
        ok: 'Criar mesmo assim',
        cancelar: 'Corrigir a data',
      })
      if (!seguir) return
    }
    const payload = {
      titulo: form.titulo.trim(),
      descricao: vazioParaNull(form.descricao),
      data_hora: new Date(form.data_hora).toISOString(),
      local: vazioParaNull(form.local),
      maps_url: vazioParaNull(form.maps_url),
      valor: isNaN(valor) || valor <= 0 ? null : valor,
      chave_pix: chave ? chave.chave : null,
      recebedor_nome: vazioParaNull(form.recebedor_nome),
      recebedor_cidade: vazioParaNull(form.recebedor_cidade),
      avisos: vazioParaNull(form.avisos),
      status: form.status,
      pix_automatico: form.pix_automatico,
    }

    setSalvando(true)
    setMensagem('')
    salvarLocal(
      'ultimo-pix',
      JSON.stringify({
        chave_pix: chave ? chave.chave : '',
        recebedor_nome: form.recebedor_nome,
        recebedor_cidade: form.recebedor_cidade,
        pix_automatico: form.pix_automatico,
      }),
    )

    if (chave) setForm((f) => ({ ...f, chave_pix: chave.chave }))

    if (novo) {
      const { data, error } = await supabase.from('eventos').insert(payload).select('id').single()
      setSalvando(false)
      if (error) return avisar('Não deu para criar o rolê', mensagemErro(error))
      navigate(`/admin/evento/${data.id}`, { replace: true })
    } else {
      const { data, error } = await supabase.from('eventos').update(payload).eq('id', id).select('*').single()
      setSalvando(false)
      if (error) return avisar('Não deu para salvar', mensagemErro(error))
      setEvento(data as Evento)
      setMensagem('Salvo ✓')
    }
  }

  async function alternarPagamento(i: Inscricao) {
    const pagamento: StatusPagamento = i.pagamento === 'pago' ? 'pendente' : 'pago'
    setInscricoes((lista) => lista.map((x) => (x.id === i.id ? { ...x, pagamento, pago_em: null } : x)))
    // pago_em só fica preenchido quando quem confirmou foi o Mercado Pago
    const { error } = await supabase.from('inscricoes').update({ pagamento, pago_em: null }).eq('id', i.id)
    if (error) {
      avisar('Não deu para atualizar o pagamento', mensagemErro(error))
      carregarInscricoes()
    }
  }

  async function alterarPresenca(i: Inscricao, presenca: Presenca) {
    if (presenca === i.presenca) return
    setInscricoes((lista) => lista.map((x) => (x.id === i.id ? { ...x, presenca } : x)))
    const { error } = await supabase.from('inscricoes').update({ presenca }).eq('id', i.id)
    if (error) {
      avisar('Não deu para mudar a resposta', mensagemErro(error))
      carregarInscricoes()
    } else {
      setMensagem(`Resposta de ${i.nome} alterada para "${ROTULO_PRESENCA[presenca]}" ✓`)
    }
  }

  async function remover(i: Inscricao) {
    if (!(await confirmar({ titulo: `Tirar ${i.nome} da lista?`, ok: 'Tirar da lista', perigo: true }))) return
    const { error } = await supabase.from('inscricoes').delete().eq('id', i.id)
    if (error) avisar('Não deu para tirar da lista', mensagemErro(error))
    carregarInscricoes()
  }

  async function excluirEvento() {
    if (!(await confirmar({ titulo: 'Excluir este rolê?', mensagem: 'A lista de inscritos e as listas de itens também serão apagadas. Não dá para desfazer.', ok: 'Excluir rolê', perigo: true }))) return
    const { error } = await supabase.from('eventos').delete().eq('id', id)
    if (error) return avisar('Não deu para excluir o rolê', mensagemErro(error))
    navigate('/admin', { replace: true })
  }

  const link = `${window.location.origin}/evento/${id}`
  const confirmados = inscricoes.filter((i) => i.presenca === 'confirmado')
  const talvez = inscricoes.filter((i) => i.presenca === 'talvez')
  const naoVao = inscricoes.filter((i) => i.presenca === 'nao_vou')
  const pagos = inscricoes.filter((i) => i.pagamento === 'pago')
  const informados = inscricoes.filter((i) => i.pagamento === 'informado')
  const valorUnit = evento?.valor ?? 0
  const nomes = useMemo(() => new Map(inscricoes.map((i) => [i.id, i.nome])), [inscricoes])
  const chaveDigitada = form.chave_pix.trim() ? normalizarChavePix(form.chave_pix) : null

  function resumoWhatsApp(): string {
    if (!evento) return ''
    return juntarLinhas([
      `🔥 *${evento.titulo}*`,
      `📅 ${dataHora(evento.data_hora)}`,
      evento.local ? `📍 ${evento.local}` : '',
      valorUnit ? `💰 ${moeda(valorUnit)}` : '',
      '',
      `✅ *Vão (${confirmados.length})*`,
      ...confirmados.map((p, n) => `${n + 1}. ${p.nome}`),
      talvez.length ? `\n🤔 Talvez: ${talvez.map((p) => p.nome).join(', ')}` : '',
      naoVao.length ? `\n😢 Não vão: ${naoVao.map((p) => p.nome).join(', ')}` : '',
      '',
      `Responde por aqui 👉 ${link}`,
    ])
  }

  async function copiarComAviso(texto: string, sucesso: string) {
    if (await copiar(texto)) setMensagem(sucesso)
    else avisar('Não deu para copiar', 'Seu navegador bloqueou a cópia. Tente de novo ou copie manualmente.')
  }

  async function mandarConvite() {
    if (!evento) return
    if (evento.status === 'fechado') {
      const seguir = await confirmar({
        titulo: 'Inscrições fechadas',
        mensagem: 'Quem abrir o convite não vai conseguir responder. Abra as inscrições antes, ou mande assim mesmo.',
        ok: 'Mandar assim mesmo',
        cancelar: 'Voltar',
      })
      if (!seguir) return
    } else if (evento.valor && !evento.chave_pix && !evento.pix_automatico) {
      const seguir = await confirmar({
        titulo: 'Falta a chave Pix',
        mensagem: 'O rolê é pago, mas não tem chave Pix cadastrada. Quem confirmar não vai conseguir pagar pelo app.',
        ok: 'Mandar assim mesmo',
        cancelar: 'Voltar',
      })
      if (!seguir) return
    }
    window.open(linkWhatsApp(textoConvite(evento, link)), '_blank', 'noreferrer')
  }

  function copiarResumo() {
    if (!inscricoes.length) return avisar('Lista vazia', 'Ninguém respondeu ainda. Mande o convite no grupo primeiro.')
    copiarComAviso(resumoWhatsApp(), 'Resumo copiado ✓ — é só colar no grupo')
  }

  return (
    <>
      <Link to="/admin" className="voltar">
        ← Voltar
      </Link>
      <h1>{novo ? 'Novo rolê' : form.titulo || 'Editar rolê'}</h1>

      {!novo && evento && (
        <div className="card acoes-evento">
          <button className="btn btn-whats" onClick={mandarConvite}>
            Mandar convite no WhatsApp
          </button>
          <button className="btn" onClick={() => copiarComAviso(textoConvite(evento, link), 'Convite copiado ✓')}>
            ✉️ Copiar convite
          </button>
          <button className="btn" onClick={() => copiarComAviso(link, 'Link copiado ✓')}>
            🔗 Copiar link
          </button>
          <button className="btn" onClick={copiarResumo}>
            📋 Copiar lista pro WhatsApp
          </button>
          <a className="btn" href={link} target="_blank" rel="noreferrer">
            👀 Ver página
          </a>
        </div>
      )}

      {mensagem && <div className="alerta alerta-ok">{mensagem}</div>}

      {!novo && evento && evento.valor && !evento.chave_pix && !evento.pix_automatico ? (
        <div className="alerta alerta-aviso">
          ⚠ Este rolê cobra {moeda(evento.valor)}, mas não tem chave Pix. Preencha a chave lá embaixo para o pessoal conseguir pagar.
        </div>
      ) : null}
      {!novo && evento?.status === 'fechado' && (
        <div className="alerta alerta-aviso">🔒 Inscrições fechadas — ninguém novo consegue responder.</div>
      )}
      {informados.length > 0 && (
        <div className="alerta alerta-aviso">
          💸 {informados.length} {informados.length === 1 ? 'pessoa disse' : 'pessoas disseram'} que pagou. Confira no extrato e clique em
          "disse que pagou" para confirmar.
        </div>
      )}

      {!novo && evento && (
        <section className="card">
          <div className="resumo">
            <div>
              <strong>{confirmados.length}</strong>
              <span>vão</span>
            </div>
            <div>
              <strong>{talvez.length}</strong>
              <span>talvez</span>
            </div>
            <div>
              <strong>{naoVao.length}</strong>
              <span>não vão</span>
            </div>
            {valorUnit > 0 && (
              <>
                <div>
                  <strong>{pagos.length}</strong>
                  <span>pagaram</span>
                </div>
                {informados.length > 0 && (
                  <div className="resumo-alerta">
                    <strong>{informados.length}</strong>
                    <span>para conferir</span>
                  </div>
                )}
                <div>
                  <strong>{moeda(pagos.length * valorUnit)}</strong>
                  <span>de {moeda(confirmados.length * valorUnit)}</span>
                </div>
              </>
            )}
          </div>

          {inscricoes.length === 0 ? (
            <p className="dica">Ninguém se inscreveu ainda. Manda o link no grupo!</p>
          ) : (
            <div className="tabela-wrap">
              <table className="tabela tabela-pessoas">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>WhatsApp</th>
                    <th>Presença</th>
                    {valorUnit > 0 && <th>Pagamento</th>}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {inscricoes.map((i) => (
                    <tr key={i.id}>
                      <td className="td-nome">{i.nome}</td>
                      <td className="td-fone">
                        <a href={`https://wa.me/55${i.telefone}`} target="_blank" rel="noreferrer">
                          {formatarTelefone(i.telefone)}
                        </a>
                      </td>
                      <td className="td-presenca">
                        <select
                          className="select-tabela"
                          value={i.presenca}
                          onChange={(e) => alterarPresenca(i, e.target.value as Presenca)}
                          aria-label={`Resposta de ${i.nome}`}
                        >
                          {(Object.keys(ROTULO_PRESENCA) as Presenca[]).map((p) => (
                            <option key={p} value={p}>
                              {ROTULO_PRESENCA[p]}
                            </option>
                          ))}
                        </select>
                      </td>
                      {valorUnit > 0 && (
                        <td className="td-pagamento">
                          {i.presenca === 'nao_vou' && i.pagamento === 'pendente' ? (
                            <span className="dica">—</span>
                          ) : (
                            <button
                              className={`tag tag-botao ${CLASSE_PAGAMENTO[i.pagamento]}`}
                              onClick={() => alternarPagamento(i)}
                              title={i.pagamento === 'pago' ? 'Clique para voltar a pendente' : 'Clique para confirmar o pagamento'}
                            >
                              {i.pagamento === 'pago' && i.pago_em ? '✓ pago ⚡ automático' : ROTULO_PAGAMENTO[i.pagamento]}
                            </button>
                          )}
                        </td>
                      )}
                      <td className="td-acoes">
                        <button className="link-perigo" onClick={() => remover(i)}>
                          remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {!novo && evento && <AdminListas eventoId={evento.id} nomes={nomes} />}

      <form className="card form" onSubmit={salvar}>
        <h3>Informações do rolê</h3>
        <label>
          Título *
          <input value={form.titulo} onChange={set('titulo')} placeholder="Churrasco de fim de ano" />
        </label>
        <div className="linha">
          <label>
            Data e hora *
            <input type="datetime-local" value={form.data_hora} onChange={set('data_hora')} />
          </label>
          <label>
            Valor por pessoa (R$)
            <input value={form.valor} onChange={set('valor')} placeholder="25,00 (vazio = gratuito)" inputMode="decimal" />
          </label>
        </div>
        <label>
          Local
          <input value={form.local} onChange={set('local')} placeholder="Chácara do João — Rua X, 123" />
        </label>
        <label>
          Link do Google Maps (opcional)
          <input value={form.maps_url} onChange={set('maps_url')} placeholder="https://maps.app.goo.gl/..." />
        </label>
        <label>
          Descrição
          <textarea value={form.descricao} onChange={set('descricao')} rows={3} />
        </label>
        <label>
          Avisos importantes
          <textarea value={form.avisos} onChange={set('avisos')} rows={4} placeholder={'Levar cadeira\nCarona sai da igreja às 11h'} />
        </label>

        <h3>Pix</h3>
        <label className="opcao-check">
          <input
            type="checkbox"
            checked={form.pix_automatico}
            onChange={(e) => setForm((f) => ({ ...f, pix_automatico: e.target.checked }))}
          />
          <span>
            Confirmar pagamento automaticamente (Mercado Pago)
            <small>
              Cada pessoa recebe um Pix gerado pelo Mercado Pago e o app marca "pago" sozinho quando o dinheiro cai. Precisa da
              configuração do Mercado Pago no Supabase (veja o README).
            </small>
          </span>
        </label>
        <label>
          {form.pix_automatico ? 'Chave Pix reserva (opcional)' : 'Chave Pix'}
          <input value={form.chave_pix} onChange={set('chave_pix')} placeholder="CPF, e-mail, +5542999998888 ou chave aleatória" />
          {chaveDigitada &&
            ('erro' in chaveDigitada ? (
              <small className="chave-erro">⚠ {chaveDigitada.erro}</small>
            ) : (
              <small className="chave-ok">
                ✓ {chaveDigitada.tipo}: <span className="mono">{chaveDigitada.chave}</span>
              </small>
            ))}
        </label>
        <div className="linha">
          <label>
            Nome do recebedor
            <input value={form.recebedor_nome} onChange={set('recebedor_nome')} maxLength={25} />
          </label>
          <label>
            Cidade
            <input value={form.recebedor_cidade} onChange={set('recebedor_cidade')} maxLength={15} placeholder="Ponta Grossa" />
          </label>
        </div>
        <p className="dica">
          {form.pix_automatico
            ? 'A chave reserva aparece só para quem abrir o rolê num celular diferente do que usou para responder (aí o pagamento é conferido à mão).'
            : 'Confira a chave acima antes de salvar: se ela não existir no banco, o Pix dá "chave não encontrada".'}
        </p>

        <label>
          Inscrições
          <select value={form.status} onChange={set('status')}>
            <option value="aberto">Abertas</option>
            <option value="fechado">Fechadas</option>
          </select>
        </label>

        <button className="btn btn-primario btn-largo" disabled={salvando}>
          {salvando ? 'Salvando…' : novo ? 'Criar rolê' : 'Salvar alterações'}
        </button>
        {!novo && (
          <button type="button" className="link-perigo" onClick={excluirEvento}>
            Excluir rolê
          </button>
        )}
      </form>
    </>
  )
}
