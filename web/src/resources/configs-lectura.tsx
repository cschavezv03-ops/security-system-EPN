import type { ResourceConfig } from './types'
import { fmtFecha, fmtFechaHora } from '../lib/format'
import { formatearPlaca } from '../lib/validacion'
import { describirDispositivo } from '../lib/dispositivo'
import { Badge } from '../components/ui'
import { BotonCerrarSesion } from '../components/BotonCerrarSesion'
import { opcionesCatalogo } from './opciones'
import { etiquetaCampo, humanizar, MOTIVO_LEGIBLE, CAT } from '../lib/catalogos'

const d = (v: any) => (v == null || v === '' ? '—' : String(v))

/**
 * Personas (vista global ADM, solo lectura + edición ADM).
 *
 * Feedback ADM: "para evitar mezclar personal interno y personal externo, mostrar en la
 * vista dos tablas diferentes". La pantalla `PersonasADMScreen` monta esta configuración
 * dos veces, una por ámbito, en lugar de duplicar el motor de listado: `ambito` decide el
 * filtro fijo, el título y la columna que aporta información en cada caso (la categoría
 * distingue a los internos; la empresa, a los externos).
 */
export function cfgPersonaADM(ambito?: 'INTERNA' | 'EXTERNA'): ResourceConfig {
  const titulo =
    ambito === 'INTERNA' ? 'Personal interno'
    : ambito === 'EXTERNA' ? 'Personal externo'
    : 'Personal interno y externo'
  return {
  tabla: 'persona',
  titulo,
  singular: 'Persona',
  idField: 'id_persona',
  select: '*, categoria:categoria_persona(codigo_categoria), empresa:empresa(nombre)',
  orderBy: { columna: 'apellidos' },
  permisos: { select: ['ADM_PERSONA_SELECT'], update: ['ADM_PERSONA_UPDATE'] },
  buscarEn: ['cedula', 'nombres', 'apellidos', 'correo'],
  filtroFijo: ambito ? { tipo_persona: ambito } : undefined,
  columnas: [
    { key: 'cedula', label: 'Cédula' },
    { key: 'nombres', label: 'Nombre', render: (r) => `${r.apellidos} ${r.nombres}` },
    // Dentro de una tabla ya separada por ámbito, repetir "Interna" en cada fila no dice
    // nada: el hueco lo ocupa la empresa, que en los externos es lo que falta saber.
    ...(ambito
      ? [{ key: 'empresa', label: 'Empresa', render: (r: any) => r.empresa?.nombre ?? '—', valorExport: (r: any) => r.empresa?.nombre ?? '' }]
      : [{ key: 'tipo_persona', label: 'Tipo', badge: true }]),
    { key: 'categoria', label: 'Categoría', render: (r) => humanizar(r.categoria?.codigo_categoria) },
    { key: 'estado', label: 'Estado', badge: true },
  ],
  campoTituloDetalle: (r) => `${r.nombres} ${r.apellidos}`,
  campoSubtituloDetalle: (r) => <><Badge value={r.tipo_persona} /> <Badge value={r.estado} /></>,
  detalle: [
    { label: 'Cédula', render: (r) => r.cedula },
    { label: 'Correo', render: (r) => d(r.correo) },
    { label: 'Categoría', render: (r) => humanizar(r.categoria?.codigo_categoria) },
    { label: 'Empresa', render: (r) => r.empresa?.nombre ?? '—' },
    { label: 'Teléfono', render: (r) => d(r.telefono_contacto) },
    { label: 'Registro', render: (r) => fmtFecha(r.fecha_registro) },
  ],
  campos: [
    {
      name: 'estado', label: 'Estado', type: 'select',
      // Dar de baja (o inactivar) a una persona es permanente: el backend
      // (trigger impedir_reactivar_persona) rechaza cualquier UPDATE que intente volver a
      // ACTIVO una vez que dejó de estarlo, para cualquier rol, incluido ADM. Aquí se retira
      // "Activo" de las opciones en cuanto eso ya pasó, para no ofrecer una opción que el
      // guardar solo va a rechazar con un error de base de datos.
      opcionesDependientes: (v) =>
        v.estado === 'ACTIVO'
          ? [
              { value: 'ACTIVO', label: 'Activo' },
              { value: 'INACTIVO', label: 'Inactivo' },
              { value: 'DADO_DE_BAJA', label: 'Dado de baja' },
            ]
          : [
              { value: 'INACTIVO', label: 'Inactivo' },
              { value: 'DADO_DE_BAJA', label: 'Dado de baja' },
            ],
      hint: 'Dar de baja o inactivar es permanente: una vez que deja de estar Activo, no se puede volver a activar.',
    },
    { name: 'correo', label: 'Correo', type: 'email' },
    { name: 'telefono_contacto', label: 'Teléfono' },
    { name: 'direccion_domicilio', label: 'Dirección', colSpan: 2 },
  ],
  campoEstado: 'estado',
  }
}

