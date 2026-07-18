import { createClient } from '@supabase/supabase-js'
import { supabase, mensajeError } from '../lib/supabase'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** Longitud mínima de contraseña (parametro_sistema.LONGITUD_MINIMA_PASSWORD = 8). */
export const LONGITUD_MINIMA_PASSWORD = 8

/** Aviso que se muestra en el login tras un cambio/recuperación de contraseña. */
const AVISO_KEY = 'epn.aviso_login'

export function ponerAvisoLogin(mensaje: string): void {
  try {
    window.localStorage.setItem(AVISO_KEY, mensaje)
  } catch {
    /* ignore */
  }
}

/** Lee y limpia el aviso pendiente para el login (uso único). */
export function consumirAvisoLogin(): string | null {
  try {
    const v = window.localStorage.getItem(AVISO_KEY)
    if (v) window.localStorage.removeItem(AVISO_KEY)
    return v
  } catch {
    return null
  }
}

/**
 * Reautentica al usuario en un cliente DESECHABLE (sin persistir sesión) para
 * verificar su contraseña actual sin perturbar la sesión activa de la app.
 * Requisito del cambio voluntario (req 26).
 */
export async function reautenticar(email: string, actual: string): Promise<void> {
  const tmp = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await tmp.auth.signInWithPassword({ email: email.trim(), password: actual })
  await tmp.auth.signOut().catch(() => {})
  if (error) throw new Error('La contraseña actual no es correcta.')
}

export interface OpcionesCambio {
  /** Si se pasan email + actual, se reautentica antes de cambiar (cambio voluntario). */
  email?: string
  actual?: string
}

/**
 * Cambia la contraseña de forma segura y coherente con los reqs 26/27/28/31:
 *   1. (voluntario) reautentica con la contraseña actual.
 *   2. actualiza la contraseña en el proveedor (Supabase Auth).
 *   3. baja requiere_cambio_password (fuente de verdad).
 *   4. revoca TODAS las sesiones en el proveedor + auditoría.
 *   5. cierra la sesión local.
 * Al terminar, el llamador debe redirigir al login (no se inicia sesión sola).
 */
export async function cambiarPasswordSeguro(nueva: string, opts: OpcionesCambio = {}): Promise<void> {
  if (opts.actual && opts.email) {
    await reautenticar(opts.email, opts.actual)
  }

  const { error } = await supabase.auth.updateUser({ password: nueva })
  if (error) throw new Error(mensajeError(error))

  // Solo tras confirmar el cambio con el proveedor se baja el indicador (req 27).
  await supabase.rpc('marcar_password_cambiada').then(({ error }) => {
    if (error) console.warn('marcar_password_cambiada:', error.message)
  })

  // Revocación efectiva en servidor/proveedor (reqs 26/31): todos los refresh tokens.
  await supabase.rpc('revocar_mis_sesiones', { p_motivo: 'CAMBIO_PASSWORD' }).then(({ error }) => {
    if (error) console.warn('revocar_mis_sesiones:', error.message)
  })

  // Mensaje para el login (no se inicia sesión automáticamente).
  ponerAvisoLogin('La contraseña se actualizó correctamente. Inicie sesión nuevamente.')

  // Cierra la sesión local; el usuario debe volver a iniciar sesión.
  await supabase.auth.signOut()
}

/** URL a la que el proveedor devuelve el enlace de recuperación. */
export function urlRestablecer(): string {
  return `${window.location.origin}/restablecer`
}
