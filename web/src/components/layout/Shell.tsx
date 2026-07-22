import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, LogOut, UserCircle } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { Logo } from '../Logo'
import { Button } from '../ui'
import { EncabezadoUsuarioActual } from '../EncabezadoUsuario'

/** Barra superior fija (07 §2.3). Sin barra de KPIs. */
export function TopBar() {
  const { cerrarSesion } = useAuth()
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-navy-700/40 bg-navy px-4 text-white">
      <Link to="/" className="flex items-center gap-2.5">
        <Logo className="h-7 w-7" />
        <div className="leading-tight">
          <p className="text-sm font-semibold">Sistema de Seguridad — EPN</p>
          <p className="text-[11px] text-white/60">Control de Accesos</p>
        </div>
      </Link>
      <div className="flex items-center gap-4">
        {/* Acceso a "Mi cuenta": es la ÚNICA vía para el cambio voluntario de
            contraseña (req 26) y para ver las sesiones activas (req 29). El
            encabezado usuario/rol (req 33) hace de disparador. */}
        <Link
          to="/cuenta"
          title="Mi cuenta"
          className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-gold/60"
        >
          <UserCircle className="h-6 w-6 shrink-0 text-white/70" />
          <EncabezadoUsuarioActual className="hidden sm:block" />
        </Link>
        <span className="hidden items-center gap-1.5 text-xs text-emerald-300 md:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-400" /> En línea
        </span>
        <Button variant="danger" onClick={cerrarSesion} className="px-3 py-1.5">
          <LogOut className="h-4 w-4" /> Salir
        </Button>
      </div>
    </header>
  )
}

export interface Miga {
  label: string
  to?: string
}

/** Breadcrumb creciente (07 §2.4/2.5). */
export function Breadcrumb({ items }: { items: Miga[] }) {
  const navigate = useNavigate()
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-ink-soft">
      {items.map((m, i) => {
        const last = i === items.length - 1
        return (
          <span key={i} className="flex items-center gap-1">
            {m.to && !last ? (
              <button onClick={() => navigate(m.to!)} className="hover:text-navy hover:underline">
                {m.label}
              </button>
            ) : (
              <span className={last ? 'font-medium text-navy' : ''}>{m.label}</span>
            )}
            {!last && <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
          </span>
        )
      })}
    </nav>
  )
}

export function PageContainer({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
}

export function PageHeader({ titulo, subtitulo, accion }: { titulo: string; subtitulo?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-navy">{titulo}</h1>
        {subtitulo && <p className="mt-0.5 text-sm text-ink-soft">{subtitulo}</p>}
      </div>
      {accion}
    </div>
  )
}