/**
 * Referencia corta del rostro almacenado: los 8 primeros caracteres del id del registro
 * más el nombre del archivo. Identifica la fila sin exponer la ruta completa ni, desde
 * luego, la imagen.
 */
function referenciaRostro(r: any): string {
  const archivo = String(r.path_storage ?? '').split('/').pop()
  return `Rostro ${String(r.id_registro ?? '').slice(0, 8)}${archivo ? ` · ${archivo}` : ''}`
}

/**
 * Dónde está guardado el rostro, en lenguaje llano.
 *
 * `path_storage` tiene la forma `<bucket>/<id_persona>/<archivo>.jpg`, así que el primer
 * segmento es el bucket. Se añade si además hay descriptor facial, porque entonces el dato
 * vive en dos sitios: la imagen en Storage y el vector de 128 dimensiones en la tabla.
 */
function lugarAlmacenamiento(r: any): string {
  const bucket = String(r.path_storage ?? '').split('/')[0]
  const lugares = []
  if (bucket) lugares.push(`Supabase Storage · ${bucket}`)
  if (r.descriptor_facial != null) lugares.push('vector facial en la base de datos')
  return lugares.length > 0 ? lugares.join(' + ') : '—'
}

/**
 * Metadatos de biometría para ADM (doc 02 nota ⁴: nunca el archivo, solo persona/vigencia/
 * fechas).
 *
 * Feedback ADM: "incorporar la referencia de Rostros o tabla de rostros y la columna Lugar
 * de almacenamiento, solo se tiene que especificar en dónde está almacenado dicho rostro,
 * no mostrar el rostro". Las dos columnas se derivan de `path_storage`; ni esta pantalla ni
 * la consulta piden nunca el archivo a Storage.
 */
