import type { ResourceConfig } from './types'
import { fmtFecha, fmtFechaHora } from '../lib/format'
import { formatearPlaca } from '../lib/validacion'
import { describirDispositivo } from '../lib/dispositivo'
import { Badge } from '../components/ui'
import { BotonCerrarSesion } from '../components/BotonCerrarSesion'
import { opcionesCatalogo } from './opciones'
import { humanizar } from '../lib/catalogos'

const d = (v: any) => (v == null || v === '' ? '—' : String(v))

/** Personas (vista global ADM, solo lectura + edición ADM). */
export const cfgPersonaADM: ResourceConfig = {
  tabla: 'persona',
  titulo: 'Personas (todas)',
  singular: 'Persona',
  idField: 'id_persona',
  select: '*, categoria:categoria_persona(nombre_categoria, codigo_categoria), empresa:empresa(nombre)',
  orderBy: { columna: 'apellidos' },
  permisos: { select: ['ADM_PERSONA_SELECT'], update: ['ADM_PERSONA_UPDATE'] },
  buscarEn: ['cedula', 'nombres', 'apellidos', 'correo'],
  columnas: [
    { key: 'cedula', label: 'Cédula' },
    { key: 'nombres', label: 'Nombre', render: (r) => `${r.apellidos} ${r.nombres}` },
    { key: 'tipo_persona', label: 'Tipo', badge: true },
    { key: 'categoria', label: 'Categoría', render: (r) => r.categoria?.codigo_categoria ?? '—' },
    { key: 'estado', label: 'Estado', badge: true },
  ],
  campoTituloDetalle: (r) => `${r.nombres} ${r.apellidos}`,
  campoSubtituloDetalle: (r) => <><Badge value={r.tipo_persona} /> <Badge value={r.estado} /></>,
  detalle: [
    { label: 'Cédula', render: (r) => r.cedula },
    { label: 'Correo', render: (r) => d(r.correo) },
    { label: 'Categoría', render: (r) => r.categoria?.nombre_categoria ?? '—' },
    { label: 'Empresa', render: (r) => r.empresa?.nombre ?? '—' },
    { label: 'Teléfono', render: (r) => d(r.telefono_contacto) },
    { label: 'Registro', render: (r) => fmtFecha(r.fecha_registro) },
  ],
  campos: [
    { name: 'estado', label: 'Estado', type: 'select', options: [
      { value: 'ACTIVO', label: 'Activo' }, { value: 'INACTIVO', label: 'Inactivo' }, { value: 'DADO_DE_BAJA', label: 'Dado de baja' },
    ] },
    { name: 'correo', label: 'Correo', type: 'email' },
    { name: 'telefono_contacto', label: 'Teléfono' },
    { name: 'direccion_domicilio', label: 'Dirección', colSpan: 2 },
  ],
  campoEstado: 'estado',
}

/** Metadatos de biometría para ADM (doc 02 nota ⁴: nunca el archivo, solo persona/vigencia/fechas). */
export const cfgBiometriaADM: ResourceConfig = {
  tabla: 'registro_biometrico',
  titulo: 'Biometría (metadatos)',
  singular: 'Registro biométrico',
  idField: 'id_registro',
  select: '*, persona:persona(nombres, apellidos, cedula)',
  orderBy: { columna: 'fecha_registro', ascendente: false },
  permisos: { select: ['ADM_BIOMETRIA_SELECT'] },
  buscarEn: ['persona.cedula', 'persona.apellidos'],
  columnas: [
    { key: 'persona', label: 'Persona', render: (r) => (r.persona ? `${r.persona.apellidos} ${r.persona.nombres}` : '—') },
    { key: 'cedula', label: 'Cédula', render: (r) => d(r.persona?.cedula) },
    { key: 'tipo_dato', label: 'Tipo de dato', render: (r) => humanizar(r.tipo_dato) },
    { key: 'vigente', label: 'Vigente', render: (r) => (r.vigente ? <Badge value="ACTIVA" /> : <Badge value="INACTIVO" />) },
    { key: 'fecha_registro', label: 'Registro', render: (r) => fmtFecha(r.fecha_registro) },
  ],
  campoTituloDetalle: (r) => (r.persona ? `${r.persona.nombres} ${r.persona.apellidos}` : 'Registro biométrico'),
  detalle: [
    { label: 'Cédula', render: (r) => d(r.persona?.cedula) },
    { label: 'Tipo de dato', render: (r) => humanizar(r.tipo_dato) },
    { label: 'Vigente', render: (r) => (r.vigente ? 'Sí' : 'No') },
    { label: 'Registro', render: (r) => fmtFecha(r.fecha_registro) },
  ],
  campos: [],
}

