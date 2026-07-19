import { useEffect, useMemo, useState } from 'react'
import { KeyRound, Lock, Plus, Search, ShieldCheck, UserPlus, UserX, X } from 'lucide-react'
import { supabase, mensajeError } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthProvider'
import { fmtFecha, fmtFechaHora } from '../../lib/format'
import {
  Badge, Button, Card, CenterSpinner, EmptyState, ErrorBanner, Field, Input, Modal, Select,
  SidePanel, useToast,
} from '../../components/ui'
import { ROL_LABEL, humanizar } from '../../lib/catalogos'
import { validarCorreoInstitucional, validarNombreUsuario } from '../../lib/validacion'
import { useBorrador } from '../../lib/useBorrador'
import { BuscarPersonaPorCedula, type PersonaCedula } from '../../components/BuscarPersonaPorCedula'

interface Asignacion {
  id_usuario_rol: string
  estado_asignacion: string
  fecha_asignacion: string
  fecha_revocacion: string | null
  observacion: string | null
  rol?: { id_rol: string; nombre_rol: string } | null
}

interface Usuario {
  id_usuario: string
  nombre_usuario: string
  correo_electronico: string
  estado_usuario: string
  requiere_cambio_password: boolean
  fecha_ultimo_login: string | null
  intentos_fallidos: number
  /** Bloqueo TEMPORAL por intentos fallidos; distinto de estado_usuario = BLOQUEADO. */
  bloqueado_hasta: string | null
  persona?: { nombres: string; apellidos: string; cedula: string } | null
  roles?: Asignacion[]
}

/** ¿La cuenta está bloqueada AHORA por intentos fallidos? El bloqueo caduca solo. */
function bloqueoVigente(u: { bloqueado_hasta: string | null }): boolean {
  return !!u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date()
}

/**
 * Estado que se MUESTRA, combinando los dos bloqueos que existen en el modelo:
 * el administrativo (`estado_usuario`, permanente) y el temporal por intentos
 * fallidos (`bloqueado_hasta`, que caduca solo).
 *
 * Son columnas distintas a propósito — si el temporal cambiara `estado_usuario`
 * dejaría de desbloquearse automáticamente —, pero para quien mira la pantalla
 * una cuenta que no puede entrar no puede aparecer como "Activo".
 */
function estadoEfectivo(u: { estado_usuario: string; bloqueado_hasta: string | null }): string {
  return u.estado_usuario === 'ACTIVO' && bloqueoVigente(u) ? 'BLOQUEO_TEMPORAL' : u.estado_usuario
}

/** Etiqueta legible del rol, con el mapa de nombres propios del sistema. */
const nombreRol = (a: Asignacion): string =>
  a.rol ? (ROL_LABEL[a.rol.nombre_rol] ?? humanizar(a.rol.nombre_rol)) : '—'

/**
 * Fecha en la que el estado ACTUAL de la asignación empezó a regir: la de revocación si
 * está revocada, la de asignación si sigue activa. Es la "fecha de estado" que pide el
 * documento de requerimientos, y sin ella una asignación revocada no dice cuándo lo fue.
 */
const fechaEstado = (a: Asignacion): string | null =>
  a.estado_asignacion === 'REVOCADO' ? a.fecha_revocacion : a.fecha_asignacion

const activas = (u: Usuario): Asignacion[] => (u.roles ?? []).filter((a) => a.estado_asignacion === 'ACTIVO')

/**
 * Usuarios del sistema, con sus roles (feedback ADM).
 *
 * Antes eran dos tarjetas: "Usuarios" y "Asignaciones de rol". Al crear una cuenta se
 * elegía el rol, pero luego no aparecía por ningún lado en la pantalla de usuarios: había
 * que abrir la otra para verlo. Ahora es un solo apartado, "Usuarios", que muestra rol,
 * cédula, fecha de asignación y fecha de estado, y desde el que se asigna y se revoca.
 *
 * Sigue siendo una pantalla dedicada y no una configuración genérica de `ResourceScreen`
 * porque cada transición de estado tiene su propio permiso granular (bloquear/desbloquear/
 * activar/dar de baja) en vez de un solo ADM_USUARIO_UPDATE — y "restablecer contraseña"
 * no es ni siquiera un UPDATE de esta tabla, es la Auth Admin API vía Edge Function.
 */
