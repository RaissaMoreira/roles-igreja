import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAdmin } from '../lib/auth'
import { mensagemErro } from '../lib/util'

export default function Login() {
  const estado = useAdmin()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState(false)

  if (estado === 'admin') return <Navigate to="/admin" replace />

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setEntrando(true)
    setErro('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    setEntrando(false)
    if (error) {
      setErro(error.message.includes('Invalid login') ? 'E-mail ou senha incorretos.' : mensagemErro(error))
    }
    else navigate('/admin')
  }

  return (
    <form className="card form login" onSubmit={entrar}>
      <h1>Área da organização</h1>
      <label>
        E-mail
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      </label>
      <label>
        Senha
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
      </label>
      <button className="btn btn-primario btn-largo" disabled={entrando}>
        {entrando ? 'Entrando…' : 'Entrar'}
      </button>
      {erro && <p className="mensagem">{erro}</p>}
    </form>
  )
}
