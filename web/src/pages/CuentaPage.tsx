import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, MonitorSmartphone } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { cambiarPasswordSeguro, LONGITUD_MINIMA_PASSWORD } from '../auth/password'
import { fmtFechaHora } from '../lib/format'
import { describirDispositivo } from '../lib/dispositivo'
import { getIdSesionActual } from '../lib/supabase'
import { Breadcrumb } from '../components/layout/Shell'
import { Badge, Button, Card, CenterSpinner, EmptyState, ErrorBanner, Field, Input } from '../components/ui'

interface SesionPropia {
  id_sesion: string
  fecha_inicio: string
  fecha_ultima_actividad: string | null
  fecha_expiracion: string
  estado_sesion: string
  recordar_sesion: boolean
  user_agent: string | null
  dispositivo_nombre: string | null
}

/** Cuenta propia: datos del usuario y cambio de contraseña (reqs 26/27/28). */
export function CuentaPage() {
  const { perfil, rolLabel } = useAuth()
  const navigate = useNavigate()
  const [actual, setActual] = useState('')
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sesiones propias (req 29). La política RLS de `sesion` ya limita a
  // id_usuario = auth.uid(); nunca se selecciona token_hash.
  const [sesiones, setSesiones] = useState<SesionPropia[] | null>(null)
  const [cerrandoSesiones, setCerrandoSesiones] = useState(false)

  const cargarSesiones = useCallback(async () => {
    if (!perfil?.id_usuario) return
    // Filtro explícito por id_usuario: la política RLS es
    // `id_usuario = auth.uid() OR tiene_permiso('ADM_USUARIO_SELECT')`, así que
    // sin él un administrador vería aquí las sesiones de TODOS los usuarios.
    const { data } = await supabase
      .from('sesion')
      .select('id_sesion, fecha_inicio, fecha_ultima_actividad, fecha_expiracion, estado_sesion, recordar_sesion, user_agent, dispositivo_nombre')
      .eq('id_usuario', perfil.id_usuario)
      .eq('estado_sesion', 'ACTIVA')
      .order('fecha_inicio', { ascending: false })
      .limit(20)
    setSesiones((data as SesionPropia[] | null) ?? [])
  }, [perfil?.id_usuario])

  useEffect(() => {
    cargarSesiones()
  }, [cargarSesiones])

  const cerrarTodas = async () => {
    setCerrandoSesiones(true)
    // Revoca en el proveedor (GoTrue) y marca la auditoría; incluye esta sesión,
    // así que el usuario deberá iniciar sesión de nuevo.
    await supabase.rpc('revocar_mis_sesiones', { p_motivo: 'CIERRE_MANUAL' })
    await supabase.auth.signOut()
  }

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
      // La URL debe dejar de apuntar a /cuenta: si no, al volver a iniciar sesión
      // el enrutador regresaría aquí en vez de al panel principal.
      navigate('/', { replace: true })
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

        {/* Sesiones activas del propio usuario (req 29): fecha, dispositivo
            aproximado y estado, nunca el token. */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-base font-semibold text-navy">
              <MonitorSmartphone className="h-5 w-5" /> Sesiones activas
            </h3>
            {sesiones && sesiones.length > 0 && (
              <Button variant="secondary" loading={cerrandoSesiones} onClick={cerrarTodas}>
                Cerrar todas mis sesiones
              </Button>
            )}
          </div>

          {sesiones === null ? (
            <CenterSpinner label="Cargando sesiones..." />
          ) : sesiones.length === 0 ? (
            <EmptyState title="No hay sesiones activas registradas" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-soft">
                    <th className="py-2 pr-4 font-medium">Dispositivo</th>
                    <th className="py-2 pr-4 font-medium">Inicio</th>
                    <th className="py-2 pr-4 font-medium">Última actividad</th>
                    <th className="py-2 pr-4 font-medium">Expira</th>
                    <th className="py-2 font-medium">Recordada</th>
                  </tr>
                </thead>
                <tbody>
                  {sesiones.map((s) => (
                    <tr key={s.id_sesion} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-4 text-navy">
                        {s.dispositivo_nombre || describirDispositivo(s.user_agent)}
                        {s.id_sesion === getIdSesionActual() && (
                          <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                            Este dispositivo
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-ink-soft">{fmtFechaHora(s.fecha_inicio)}</td>
                      <td className="py-2 pr-4 text-ink-soft">{fmtFechaHora(s.fecha_ultima_actividad)}</td>
                      <td className="py-2 pr-4 text-ink-soft">{fmtFechaHora(s.fecha_expiracion)}</td>
                      <td className="py-2">{s.recordar_sesion ? 'Sí' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