export function UsuariosScreen() {
  const { tiene, perfil } = useAuth()
  const toast = useToast()
  const puedeLeer = tiene('ADM_USUARIO_SELECT')
  const puedeVerRoles = tiene('ADM_USUARIO_ROL_SELECT')

  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [sel, setSel] = useState<Usuario | null>(null)
  const [accionando, setAccionando] = useState(false)
  const [passwordModal, setPasswordModal] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)

  const cargar = async () => {
    setCargando(true)
    // Los roles se traen embebidos: una consulta en lugar de una por usuario, y así la
    // tabla puede mostrarlos sin saltar a otra pantalla.
    const select = puedeVerRoles
      ? 'id_usuario, nombre_usuario, correo_electronico, estado_usuario, requiere_cambio_password, fecha_ultimo_login, intentos_fallidos, bloqueado_hasta, persona:persona!usuario_sistema_id_persona_fkey(nombres, apellidos, cedula), roles:usuario_rol(id_usuario_rol, estado_asignacion, fecha_asignacion, fecha_revocacion, observacion, rol:rol(id_rol, nombre_rol))'
      : 'id_usuario, nombre_usuario, correo_electronico, estado_usuario, requiere_cambio_password, fecha_ultimo_login, intentos_fallidos, bloqueado_hasta, persona:persona!usuario_sistema_id_persona_fkey(nombres, apellidos, cedula)'
    const { data, error } = await supabase.from('usuario_sistema').select(select).order('nombre_usuario')
    if (error) setError(mensajeError(error))
    const filas = (data as unknown as Usuario[] | null) ?? []
    setUsuarios(filas)
    // Mantiene abierto el panel del usuario seleccionado con los datos recién cargados.
    setSel((s) => (s ? filas.find((u) => u.id_usuario === s.id_usuario) ?? null : null))
    setCargando(false)
  }

  useEffect(() => {
    if (puedeLeer) cargar()
    else setCargando(false)
  }, [puedeLeer])

  const filtrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return usuarios
    return usuarios.filter((u) =>
      [
        u.nombre_usuario,
        u.correo_electronico,
        u.persona?.cedula,
        u.persona?.apellidos,
        u.persona?.nombres,
        ...(u.roles ?? []).map(nombreRol),
      ].some((c) => String(c ?? '').toLowerCase().includes(t)),
    )
  }, [usuarios, busqueda])

  /** Reinicia el contador de intentos fallidos y levanta el bloqueo temporal. */
  const desbloquearIntentos = async () => {
    if (!sel) return
    setAccionando(true)
    const { error } = await supabase.rpc('desbloquear_intentos_login', { p_id_usuario: sel.id_usuario })
    setAccionando(false)
    if (error) {
      toast('error', mensajeError(error))
      return
    }
    toast('ok', 'Cuenta desbloqueada.')
    await cargar()
  }

  const cambiarEstado = async (nuevoEstado: string) => {
    if (!sel) return
    setAccionando(true)
    const { error } = await supabase.from('usuario_sistema').update({ estado_usuario: nuevoEstado }).eq('id_usuario', sel.id_usuario)
    setAccionando(false)
    if (error) {
      toast('error', mensajeError(error))
      return
    }
    toast('ok', 'Estado actualizado.')
    await cargar()
  }

  /** Llama a una Edge Function con el JWT del usuario actual (ella verifica el permiso granular). */
  const llamarFuncion = async (nombre: string, cuerpo: unknown) => {
    const { data: sess } = await supabase.auth.getSession()
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${nombre}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        Authorization: `Bearer ${sess.session?.access_token}`,
      },
      body: JSON.stringify(cuerpo),
    })
    return { ok: resp.ok, json: await resp.json() }
  }

  const resetearPassword = async () => {
    if (!sel) return
    setAccionando(true)
    const { ok, json } = await llamarFuncion('resetear-password-usuario', { id_usuario: sel.id_usuario })
    setAccionando(false)
    if (!ok) {
      toast('error', json.error ?? 'No se pudo restablecer la contraseña.')
      return
    }
    setPasswordModal(json.password_temporal)
    await cargar()
  }

  const esMiCuenta = !!sel && sel.id_usuario === perfil?.id_usuario

  if (!puedeLeer) return <EmptyState title="No tienes acceso a los usuarios" hint="Pide acceso al administrador del sistema." />

  return (
    <div>
      <ErrorBanner message={error} />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por usuario, correo, cédula o rol..."
            aria-label="Buscar usuarios"
            className="epn-input pl-9"
          />
        </div>
        {/* Antes no había forma de crear una cuenta desde el sistema: había que sembrarla con un
            script. Necesario cuando un encargado de módulo deja la EPN y entra su reemplazo. */}
        {tiene('ADM_USUARIO_INSERT') && (
          <Button onClick={() => setCreando(true)}>
            <UserPlus className="h-4 w-4" />
            Crear usuario
          </Button>
        )}
      </div>

      {creando && (
        <CrearUsuarioPanel
          onCerrar={() => setCreando(false)}
          onCreado={async (password) => {
            setCreando(false)
            setPasswordModal(password)
            await cargar()
          }}
          llamarFuncion={llamarFuncion}
        />
      )}
      <Card className="overflow-hidden">
        {cargando ? (
          <CenterSpinner label="Cargando usuarios..." />
        ) : filtrados.length === 0 ? (
          <EmptyState title="Sin resultados" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase text-ink-soft">
                  <th className="px-4 py-2.5">Usuario</th>
                  <th className="px-4 py-2.5">Persona</th>
                  <th className="px-4 py-2.5">Cédula</th>
                  <th className="px-4 py-2.5">Rol</th>
                  <th className="px-4 py-2.5">Estado de la cuenta</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((u) => (
                  <tr key={u.id_usuario} onClick={() => setSel(u)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-navy">{u.nombre_usuario}</div>
                      <div className="text-xs text-ink-soft">{u.correo_electronico}</div>
                    </td>
                    <td className="px-4 py-2.5">{u.persona ? `${u.persona.apellidos} ${u.persona.nombres}` : '—'}</td>
                    <td className="px-4 py-2.5">{u.persona?.cedula ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      {!puedeVerRoles ? (
                        <span className="text-xs text-ink-soft">Sin permiso para ver roles</span>
                      ) : activas(u).length === 0 ? (
                        // Una cuenta sin rol no ve nada al entrar: conviene que salte a la vista.
                        <span className="text-xs text-amber-700">Sin rol asignado</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {activas(u).map((a) => (
                            <li key={a.id_usuario_rol}>
                              <span className="text-navy">{nombreRol(a)}</span>{' '}
                              <span className="text-xs text-ink-soft">desde {fmtFecha(a.fecha_asignacion)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-2.5"><Badge value={estadoEfectivo(u)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-2 text-xs text-slate-400">{filtrados.length} usuario(s)</p>

      <SidePanel open={!!sel} onClose={() => setSel(null)} title={sel?.nombre_usuario}>
        {sel && (
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge value={estadoEfectivo(sel)} />
              {sel.requiere_cambio_password && <Badge value="CAMBIO_PENDIENTE" />}
            </div>
            <dl className="mb-5 divide-y divide-slate-100">
              <Row label="Correo" val={sel.correo_electronico} />
              <Row label="Persona" val={sel.persona ? `${sel.persona.nombres} ${sel.persona.apellidos}` : '—'} />
              <Row label="Cédula" val={sel.persona?.cedula ?? '—'} />
              <Row label="Último inicio de sesión" val={fmtFechaHora(sel.fecha_ultimo_login)} />
              <Row label="Intentos fallidos" val={String(sel.intentos_fallidos)} />
              {bloqueoVigente(sel) && (
                <Row label="Bloqueada hasta" val={fmtFechaHora(sel.bloqueado_hasta)} />
              )}
            </dl>

            {puedeVerRoles && <RolesDelUsuario usuario={sel} onCambio={cargar} />}

            {bloqueoVigente(sel) && (
              <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-600/20">
                Cuenta bloqueada por intentos fallidos.
              </p>
            )}
            <div className="space-y-2">
              {/* La BD ya lo impide (trigger proteger_administracion): esto solo evita que el
                  administrador descubra la regla chocándose con un error. La guarda de verdad no
                  puede vivir aquí — la API REST está expuesta y no pasa por esta pantalla. */}
              {esMiCuenta && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-600/20">
                  Es su propia cuenta: no puede bloquearla ni darla de baja.
                </p>
              )}
              {tiene('ADM_USUARIO_BLOQUEAR') && sel.estado_usuario === 'ACTIVO' && !esMiCuenta && (
                <Button variant="danger" className="w-full" loading={accionando} onClick={() => cambiarEstado('BLOQUEADO')}>
                  {/* Si ya hay un bloqueo temporal, se aclara que este es el permanente:
                      son acciones distintas y "Bloquear usuario" a secas confundía. */}
                  <Lock className="h-4 w-4" />
                  {bloqueoVigente(sel) ? 'Bloquear permanentemente' : 'Bloquear usuario'}
                </Button>
              )}
              {tiene('ADM_USUARIO_DESBLOQUEAR') && sel.estado_usuario === 'BLOQUEADO' && (
                <Button className="w-full" loading={accionando} onClick={() => cambiarEstado('ACTIVO')}>
                  <ShieldCheck className="h-4 w-4" /> Desbloquear usuario
                </Button>
              )}
              {/* Bloqueo TEMPORAL por intentos fallidos: es independiente del estado
                  administrativo, así que necesita su propia acción. */}
              {tiene('ADM_USUARIO_DESBLOQUEAR') && bloqueoVigente(sel) && (
                <Button className="w-full" loading={accionando} onClick={desbloquearIntentos}>
                  <ShieldCheck className="h-4 w-4" /> Desbloquear intentos fallidos
                </Button>
              )}
              {tiene('ADM_USUARIO_ACTIVAR') && sel.estado_usuario !== 'ACTIVO' && sel.estado_usuario !== 'BLOQUEADO' && (
                <Button className="w-full" loading={accionando} onClick={() => cambiarEstado('ACTIVO')}>
                  <ShieldCheck className="h-4 w-4" /> Activar usuario
                </Button>
              )}
              {tiene('ADM_USUARIO_DAR_BAJA') && sel.estado_usuario !== 'DADO_DE_BAJA' && !esMiCuenta && (
                <Button variant="danger" className="w-full" loading={accionando} onClick={() => cambiarEstado('DADO_DE_BAJA')}>
                  <UserX className="h-4 w-4" /> Dar de baja
                </Button>
              )}
              {tiene('ADM_USUARIO_RESETEAR_PASSWORD') && (
                <Button variant="secondary" className="w-full" loading={accionando} onClick={resetearPassword}>
                  <KeyRound className="h-4 w-4" /> Restablecer contraseña
                </Button>
              )}
            </div>
          </div>
        )}
      </SidePanel>

      <Modal open={!!passwordModal} onClose={() => setPasswordModal(null)} title="Contraseña temporal">
        <p className="mb-3 text-sm text-ink-soft">
          Comunica esta contraseña temporal al usuario por un canal seguro. Deberá cambiarla en su próximo inicio de sesión.
        </p>
        <p className="rounded-md bg-slate-100 px-3 py-2 font-mono text-sm text-navy">{passwordModal}</p>
      </Modal>
    </div>
  )
}

function Row({ label, val }: { label: string; val: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2">
      <dt className="text-xs font-medium text-ink-soft">{label}</dt>
      <dd className="col-span-2 text-sm text-navy">{val}</dd>
    </div>
  )
}

/**
 * Roles de un usuario dentro de su propia ficha: la mitad de la antigua pantalla
 * "Asignaciones de rol".
 *
 * Muestra también las revocadas, con su fecha: quién tuvo qué permiso y hasta cuándo es
 * justo lo que se le pregunta a un sistema de accesos cuando algo sale mal.
 */
function RolesDelUsuario({ usuario, onCambio }: { usuario: Usuario; onCambio: () => Promise<void> }) {
  const { tiene } = useAuth()
  const toast = useToast()
  const puedeAsignar = tiene('ADM_USUARIO_ROL_INSERT')
  const puedeRevocar = tiene('ADM_USUARIO_ROL_UPDATE')

  const [roles, setRoles] = useState<{ id_rol: string; nombre_rol: string }[]>([])
  const [asignando, setAsignando] = useState(false)
  const [idRol, setIdRol] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!puedeAsignar) return
    void (async () => {
      const { data } = await supabase.from('rol').select('id_rol, nombre_rol').eq('estado_rol', 'ACTIVO').order('nombre_rol')
      setRoles((data as { id_rol: string; nombre_rol: string }[] | null) ?? [])
    })()
  }, [puedeAsignar])

  // Cambiar de usuario con el formulario abierto dejaría el rol elegido apuntando a otra
  // cuenta: se cierra al cambiar la selección.
  useEffect(() => {
    setAsignando(false)
    setIdRol('')
  }, [usuario.id_usuario])

  const asignados = usuario.roles ?? []
  const yaTieneActivo = (id: string) =>
    asignados.some((a) => a.estado_asignacion === 'ACTIVO' && a.rol?.id_rol === id)

  const asignar = async () => {
    if (!idRol) return
    setGuardando(true)
    const { error } = await supabase.from('usuario_rol').insert({
      id_usuario: usuario.id_usuario,
      id_rol: idRol,
      estado_asignacion: 'ACTIVO',
    } as never)
    setGuardando(false)
    if (error) {
      toast('error', mensajeError(error))
      return
    }
    toast('ok', 'Rol asignado.')
    setAsignando(false)
    setIdRol('')
    await onCambio()
  }

  const revocar = async (a: Asignacion) => {
    setGuardando(true)
    const { error } = await supabase
      .from('usuario_rol')
      .update({ estado_asignacion: 'REVOCADO', fecha_revocacion: new Date().toISOString() } as never)
      .eq('id_usuario_rol', a.id_usuario_rol)
    setGuardando(false)
    if (error) {
      toast('error', mensajeError(error))
      return
    }
    toast('ok', 'Rol revocado.')
    await onCambio()
  }

  return (
    <div className="mb-5 border-t border-slate-100 pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-navy">Roles asignados</h3>
        {puedeAsignar && !asignando && (
          <Button variant="secondary" onClick={() => setAsignando(true)}>
            <Plus className="h-4 w-4" /> Asignar rol
          </Button>
        )}
      </div>

      {asignando && (
        <div className="mb-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <Field label="Rol" htmlFor="asignar-rol" hint="Define qué módulos y acciones podrá usar.">
            <Select
              id="asignar-rol"
              value={idRol}
              onChange={(e) => setIdRol(e.target.value)}
              placeholder="— Seleccionar —"
              options={roles
                .filter((r) => !yaTieneActivo(r.id_rol))
                .map((r) => ({ value: r.id_rol, label: ROL_LABEL[r.nombre_rol] ?? humanizar(r.nombre_rol) }))}
            />
          </Field>
          <div className="flex gap-2">
            <Button onClick={asignar} loading={guardando} disabled={!idRol}>Asignar</Button>
            <Button variant="ghost" onClick={() => { setAsignando(false); setIdRol('') }}>Cancelar</Button>
          </div>
        </div>
      )}

      {asignados.length === 0 ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Esta cuenta no tiene ningún rol: al entrar no vería ningún módulo.
        </p>
      ) : (
        <ul className="space-y-2">
          {asignados.map((a) => (
            <li key={a.id_usuario_rol} className="flex items-start justify-between gap-2 rounded-md bg-slate-50 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-navy">{nombreRol(a)}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
                  <Badge value={a.estado_asignacion} />
                  <span>Asignado el {fmtFecha(a.fecha_asignacion)}</span>
                  <span>· {a.estado_asignacion === 'REVOCADO' ? 'Revocado' : 'Activo'} desde {fmtFecha(fechaEstado(a))}</span>
                </p>
                {a.observacion && <p className="mt-0.5 text-xs text-ink-soft">{a.observacion}</p>}
              </div>
              {puedeRevocar && a.estado_asignacion === 'ACTIVO' && (
                <button
                  type="button"
                  onClick={() => revocar(a)}
                  disabled={guardando}
                  className="rounded p-1 text-slate-400 hover:bg-white hover:text-rose-600 disabled:opacity-50"
                  aria-label={`Revocar el rol ${nombreRol(a)}`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Alta de una cuenta sobre una persona interna ya registrada.
 *
 * La cuenta se crea en la Edge Function `crear-usuario-sistema` (Auth Admin API): auth.users está
 * fuera del alcance de RLS, así que no hay forma de hacerlo con un INSERT desde aquí.
 *
 * La persona se busca por cédula y no se elige en un combo (feedback ADM: "evita tener que
 * buscar entre miles de registros manualmente"). Como el combo antiguo ya venía filtrado a
 * personas internas activas sin cuenta, esas tres condiciones se comprueban ahora sobre la
 * persona encontrada, con un mensaje que dice cuál falla.
 */
function CrearUsuarioPanel({
  onCerrar,
  onCreado,
  llamarFuncion,
}: {
  onCerrar: () => void
  onCreado: (password: string) => void
  llamarFuncion: (nombre: string, cuerpo: unknown) => Promise<{ ok: boolean; json: any }>
}) {
  const toast = useToast()
  const { perfil } = useAuth()
  const [roles, setRoles] = useState<{ id_rol: string; nombre_rol: string }[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [persona, setPersona] = useState<PersonaCedula | null>(null)
  const [problemaPersona, setProblemaPersona] = useState<string | null>(null)
  const [nombreUsuario, setNombreUsuario] = useState('')
  const [correo, setCorreo] = useState('')
  const [idRol, setIdRol] = useState('')
  const [usuarioTocado, setUsuarioTocado] = useState(false)

  // Borrador: si el administrador cambia de pestaña a mitad del alta, al volver no tiene
  // que teclearlo todo otra vez. La contraseña temporal no pasa por aquí, y `useBorrador`
  // descarta por su cuenta cualquier clave que parezca sensible.
  const borrador = useBorrador(
    perfil ? `${perfil.id_usuario}:ADM:usuario_sistema:nuevo` : null,
    { nombreUsuario, correo, idRol },
  )

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('rol').select('id_rol, nombre_rol').eq('estado_rol', 'ACTIVO').order('nombre_rol')
      setRoles((data as { id_rol: string; nombre_rol: string }[] | null) ?? [])
    })()
    const previo = borrador.restaurar()
    if (previo) {
      if (previo.nombreUsuario) { setNombreUsuario(previo.nombreUsuario); setUsuarioTocado(true) }
      if (previo.correo) setCorreo(previo.correo)
      if (previo.idRol) setIdRol(previo.idRol)
    }
  }, [])

  /**
   * Comprueba que la persona encontrada pueda tener cuenta y propone usuario y correo.
   * La consulta de cuenta existente es puntual (una cédula), no la lista completa.
   */
  const alElegirPersona = async (p: PersonaCedula | null) => {
    setPersona(p)
    setProblemaPersona(null)
    if (!p) return

    if (p.tipo_persona !== 'INTERNA') {
      setProblemaPersona('Solo el personal interno puede tener cuenta en el sistema.')
      return
    }
    const { data: yaTiene } = await supabase
      .from('usuario_sistema')
      .select('nombre_usuario')
      .eq('id_persona', p.id_persona)
      .maybeSingle()
    if (yaTiene) {
      setProblemaPersona(`Esta persona ya tiene la cuenta "${(yaTiene as { nombre_usuario: string }).nombre_usuario}".`)
      return
    }

    if (!usuarioTocado) {
      const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
      const nombre = sinTildes(p.nombres.trim().split(/\s+/)[0] ?? '').toLowerCase()
      const apellido = sinTildes(p.apellidos.trim().split(/\s+/)[0] ?? '').toLowerCase()
      setNombreUsuario(`${nombre}.${apellido}`.replace(/[^a-z0-9._-]/g, ''))
    }
  }

  const errorUsuario = nombreUsuario ? validarNombreUsuario(nombreUsuario) : null
  const errorCorreo = correo ? validarCorreoInstitucional(correo) : null
  const listo = !!persona && !problemaPersona && nombreUsuario && correo && idRol && !errorUsuario && !errorCorreo

  const crear = async () => {
    if (!persona) return
    setGuardando(true)
    setError(null)
    const { ok, json } = await llamarFuncion('crear-usuario-sistema', {
      id_persona: persona.id_persona,
      nombre_usuario: nombreUsuario,
      correo,
      id_rol: idRol,
    })
    setGuardando(false)
    if (!ok) {
      setError(json.error ?? 'No se pudo crear el usuario.')
      return
    }
    borrador.descartar()
    toast('ok', `Cuenta "${json.nombre_usuario}" creada para ${json.persona}.`)
    onCreado(json.password_temporal)
  }

  const cancelar = () => {
    borrador.descartar()
    onCerrar()
  }

  return (
    <Card className="mb-4 p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-navy">Crear usuario del sistema</h3>
          <p className="mt-0.5 text-sm text-ink-soft">
            Busca por cédula a la persona interna que tendrá la cuenta. Si no aparece, regístrala
            primero en Personal interno (GPI).
          </p>
        </div>
        <Button variant="ghost" onClick={cancelar}>Cancelar</Button>
      </div>

      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <BuscarPersonaPorCedula onSelect={alElegirPersona} soloActivas label="Cédula de la persona" autoFocus />
          {problemaPersona && (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{problemaPersona}</p>
          )}
        </div>

        <Field
          label="Nombre de usuario"
          required
          htmlFor="alta-usuario"
          error={errorUsuario}
          ayuda="Solo minúsculas, dígitos, punto, guion y guion bajo, entre 3 y 50 caracteres. Se propone nombre.apellido a partir de la persona encontrada, pero puedes cambiarlo."
        >
          <Input
            id="alta-usuario"
            value={nombreUsuario}
            onChange={(e) => { setUsuarioTocado(true); setNombreUsuario(e.target.value.toLowerCase()) }}
            placeholder="nombre.apellido"
          />
        </Field>

        <Field
          label="Correo institucional"
          required
          htmlFor="alta-correo"
          error={errorCorreo}
          ayuda="Debe ser una dirección de la Politécnica: @epn.edu.ec (o un subdominio) o @cec.edu.ec. Es el correo con el que la persona iniciará sesión."
        >
          <Input id="alta-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value.toLowerCase())} placeholder="nombre.apellido@epn.edu.ec" />
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="Rol"
            required
            htmlFor="alta-rol"
            ayuda="Define qué módulos y acciones podrá usar. Un usuario sin rol no tiene ningún permiso y no vería nada al entrar."
          >
            <Select
              id="alta-rol"
              value={idRol}
              onChange={(e) => setIdRol(e.target.value)}
              placeholder="— Seleccionar —"
              options={roles.map((r) => ({ value: r.id_rol, label: ROL_LABEL[r.nombre_rol] ?? humanizar(r.nombre_rol) }))}
            />
          </Field>
        </div>

        <div className="sm:col-span-2 flex items-center gap-3 pt-1">
          <Button onClick={crear} loading={guardando} disabled={!listo}>Crear usuario</Button>
          <span className="text-xs text-ink-soft">
            Se generará una contraseña temporal que deberás entregarle; el sistema le exigirá cambiarla al entrar.
          </span>
        </div>
      </div>
    </Card>
  )
}
