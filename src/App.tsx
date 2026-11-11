import { Link, Route, Routes } from 'react-router-dom'
import { configurado } from './lib/supabase'
import { useAdmin } from './lib/auth'
import RequireAdmin from './components/RequireAdmin'
import Notificacoes from './components/Notificacoes'
import Home from './pages/Home'
import EventoPage from './pages/EventoPage'
import Login from './pages/Login'
import AdminEventos from './pages/AdminEventos'
import AdminEvento from './pages/AdminEvento'

export default function App() {
  const estadoAdmin = useAdmin()

  return (
    <div className="app">
      <header className="topo">
        <Link to="/" className="marca">
          <img src="/alcance-logo.png" alt="Alcance — Rolês da Alcance" />
        </Link>
        <div className="topo-acoes">
          {estadoAdmin === 'admin' && <Notificacoes />}
          <Link to="/admin" className="btn-pilula">
            {estadoAdmin === 'admin' ? 'Painel' : 'Sou organizador'}
          </Link>
        </div>
      </header>

      {!configurado && (
        <div className="alerta alerta-erro">
          Supabase não configurado. Crie o arquivo <code>.env</code> a partir do{' '}
          <code>.env.example</code> e reinicie o <code>npm run dev</code>.
        </div>
      )}

      <main className="conteudo">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/evento/:id" element={<EventoPage />} />
          <Route path="/admin/login" element={<Login />} />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminEventos />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/evento/:id"
            element={
              <RequireAdmin>
                <AdminEvento />
              </RequireAdmin>
            }
          />
          <Route
            path="*"
            element={
              <div className="card">
                <p>Página não encontrada.</p>
                <Link to="/">Voltar para os rolês</Link>
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  )
}
