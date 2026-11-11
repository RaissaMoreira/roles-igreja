import { useEffect, useState } from 'react'
import { lerLocal, salvarLocal } from '../lib/util'

/** Evento do Chrome/Android que permite abrir o "Instalar app" pelo botão. */
type PromptInstalacao = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const CHAVE_DISPENSOU = 'instalar-app-dispensado-em'
const ESPERA_DEPOIS_DE_DISPENSAR_MS = 14 * 24 * 3600_000

function jaInstalado(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function ehIphone(): boolean {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

function dispensouRecentemente(): boolean {
  const quando = Number(lerLocal(CHAVE_DISPENSOU))
  return Boolean(quando) && Date.now() - quando < ESPERA_DEPOIS_DE_DISPENSAR_MS
}

/** Barrinha no rodapé convidando a instalar o site como app no celular. */
export default function InstalarApp() {
  const [prompt, setPrompt] = useState<PromptInstalacao | null>(null)
  const [mostrar, setMostrar] = useState(false)
  const [instrucoesIphone, setInstrucoesIphone] = useState(false)

  useEffect(() => {
    if (jaInstalado() || dispensouRecentemente()) return

    if (ehIphone()) {
      setMostrar(true)
      return
    }

    const aoPoderInstalar = (e: Event) => {
      e.preventDefault()
      setPrompt(e as PromptInstalacao)
      setMostrar(true)
    }
    const aoInstalar = () => setMostrar(false)
    window.addEventListener('beforeinstallprompt', aoPoderInstalar)
    window.addEventListener('appinstalled', aoInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', aoPoderInstalar)
      window.removeEventListener('appinstalled', aoInstalar)
    }
  }, [])

  function dispensar() {
    salvarLocal(CHAVE_DISPENSOU, String(Date.now()))
    setMostrar(false)
    setInstrucoesIphone(false)
  }

  async function instalar() {
    if (prompt) {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      setPrompt(null)
      if (outcome === 'accepted') setMostrar(false)
      return
    }
    setInstrucoesIphone(true)
  }

  if (!mostrar) return null

  return (
    <>
      <div className="instalar-barra" role="region" aria-label="Instalar app">
        <img src="/icon-192.png" alt="" className="instalar-icone" />
        <div className="instalar-texto">
          <strong>Instale o app dos Rolês</strong>
          <span>Abre direto da tela inicial, sem precisar procurar o link.</span>
        </div>
        <button className="btn btn-primario" onClick={instalar}>
          Instalar
        </button>
        <button className="instalar-fechar" onClick={dispensar} aria-label="Agora não">
          ✕
        </button>
      </div>

      {instrucoesIphone && (
        <div className="modal-fundo" onClick={() => setInstrucoesIphone(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="instalar-titulo" onClick={(e) => e.stopPropagation()}>
            <h3 id="instalar-titulo">Instalar no iPhone</h3>
            <ol className="instalar-passos">
              <li>
                Abra este site no <strong>Safari</strong>.
              </li>
              <li>
                Toque no botão <strong>Compartilhar</strong> <span className="instalar-simbolo">⬆︎</span> na barra de baixo.
              </li>
              <li>
                Role e toque em <strong>Adicionar à Tela de Início</strong>.
              </li>
              <li>
                Toque em <strong>Adicionar</strong>. Pronto: o ícone da Alcance aparece na tela inicial.
              </li>
            </ol>
            <div className="modal-acoes">
              <button className="btn" onClick={dispensar}>
                Agora não
              </button>
              <button className="btn btn-primario" onClick={() => setInstrucoesIphone(false)}>
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