export const cfgBiometriaADM: ResourceConfig = {
  tabla: 'registro_biometrico',
  titulo: 'Biometría (metadatos)',
  singular: 'Registro biométrico',
  idField: 'id_registro',
  // `descriptor_facial` se pide solo para saber SI existe (lugarAlmacenamiento); el vector
  // en sí no se muestra en ninguna columna.
  select: 'id_registro, id_persona, tipo_dato, path_storage, vigente, fecha_registro, descriptor_facial, persona:persona(nombres, apellidos, cedula)',
  orderBy: { columna: 'fecha_registro', ascendente: false },
  permisos: { select: ['ADM_BIOMETRIA_SELECT'] },
  buscarEn: ['persona.cedula', 'persona.apellidos'],
  columnas: [
    { key: 'persona', label: 'Persona', render: (r) => (r.persona ? `${r.persona.apellidos} ${r.persona.nombres}` : '—') },
    { key: 'cedula', label: 'Cédula', render: (r) => d(r.persona?.cedula) },
    { key: 'referencia', label: 'Referencia del rostro', render: (r) => <code className="text-xs">{referenciaRostro(r)}</code>, valorExport: (r) => referenciaRostro(r) },
    { key: 'almacenamiento', label: 'Lugar de almacenamiento', render: (r) => lugarAlmacenamiento(r), valorExport: (r) => lugarAlmacenamiento(r) },
    { key: 'vigente', label: 'Vigente', render: (r) => (r.vigente ? <Badge value="ACTIVA" /> : <Badge value="INACTIVO" />) },
    { key: 'fecha_registro', label: 'Registro', render: (r) => fmtFecha(r.fecha_registro) },
  ],
  campoTituloDetalle: (r) => (r.persona ? `${r.persona.nombres} ${r.persona.apellidos}` : 'Registro biométrico'),
  detalle: [
    { label: 'Cédula', render: (r) => d(r.persona?.cedula) },
    { label: 'Referencia del rostro', render: (r) => <code className="text-xs">{referenciaRostro(r)}</code> },
    { label: 'Lugar de almacenamiento', render: (r) => lugarAlmacenamiento(r) },
    { label: 'Tipo de dato', render: (r) => humanizar(r.tipo_dato) },
    { label: 'Vigente', render: (r) => (r.vigente ? 'Sí' : 'No') },
    { label: 'Registro', render: (r) => fmtFecha(r.fecha_registro) },
    {
      label: 'Acceso al archivo',
      render: () => (
        <span className="text-xs text-ink-soft">
          Administración consulta metadatos. El archivo biométrico no se muestra ni se descarga desde aquí.
        </span>
      ),
    },
  ],
  campos: [],
}

/** Un cambio concreto tal y como lo devuelve `v_auditoria.cambios`. */
interface Cambio {
  campo: string
  antes: string | null
  despues: string | null
}

/**
 * ¿El valor es un código de catálogo (`DADO_DE_BAJA`) o un dato libre (una fecha, un
 * nombre, un número)? Solo los primeros se traducen: pasar "1750000109" por `humanizar`
 * no haría daño, pero pasar "true" lo convertiría en "True".
 */
function valorAuditoria(valor: string | null): string {
  if (valor == null || valor === '') return '—'
  if (valor === 'true') return 'Sí'
  if (valor === 'false') return 'No'
  return /^[A-Z][A-Z0-9_]*$/.test(valor) ? humanizar(valor) : valor
}

/** Un cambio en una línea: "Estado del usuario: Activo → Bloqueado". */
function textoCambio(c: Cambio): string {
  const etiqueta = etiquetaCampo(c.campo)
  // Sin `antes` es un alta: no hay flecha que dibujar.
  return c.antes == null
    ? `${etiqueta}: ${valorAuditoria(c.despues)}`
    : `${etiqueta}: ${valorAuditoria(c.antes)} → ${valorAuditoria(c.despues)}`
}

const cambiosDe = (r: any): Cambio[] => (Array.isArray(r.cambios) ? (r.cambios as Cambio[]) : [])

/**
 * Auditoría del sistema (antes "Bitácora").
 *
 * Feedback ADM: "cambiar el nombre Bitácora por Auditoría. Reemplazar Entidad por una
 * referencia más intuitiva, mostrar Usuario que realizó la acción, Usuario accedido cuando
 * aplique, Datos y la hora de salida para eventos de sesión."
 *
 * Se lee de `v_auditoria` y no de `bitacora_sistema`: la vista ya resuelve el uuid de
 * `id_entidad_afectada` contra la tabla correspondiente y trae la sesión asociada. Hacerlo
 * aquí habría exigido una consulta por fila.
 */
