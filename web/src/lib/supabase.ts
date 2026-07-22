import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { traducirError } from './errores'

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

// -----------------------------------------------------------------------------
// Identificador de la fila de auditoría `sesion` de ESTE dispositivo.
//
// Cada dispositivo debe cerrar y refrescar SU propia sesión: sin esto, cerrar
// sesión en el celular marcaba como cerrada la fila del PC (req 29). Se guarda en
// el mismo almacén que el token, así que sigue la preferencia de "recordar sesión"
// y desaparece con ella. No es un secreto: es solo el id de una fila de auditoría.
// -----------------------------------------------------------------------------
const ID_SESION_KEY = 'epn.id_sesion'

export function setIdSesionActual(id: string | null): void {
  try {
    if (id) storageRecordar.setItem(ID_SESION_KEY, id)
    else storageRecordar.removeItem(ID_SESION_KEY)
  } catch {
    /* almacenamiento no disponible */
  }
}

export function getIdSesionActual(): string | undefined {
  try {
    return storageRecordar.getItem(ID_SESION_KEY) ?? undefined
  } catch {
    return undefined
  }
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
 * Inicio de sesión a través de la Edge Function `iniciar-sesion`, que aplica la
 * política de intentos fallidos (MAX_INTENTOS_LOGIN / TIEMPO_BLOQUEO_CUENTA_MIN).
 *
 * No se usa `signInWithPassword` directamente porque entonces la base de datos
 * nunca se entera de un intento fallido y el contador se queda en cero: el
 * sistema quedaba abierto a fuerza bruta. Cuando la cuenta se bloquea, el backend
 * escribe además `auth.users.banned_until`, así que GoTrue rechaza el acceso
 * aunque se llame a su API directamente.
 *
 * Devuelve `null` si todo fue bien, o el mensaje de error ya en español.
 */
export async function iniciarSesion(email: string, password: string): Promise<string | null> {
  let respuesta: Response
  try {
    respuesta = await fetch(`${url}/functions/v1/iniciar-sesion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    })
  } catch {
    return 'No se pudo conectar con el servidor. Revise su conexión a internet.'
  }

  const datos = (await respuesta.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    error_code?: string
    minutos_restantes?: number | null
    intentos_restantes?: number | null
    message?: string
    error?: string
  }

  if (respuesta.ok && datos.access_token && datos.refresh_token) {
    // Instala la sesión en el cliente; esto emite SIGNED_IN y dispara el registro
    // de sesión de auditoría en AuthProvider, igual que un login normal.
    const { error } = await supabase.auth.setSession({
      access_token: datos.access_token,
      refresh_token: datos.refresh_token,
    })
    return error ? traducirError(error) : null
  }

  // El mensaje se compone aquí para garantizar la ortografía en español.
  if (datos.error_code === 'account_locked') {
    const min = datos.minutos_restantes
    return (
      'Cuenta bloqueada temporalmente por superar el máximo de intentos fallidos. ' +
      (min
        ? `Podrá intentarlo de nuevo en ${min} minuto${min === 1 ? '' : 's'}, `
        : 'Podrá intentarlo más tarde, ') +
      'o solicitar el desbloqueo al administrador.'
    )
  }
  if (datos.error_code === 'account_blocked_by_admin') {
    return 'La cuenta fue bloqueada por el administrador. Solicite su desbloqueo.'
  }
  if (datos.error_code === 'account_deactivated') {
    return 'La cuenta fue dada de baja. Solicite su reactivación al administrador.'
  }
  if (datos.error_code === 'account_inactive') {
    return 'La cuenta está inactiva. Solicite su activación al administrador.'
  }
  if (datos.error_code === 'account_state_unavailable') {
    return 'No se pudo verificar el estado de la cuenta. Inténtelo nuevamente.'
  }
  if (datos.error_code === 'invalid_credentials') {
    const quedan = datos.intentos_restantes
    return quedan != null && quedan > 0
      ? `Correo o contraseña incorrectos. Le quedan ${quedan} intento${quedan === 1 ? '' : 's'} antes de que la cuenta se bloquee.`
      : 'Correo o contraseña incorrectos.'
  }

  return traducirError(datos.error ? { message: datos.error } : datos)
}

/**
 * Cierra la fila de auditoría de ESTA sesión mientras la página se está cerrando.
 *
 * Se usa `keepalive`, que es lo que garantiza que el navegador termine de enviar
 * la petición aunque la pestaña ya se esté destruyendo; un `await` normal se
 * cancelaría. No sirve `supabase.rpc` aquí porque no expone esa opción.
 */
export function cerrarSesionAlSalir(idSesion: string, accessToken: string): void {
  try {
    void fetch(`${url}/rest/v1/rpc/cerrar_sesion`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ p_id_sesion: idSesion }),
    }).catch(() => {})
  } catch {
    /* la página se está cerrando: no hay nada que reportar */
  }
}

/**
 * Acceso a una tabla por nombre dinámico (motor genérico de recursos). El cliente tipado
 * exige un literal de tabla; aquí el nombre viene de la config, así que relajamos el tipo.
 */
export function fromTable(tabla: string) {
  return (supabase as any).from(tabla)
}

/**
 * Mensaje de error listo para mostrar al usuario, SIEMPRE en español (req 25).
 *
 * Antes devolvía `error.message` tal cual, así que el usuario veía textos crudos
 * del proveedor como "Invalid login credentials" o incluso detalle de SQL. La
 * traducción vive en lib/errores.ts; aquí solo se reexporta para no tocar los
 * ~40 puntos que ya llaman a esta función.
 */
export function mensajeError(error: unknown): string {
  return traducirError(error)
}
