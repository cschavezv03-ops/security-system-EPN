import { useEffect, useMemo, useState } from 'react'
import { KeyRound, Lock, Search, ShieldCheck, UserPlus, UserX } from 'lucide-react'
import { supabase, mensajeError } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthProvider'
import { fmtFechaHora } from '../../lib/format'
import {
  Badge, Button, Card, CenterSpinner, EmptyState, ErrorBanner, Field, Input, Modal, Select,
  SidePanel, useToast,
} from '../../components/ui'
import { ROL_LABEL, humanizar } from '../../lib/catalogos'
import { validarCorreoInstitucional, validarNombreUsuario } from '../../lib/validacion'

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

/**
 * Gestión de usuarios (feedback ADM §5.3/§7.2): la pantalla genérica de CRUD no alcanza para
 * esto porque cada transición de estado tiene su propio permiso granular (bloquear/desbloquear/
 * activar/dar de baja) en vez de un solo ADM_USUARIO_UPDATE — y "restablecer contraseña" no es
 * ni siquiera un UPDATE de esta tabla, es la Auth Admin API vía Edge Function.
 */
export function UsuariosScreen() {
  const { tiene, perfil } = useAuth()
  const toast = useToast()
  const puedeLeer = tiene('ADM_USUARIO_SELECT')

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
    const { data, error } = await supabase
      .from('usuario_sistema')
      .select('id_usuario, nombre_usuario, correo_electronico, estado_usuario, requiere_cambio_password, fecha_ultimo_login, intentos_fallidos, bloqueado_hasta, persona:persona!usuario_sistema_id_persona_fkey(nombres, apellidos, cedula)')
      .order('nombre_usuario')
    if (error) setError(mensajeError(error))
    setUsuarios((data as Usuario[] | null) ?? [])
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
      [u.nombre_usuario, u.correo_electronico, u.persona?.cedula, u.persona?.apellidos]
        .some((c) => String(c ?? '').toLowerCase().includes(t)),
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
    setSel((s) => (s ? { ...s, bloqueado_hasta: null, intentos_fallidos: 0 } : s))
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
    setSel((s) => (s ? { ...s, estado_usuario: nuevoEstado } : s))
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

  if (!puedeLeer) return <EmptyState title="No tienes acceso a usuarios" hint="Requiere ADM_USUARIO_SELECT." />

  return (
    <div>
      <ErrorBanner message={error} />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por usuario, correo, cédula..."
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
                  <th className="px-4 py-2.5">Correo</th>
                  <th className="px-4 py-2.5">Persona</th>
                  <th className="px-4 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((u) => (
                  <tr key={u.id_usuario} onClick={() => setSel(u)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-navy">{u.nombre_usuario}</td>
                    <td className="px-4 py-2.5">{u.correo_electronico}</td>
                    <td className="px-4 py-2.5">{u.persona ? `${u.persona.nombres} ${u.persona.apellidos}` : '—'}</td>
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
              <Row label="Último login" val={fmtFechaHora(sel.fecha_ultimo_login)} />
              <Row label="Intentos fallidos" val={String(sel.intentos_fallidos)} />
              {bloqueoVigente(sel) && (
                <Row label="Bloqueada hasta" val={fmtFechaHora(sel.bloqueado_hasta)} />
              )}
            </dl>

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

interface PersonaSinCuenta {
  id_persona: string
  nombres: string
  apellidos: string
  cedula: string
  correo: string | null
}

/**
 * Alta de una cuenta sobre una persona interna ya registrada.
 *
 * La cuenta se crea en la Edge Function `crear-usuario-sistema` (Auth Admin API): auth.users está
 * fuera del alcance de RLS, así que no hay forma de hacerlo con un INSERT desde aquí.
 *
 * Solo lista personas INTERNAS activas que aún no tengan cuenta: `persona` es la maestra única
 * (CLAUDE.md) y el alta de personas es de GPI, no de ADM.
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
  const [personas, setPersonas] = useState<PersonaSinCuenta[]>([])
  const [roles, setRoles] = useState<{ id_rol: string; nombre_rol: string }[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [idPersona, setIdPersona] = useState('')
  const [nombreUsuario, setNombreUsuario] = useState('')
  const [correo, setCorreo] = useState('')
  const [idRol, setIdRol] = useState('')
  const [usuarioTocado, setUsuarioTocado] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [personasRes, rolesRes, usuariosRes] = await Promise.all([
        supabase.from('persona').select('id_persona, nombres, apellidos, cedula, correo')
          .eq('tipo_persona', 'INTERNA').eq('estado', 'ACTIVO').order('apellidos'),
        supabase.from('rol').select('id_rol, nombre_rol').eq('estado_rol', 'ACTIVO').order('nombre_rol'),
        supabase.from('usuario_sistema').select('id_persona'),
      ])
      if (personasRes.error) setError(mensajeError(personasRes.error))
      const conCuenta = new Set(((usuariosRes.data as { id_persona: string }[] | null) ?? []).map((u) => u.id_persona))
      setPersonas(((personasRes.data as PersonaSinCuenta[] | null) ?? []).filter((p) => !conCuenta.has(p.id_persona)))
      setRoles((rolesRes.data as { id_rol: string; nombre_rol: string }[] | null) ?? [])
      setCargando(false)
    })()
  }, [])

  /** Al elegir la persona se propone usuario y correo, pero se pueden corregir. */
  const alElegirPersona = (id: string) => {
    setIdPersona(id)
    const p = personas.find((x) => x.id_persona === id)
    if (!p) return
    if (p.correo) setCorreo(p.correo)
    if (!usuarioTocado) {
      const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
      const nombre = sinTildes(p.nombres.trim().split(/\s+/)[0] ?? '').toLowerCase()
      const apellido = sinTildes(p.apellidos.trim().split(/\s+/)[0] ?? '').toLowerCase()
      setNombreUsuario(`${nombre}.${apellido}`.replace(/[^a-z0-9._-]/g, ''))
    }
  }

  const errorUsuario = nombreUsuario ? validarNombreUsuario(nombreUsuario) : null
  const errorCorreo = correo ? validarCorreoInstitucional(correo) : null
  const listo = idPersona && nombreUsuario && correo && idRol && !errorUsuario && !errorCorreo

  const crear = async () => {
    setGuardando(true)
    setError(null)
    const { ok, json } = await llamarFuncion('crear-usuario-sistema', {
      id_persona: idPersona,
      nombre_usuario: nombreUsuario,
      correo,
      id_rol: idRol,
    })
    setGuardando(false)
    if (!ok) {
      setError(json.error ?? 'No se pudo crear el usuario.')
      return
    }
    toast('ok', `Cuenta "${json.nombre_usuario}" creada para ${json.persona}.`)
    onCreado(json.password_temporal)
  }

  return (
    <Card className="mb-4 p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-navy">Crear usuario del sistema</h3>
          <p className="mt-0.5 text-sm text-ink-soft">
            La cuenta se crea sobre una persona interna ya registrada. Si no aparece en la lista, regístrala
            primero en Personal interno (GPI) o comprueba que no tenga ya una cuenta.
          </p>
        </div>
        <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
      </div>

      <ErrorBanner message={error} />

      {cargando ? (
        <CenterSpinner label="Cargando personas..." />
      ) : personas.length === 0 ? (
        <EmptyState
          title="No hay personas disponibles"
          hint="Todas las personas internas activas ya tienen cuenta. Registra una nueva persona en el módulo GPI."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Persona" required htmlFor="alta-persona">
              <Select
                id="alta-persona"
                value={idPersona}
                onChange={(e) => alElegirPersona(e.target.value)}
                placeholder="— Seleccionar —"
                options={personas.map((p) => ({ value: p.id_persona, label: `${p.apellidos} ${p.nombres} · ${p.cedula}` }))}
              />
            </Field>
          </div>

          <Field
            label="Nombre de usuario"
            required
            htmlFor="alta-usuario"
            error={errorUsuario}
            ayuda="Solo minúsculas, dígitos, punto, guion y guion bajo, entre 3 y 50 caracteres. Se propone nombre.apellido a partir de la persona elegida, pero puedes cambiarlo."
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
      )}
    </Card>
  )
}