export const cfgBitacora: ResourceConfig = {
  tabla: 'v_auditoria',
  titulo: 'Auditoría del sistema',
  singular: 'Registro de auditoría',
  idField: 'id_bitacora',
  orderBy: { columna: 'fecha_hora', ascendente: false },
  permisos: { select: ['ADM_BITACORA_SELECT'] },
  exportarConPermiso: ['ADM_BITACORA_EXPORTAR'],
  buscarEn: ['modulo', 'tipo_registro', 'accion', 'registro_afectado', 'ejecutor_usuario', 'usuario_accedido', 'descripcion'],
  filtros: [
    { campo: 'modulo', label: 'Filtrar por módulo', opciones: opcionesCatalogo(['ADM', 'GPI', 'GPE', 'PCO', 'CAC']) },
    { campo: 'accion', label: 'Filtrar por acción', opciones: opcionesCatalogo(['INSERT', 'UPDATE', 'DELETE', 'CIERRE_ADMINISTRATIVO_SESION', 'BLOQUEO_POR_INTENTOS_FALLIDOS', 'DESBLOQUEO_INTENTOS_FALLIDOS']) },
    { campo: 'resultado', label: 'Filtrar por resultado', opciones: opcionesCatalogo(['EXITO', 'ERROR']) },
  ],
  columnas: [
    { key: 'fecha_hora', label: 'Fecha y hora', render: (r) => fmtFechaHora(r.fecha_hora), valorExport: (r) => fmtFechaHora(r.fecha_hora) },
    { key: 'accion', label: 'Acción', render: (r) => humanizar(r.accion), valorExport: (r) => humanizar(r.accion) },
    // Sustituye a "Entidad": el tipo de registro en cristiano y, debajo, cuál en concreto.
    {
      key: 'registro_afectado',
      label: 'Registro afectado',
      render: (r) => (
        <div>
          <div className="font-medium text-navy">{d(r.registro_afectado)}</div>
          <div className="text-xs text-ink-soft">{d(r.tipo_registro)}</div>
        </div>
      ),
      valorExport: (r) => `${r.registro_afectado ?? ''} (${r.tipo_registro ?? ''})`,
    },
    {
      key: 'ejecutor_usuario',
      label: 'Usuario que ejecutó',
      // Sin usuario es una acción del propio sistema (un trigger, una tarea programada):
      // decirlo evita que el auditor lo lea como un dato que falta.
      render: (r) => (r.ejecutor_usuario ? <div><div>{r.ejecutor_usuario}</div>{r.ejecutor_nombre && <div className="text-xs text-ink-soft">{r.ejecutor_nombre}</div>}</div> : <span className="text-ink-soft">Sistema</span>),
      valorExport: (r) => r.ejecutor_usuario ?? 'Sistema',
    },
    { key: 'usuario_accedido', label: 'Usuario accedido', render: (r) => d(r.usuario_accedido), valorExport: (r) => r.usuario_accedido ?? '' },
    { key: 'hora_salida', label: 'Salida', render: (r) => (r.hora_salida ? fmtFechaHora(r.hora_salida) : '—'), valorExport: (r) => (r.hora_salida ? fmtFechaHora(r.hora_salida) : '') },
    {
      key: 'datos',
      label: 'Datos',
      // Dos cambios caben en una fila; el resto se cuenta y se ve completo en el detalle.
      render: (r) => {
        const cambios = cambiosDe(r)
        if (cambios.length === 0) return <span className="text-ink-soft">{d(r.descripcion)}</span>
        const visibles = cambios.slice(0, 2).map(textoCambio).join(' · ')
        return (
          <span className="text-xs">
            {visibles}
            {cambios.length > 2 && <span className="text-ink-soft"> y {cambios.length - 2} más</span>}
          </span>
        )
      },
      valorExport: (r) => (cambiosDe(r).map(textoCambio).join(' · ') || r.descripcion || ''),
    },
    { key: 'resultado', label: 'Resultado', badge: true },
  ],
  campoTituloDetalle: (r) => `${humanizar(r.accion)} · ${d(r.registro_afectado)}`,
  campoSubtituloDetalle: (r) => <><Badge value={r.resultado} /> · {fmtFechaHora(r.fecha_hora)}</>,
  detalle: [
    { label: 'Tipo de registro', render: (r) => d(r.tipo_registro) },
    { label: 'Registro afectado', render: (r) => d(r.registro_afectado) },
    { label: 'Módulo', render: (r) => d(r.modulo) },
    { label: 'Usuario que ejecutó', render: (r) => (r.ejecutor_usuario ? `${r.ejecutor_usuario}${r.ejecutor_nombre ? ` — ${r.ejecutor_nombre}` : ''}` : 'Sistema') },
    { label: 'Usuario accedido', render: (r) => (r.usuario_accedido ? `${r.usuario_accedido}${r.usuario_accedido_correo ? ` — ${r.usuario_accedido_correo}` : ''}` : '—') },
    // Solo en eventos de sesión hay entrada y salida; en el resto de filas estas tres
    // líneas mostrarían un guion que no significa nada.
    { label: 'Entrada', render: (r) => (r.hora_entrada ? fmtFechaHora(r.hora_entrada) : '—') },
    { label: 'Salida', render: (r) => (r.hora_salida ? fmtFechaHora(r.hora_salida) : '—') },
    { label: 'Motivo de cierre', render: (r) => (r.motivo_cierre ? humanizar(r.motivo_cierre) : '—') },
    {
      label: 'Datos',
      render: (r) => {
        const cambios = cambiosDe(r)
        if (cambios.length === 0) return <span>{d(r.descripcion)}</span>
        return (
          <ul className="space-y-1">
            {cambios.map((c, i) => (
              <li key={i} className="text-sm">
                <span className="text-ink-soft">{etiquetaCampo(c.campo)}:</span>{' '}
                {c.antes == null ? (
                  <b>{valorAuditoria(c.despues)}</b>
                ) : (
                  <>
                    <span className="line-through decoration-slate-300">{valorAuditoria(c.antes)}</span>{' '}
                    → <b>{valorAuditoria(c.despues)}</b>
                  </>
                )}
              </li>
            ))}
          </ul>
        )
      },
    },
    { label: 'Descripción', render: (r) => d(r.descripcion) },
    { label: 'Dirección IP', render: (r) => d(r.ip_origen) },
  ],
  campos: [],
}

