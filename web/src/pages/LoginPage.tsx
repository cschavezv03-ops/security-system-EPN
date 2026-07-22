import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { Logo } from '../components/Logo'
import { iniciarSesion, setRecordarSesion } from '../lib/supabase'
import { consumirAvisoLogin } from '../auth/password'
import { Button, ErrorBanner, Field, Input } from '../components/ui'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [ver, setVer] = useState(false)
  const [recordar, setRecordar] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso] = useState<string | null>(() => consumirAvisoLogin())

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setCargando(true)
    // "Recordar sesión" decide el almacén del token ANTES de iniciar sesión (req 30).
    setRecordarSesion(recordar)
    // Pasa por la Edge Function `iniciar-sesion`, que aplica la política de
    // intentos fallidos antes de verificar la contraseña. El AuthProvider
    // reacciona al SIGNED_IN que emite setSession.
    const fallo = await iniciarSesion(email, password)
    setCargando(false)
    if (fallo) {
      setError(fallo)
      return
    }
    // Tras iniciar sesión SIEMPRE se entra al panel principal. El login se renderiza
    // con la ruta comodín, así que la URL puede haber quedado en una pantalla previa
    // (p. ej. /cuenta tras cambiar la contraseña); sin esto, el enrutador volvería
    // allí en vez de al panel. Si la cuenta tiene cambio de contraseña pendiente,
    // el guard de App muestra igualmente la pantalla de cambio obligatorio.
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-bg p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="bg-navy px-6 py-7 text-center text-white">
          <Logo className="mx-auto h-16 w-16" />
          <h1 className="mt-3 text-lg font-semibold">Sistema de Seguridad — EPN</h1>
          <p className="mt-1 text-xs text-white/60">Control de Accesos · Escuela Politécnica Nacional</p>
          <div className="mx-auto mt-3 h-0.5 w-16 rounded bg-gold" />
        </div>

        <form onSubmit={entrar} className="space-y-4 px-6 py-6">
          {aviso && (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{aviso}</span>
            </div>
          )}
          {/* htmlFor + id: sin ellos la etiqueta no queda asociada al campo, así que
              un lector de pantalla no la anuncia al enfocarlo. */}
          <Field label="Usuario (correo institucional)" required htmlFor="login-usuario">
            <Input
              id="login-usuario"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@epn.edu.ec"
              required
            />
          </Field>
          <Field label="Contraseña" required htmlFor="login-password">
            <div className="relative">
              <Input
                id="login-password"
                type={ver ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setVer((v) => !v)}
                className="absolute right-2 top-2 rounded p-1 text-slate-400 hover:text-navy"
                tabIndex={-1}
              >
                {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-ink-soft" title="Mantiene la sesión iniciada en este navegador. Nunca guarda la contraseña.">
              <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} className="h-4 w-4" />
              Recordar sesión
            </label>
            <Link to="/olvido" className="text-navy hover:underline">
              ¿Olvidó su contraseña?
            </Link>
          </div>

          <ErrorBanner message={error} />

          <Button type="submit" loading={cargando} className="w-full">
            Ingresar al sistema
          </Button>
        </form>
      </div>
    </div>
  )
}
