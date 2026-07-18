import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  supabase, getRecordarSesion, setIdSesionActual, getIdSesionActual, cerrarSesionAlSalir,
} from '../lib/supabase'
import { ROL_LABEL } from '../lib/catalogos'
import { dispositivoActual } from '../lib/dispositivo'

export type ModuloCodigo = 'ADM' | 'GPI' | 'GPE' | 'PCO' | 'CAC'

interface Perfil {
  id_usuario: string
  nombre_usuario: string
  correo_electronico: string
  requiere_cambio_password: boolean
  id_persona: string
  nombre_completo: string
}

interface AuthState {
  session: Session | null
  perfil: Perfil | null
  /** Best-effort: `usuario_rol` solo es legible por ADM/DIR (doc 02). Puede quedar vacío para el resto. */
  roles: string[]
  /** Etiqueta de rol para mostrar en UI, derivada de permisos/módulos — funciona para los 7 roles. */
  rolLabel: string
  permisos: Set<string>
  modulos: ModuloCodigo[]
  esGuardia: boolean
  cargando: boolean
  /** true cuando el usuario llegó por un enlace de recuperación de contraseña (evento PASSWORD_RECOVERY). */
  recuperacion: boolean
  tiene: (codigo: string) => boolean
  refrescarPerfil: () => Promise<void>
  cerrarSesion: () => Promise<void>
}

/**
 * Deriva una etiqueta de rol legible SIN depender de `usuario_rol` (bloqueada por RLS para
 * todos los roles salvo ADM/DIR, doc 02 matriz ADM). Se basa en permisos efectivos + módulos
 * permitidos — nunca en el nombre de rol (05 §2.6). CAC_EVENTO_INSERT es exclusivo del guardia
 * (única fila con INSERT en evento_acceso fuera de DISP, doc 02 tabla CAC), verificado en vivo
 * contra las cuentas reales guardia.demo y carlos.chavez03 el 2026-07-14.
 */