/** Cuánto duró la sesión: hasta el cierre real, o "en curso" si sigue viva. */
function duracionSesion(r: any): string {
  const inicio = new Date(r.fecha_inicio).getTime()
  const fin = r.fecha_cierre ? new Date(r.fecha_cierre).getTime() : null
  if (fin == null) return r.estado_sesion === 'ACTIVA' ? 'En curso' : '—'
  const minutos = Math.max(0, Math.round((fin - inicio) / 60000))
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  return `${horas} h ${minutos % 60} min`
}

/** Desde dónde se abrió: el nombre guardado al iniciar sesión, o derivado del user agent. */
function dispositivoSesion(r: any): string {
  return r.dispositivo_nombre || describirDispositivo(r.user_agent)
}

export const cfgSesion: ResourceConfig = {
  tabla: 'sesion',
  titulo: 'Sesiones',
  singular: 'Sesión',
  idField: 'id_sesion',
  // `sesion` tiene DOS claves foráneas a usuario_sistema (id_usuario y
  // revocada_por), así que hay que decirle a PostgREST cuál usar: sin el nombre
  // del constraint responde "more than one relationship was found".
  select: '*, usuario:usuario_sistema!sesion_id_usuario_fkey(correo_electronico)',
  orderBy: { columna: 'fecha_inicio', ascendente: false },
  permisos: { select: ['ADM_USUARIO_SELECT'] },
  buscarEn: ['usuario.correo_electronico'],
  columnas: [
    { key: 'usuario', label: 'Usuario', render: (r) => r.usuario?.correo_electronico ?? '—' },
    { key: 'dispositivo', label: 'Dispositivo', render: (r) => dispositivoSesion(r) },
    { key: 'fecha_inicio', label: 'Apertura', render: (r) => fmtFechaHora(r.fecha_inicio) },
    { key: 'fecha_cierre', label: 'Cierre', render: (r) => fmtFechaHora(r.fecha_cierre) },
    { key: 'duracion', label: 'Duración', render: (r) => duracionSesion(r) },
    { key: 'estado_sesion', label: 'Estado', badge: true },
  ],
  // Separa las sesiones vivas del histórico: era imposible saber cuáles seguían abiertas.
  filtros: [
    {
      campo: 'estado_sesion',
      label: 'Estado',
      opciones: [
        { value: 'ACTIVA', label: 'Activas' },
        { value: 'CERRADA', label: 'Cerradas' },
        { value: 'EXPIRADA', label: 'Expiradas' },
        { value: 'REVOCADA', label: 'Revocadas' },
        { value: 'CERRADA_CAMBIO_PASSWORD', label: 'Cerradas por cambio de contraseña' },
      ],
    },
  ],
  campoTituloDetalle: (r) => r.usuario?.correo_electronico ?? 'Sesión',
  campoSubtituloDetalle: (r) => <Badge value={r.estado_sesion} />,
  // Cerrar una sesión concreta sin tocar las demás del mismo usuario (req 29).
  accionDetalle: (r, { recargar, cerrarPanel }) => (
    <BotonCerrarSesion
      idSesion={r.id_sesion}
      estado={r.estado_sesion}
      onCerrada={async () => {
        await recargar()
        cerrarPanel()
      }}
    />
  ),
  detalle: [
    { label: 'Dispositivo', render: (r) => dispositivoSesion(r) },
    { label: 'Apertura', render: (r) => fmtFechaHora(r.fecha_inicio) },
    { label: 'Última actividad', render: (r) => fmtFechaHora(r.fecha_ultima_actividad) },
    { label: 'Expiración', render: (r) => fmtFechaHora(r.fecha_expiracion) },
    { label: 'Cierre', render: (r) => fmtFechaHora(r.fecha_cierre) },
    { label: 'Duración', render: (r) => duracionSesion(r) },
    { label: 'Estado', render: (r) => <Badge value={r.estado_sesion} /> },
    { label: 'Motivo de cierre', render: (r) => (r.motivo_cierre ? humanizar(r.motivo_cierre) : '—') },
    { label: 'Recordada', render: (r) => (r.recordar_sesion ? 'Sí' : 'No') },
    { label: 'Navegador (user agent)', render: (r) => <span className="break-all text-xs">{d(r.user_agent)}</span> },
  ],
  campos: [],
}

