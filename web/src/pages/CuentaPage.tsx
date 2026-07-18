import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { mensajeError } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { cambiarPasswordSeguro, LONGITUD_MINIMA_PASSWORD } from '../auth/password'
import { Breadcrumb } from '../components/layout/Shell'
import { Badge, Button, Card, ErrorBanner, Field, Input } from '../components/ui'

/** Cuenta propia: datos del usuario y cambio de contraseña (reqs 26/27/28). */
export function CuentaPage() {
  const { perfil, rolLabel } = useAuth()
  const [actual, setActual] = useState('')
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cambiar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!actual) { setError('Ingrese su contraseña actual.'); return }
    if (p1.length < LONGITUD_MINIMA_PASSWORD) { setError(`La contraseña debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres.`); return }
    if (p1 !== p2) { setError('Las contraseñas no coinciden.'); return }
    if (p1 === actual) { setError('La nueva contraseña debe ser distinta de la actual.'); return }
    setGuardando(true)
    try {
      // Cambio voluntario (req 26): reautentica con la actual, cambia, revoca
      // TODAS las sesiones y cierra sesión. La app vuelve al login con aviso.
      await cambiarPasswordSeguro(p1, { email: perfil?.correo_electronico, actual })
    } catch (err) {
      setError(mensajeError(err))
      setGuardando(false)
    }
  }

  return (
    <div>
      <Breadcrumb items={[{ label: 'Panel Principal', to: '/' }, { label: 'Mi cuenta' }]} />
      <h1 className="mb-4 text-xl font-bold text-navy">Mi cuenta</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 text-base font-semibold text-navy">Datos del usuario</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ink-soft">Nombre</dt><dd className="text-navy">{perfil?.nombre_completo}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">Usuario</dt><dd className="text-navy">{perfil?.nombre_usuario}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">Correo</dt><dd className="text-navy">{perfil?.correo_electronico}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">Rol</dt><dd className="text-navy">{rolLabel}</dd></div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Cambio de contraseña</dt>
              {/* Fuente de verdad: requiere_cambio_password (reqs 27/28). */}
              <dd><Badge value={perfil?.requiere_cambio_password ? 'PENDIENTE' : 'REALIZADO'} /></dd>
            </div>
          </dl>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-navy"><KeyRound className="h-5 w-5" /> Cambiar contraseña</h3>
          <p className="mb-3 text-xs text-ink-soft">
            Al cambiar la contraseña se cerrarán todas sus sesiones y deberá iniciar sesión nuevamente.
          </p>
          <form onSubmit={cambiar} className="space-y-3">
            <Field label="Contraseña actual" required>
              <Input type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" />
            </Field>
            <Field label="Nueva contraseña" required hint={`Mínimo ${LONGITUD_MINIMA_PASSWORD} caracteres.`}>
              <Input type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="Confirmar contraseña" required>
              <Input type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" />
            </Field>
            <ErrorBanner message={error} />
            <Button type="submit" loading={guardando}>Actualizar contraseña</Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
