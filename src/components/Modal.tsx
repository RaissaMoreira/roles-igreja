import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

type Pedido = {
  titulo: string
  mensagem?: string
  /** texto do botão principal */
  ok: string
  /** quando existe, mostra o botão de cancelar (modo confirmação) */
  cancelar?: string
  perigo?: boolean
  responder: (sim: boolean) => void
}

type OpcoesConfirmar = { titulo: string; mensagem?: string; ok?: string; cancelar?: string; perigo?: boolean }

type ModalApi = {
  /** Pergunta sim/não. Resolve true se a pessoa confirmar. */
  confirmar: (opcoes: OpcoesConfirmar) => Promise<boolean>
  /** Só avisa (um botão "Ok"). */
  avisar: (titulo: string, mensagem?: string) => Promise<void>
}

const ModalContext = createContext<ModalApi | null>(null)

export function useModal(): ModalApi {
  const api = useContext(ModalContext)
  if (!api) throw new Error('useModal precisa estar dentro de <ModalProvider>')
  return api
}

/** Substitui alert/confirm do navegador por uma modal no visual do app. */
export function ModalProvider({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const botaoOk = useRef<HTMLButtonElement>(null)

  const confirmar = useCallback(
    (o: OpcoesConfirmar) =>
      new Promise<boolean>((resolve) =>
        setPedido({
          titulo: o.titulo,
          mensagem: o.mensagem,
          ok: o.ok ?? 'Confirmar',
          cancelar: o.cancelar ?? 'Cancelar',
          perigo: o.perigo,
          responder: resolve,
        }),
      ),
    [],
  )

  const avisar = useCallback(
    (titulo: string, mensagem?: string) =>
      new Promise<void>((resolve) => setPedido({ titulo, mensagem, ok: 'Ok', responder: () => resolve() })),
    [],
  )

  const fechar = useCallback(
    (sim: boolean) => {
      pedido?.responder(sim)
      setPedido(null)
    },
    [pedido],
  )

  useEffect(() => {
    if (!pedido) return
    botaoOk.current?.focus()
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && fechar(false)
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [pedido, fechar])

  return (
    <ModalContext.Provider value={{ confirmar, avisar }}>
      {children}
      {pedido && (
        <div className="modal-fundo" onClick={() => fechar(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="modal-titulo">{pedido.titulo}</h3>
            {pedido.mensagem && <p className="modal-mensagem">{pedido.mensagem}</p>}
            <div className="modal-acoes">
              {pedido.cancelar && (
                <button className="btn" onClick={() => fechar(false)}>
                  {pedido.cancelar}
                </button>
              )}
              <button
                ref={botaoOk}
                className={`btn ${pedido.perigo ? 'btn-perigo' : 'btn-primario'}`}
                onClick={() => fechar(true)}
              >
                {pedido.ok}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  )
}