/** Eventos de acceso — históricos, solo lectura (05 §3, la escritura va por Edge Function). */
export function cfgEventoAcceso(): ResourceConfig {
  return {
    tabla: 'evento_acceso',
    titulo: 'Eventos de acceso',
    singular: 'Evento',
    idField: 'id_evento',
    select: '*, persona:persona(nombres, apellidos, cedula, categoria:categoria_persona(codigo_categoria)), punto:punto_control(nombre_punto), vehiculo:vehiculo(placa), salida:evento_acceso!id_evento_ingreso(fecha_hora, punto:punto_control(nombre_punto))',
    orderBy: { columna: 'fecha_hora', ascendente: false },
    permisos: { select: ['CAC_EVENTO_SELECT', 'CAC_EVENTO_SELECT_PUNTO_ASIGNADO'] },
    buscarEn: ['persona.cedula', 'persona.apellidos', 'punto.nombre_punto', 'placa_detectada', 'fecha_hora'],
    filtros: [
      { campo: 'tipo_movimiento', label: 'Movimiento', opciones: [{ value: 'INGRESO', label: 'Ingreso' }, { value: 'SALIDA', label: 'Salida' }] },
      // RF-CA-024/025: el tipo de acceso es parte de lo que el historial debe mostrar, así
      // que también debe poder filtrarse por él.
      { campo: 'tipo_acceso', label: 'Tipo de acceso', opciones: [{ value: 'PEATONAL', label: 'Peatonal' }, { value: 'VEHICULAR', label: 'Vehicular' }] },
      { campo: 'origen_registro', label: 'Origen', opciones: [{ value: 'AUTOMATICA', label: 'Automática' }, { value: 'MANUAL', label: 'Manual' }] },
      { campo: 'resultado', label: 'Resultado', opciones: [{ value: 'AUTORIZADO', label: 'Autorizado' }, { value: 'DENEGADO', label: 'Denegado' }] },
    ],
    columnas: [
      { key: 'fecha_hora', label: 'Fecha', render: (r) => fmtFechaHora(r.fecha_hora) },
      // "Persona desconocida", no "—": el evento sin persona de RF-CA-021 es un intento de
      // alguien no identificado, no un dato que falte.
      { key: 'persona', label: 'Persona', render: (r) => nombrePersona(r), valorExport: (r) => nombrePersona(r) },
      { key: 'categoria', label: 'Categoría', render: (r) => humanizar(r.persona?.categoria?.codigo_categoria) },
      { key: 'punto', label: 'Garita', render: (r) => r.punto?.nombre_punto ?? '—' },
      { key: 'tipo_acceso', label: 'Tipo', badge: true },
      { key: 'tipo_movimiento', label: 'Movimiento', badge: true },
      { key: 'resultado', label: 'Resultado', badge: true },
      // El motivo del rechazo va en el listado, no solo en la ficha: RF-CA-024 lo pide como
      // columna del historial, y abrir cada fila para saber por qué se denegó un acceso hace
      // inservible la consulta cuando hay veinte denegaciones seguidas.
      { key: 'motivo_resultado', label: 'Motivo del rechazo', render: (r) => motivoLegible(r), valorExport: (r) => motivoLegible(r) },
    ],
    campoTituloDetalle: (r) => nombrePersona(r),
    campoSubtituloDetalle: (r) => <><Badge value={r.tipo_acceso} /> <Badge value={r.tipo_movimiento} /> <Badge value={r.resultado} /></>,
    detalle: [
      { label: 'Fecha y hora', render: (r) => fmtFechaHora(r.fecha_hora) },
      { label: 'Cédula', render: (r) => d(r.persona?.cedula) },
      { label: 'Categoría', render: (r) => humanizar(r.persona?.categoria?.codigo_categoria) },
      { label: 'Garita', render: (r) => r.punto?.nombre_punto ?? '—' },
      { label: 'Tipo de acceso', render: (r) => humanizar(r.tipo_acceso) },
      // RF-CA-013 / RF-CA-024: la salida asociada a este ingreso, cuando exista.
      { label: 'Hora de salida', render: (r) => horaDeSalida(r) },
      { label: 'Vehículo', render: (r) => (r.vehiculo?.placa ? formatearPlaca(r.vehiculo.placa) : '—') },
      {
        label: 'Placa leída',
        render: (r) => (r.placa_detectada
          ? `${formatearPlaca(r.placa_detectada)}${r.confianza_placa != null ? ` (confianza ${Number(r.confianza_placa).toFixed(2)})` : ''}`
          : '—'),
      },
      { label: 'Conductor', render: (r) => (r.es_conductor ? 'Sí' : 'No') },
      { label: 'Confianza facial', render: (r) => (r.confianza_biometria != null ? Number(r.confianza_biometria).toFixed(3) : '—') },
      { label: 'Origen', render: (r) => humanizar(r.origen_registro) },
      { label: 'Motivo', render: (r) => motivoLegible(r) },
    ],
    campos: [],
  }
}

