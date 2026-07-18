import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copia web/.env.example a web/.env.local.',
  )
}

// -----------------------------------------------------------------------------
// "Recordar sesión" funcional y seguro (req 30).
//
// NUNCA se guarda la contraseña ni se autocompleta. Lo único que cambia es DÓNDE
// vive el refresh token del proveedor:
//   - recordar = true  -> localStorage: la sesión sobrevive al cierre del navegador.
//   - recordar = false -> sessionStorage: se borra al cerrar la pestaña/navegador.
// La preferencia es del navegador/dispositivo (spec §30): en otro navegador hay
// que autenticarse de nuevo. El token sigue siendo del proveedor (Supabase Auth),
// rotatorio y revocable desde el servidor.
// -----------------------------------------------------------------------------
const RECORDAR_KEY = 'epn.recordar_sesion'

export function setRecordarSesion(recordar: boolean): void {
  try {
    localStorage.setItem(RECORDAR_KEY, recordar ? 'true' : 'false')
  } catch {
    /* almacenamiento no disponible: la sesión será de pestaña */
  }
}

export function getRecordarSesion(): boolean {
  try {
    return localStorage.getItem(RECORDAR_KEY) === 'true'
  } catch {
    return false
  }
}

function almacenActivo(): Storage {
  return getRecordarSesion() ? window.localStorage : window.sessionStorage
}

/** Storage que enruta el token del proveedor al almacén elegido por "recordar sesión".
 *  Solo guarda tokens de Supabase Auth; jamás contraseñas. */
const storageRecordar = {
  getItem(key: string): string | null {
    return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key)
  },
  setItem(key: string, value: string): void {
    const destino = almacenActivo()
    destino.setItem(key, value)
    // Evita dejar una copia en el otro almacén (p. ej. tras cambiar la preferencia).
    const otro = destino === window.localStorage ? window.sessionStorage : window.localStorage
    otro.removeItem(key)
  },
  removeItem(key: string): void {
    window.localStorage.removeItem(key)
    window.sessionStorage.removeItem(key)
  },
}

// Un ÚNICO cliente, anon key pública (nunca service_role). docs/05_API_PARA_FRONTEND.md §1.
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Necesario para el enlace de recuperación de contraseña (evento PASSWORD_RECOVERY).
    detectSessionInUrl: true,
    storage: storageRecordar,
  },
})

/**
 * Acceso a una tabla por nombre dinámico (motor genérico de recursos). El cliente tipado
 * exige un literal de tabla; aquí el nombre viene de la config, así que relajamos el tipo.
 */
export function fromTable(tabla: string) {
  return (supabase as any).from(tabla)
}

/** Traduce un error de PostgREST/Supabase a texto legible. Un 403/permiso se muestra tal cual (05 §2.6). */
export function mensajeError(error: unknown): string {
  if (!error) return 'Error desconocido.'
  const e = error as { message?: string; error_description?: string; hint?: string }
  return e.message || e.error_description || e.hint || String(error)
}
