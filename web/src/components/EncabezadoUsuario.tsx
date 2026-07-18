import { cx } from './ui'
import { useAuth } from '../auth/AuthProvider'

/**
 * Encabezado de usuario reutilizable (req 33): dos líneas, nombre arriba y rol
 * debajo. Un único componente para que todos los módulos muestren lo mismo.
 *
 * Ejemplo obligatorio de la especificación (cuenta admin):
 *   Admin
 *   Administrador del Sistema
 */
export function EncabezadoUsuario({
  nombre,
  rol,
  className,
  align = 'left',
}: {
  nombre: string
  rol: string
  className?: string
  align?: 'left' | 'right'
}) {
  return (
    <div className={cx('leading-tight', align === 'right' && 'text-right', className)}>
      <p className="text-sm font-medium">{nombre}</p>
      <p className="text-[11px] opacity-70">{rol}</p>
    </div>
  )
}

/** Capitaliza la primera letra ("admin" -> "Admin"). */
function capitalizar(v: string): string {
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : v
}

/**
 * Nombre visible del usuario: su nombre personal (persona), y si ese nombre
 * coincide con la etiqueta del rol (caso de la cuenta admin, cuyo "nombre" es
 * literalmente "Administrador del Sistema") se usa el nombre de usuario para no
 * repetir el rol en las dos líneas. Así la cuenta admin muestra "Admin".
 */
export function nombreVisibleUsuario(
  nombreCompleto: string | undefined,
  nombreUsuario: string | undefined,
  rolLabel: string,
): string {
  const nombre = (nombreCompleto ?? '').trim()
  if (nombre && nombre.toLowerCase() !== rolLabel.trim().toLowerCase()) return nombre
  return capitalizar((nombreUsuario ?? nombre ?? '').trim())
}

/** Encabezado del usuario autenticado, listo para la barra superior. */
export function EncabezadoUsuarioActual({ className, align = 'right' }: { className?: string; align?: 'left' | 'right' }) {
  const { perfil, rolLabel } = useAuth()
  const nombre = nombreVisibleUsuario(perfil?.nombre_completo, perfil?.nombre_usuario, rolLabel)
  return <EncabezadoUsuario nombre={nombre || '—'} rol={rolLabel} className={className} align={align} />
}