function nombrePersona(r: any): string {
  if (r.persona) return `${r.persona.apellidos} ${r.persona.nombres}`
  return 'Persona desconocida'
}

/** El motivo viaja como `CODIGO: explicación`. Se muestra el titular en castellano y, detrás,
 *  la explicación concreta — un código en mayúsculas no es un mensaje para nadie (RNF-CA-004). */
function motivoLegible(r: any): string {
  if (!r.motivo_resultado) return '—'
  const [codigo, ...resto] = String(r.motivo_resultado).split(':')
  const titular = MOTIVO_LEGIBLE[codigo.trim()]
  const explicacion = resto.join(':').trim()
  if (!titular) return String(r.motivo_resultado)
  return explicacion ? `${titular} — ${explicacion}` : titular
}

function horaDeSalida(r: any): string {
  const salidas = (r.salida ?? []) as { fecha_hora: string; punto?: { nombre_punto: string } | null }[]
  if (r.tipo_movimiento !== 'INGRESO') return 'No aplica'
  if (salidas.length === 0) return r.resultado === 'AUTORIZADO' ? 'Sigue dentro' : '—'
  const salida = salidas[0]
  return `${fmtFechaHora(salida.fecha_hora)}${salida.punto ? ` · ${salida.punto.nombre_punto}` : ''}`
}