export const cfgBitacora: ResourceConfig = {
  tabla: 'bitacora_sistema',
  titulo: 'Bitácora del sistema',
  singular: 'Registro de bitácora',
  idField: 'id_bitacora',
  select: '*, usuario:usuario_sistema(correo_electronico)',
  orderBy: { columna: 'fecha_hora', ascendente: false },
  permisos: { select: ['ADM_BITACORA_SELECT'] },
  exportarConPermiso: ['ADM_BITACORA_EXPORTAR'],
  buscarEn: ['modulo', 'entidad_afectada', 'accion', 'descripcion', 'fecha_hora'],
  filtros: [
    { campo: 'modulo', label: 'Filtrar por módulo', opciones: opcionesCatalogo(['ADM', 'GPI', 'GPE', 'PCO', 'CAC']) },
    { campo: 'accion', label: 'Filtrar por acción', opciones: opcionesCatalogo(['INSERT', 'UPDATE', 'DELETE']) },
    { campo: 'resultado', label: 'Filtrar por resultado', opciones: opcionesCatalogo(['EXITO', 'ERROR']) },
  ],
  columnas: [
    { key: 'fecha_hora', label: 'Fecha', render: (r) => fmtFechaHora(r.fecha_hora), valorExport: (r) => fmtFechaHora(r.fecha_hora) },
    { key: 'modulo', label: 'Módulo' },
    { key: 'entidad_afectada', label: 'Entidad' },
    { key: 'accion', label: 'Acción' },
    { key: 'resultado', label: 'Resultado', badge: true },
    { key: 'usuario', label: 'Usuario', render: (r) => r.usuario?.correo_electronico ?? '—', valorExport: (r) => r.usuario?.correo_electronico ?? '' },
  ],
  campoTituloDetalle: (r) => `${r.accion} · ${r.entidad_afectada}`,
  campoSubtituloDetalle: (r) => <><Badge value={r.resultado} /> · {fmtFechaHora(r.fecha_hora)}</>,
  detalle: [
    { label: 'Módulo', render: (r) => r.modulo },
    { label: 'Entidad', render: (r) => r.entidad_afectada },
    { label: 'ID entidad', render: (r) => d(r.id_entidad_afectada) },
    { label: 'Usuario', render: (r) => r.usuario?.correo_electronico ?? '—' },
    { label: 'Descripción', render: (r) => d(r.descripcion) },
    { label: 'Valor anterior', render: (r) => <pre className="whitespace-pre-wrap break-all text-xs">{r.valor_anterior ? JSON.stringify(r.valor_anterior, null, 2) : '—'}</pre> },
    { label: 'Valor nuevo', render: (r) => <pre className="whitespace-pre-wrap break-all text-xs">{r.valor_nuevo ? JSON.stringify(r.valor_nuevo, null, 2) : '—'}</pre> },
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
    select: '*, persona:persona(nombres, apellidos, cedula), punto:punto_control(nombre_punto), vehiculo:vehiculo(placa)',
    orderBy: { columna: 'fecha_hora', ascendente: false },
    permisos: { select: ['CAC_EVENTO_SELECT', 'CAC_EVENTO_SELECT_PUNTO_ASIGNADO'] },
    buscarEn: ['persona.cedula', 'persona.apellidos', 'punto.nombre_punto', 'fecha_hora'],
    filtros: [
      { campo: 'tipo_movimiento', label: 'Movimiento', opciones: [{ value: 'INGRESO', label: 'Ingreso' }, { value: 'SALIDA', label: 'Salida' }] },
      { campo: 'origen_registro', label: 'Origen', opciones: [{ value: 'AUTOMATICA', label: 'Automática' }, { value: 'MANUAL', label: 'Manual' }] },
      { campo: 'resultado', label: 'Resultado', opciones: [{ value: 'AUTORIZADO', label: 'Autorizado' }, { value: 'DENEGADO', label: 'Denegado' }] },
    ],
    columnas: [
      { key: 'fecha_hora', label: 'Fecha', render: (r) => fmtFechaHora(r.fecha_hora) },
      { key: 'persona', label: 'Persona', render: (r) => (r.persona ? `${r.persona.apellidos} ${r.persona.nombres}` : '—') },
      { key: 'punto', label: 'Punto', render: (r) => r.punto?.nombre_punto ?? '—' },
      { key: 'tipo_movimiento', label: 'Movimiento', badge: true },
      { key: 'origen_registro', label: 'Origen' },
      { key: 'resultado', label: 'Resultado', badge: true },
    ],
    campoTituloDetalle: (r) => (r.persona ? `${r.persona.nombres} ${r.persona.apellidos}` : 'Evento'),
    campoSubtituloDetalle: (r) => <><Badge value={r.tipo_movimiento} /> <Badge value={r.resultado} /></>,
    detalle: [
      { label: 'Fecha y hora', render: (r) => fmtFechaHora(r.fecha_hora) },
      { label: 'Cédula', render: (r) => d(r.persona?.cedula) },
      { label: 'Punto de control', render: (r) => r.punto?.nombre_punto ?? '—' },
      { label: 'Vehículo', render: (r) => (r.vehiculo?.placa ? formatearPlaca(r.vehiculo.placa) : '—') },
      { label: 'Conductor', render: (r) => (r.es_conductor ? 'Sí' : 'No') },
      { label: 'Origen', render: (r) => humanizar(r.origen_registro) },
      { label: 'Motivo', render: (r) => d(r.motivo_resultado) },
    ],
    campos: [],
  }
}
