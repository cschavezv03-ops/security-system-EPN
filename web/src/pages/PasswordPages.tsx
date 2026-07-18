import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MailCheck, ShieldCheck } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { cambiarPasswordSeguro, urlRestablecer, LONGITUD_MINIMA_PASSWORD } from '../auth/password'
import { useAuth } from '../auth/AuthProvider'
import { Button, ErrorBanner, Field, Input } from '../components/ui'

/** Marco visual común de las pantallas de autenticación. */
function MarcoAuth({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-bg p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="bg-navy px-6 py-6 text-center text-white">
          <ShieldCheck className="mx-auto h-9 w-9 text-gold" />
          <h1 className="mt-2 text-base font-semibold">{titulo}</h1>
          <p className="mt-1 text-xs text-white/60">Sistema de Seguridad — EPN</p>
        </div>
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ¿Olvidó su contraseña? (req 31)
// ---------------------------------------------------------------------------
export function OlvidoPasswordPage() {
  const [correo, setCorreo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  const solicitar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    // Flujo NATIVO de Supabase Auth: administra token, expiración, un solo uso y
    // rate limiting. Sin SMTP configurado NO llega correo, pero la respuesta al
    // usuario es SIEMPRE neutral: no revela si la cuenta existe (req 31).
    await supabase.auth.resetPasswordForEmail(correo.trim().toLowerCase(), {
      redirectTo: urlRestablecer(),
    })
    setEnviando(false)
    setEnviado(true)
  }

  if (enviado) {
    return (
      <MarcoAuth titulo="Recuperar contraseña">
        <div className="flex flex-col items-center gap-3 text-center">
          <MailCheck className="h-10 w-10 text-emerald-600" />
          <p className="text-sm text-ink">
            Si existe una cuenta asociada, recibirá instrucciones para restablecer la contraseña.
          </p>
          <Link to="/" className="mt-2 text-sm font-medium text-navy hover:underline">
            Volver al inicio de sesión
          </Link>
        </div>
      </MarcoAuth>
    )
  }

  return (
    <MarcoAuth titulo="Recuperar contraseña">
      <form onSubmit={solicitar} className="space-y-4">
        <p className="text-sm text-ink-soft">
          Ingrese el correo institucional de su cuenta. Le enviaremos un enlace para restablecer la contraseña.
        </p>
        <Field label="Correo institucional" required>
          <Input
            type="email"
            autoComplete="username"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            placeholder="usuario@epn.edu.ec"
            required
          />
        </Field>
        <Button type="submit" loading={enviando} className="w-full">
          Enviar instrucciones
        </Button>
        <Link to="/" className="block text-center text-sm text-navy hover:underline">
          Volver al inicio de sesión
        </Link>
      </form>
    </MarcoAuth>
  )
}

// ---------------------------------------------------------------------------
// Restablecer contraseña desde el enlace de recuperación (req 31)
// ---------------------------------------------------------------------------
export function RestablecerPasswordPage() {
  const { recuperacion, session } = useAuth()
  const navigate = useNavigate()
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sin sesión de recuperación válida no se puede continuar.
  if (!recuperacion && !session) {
    return (
      <MarcoAuth titulo="Restablecer contraseña">
        <div className="space-y-3 text-center">
          <p className="text-sm text-ink">El enlace no es válido o ha expirado.</p>
          <Link to="/olvido" className="text-sm font-medium text-navy hover:underline">
            Solicitar un nuevo enlace
          </Link>
        </div>
      </MarcoAuth>
    )
  }

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (p1.length < LONGITUD_MINIMA_PASSWORD) {
      setError(`La contraseña debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres.`)
      return
    }
    if (p1 !== p2) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setGuardando(true)
    try {
      // Sin reauth: la sesión de recuperación ya prueba la posesión del correo.
      // Cambia, baja el indicador, revoca TODAS las sesiones y cierra sesión.
      await cambiarPasswordSeguro(p1)
      navigate('/', { replace: true })
    } catch (err) {
      setError(mensajeError(err))
      setGuardando(false)
    }
  }

  return (
    <MarcoAuth titulo="Restablecer contraseña">
      <form onSubmit={guardar} className="space-y-4">
        <Field label="Nueva contraseña" required hint={`Mínimo ${LONGITUD_MINIMA_PASSWORD} caracteres.`}>
          <Input type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} required />
        </Field>
        <Field label="Confirmar contraseña" required>
          <Input type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} required />
        </Field>
        <ErrorBanner message={error} />
        <Button type="submit" loading={guardando} className="w-full">
          Actualizar contraseña
        </Button>
      </form>
    </MarcoAuth>
  )
}

// ---------------------------------------------------------------------------
// Cambio obligatorio de contraseña de arranque (reqs 26/27)
// ---------------------------------------------------------------------------
export function CambioObligatorioPage() {
  const { perfil, cerrarSesion } = useAuth()
  const navigate = useNavigate()
  const [actual, setActual] = useState('')
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (p1.length < LONGITUD_MINIMA_PASSWORD) {
      setError(`La contraseña debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres.`)
      return
    }
    if (p1 !== p2) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (p1 === actual) {
      setError('La nueva contraseña debe ser distinta de la temporal.')
      return
    }
    setGuardando(true)
    try {
      // Reautentica con la contraseña temporal, cambia, baja el indicador,
      // revoca sesiones y cierra sesión (reqs 26/27).
      await cambiarPasswordSeguro(p1, { email: perfil?.correo_electronico, actual })
      navigate('/', { replace: true })
    } catch (err) {
      setError(mensajeError(err))
      setGuardando(false)
    }
  }

  return (
    <MarcoAuth titulo="Debe cambiar su contraseña">
      <form onSubmit={guardar} className="space-y-4">
        <p className="text-sm text-ink-soft">
          Su cuenta usa una contraseña temporal. Debe definir una nueva antes de continuar.
        </p>
        <Field label="Contraseña temporal (actual)" required>
          <Input type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} required />
        </Field>
        <Field label="Nueva contraseña" required hint={`Mínimo ${LONGITUD_MINIMA_PASSWORD} caracteres.`}>
          <Input type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} required />
        </Field>
        <Field label="Confirmar contraseña" required>
          <Input type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} required />
        </Field>
        <ErrorBanner message={error} />
        <Button type="submit" loading={guardando} className="w-full">
          Cambiar contraseña
        </Button>
        <button type="button" onClick={cerrarSesion} className="block w-full text-center text-sm text-ink-soft hover:text-navy hover:underline">
          Cerrar sesión
        </button>
      </form>
    </MarcoAuth>
  )
}