/**
 * Errores de reconocimiento — RF-CA-022, histórico de solo lectura.
 *
 * Registra lo que falla del lado técnico: la cámara que el navegador no deja abrir, el modelo
 * facial que no carga, el servicio de placas que no responde, la imagen en la que no se
 * distingue nada. Son incidencias que hasta ahora se le mostraban al guardia como un texto
 * rojo y desaparecían al recargar la página, así que nadie podía saber si una garita llevaba
 * una semana con la cámara estropeada.
 */
export function cfgErrorReconocimiento(): ResourceConfig {
  return {
    tabla: 'error_reconocimiento',
    titulo: 'Errores de reconocimiento',
    singular: 'Error de reconocimiento',
    idField: 'id_error',
    // Un dispositivo no tiene nombre: se identifica por su MAC y su tecnología (igual que en
    // el módulo de dispositivos). Pedir la columna inexistente nombre_dispositivo hacía que
    // PostgREST devolviera 400 y la pantalla entera no cargara (lo detectó INT-11).
    select: '*, punto:punto_control(nombre_punto), dispositivo:dispositivo(codigo_mac, tipo_tecnologia)',
    orderBy: { columna: 'fecha_hora', ascendente: false },
    permisos: { select: ['CAC_EVENTO_SELECT', 'CAC_EVENTO_SELECT_PUNTO_ASIGNADO'] },
    buscarEn: ['descripcion', 'punto.nombre_punto'],
    filtros: [
      { campo: 'tipo_reconocimiento', label: 'Reconocimiento', opciones: opcionesCatalogo(CAT.error_reconocimiento_tipo) },
      { campo: 'codigo_error', label: 'Tipo de fallo', opciones: opcionesCatalogo(CAT.error_reconocimiento_codigo) },
    ],
    columnas: [
      { key: 'fecha_hora', label: 'Fecha', render: (r) => fmtFechaHora(r.fecha_hora) },
      { key: 'tipo_reconocimiento', label: 'Reconocimiento', badge: true },
      { key: 'codigo_error', label: 'Fallo', render: (r) => humanizar(r.codigo_error) },
      { key: 'punto', label: 'Garita', render: (r) => r.punto?.nombre_punto ?? '—' },
      { key: 'descripcion', label: 'Detalle' },
    ],
    campoTituloDetalle: (r) => humanizar(r.codigo_error),
    campoSubtituloDetalle: (r) => <Badge value={r.tipo_reconocimiento} />,
    detalle: [
      { label: 'Fecha y hora', render: (r) => fmtFechaHora(r.fecha_hora) },
      { label: 'Reconocimiento', render: (r) => humanizar(r.tipo_reconocimiento) },
      { label: 'Tipo de fallo', render: (r) => humanizar(r.codigo_error) },
      { label: 'Garita', render: (r) => r.punto?.nombre_punto ?? '—' },
      { label: 'Dispositivo', render: (r) => (r.dispositivo ? `${r.dispositivo.codigo_mac}${r.dispositivo.tipo_tecnologia ? ` · ${humanizar(r.dispositivo.tipo_tecnologia)}` : ''}` : '—') },
      { label: 'Detalle', render: (r) => d(r.descripcion) },
    ],
    campos: [],
  }
}