function derivarRolLabel(permisos: Set<string>, modulos: ModuloCodigo[]): string {
  const tiene = (c: string) => permisos.has(c)
  if (tiene('CAC_EVENTO_INSERT')) return 'Guardia de Seguridad'
  if (modulos.includes('ADM')) return tiene('ADM_USUARIO_INSERT') ? 'Administrador del Sistema' : 'Director Administrativo'
  if (modulos.includes('GPI')) return 'Responsable de Personal Interno'
  if (modulos.includes('GPE')) return 'Responsable de Personal Externo'
  if (modulos.includes('PCO')) return 'Responsable de Puntos de Control'
  if (modulos.includes('CAC')) return 'Responsable de Control de Accesos'
  return '—'
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [permisos, setPermisos] = useState<Set<string>>(new Set())
  const [modulos, setModulos] = useState<ModuloCodigo[]>([])
  const [cargando, setCargando] = useState(true)
  const [recuperacion, setRecuperacion] = useState(false)

  /** Carga permisos efectivos, módulos permitidos, roles y el perfil del usuario. */
  const cargarContexto = useCallback(async (uid: string) => {
    const [permRes, modRes, perfilRes, rolesRes] = await Promise.all([
      supabase.rpc('permisos_efectivos'),
      supabase.rpc('allowed_modules'),
      supabase
        .from('usuario_sistema')
        .select('id_usuario, nombre_usuario, correo_electronico, requiere_cambio_password, id_persona, persona:persona!usuario_sistema_id_persona_fkey(nombres, apellidos)')
        .eq('id_usuario', uid)
        .maybeSingle(),
      supabase
        .from('usuario_rol')
        .select('rol:rol(nombre_rol)')
        .eq('id_usuario', uid)
        .eq('estado_asignacion', 'ACTIVO'),
    ])

    setPermisos(new Set((permRes.data as string[] | null) ?? []))
    setModulos(((modRes.data as string[] | null) ?? []) as ModuloCodigo[])

    const p = perfilRes.data as
      | { id_usuario: string; nombre_usuario: string; correo_electronico: string; requiere_cambio_password: boolean; id_persona: string; persona: { nombres: string; apellidos: string } | null }
      | null
    if (p) {
      setPerfil({
        id_usuario: p.id_usuario,
        nombre_usuario: p.nombre_usuario,
        correo_electronico: p.correo_electronico,
        requiere_cambio_password: p.requiere_cambio_password,
        id_persona: p.id_persona,
        nombre_completo: p.persona ? `${p.persona.nombres} ${p.persona.apellidos}` : p.nombre_usuario,
      })
    }
    const rr = (rolesRes.data as { rol: { nombre_rol: string } | null }[] | null) ?? []
    setRoles(rr.map((r) => r.rol?.nombre_rol).filter(Boolean) as string[])
  }, [])

  const refrescarPerfil = useCallback(async () => {
    if (session?.user.id) await cargarContexto(session.user.id)
  }, [session, cargarContexto])

  const cerrarSesion = useCallback(async () => {
    // Cerrar la fila de auditoría ANTES de signOut(): después, auth.uid() ya es null dentro de
    // la RPC y no habría forma de saber qué sesión cerrar. Si falla, se sale igual — quedarse
    // dentro por un error de auditoría sería peor; el barrido de pg_cron la marcará EXPIRADA.
    // Se envía el id propio para no cerrar la sesión de otro dispositivo (req 29).
    const { error } = await supabase.rpc('cerrar_sesion', { p_id_sesion: getIdSesionActual() })
    if (error) console.warn('cerrar_sesion:', error.message)
    setIdSesionActual(null)
    await supabase.auth.signOut()
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setCargando(false)
    })

    // Reaccionar a SIGNED_OUT y a la expiración de sesión de Supabase (01 §5, 05 §2.4).
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess)

      // Enlace de recuperación de contraseña: la sesión existe pero el usuario
      // solo debe ver la pantalla de restablecimiento (req 31).
      if (event === 'PASSWORD_RECOVERY') setRecuperacion(true)

      // OJO: supabase-js emite SIGNED_IN no solo al iniciar sesión, sino también cada vez que
      // la pestaña recupera visibilidad y revalida la sesión. Por eso `registrar_sesion` es
      // IDEMPOTENTE en la base (una fila ACTIVA por sesión del proveedor): antes, volver a la
      // pestaña insertaba una fila nueva y el registro mostraba decenas de sesiones abiertas.
      // Al repetirse, la llamada solo refresca la última actividad y devuelve la misma fila.
      if (event === 'SIGNED_IN' && sess) {
        // La preferencia "recordar sesión" ya decidió el almacén del token (lib/supabase);
        // aquí solo se refleja en la auditoría junto con el dispositivo (reqs 29/30).
        supabase
          .rpc('registrar_sesion', {
            p_recordar_sesion: getRecordarSesion(),
            p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : undefined,
            p_dispositivo: dispositivoActual(),
          })
          .then(({ data, error }) => {
            if (error) {
              console.warn('registrar_sesion:', error.message)
              return
            }
            // Se recuerda la fila propia para cerrarla y refrescarla sin tocar la
            // de otros dispositivos del mismo usuario (req 29).
            const fila = data as { id_sesion?: string } | null
            if (fila?.id_sesion) setIdSesionActual(fila.id_sesion)
          })
      }

      if (event === 'SIGNED_OUT' || !sess) {
        // Se olvida la fila de auditoría propia: si entra otra cuenta en este mismo
        // navegador, no debe reutilizar la sesión de la anterior.
        setIdSesionActual(null)
        setPerfil(null)
        setRoles([])
        setPermisos(new Set())
        setModulos([])
        setRecuperacion(false)
        setCargando(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // El contexto se carga cuando cambia el USUARIO, no cuando cambia el objeto
  // `session`. supabase-js entrega un objeto nuevo cada vez que revalida la sesión
  // (p. ej. al volver a la pestaña); si se dependiera de él, este efecto volvería
  // a correr, pondría `cargando` en true y REMONTARÍA toda la aplicación: eso se
  // veía como una recarga y, de paso, borraba lo escrito en los formularios.
  const idUsuario = session?.user.id ?? null
  useEffect(() => {
    if (!idUsuario) return
    let vivo = true
    setCargando(true)
    ;(async () => {
      await cargarContexto(idUsuario)
      if (vivo) setCargando(false)
    })()
    return () => {
      vivo = false
    }
  }, [idUsuario, cargarContexto])

  // Latido de actividad: renueva sesion.fecha_ultima_actividad para el timeout
  // de inactividad (req 29). Se limita a una llamada por minuto aunque el usuario
  // esté muy activo; la hora real la pone el servidor dentro de tocar_sesion().
  const ultimoLatido = useRef(0)
  useEffect(() => {
    if (!session?.user.id) return
    const latir = () => {
      const ahora = Date.now()
      if (ahora - ultimoLatido.current < 60_000) return
      ultimoLatido.current = ahora
      // Solo la sesión de este dispositivo: si no, la actividad en el PC
      // mantendría viva la del celular y el timeout de inactividad no serviría.
      // Devuelve false si la sesión fue revocada: en ese caso el token todavía no
      // ha caducado, pero ya no sirve para nada, así que se cierra sesión sola en
      // vez de dejar al usuario en una pantalla sin datos.
      supabase.rpc('tocar_sesion', { p_id_sesion: getIdSesionActual() }).then(({ data, error }) => {
        if (!error && data === false) {
          setIdSesionActual(null)
          void supabase.auth.signOut()
        }
      })
    }
    latir()
    window.addEventListener('click', latir)
    window.addEventListener('keydown', latir)
    document.addEventListener('visibilitychange', latir)
    return () => {
      window.removeEventListener('click', latir)
      window.removeEventListener('keydown', latir)
      document.removeEventListener('visibilitychange', latir)
    }
  }, [session])

  // Cerrar la pestaña debe cerrar la sesión: si no, la fila queda ACTIVA en el
  // registro hasta que la barra de inactividad la marque, y la pantalla de
  // sesiones muestra como vivas sesiones que ya no existen (req 29).
  //
  // Solo aplica cuando "recordar sesión" está DESACTIVADO: en ese caso el token
  // vive en sessionStorage (una sesión por pestaña) y cerrarla realmente la
  // termina. Con "recordar" activado el usuario espera seguir dentro al volver,
  // así que la sesión debe sobrevivir.
  useEffect(() => {
    if (!session?.access_token) return
    const alSalir = (e: PageTransitionEvent) => {
      // e.persisted: la página va a la caché de retroceso y puede reaparecer.
      if (e.persisted || getRecordarSesion()) return
      const id = getIdSesionActual()
      if (id) cerrarSesionAlSalir(id, session.access_token)
    }
    window.addEventListener('pagehide', alSalir)
    return () => window.removeEventListener('pagehide', alSalir)
  }, [session])

  const tiene = useCallback((codigo: string) => permisos.has(codigo), [permisos])
  const esGuardia = permisos.has('CAC_EVENTO_INSERT')
  // Etiqueta de rol desde el catálogo canónico (ROL_LABEL) — nunca el código crudo
  // en MAYÚSCULAS. Con varios roles activos se muestran todos (req 33).
  const rolLabel = roles.length
    ? roles.map((r) => ROL_LABEL[r] ?? r.replaceAll('_', ' ')).join(' · ')
    : derivarRolLabel(permisos, modulos)

  return (
    <Ctx.Provider
      value={{
        session, perfil, roles, rolLabel, permisos, modulos, esGuardia, cargando, recuperacion,
        tiene, refrescarPerfil, cerrarSesion,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
