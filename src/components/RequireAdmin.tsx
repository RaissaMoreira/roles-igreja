import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAdmin } from '../lib/auth'
import { supabase } from '../lib/supabase'

export default function RequireAdmin({ children }: { children: ReactNode }) {
  const estado = useAdmin()

  if (estado === 'carregando') return <p className="carregando">Carregando…</p>
  if (estado === 'anonimo') return <Navigate to="/admin/login" replace />
  if (estado === 'sem-permissao') {
    return (
      <div className="card">
        <p>Sua conta não tem acesso de organização.</p>
        <button className="btn" onClick={() => supabase.auth.signOut()}>
          Sair
        </button>
      </div>
    )
  }
  return <>{children}</>
}
