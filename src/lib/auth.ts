import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type EstadoAdmin = 'carregando' | 'anonimo' | 'admin' | 'sem-permissao'

export function useAdmin(): EstadoAdmin {
  const [estado, setEstado] = useState<EstadoAdmin>('carregando')

  useEffect(() => {
    let ativo = true

    async function verificar(session: Session | null) {
      if (!session) {
        if (ativo) setEstado('anonimo')
        return
      }
      const { data } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (ativo) setEstado(data ? 'admin' : 'sem-permissao')
    }

    supabase.auth.getSession().then(({ data }) => verificar(data.session))

    // setTimeout evita chamar o Supabase dentro do callback (recomendação da lib)
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, session) => {
      setTimeout(() => verificar(session), 0)
    })

    return () => {
      ativo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return estado
}
