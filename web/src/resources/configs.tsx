import { Link } from 'react-router-dom'
import type { ResourceConfig } from './types'
import { CAT, humanizar } from '../lib/catalogos'
import { fmtFecha, fmtFechaHora, fmtHora, formatearMac, formatearIp, estaEnTurno, duracionTurnoMin, fmtFechaDia } from '../lib/format'
import {
  diasDeVigencia, estadoAutorizacionEfectivo, estadoMemorandoEfectivo, vigenteHastaTexto,
} from '../lib/vigencia'
import { Badge } from '../components/ui'
import { AsociacionesVehiculo } from '../components/AsociacionesVehiculo'
import { AnularMemorando } from '../components/AnularMemorando'
import { GaritasDeRegla } from '../components/GaritasDeRegla'
import {
  opcionesCatalogo, optCategorias, optEmpresas, optPuntosControl, optZonas,
  opcionesTabla, optZonasPorTipo, optZonasPadrePara, optPuntosPorZona, optGuardiasDisponibles,
  optPersonasExternasConEmpresa, optMemorandosVigentes, humanizarNombreCuenta,
} from './opciones'
import { supabase } from '../lib/supabase'
import { hoyISO } from '../lib/format'
import {
  formatearPlaca, formatearPlacaInput, normalizarPlaca, normalizarTelefono,
  validarCedula, validarCodigoParametro, validarCodigoPermiso, validarCorreo,
  validarFechaNacimiento, validarIp, validarMac, validarNoVacio, validarNombre,
  validarNumeroMemorando, validarPlaca, validarRuc, validarTelefono, validarValorParametro,
  componerNombrePuntoEPN, partesUbicacionEPN,
} from '../lib/validacion'

const d = (v: any) => (v == null || v === '' ? '—' : String(v))

/**
 * RUC con su estado de verificación (§V12). No hay integración con el SRI en el prototipo, así
 * que ningún RUC llega a VALIDO/INVALIDO. En vez de callarlo —que se leía como "verificado"— la
 * pantalla dice explícitamente "sin verificar" cuando el estado es NO_VERIFICADO.
 */
function rucConVerificacion(r: any) {
  if (!r.ruc) return '—'
  const estado = r.estado_verificacion_ruc
  if (!estado || estado === 'NO_VERIFICADO')
    return <>{r.ruc} <span className="text-xs text-ink-soft">· sin verificar</span></>
  return <>{r.ruc} <Badge value={estado} /></>
}

/* =========================================================================
   ADM — entidades maestras y seguridad lógica
   ========================================================================= */

export const cfgEmpresa: ResourceConfig = {
  tabla: 'empresa',
  titulo: 'Empresas',
  singular: 'Empresa',
  idField: 'id_empresa',
  orderBy: { columna: 'nombre' },
  // GPE también puede ver/crear empresas desde su propio módulo (feedback GPE, permiso nuevo
  // GPE_EMPRESA_INSERT — el SELECT ya lo permitía la política RLS vía GPE_MODULO_ACCEDER).
  permisos: { select: ['ADM_EMPRESA_SELECT', 'GPE_MODULO_ACCEDER'], insert: ['ADM_EMPRESA_INSERT', 'GPE_EMPRESA_INSERT'], update: ['ADM_EMPRESA_UPDATE'] },
  buscarEn: ['nombre', 'ruc', 'tipo_servicio'],
  columnas: [
    { key: 'nombre', label: 'Nombre' },
    { key: 'ruc', label: 'RUC', render: (r) => rucConVerificacion(r) },
    { key: 'tipo_servicio', label: 'Tipo de servicio', render: (r) => d(r.tipo_servicio) },
    { key: 'estado', label: 'Estado', badge: true },
  ],
  campoTituloDetalle: (r) => r.nombre,
  campoSubtituloDetalle: (r) => <Badge value={r.estado} />,
  detalle: [
    { label: 'RUC', render: (r) => rucConVerificacion(r) },
    { label: 'Tipo de servicio', render: (r) => d(r.tipo_servicio) },
    { label: 'Registro', render: (r) => fmtFecha(r.fecha_registro) },
  ],
  campos: [
    { name: 'nombre', label: 'Nombre', required: true, colSpan: 2, validar: validarNoVacio },
    { name: 'ruc', label: 'RUC', validar: validarRuc, hint: '13 dígitos, termina en el establecimiento (001).', ayuda: '13 dígitos. Los dos primeros son la provincia (01 a 24, o 30). El tercero indica el tipo de contribuyente: menor que 6 persona natural, 6 sector público, 9 sociedad privada. Termina en el número de establecimiento (001 para la matriz). Se verifica el dígito verificador.', placeholder: '1790012345001' },
    { name: 'tipo_servicio', label: 'Tipo de servicio', validar: validarNoVacio },
    { name: 'estado', label: 'Estado', type: 'select', options: opcionesCatalogo(CAT.empresa_estado), default: 'ACTIVO', editable: true },
  ],
  campoEstado: 'estado',
  baja: { campoEstado: 'estado', valorBaja: 'INACTIVO', etiqueta: 'Inactivar' },
}

export const cfgCategoria: ResourceConfig = {
  tabla: 'categoria_persona',
  titulo: 'Categorías de persona',
  singular: 'Categoría',
  idField: 'id_categoria',
  orderBy: { columna: 'codigo_categoria' },
  permisos: { select: ['ADM_CATEGORIA_SELECT'], insert: ['ADM_CATEGORIA_INSERT'], update: ['ADM_CATEGORIA_UPDATE'] },
  buscarEn: ['codigo_categoria', 'descripcion'],
  // Feedback ADM: "identificar si la categoría corresponde a la parte Interna o Externa;
  // retirar la columna Nombre e implementar una descripción". `nombre_categoria` repetía el
  // código en versión legible ("Docente" para DOCENTE), así que el equipo decidió eliminarla
  // del todo: donde hacía de etiqueta corta ahora va `humanizar(codigo_categoria)`, que da
  // el mismo texto sin necesidad de mantener el dato a mano en dos sitios.
  columnas: [
    { key: 'codigo_categoria', label: 'Categoría', render: (r) => humanizar(r.codigo_categoria) },
    { key: 'ambito', label: 'Ámbito', badge: true },
    { key: 'descripcion', label: 'Descripción', render: (r) => d(r.descripcion) },
    { key: 'estado', label: 'Estado', badge: true },
  ],
  // El ámbito filtra la lista: es la pregunta que se hace quien entra aquí.
  filtros: [
    { campo: 'ambito', label: 'Ámbito', opciones: opcionesCatalogo(CAT.categoria_ambito) },
  ],
  campoTituloDetalle: (r) => humanizar(r.codigo_categoria),
  campoSubtituloDetalle: (r) => <><Badge value={r.ambito} /> <Badge value={r.estado} /></>,
  detalle: [
    { label: 'Ámbito', render: (r) => <Badge value={r.ambito} /> },
    { label: 'Descripción', render: (r) => d(r.descripcion) },
    { label: 'Estado', render: (r) => <Badge value={r.estado} /> },
  ],
  campos: [
    { name: 'codigo_categoria', label: 'Categoría', type: 'select', required: true, options: opcionesCatalogo(CAT.categoria_codigo), editable: false },
    { name: 'ambito', label: 'Ámbito', type: 'select', required: true, options: opcionesCatalogo(CAT.categoria_ambito), editable: false, hint: 'Interna: pertenece a la Politécnica. Externa: visita o proveedor.' },
    { name: 'descripcion', label: 'Descripción', type: 'textarea', required: true, colSpan: 3, validar: validarNoVacio, hint: 'Qué personas agrupa esta categoría.' },
    { name: 'estado', label: 'Estado', type: 'select', options: opcionesCatalogo(CAT.categoria_estado), default: 'ACTIVO' },
  ],
  campoEstado: 'estado',
  baja: { campoEstado: 'estado', valorBaja: 'INACTIVO', etiqueta: 'Inactivar' },
}

export const cfgParametro: ResourceConfig = {
  tabla: 'parametro_sistema',
  titulo: 'Parámetros del sistema',
  singular: 'Parámetro',
  idField: 'id_parametro',
  orderBy: { columna: 'codigo_parametro' },
  permisos: { select: ['ADM_PARAMETRO_SELECT'], insert: ['ADM_PARAMETRO_INSERT'], update: ['ADM_PARAMETRO_UPDATE'] },
  buscarEn: ['codigo_parametro', 'nombre_parametro', 'modulo_aplicacion'],
  columnas: [
    { key: 'codigo_parametro', label: 'Código' },
    { key: 'nombre_parametro', label: 'Nombre' },
    { key: 'valor_parametro', label: 'Valor' },
    // Feedback ADM: la unidad iba pegada al nombre ("Tiempo de sesion (min)"). Ahora es una
    // columna propia, así que el valor "30" se puede leer sin adivinar de qué es.
    { key: 'unidad_medida', label: 'Unidad de medida', render: (r) => humanizar(r.unidad_medida), valorExport: (r) => humanizar(r.unidad_medida) },
    { key: 'modulo_aplicacion', label: 'Módulo', render: (r) => humanizar(r.modulo_aplicacion) },
    { key: 'estado_parametro', label: 'Estado', badge: true },
  ],
  campoTituloDetalle: (r) => r.nombre_parametro,
  campoSubtituloDetalle: (r) => <><code className="text-xs">{r.codigo_parametro}</code> · <Badge value={r.estado_parametro} /></>,
  detalle: [
    { label: 'Valor', render: (r) => <b>{r.valor_parametro}{r.unidad_medida ? ` ${humanizar(r.unidad_medida).toLowerCase()}` : ''}</b> },
    { label: 'Unidad de medida', render: (r) => humanizar(r.unidad_medida) },
    { label: 'Tipo de dato', render: (r) => humanizar(r.tipo_dato) },
    { label: 'Módulo', render: (r) => humanizar(r.modulo_aplicacion) },
    { label: 'Editable', render: (r) => (r.editable ? 'Sí' : 'No') },
    { label: 'Descripción', render: (r) => d(r.descripcion) },
    { label: 'Modificado', render: (r) => fmtFechaHora(r.fecha_modificacion) },
  ],
  campos: [
    { name: 'codigo_parametro', label: 'Código', required: true, editable: false, colSpan: 2, validar: validarCodigoParametro, ayuda: 'Solo mayúsculas, números y guion bajo, empezando por una letra. Por ejemplo TIEMPO_SESION_MIN.', placeholder: 'TIEMPO_SESION_MIN' },
    { name: 'nombre_parametro', label: 'Nombre', required: true, colSpan: 2, validar: validarNoVacio },
    // El valor debe castear al tipo_dato elegido en el propio formulario.
    { name: 'valor_parametro', label: 'Valor', required: true, validar: (v, vals) => validarValorParametro(String(vals.tipo_dato ?? ''), v), ayuda: 'El valor debe corresponder al tipo de dato elegido abajo: un número entero si es ENTERO, un decimal como 0.38 si es DECIMAL, true o false si es BOOLEANO.' },
    { name: 'unidad_medida', label: 'Unidad de medida', type: 'select', options: opcionesCatalogo(CAT.parametro_unidad), hint: 'En qué se expresa el valor.', ayuda: 'Acompaña al valor para que se entienda sin abrir la descripción: 30 minutos, 5 intentos, 2 vehículos. Déjalo en blanco solo si el parámetro no expresa ninguna magnitud. "Hora del día" es para los valores tipo 06:00 de los turnos.' },
    { name: 'tipo_dato', label: 'Tipo de dato', type: 'select', required: true, options: opcionesCatalogo(CAT.parametro_tipo_dato) },
    { name: 'modulo_aplicacion', label: 'Módulo', type: 'select', required: true, options: opcionesCatalogo(CAT.parametro_modulo) },
    { name: 'estado_parametro', label: 'Estado', type: 'select', options: opcionesCatalogo(CAT.parametro_estado), default: 'ACTIVO' },
    { name: 'editable', label: '¿Editable?', type: 'checkbox', default: true },
    { name: 'descripcion', label: 'Descripción', type: 'textarea', colSpan: 3 },
  ],
}

export const cfgRol: ResourceConfig = {
  tabla: 'rol',
  titulo: 'Roles',
  singular: 'Rol',
  idField: 'id_rol',
  orderBy: { columna: 'nombre_rol' },
  permisos: { select: ['ADM_ROL_SELECT'], insert: ['ADM_ROL_INSERT'], update: ['ADM_ROL_UPDATE'] },
  buscarEn: ['nombre_rol', 'descripcion'],
  columnas: [
    { key: 'nombre_rol', label: 'Nombre del rol' },
    { key: 'descripcion', label: 'Descripción', render: (r) => d(r.descripcion) },
    { key: 'estado_rol', label: 'Estado', badge: true },
  ],
  campoTituloDetalle: (r) => r.nombre_rol,
  campoSubtituloDetalle: (r) => <Badge value={r.estado_rol} />,
  detalle: [
    { label: 'Descripción', render: (r) => d(r.descripcion) },
    { label: 'Estado', render: (r) => <Badge value={r.estado_rol} /> },
  ],
  campos: [
    { name: 'nombre_rol', label: 'Nombre del rol', type: 'select', required: true, options: opcionesCatalogo(CAT.rol_nombre), editable: false, colSpan: 2 },
    { name: 'descripcion', label: 'Descripción', type: 'textarea', colSpan: 3 },
    { name: 'estado_rol', label: 'Estado', type: 'select', options: opcionesCatalogo(CAT.categoria_estado), default: 'ACTIVO' },
  ],
}

export const cfgPermiso: ResourceConfig = {
  tabla: 'permiso',
  titulo: 'Permisos',
  singular: 'Permiso',
  idField: 'id_permiso',
  orderBy: { columna: 'codigo_permiso' },
  permisos: { select: ['ADM_PERMISO_SELECT'], insert: ['ADM_PERMISO_INSERT'], update: ['ADM_PERMISO_UPDATE'] },
  buscarEn: ['codigo_permiso', 'descripcion'],
  // Feedback ADM: "cambiar el título de la columna Código por Permiso. El código técnico
  // puede mantenerse como información secundaria". Quien administra permisos quiere leer
  // qué autoriza el permiso; GPI_PERSONA_INSERT es la clave del sistema, no su nombre.
  columnas: [
    {
      key: 'codigo_permiso',
      label: 'Permiso',
      render: (r) => (
        <div>
          <div className="font-medium text-navy">{d(r.descripcion)}</div>
          <code className="text-xs text-ink-soft">{r.codigo_permiso}</code>
        </div>
      ),
      valorExport: (r) => `${r.descripcion ?? ''} (${r.codigo_permiso})`,
    },
    { key: 'estado_permiso', label: 'Estado', badge: true },
  ],
  campoTituloDetalle: (r) => d(r.descripcion),
  campoSubtituloDetalle: (r) => <code className="text-xs">{r.codigo_permiso}</code>,
  detalle: [
    { label: 'Código técnico', render: (r) => <code className="text-xs">{r.codigo_permiso}</code> },
    { label: 'Descripción', render: (r) => d(r.descripcion) },
    { label: 'Estado', render: (r) => <Badge value={r.estado_permiso} /> },
  ],
  campos: [
    { name: 'codigo_permiso', label: 'Código', required: true, editable: false, colSpan: 2, hint: 'Formato MODULO_ENTIDAD_ACCION', validar: validarCodigoPermiso, ayuda: 'Convención del sistema: MÓDULO_ENTIDAD_ACCIÓN en mayúsculas, por ejemplo GPI_PERSONA_INSERT. El módulo debe ser ADM, GPI, GPE, PCO o CAC.', placeholder: 'GPI_PERSONA_INSERT' },
    { name: 'descripcion', label: 'Descripción', type: 'textarea', colSpan: 3 },
    { name: 'estado_permiso', label: 'Estado', type: 'select', options: opcionesCatalogo(CAT.categoria_estado), default: 'ACTIVO' },
  ],
}

// `cfgUsuarioRol` se eliminó: las asignaciones de rol dejaron de ser una pantalla propia
// y viven dentro de la ficha del usuario (pages/modules/UsuariosScreen.tsx), como pidió el
// equipo. Los permisos ADM_USUARIO_ROL_* siguen existiendo y son los que consulta esa
// pantalla para decidir si puede asignar o revocar.

/* =========================================================================
   Compartidos: vehículo, persona_vehiculo (ADM/GPI/GPE)
   ========================================================================= */

/** Nombre completo de una persona embebida por PostgREST. */
const nombrePersona = (p: any): string => (p ? `${p.apellidos} ${p.nombres}` : '—')

/** Relaciones persona-vehículo vigentes (las revocadas/vencidas no cuentan como "pertenece a"). */
const relacionesVigentes = (r: any): any[] =>
  ((r.relaciones ?? []) as any[]).filter((x) => x.estado_relacion === 'ACTIVA')

/** Propietario actual del vehículo, o la primera relación vigente si nadie figura como tal. */
function propietarioDe(r: any): string {
  const vigentes = relacionesVigentes(r)
  const duenio = vigentes.find((x) => x.tipo_relacion === 'PROPIETARIO')
  if (duenio) return nombrePersona(duenio.persona)
  if (vigentes.length > 0) return `${nombrePersona(vigentes[0].persona)} (${humanizar(vigentes[0].tipo_relacion)})`
  return '—'
}

export function cfgVehiculo(modulo: 'ADM' | 'GPI' | 'GPE'): ResourceConfig {
  const select = [`${modulo}_VEHICULO_SELECT`]
  const insert = [`${modulo}_VEHICULO_INSERT`]
  // Solo ADM puede UPDATE / dar de baja el vehículo (matriz doc 02, nota ³).
  const update = modulo === 'ADM' ? ['ADM_VEHICULO_UPDATE'] : undefined
  return {
    tabla: 'vehiculo',
    titulo: 'Vehículos',
    singular: 'Vehículo',
    idField: 'id_vehiculo',
    // Trae las personas asociadas: un vehículo suelto sin dueño no dice nada al guardia ni a ADM.
    // La FK de persona_vehiculo hacia vehiculo permite embeberlas en una sola consulta.
    select: '*, relaciones:persona_vehiculo(id_persona, tipo_relacion, estado_relacion, fecha_inicio, fecha_fin, es_responsable_tramite, persona:persona(nombres, apellidos, cedula, tipo_persona))',
    orderBy: { columna: 'placa' },
    permisos: { select, insert, update },
    autoUsuarioRegistro: ['id_usuario_registro'],
    // Un vehículo NO puede crearse sin propietario (RF-CA-018): el alta va a la pantalla que
    // registra vehículo y propietario en una sola transacción (RPC crear_vehiculo_con_propietario),
    // en vez del formulario genérico, que insertaba la fila suelta y dejaba vehículos huérfanos.
    // La restricción diferida de la base lo respalda para cualquier otra vía.
    altaRuta: '/vehiculos/nuevo',
    buscarEn: ['placa', 'marca', 'modelo', 'color', 'relaciones.persona.apellidos', 'relaciones.persona.cedula'],
    columnas: [
      { key: 'placa', label: 'Placa', render: (r) => (r.placa ? formatearPlaca(r.placa) : '—'), valorExport: (r) => (r.placa ? formatearPlaca(r.placa) : '') },
      { key: 'tipo_vehiculo', label: 'Tipo', render: (r) => humanizar(r.tipo_vehiculo) },
      // La pregunta real frente a un vehículo es "¿de quién es?", no "¿qué marca es?".
      { key: 'propietario', label: 'Propietario', render: (r) => propietarioDe(r), valorExport: (r) => propietarioDe(r) },
      { key: 'marca', label: 'Marca', render: (r) => d(r.marca) },
      { key: 'estado_vehiculo', label: 'Estado', badge: true },
    ],
    campoTituloDetalle: (r) => (r.placa ? formatearPlaca(r.placa) : 'Vehículo'),
    campoSubtituloDetalle: (r) => <><Badge value={r.tipo_vehiculo} /> <Badge value={r.estado_vehiculo} /> · {propietarioDe(r)}</>,
    detalle: [
      { label: 'Marca / Modelo', render: (r) => `${d(r.marca)} ${d(r.modelo)}` },
      { label: 'Color', render: (r) => d(r.color) },
      // Un vehículo puede tener varias personas (propietario + conductores autorizados): la
      // columna muestra la principal, aquí está la verdad completa.
      {
        label: 'Personas asociadas',
        render: (r) => {
          const todas = (r.relaciones ?? []) as any[]
          if (todas.length === 0) return <span className="text-slate-400">Sin personas asociadas</span>
          return (
            <ul className="space-y-1.5">
              {todas.map((x, i) => (
                <li key={i} className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-navy">{nombrePersona(x.persona)}</span>
                  <span className="text-xs text-ink-soft">{x.persona?.cedula}</span>
                  <Badge value={x.tipo_relacion} />
                  <Badge value={x.estado_relacion} />
                  {x.es_responsable_tramite && <span className="text-xs text-ink-soft">· responsable del trámite</span>}
                </li>
              ))}
            </ul>
          )
        },
      },
      { label: 'Registro', render: (r) => fmtFecha(r.fecha_registro) },
    ],
    // Las asociaciones persona-vehículo se gestionan desde la propia ficha del vehículo, en
    // los tres módulos. En la ronda anterior esto era exclusivo de ADM y GPI/GPE conservaban
    // su tarjeta "Asociaciones" aparte; ambos equipos pidieron en esta ronda lo mismo que
    // tiene ADM ("debe implementarse de la misma manera en este apartado"), así que la tarjeta
    // suelta desaparece también de ellos. Cada módulo solo ofrece personas de su ámbito.
    detalleExtra: (r, { recargar }) => (
      <AsociacionesVehiculo idVehiculo={r.id_vehiculo} onCambio={recargar} modulo={modulo} />
    ),
    campos: [
      // Se teclea con guion (ABC-1234) pero se guarda canónica sin guion: es la clave con la
      // que el OCR de placas comparará contra la BD.
      {
        name: 'placa', label: 'Placa', colSpan: 1, validar: validarPlaca,
        formatear: formatearPlacaInput, normalizar: normalizarPlaca,
        hint: '3 letras y 3 o 4 dígitos.', ayuda: 'Formato de la ANT: 3 letras y 3 o 4 dígitos (ABC-1234 o ABC-123). La primera letra es la provincia donde se matriculó. Se guarda sin guion para poder compararla con la lectura de la cámara.', placeholder: 'PDF-1234',
      },
      { name: 'tipo_vehiculo', label: 'Tipo', type: 'select', required: true, options: opcionesCatalogo(CAT.vehiculo_tipo) },
      { name: 'marca', label: 'Marca', validar: validarNoVacio },
      { name: 'modelo', label: 'Modelo', validar: validarNoVacio },
      { name: 'color', label: 'Color', validar: validarNoVacio },
      { name: 'estado_vehiculo', label: 'Estado', type: 'select', options: opcionesCatalogo(CAT.vehiculo_estado), default: 'ACTIVO', editable: modulo === 'ADM' },
    ],
    campoEstado: 'estado_vehiculo',
    baja: update ? { campoEstado: 'estado_vehiculo', valorBaja: 'DADO_DE_BAJA', etiqueta: 'Dar de baja' } : undefined,
  }
}

// `cfgPersonaVehiculo` se eliminó. Era la pantalla suelta "Asociaciones" que GPI y GPE
// mantenían aparte; ahora los vínculos persona-vehículo se gestionan desde la ficha del
// vehículo con `AsociacionesVehiculo`, igual que en ADM, que es lo que pidieron los dos
// equipos en esta ronda. Los permisos GPI/GPE_PERSONA_VEHICULO_* siguen existiendo y son
// los que ese componente comprueba.

/* =========================================================================
   PCO — infraestructura física
   ========================================================================= */

/** Nombre legible del guardia de una asignación.
 *
 *  Prefiere el nombre de la persona; si RLS no lo deja ver, cae al nombre de la cuenta
 *  humanizado ("guardia_demo" → "Guardia Demo") antes que al correo, y solo en último caso al
 *  correo. Nunca se muestra un identificador crudo (feedback PCO). */
function nombreGuardia(r: Record<string, any>): string {
  const p = r.guardia?.persona
  if (p?.nombres || p?.apellidos) return `${p.nombres ?? ''} ${p.apellidos ?? ''}`.trim()
  if (r.guardia?.nombre_usuario) return humanizarNombreCuenta(r.guardia.nombre_usuario)
  return r.guardia?.correo_electronico ?? '—'
}

/** ¿Está este guardia cubriendo su punto en este momento?
 *
 *  Va en su propia columna, separada de la vigencia de la asignación, porque son dos cosas que
 *  se confundían: "Activa" quiere decir que la asignación está en vigor estos días, y eso sigue
 *  siendo cierto a mediodía para un turno de noche. El cálculo usa la hora de Ecuador, no la del
 *  navegador (§D52), y solo dice algo cuando puede saberlo. */
function etiquetaTurnoAhora(fila: Record<string, any>): string {
  if (fila.estado_asignacion !== 'ACTIVA') return 'No aplica'
  const dentro = estaEnTurno(fila.hora_inicio, fila.hora_fin)
  if (dentro === null) return 'Sin horario'
  return dentro ? 'En turno' : 'Fuera de turno'
}

function EnTurnoAhora({ fila }: { fila: Record<string, any> }) {
  const texto = etiquetaTurnoAhora(fila)
  const color =
    texto === 'En turno' ? 'text-emerald-700 font-medium'
    : texto === 'Fuera de turno' ? 'text-ink-soft'
    : 'text-slate-400'
  return <span className={`text-xs ${color}`}>{texto}</span>
}

/* Jornada del guardia. En la base viven en `parametro_sistema`
   (JORNADA_MAXIMA_GUARDIA_HORAS y el descanso), porque son política laboral y pueden cambiar;
   aquí se repiten como constantes solo para adelantar el aviso en el formulario.
   Código del Trabajo del Ecuador: 8 h ordinarias (art. 47), hasta 12 con extras (art. 55). */
const JORNADA_ORDINARIA_MIN = 8 * 60
const JORNADA_MAXIMA_MIN = 12 * 60

/** El punto de la asignación y, si no está operativo, por qué ese guardia no puede trabajar.
 *
 *  Caso real detectado en esta ronda (§V29): la asignación de "Guardia Demo" se veía impecable
 *  —vigente, en horario— pero el guardia no podía operar, porque `esta_en_turno_guardia()` exige
 *  que el punto esté ACTIVO y el suyo estaba en mantenimiento. Nada en pantalla lo decía, así que
 *  desde PCO no había forma de saber que había que reasignarlo a otro punto. */
function PuntoConAviso({ fila }: { fila: Record<string, any> }) {
  const nombre = fila.punto?.nombre_punto ?? '—'
  const operativo = fila.punto?.estado_punto === 'ACTIVO'
  if (operativo || fila.estado_asignacion !== 'ACTIVA') return <>{nombre}</>
  return (
    <span className="inline-flex flex-col">
      {nombre}
      <span className="text-[11px] text-amber-700">
        {humanizar(fila.punto?.estado_punto)}: el guardia no puede operar aquí
      </span>
    </span>
  )
}

export const cfgZona: ResourceConfig = {
  tabla: 'zona',
  titulo: 'Zonas',
  singular: 'Zona',
  idField: 'id_zona',
  // Auto-join: PostgREST resuelve el embed por columna FK directamente (padre:columna(...)),
  // el hint de nombre de constraint falla para relaciones autorreferenciadas en esta versión.
  select: '*, padre:id_zona_padre(nombre_zona)',
  orderBy: { columna: 'nombre_zona' },
  permisos: { select: ['PCO_ZONA_SELECT'], insert: ['PCO_ZONA_INSERT'], update: ['PCO_ZONA_UPDATE'] },
  buscarEn: ['nombre_zona', 'tipo_zona'],
  columnas: [
    { key: 'nombre_zona', label: 'Nombre' },
    { key: 'tipo_zona', label: 'Tipo', badge: true },
    { key: 'padre', label: 'Zona padre', render: (r) => r.padre?.nombre_zona ?? '—' },
    { key: 'estado_zona', label: 'Estado', badge: true },
  ],
  campoTituloDetalle: (r) => r.nombre_zona,
  campoSubtituloDetalle: (r) => <Badge value={r.tipo_zona} />,
  detalle: [
    { label: 'Zona padre', render: (r) => r.padre?.nombre_zona ?? '—' },
    { label: 'Estado', render: (r) => <Badge value={r.estado_zona} /> },
    { label: 'Registro', render: (r) => fmtFecha(r.fecha_registro) },
  ],
  filtros: [{ campo: 'tipo_zona', label: 'Filtrar por zona', opciones: opcionesCatalogo(CAT.zona_tipo) }],
  campos: [
    { name: 'nombre_zona', label: 'Nombre', required: true, colSpan: 2, validar: validarNoVacio },
    { name: 'tipo_zona', label: 'Tipo', type: 'select', required: true, options: opcionesCatalogo(CAT.zona_tipo), alCambiarLimpiar: ['id_zona_padre'] },
    // Jerarquía CAMPUS -> EDIFICIO -> PARQUEADERO (feedback PCO): el combo ofrecía todas las
    // zonas, así que un parqueadero podía colgar de otro parqueadero. Ahora solo se ofrece el
    // nivel inmediatamente superior. El trigger validar_jerarquia_zona lo vuelve a comprobar.
    {
      name: 'id_zona_padre', label: 'Zona padre', type: 'select', required: true,
      opcionesDependientes: (v) => optZonasPadrePara(v.tipo_zona),
      visibleSi: (v) => v.tipo_zona === 'PARQUEADERO' || v.tipo_zona === 'EDIFICIO',
      hint: 'Un edificio pertenece a un campus; un parqueadero, a un edificio.',
    },
    // Sin combo de Estado al registrar (feedback PCO): una zona nueva nace en servicio. Cambiarlo
    // es una decisión posterior, y para eso está la ficha —con Inactivar y Reactivar—.
    { name: 'estado_zona', label: 'Estado', type: 'select', options: opcionesCatalogo(CAT.zona_estado), default: 'ACTIVA', hideOnInsert: true },
  ],
  campoEstado: 'estado_zona',
  baja: { campoEstado: 'estado_zona', valorBaja: 'INACTIVA', etiqueta: 'Inactivar' },
  reactivar: { valorActivo: 'ACTIVA', etiqueta: 'Reactivar' },
}

/** Siguiente nombre sugerido para un punto de control tipo CAMPUS (feedback PCO #7):
 *  si ya hay "Acceso A".."Acceso D", sugiere "Acceso E". Solo aplica a zonas CAMPUS. */
async function sugerirNombrePuntoCampus(idZona: string, valores: Record<string, any>): Promise<string | null> {
  if (valores._filtro_tipo_zona !== 'CAMPUS') return null
  const { data } = await (supabase as any).from('punto_control').select('nombre_punto').eq('id_zona', idZona)
  const letras = ((data as { nombre_punto: string }[]) ?? [])
    .map((r) => /^Acceso ([A-Z])$/i.exec(r.nombre_punto.trim())?.[1]?.toUpperCase())
    .filter((l): l is string => !!l)
    .map((l) => l.charCodeAt(0))
  const siguiente = letras.length ? Math.max(...letras) + 1 : 'A'.charCodeAt(0)
  return `Acceso ${String.fromCharCode(siguiente)}`
}

export const cfgPuntoControl: ResourceConfig = {
  tabla: 'punto_control',
  titulo: 'Puntos de control',
  singular: 'Punto de control',
  idField: 'id_punto_control',
  select: '*, zona:zona(nombre_zona)',
  orderBy: { columna: 'nombre_punto' },
  permisos: { select: ['PCO_PUNTO_CONTROL_SELECT'], insert: ['PCO_PUNTO_CONTROL_INSERT'], update: ['PCO_PUNTO_CONTROL_UPDATE'] },
  buscarEn: ['nombre_punto'],
  filtros: [{
    campo: 'zona.nombre_zona',
    label: 'Filtrar por zona',
    opciones: async () => {
      const { data } = await (supabase as any).from('zona').select('nombre_zona')
      return ((data as { nombre_zona: string }[]) ?? []).map((z) => ({ value: z.nombre_zona, label: z.nombre_zona }))
    },
  }],
  columnas: [
    { key: 'nombre_punto', label: 'Nombre' },
    { key: 'zona', label: 'Zona', render: (r) => r.zona?.nombre_zona ?? '—' },
    { key: 'estado_punto', label: 'Estado', badge: true },
  ],
  campoTituloDetalle: (r) => r.nombre_punto,
  campoSubtituloDetalle: (r) => <Badge value={r.estado_punto} />,
  detalle: [
    { label: 'Zona', render: (r) => r.zona?.nombre_zona ?? '—' },
    { label: 'Estado', render: (r) => <Badge value={r.estado_punto} /> },
    { label: 'Registro', render: (r) => fmtFecha(r.fecha_registro) },
  ],
  campos: [
    // Cascada (feedback PCO #5): primero el tipo de zona, luego se despliegan solo esas zonas.
    //
    // `derivarDeRegistro` arregla el bug de "en la parte de Zona no aparece nada": al editar un
    // punto de control este filtro arrancaba vacío —no es una columna de la tabla— y dejaba el
    // combo Zona sin ninguna opción, con lo que ni siquiera se podía guardar el registro.
    {
      name: '_filtro_tipo_zona', label: 'Tipo de zona', type: 'select', required: true, persistir: false,
      // Los tres tipos, también al registrar (PCO v2 §"En el campo Zona de todos los paneles, se
      // debe escoger solo los 3 tipos de zona"). En la ronda anterior se había quitado CAMPUS de
      // aquí, y eso dejaba a medio gestionar las garitas de entrada a la universidad, que sí
      // cuelgan del campus. Con esto se cierra §V25.
      options: opcionesCatalogo(CAT.zona_tipo),
      alCambiarLimpiar: ['id_zona'],
      derivarDeRegistro: async (registro) => {
        const { data } = await (supabase as any).from('zona').select('tipo_zona').eq('id_zona', registro.id_zona).maybeSingle()
        return (data as { tipo_zona: string } | null)?.tipo_zona ?? ''
      },
    },
    { name: 'id_zona', label: 'Zona', type: 'select', required: true, opcionesDependientes: (v) => optZonasPorTipo(v._filtro_tipo_zona) },

    /* Nomenclatura oficial de la EPN dentro de un edificio (PCO v2). El usuario teclea solo
       números y una descripción; los separadores los pone el sistema, que es lo que pedía el
       documento («no estos caracteres: "/, -"»). Espejo de `componer_nombre_punto_epn()`. */
    {
      name: '_edificio', label: 'Edificio', type: 'number', required: true, persistir: false,
      visibleSi: (v) => v._filtro_tipo_zona === 'EDIFICIO',
      placeholder: '20', hint: 'Solo el número.',
      derivarDeRegistro: (r) => partesUbicacionEPN(r.nombre_punto)?.edificio ?? '',
    },
    {
      name: '_piso', label: 'Piso', type: 'number', required: true, persistir: false,
      visibleSi: (v) => v._filtro_tipo_zona === 'EDIFICIO',
      placeholder: '4', hint: 'Planta baja es 0.',
      derivarDeRegistro: (r) => partesUbicacionEPN(r.nombre_punto)?.piso ?? '',
    },
    {
      name: '_espacio', label: 'Aula o espacio', type: 'number', required: true, persistir: false,
      visibleSi: (v) => v._filtro_tipo_zona === 'EDIFICIO',
      placeholder: '4', hint: 'Se completa a tres dígitos: 4 → 004.',
      derivarDeRegistro: (r) => partesUbicacionEPN(r.nombre_punto)?.espacio ?? '',
    },
    {
      name: '_descripcion', label: 'Descripción', colSpan: 2, persistir: false,
      visibleSi: (v) => v._filtro_tipo_zona === 'EDIFICIO',
      placeholder: 'Laboratorio Alan Turing', hint: 'Cómo se conoce al sitio. Opcional.',
      derivarDeRegistro: (r) => partesUbicacionEPN(r.nombre_punto)?.descripcion ?? '',
    },

    // En un edificio el nombre lo compone el sistema y se muestra en gris; en un campus o un
    // parqueadero se escribe a mano, porque ahí los puntos son garitas y accesos perimetrales
    // que no ocupan un aula. Es el mismo criterio que aplica el trigger de la base.
    {
      name: 'nombre_punto', label: 'Nombre', required: true, colSpan: 2, validar: validarNoVacio,
      visibleSi: (v) => v._filtro_tipo_zona !== 'EDIFICIO',
      autoSugerenciaDesde: { campo: 'id_zona', calcular: sugerirNombrePuntoCampus },
    },
    {
      name: 'nombre_punto', label: 'Nombre del punto', colSpan: 2,
      visibleSi: (v) => v._filtro_tipo_zona === 'EDIFICIO',
      componerDesde: {
        campos: ['_edificio', '_piso', '_espacio', '_descripcion'],
        componer: (v) => componerNombrePuntoEPN(v._edificio, v._piso, v._espacio, v._descripcion),
      },
      hint: 'Lo arma el sistema con los datos de arriba.',
    },
    // Todo punto de control nace activo (feedback PCO): no tiene sentido registrar uno que ya
    // esté en mantenimiento. FALLA desapareció del catálogo: un lugar no falla.
    { name: 'estado_punto', label: 'Estado', type: 'select', options: opcionesCatalogo(CAT.punto_estado), default: 'ACTIVO', hideOnInsert: true },
  ],
  campoEstado: 'estado_punto',
}

export const cfgDispositivo: ResourceConfig = {
  tabla: 'dispositivo',
  titulo: 'Dispositivos',
  singular: 'Dispositivo',
  idField: 'id_dispositivo',
  select: '*, punto:punto_control(nombre_punto)',
  permisos: { select: ['PCO_DISPOSITIVO_SELECT'], insert: ['PCO_DISPOSITIVO_INSERT'], update: ['PCO_DISPOSITIVO_UPDATE'] },
  buscarEn: ['codigo_mac'],
  filtros: [
    { campo: 'tipo_tecnologia', label: 'Filtrar por tecnología', opciones: opcionesCatalogo(CAT.dispositivo_tecnologia) },
    { campo: 'estado_dispositivo', label: 'Filtrar por estado', opciones: opcionesCatalogo(CAT.dispositivo_estado) },
  ],
  columnas: [
    { key: 'codigo_mac', label: 'MAC' },
    { key: 'direccion_ip', label: 'IP' },
    { key: 'tipo_tecnologia', label: 'Tecnología' },
    { key: 'punto', label: 'Punto', render: (r) => r.punto?.nombre_punto ?? '—' },
    { key: 'estado_dispositivo', label: 'Estado', badge: true },
  ],
  campoTituloDetalle: (r) => r.codigo_mac,
  campoSubtituloDetalle: (r) => <Badge value={r.estado_dispositivo} />,
  detalle: [
    { label: 'IP', render: (r) => r.direccion_ip },
    { label: 'Tecnología', render: (r) => humanizar(r.tipo_tecnologia) },
    { label: 'Punto de control', render: (r) => r.punto?.nombre_punto ?? '—' },
  ],
  campos: [
    // Orden pedido (feedback PCO #9): tecnología primero, luego MAC/IP con autoformato.
    { name: 'tipo_tecnologia', label: 'Tecnología', type: 'select', required: true, options: opcionesCatalogo(CAT.dispositivo_tecnologia), alCambiarLimpiar: ['_filtro_zona', 'id_punto_control'] },
    { name: 'codigo_mac', label: 'Código MAC', required: true, placeholder: 'AA:BB:CC:DD:EE:FF', formatear: formatearMac, validar: validarMac, ayuda: 'Seis pares de dígitos hexadecimales (0-9 y A-F) separados por dos puntos: AA:BB:CC:DD:EE:FF. Los dos puntos se añaden solos mientras escribes.' },
    { name: 'direccion_ip', label: 'Dirección IP', required: true, placeholder: '10.0.0.10', formatear: formatearIp, validar: validarIp, ayuda: 'Dirección IPv4 con cuatro números de 0 a 255 separados por puntos (10.0.0.10). También se acepta IPv6.' },
    // Cascada (feedback PCO #10): zona → punto de control, ya filtrada por compatibilidad
    // tecnología↔zona (LPR_PLACAS solo PARQUEADERO). El trigger validar_asignacion_dispositivo
    // en la base de datos es la garantía real; esto es solo para no ofrecer opciones inválidas.
    //
    // `derivarDeRegistro` arregla el bug de "el campo Punto de control no tiene nada para
    // seleccionar": al editar un dispositivo este filtro de zona arrancaba vacío y el combo de
    // puntos se quedaba sin opciones, bloqueando el guardado.
    {
      name: '_filtro_zona', label: 'Zona', type: 'select', required: true, persistir: false,
      opcionesDependientes: (v) => v.tipo_tecnologia === 'LPR_PLACAS' ? optZonasPorTipo('PARQUEADERO') : optZonas(),
      alCambiarLimpiar: ['id_punto_control'],
      derivarDeRegistro: async (registro) => {
        const { data } = await (supabase as any).from('punto_control').select('id_zona').eq('id_punto_control', registro.id_punto_control).maybeSingle()
        return (data as { id_zona: string } | null)?.id_zona ?? ''
      },
    },
    { name: 'id_punto_control', label: 'Punto de control', type: 'select', required: true, opcionesDependientes: (v) => optPuntosPorZona(v._filtro_zona) },
    // Un dispositivo nuevo se instala funcionando (feedback PCO). A diferencia del punto de
    // control, aquí el estado SÍ se conserva en el catálogo: un lector sí puede quedarse sin red
    // o romperse, y esa avería hay que poder registrarla desde la ficha.
    { name: 'estado_dispositivo', label: 'Estado', type: 'select', options: opcionesCatalogo(CAT.dispositivo_estado), default: 'OPERATIVO', hideOnInsert: true },
  ],
  campoEstado: 'estado_dispositivo',
}

export const cfgAsignacionGuardia: ResourceConfig = {
  tabla: 'guardia_punto_control',
  titulo: 'Asignaciones de guardia',
  singular: 'Asignación',
  idField: 'id_asignacion',
  // El embed de `persona` es lo que por fin da un nombre humano al guardia. Antes solo se
  // traían campos de la cuenta y, además, RLS devolvía `guardia: null` a PCO sin dar error,
  // así que la columna se veía como "—" (feedback PCO: "no aparece el nombre del guardia").
  select: '*, guardia:usuario_sistema!guardia_punto_control_id_usuario_fkey(nombre_usuario, correo_electronico, persona:persona(nombres, apellidos, cedula)), punto:punto_control(nombre_punto, estado_punto)',
  // Solo PCO asigna (feedback CAC: "quitar asignación de guardia" — ya revocado en rol_permiso).
  // CAC conserva SELECT únicamente, para supervisión.
  permisos: { select: ['PCO_ASIGNACION_SELECT', 'CAC_ASIGNACION_SELECT'], insert: ['PCO_ASIGNACION_INSERT'], update: ['PCO_ASIGNACION_UPDATE'] },
  autoUsuarioRegistro: ['id_usuario_registro'],
  // Se busca por cédula y apellido, no por correo: el identificador de una persona es su
  // cédula (§D57). El correo identifica a la CUENTA, que es otra cosa.
  buscarEn: ['guardia.persona.cedula', 'guardia.persona.apellidos', 'punto.nombre_punto', 'turno'],
  columnas: [
    { key: 'guardia', label: 'Guardia', render: (r) => nombreGuardia(r), valorExport: (r) => nombreGuardia(r) },
    // El identificador visible de una persona es siempre la cédula (RF de PCO), nunca un código
    // interno ni el correo.
    { key: 'cedula', label: 'Cédula', render: (r) => r.guardia?.persona?.cedula ?? '—' },
    { key: 'punto', label: 'Punto', render: (r) => <PuntoConAviso fila={r} />, valorExport: (r) => r.punto?.nombre_punto ?? '' },
    { key: 'turno', label: 'Horario', render: (r) => d(r.turno), valorExport: (r) => String(r.turno ?? '') },
    // Fechas del turno (PCO v2): "se debe agregar una columna fecha para saber cuándo empieza y
    // cuándo finaliza un turno".
    { key: 'fecha_inicio', label: 'Desde', render: (r) => fmtFechaDia(r.fecha_inicio), valorExport: (r) => fmtFechaDia(r.fecha_inicio) },
    { key: 'fecha_fin', label: 'Hasta', render: (r) => (r.fecha_fin ? fmtFechaDia(r.fecha_fin) : 'Sin definir'), valorExport: (r) => (r.fecha_fin ? fmtFechaDia(r.fecha_fin) : '') },
    // Dos columnas distintas con nombres que no se pueden confundir. Antes la vigencia se
    // llamaba "Estado" y el "en turno ahora" viajaba pegado al horario, y no se sabía cuál era
    // cuál: son cosas diferentes. Una asignación VIGENTE de 22:00–06:00 lo está también a
    // mediodía, con el guardia en su casa.
    { key: 'estado_asignacion', label: 'Asignación', badge: true },
    { key: '_ahora', label: 'Ahora mismo', render: (r) => <EnTurnoAhora fila={r} />, valorExport: (r) => etiquetaTurnoAhora(r) },
  ],
  campoTituloDetalle: (r) => nombreGuardia(r),
  campoSubtituloDetalle: (r) => <>Punto {r.punto?.nombre_punto ?? '—'} · <Badge value={r.estado_asignacion} /></>,
  detalle: [
    { label: 'Cédula', render: (r) => r.guardia?.persona?.cedula ?? '—' },
    { label: 'Correo', render: (r) => d(r.guardia?.correo_electronico) },
    { label: 'Punto de control', render: (r) => r.punto?.nombre_punto ?? '—' },
    { label: 'Horario', render: (r) => d(r.turno) },
    { label: 'Ahora mismo', render: (r) => <EnTurnoAhora fila={r} /> },
    { label: 'Vigencia', render: (r) => `${fmtFechaDia(r.fecha_inicio)} → ${r.fecha_fin ? fmtFechaDia(r.fecha_fin) : 'indefinida'}` },
  ],
  campos: [
    // Se busca por cédula, no en un desplegable (PCO v2): «al asignar un Guardia a un punto de
    // control, lo buscamos con su cédula». El desplegable obligaba a reconocer a la persona por
    // su correo, que no es como se identifica a nadie. El RPC solo responde por cuentas con rol
    // GUARDIA_SEGURIDAD activo, así que sigue siendo imposible asignar a un Responsable de Módulo.
    {
      name: 'id_usuario', label: 'Cédula del guardia', type: 'cedula-busqueda', required: true, editable: false,
      buscarPorCedula: {
        rpc: 'buscar_guardia_por_cedula',
        textoNoEncontrado: 'Esa cédula no corresponde a ningún guardia registrado.',
      },
      hint: '10 dígitos. Al completarlos se muestra el nombre.',
    },
    // Cascada (feedback PCO #13): primero la zona, luego solo sus puntos de control.
    {
      name: '_filtro_zona', label: 'Zona', type: 'select', required: true, persistir: false, options: optZonas,
      alCambiarLimpiar: ['id_punto_control'],
      derivarDeRegistro: async (registro) => {
        const { data } = await (supabase as any).from('punto_control').select('id_zona').eq('id_punto_control', registro.id_punto_control).maybeSingle()
        return (data as { id_zona: string } | null)?.id_zona ?? ''
      },
    },
    { name: 'id_punto_control', label: 'Punto de control', type: 'select', required: true, opcionesDependientes: (v) => optPuntosPorZona(v._filtro_zona) },
    // El turno deja de ser texto libre (§V10). Se guardaba "07:00–17:00" y también "MATUTINO",
    // así que no se podía comparar contra un reloj; ahora son dos horas y el texto se deriva de
    // ellas en la BD. Con esto `esta_en_turno_guardia` deja de depender de una expresión regular
    // y se puede avisar de si el guardia está en turno ahora mismo.
    { name: 'hora_inicio', label: 'Entrada', type: 'time', required: true, hint: 'Hora local de Ecuador.' },
    {
      name: 'hora_fin', label: 'Salida', type: 'time', required: true,
      hint: 'Puede cruzar la medianoche (22:00 → 06:00).',
      // Espejo de validar_jornada_guardia(). La base es la que manda; esto solo adelanta el
      // aviso para que no se descubra al guardar.
      validar: (v, todos) => {
        const dur = duracionTurnoMin(todos.hora_inicio, v)
        if (dur === null) return null
        if (dur === 0) return 'La entrada y la salida no pueden ser la misma hora.'
        return dur > JORNADA_MAXIMA_MIN
          ? `Un turno no puede durar ${(dur / 60).toFixed(1)} horas: el máximo son ${JORNADA_MAXIMA_MIN / 60}.`
          : null
      },
      aviso: (v, todos) => {
        const dur = duracionTurnoMin(todos.hora_inicio, v)
        if (dur === null || dur <= JORNADA_ORDINARIA_MIN || dur > JORNADA_MAXIMA_MIN) return null
        // Legal, pero conviene que quien lo registra sepa lo que está firmando.
        return `Turno de ${(dur / 60).toFixed(1)} h: supera la jornada ordinaria de ${JORNADA_ORDINARIA_MIN / 60} h, el resto son horas extra.`
      },
    },
    { name: 'fecha_inicio', label: 'Inicio', type: 'date', required: true, minHoy: true },
    // Obligatoria (feedback PCO #12): todos los guardias cumplen contrato con fecha de fin.
    { name: 'fecha_fin', label: 'Fin', type: 'date', required: true, minHoy: true },
    // Una asignación nueva nace vigente; se finaliza desde la ficha, no al crearla.
    { name: 'estado_asignacion', label: 'Estado', type: 'select', options: opcionesCatalogo(CAT.asignacion_estado), default: 'ACTIVA', hideOnInsert: true },
  ],
  campoEstado: 'estado_asignacion',
  baja: { campoEstado: 'estado_asignacion', valorBaja: 'FINALIZADA', etiqueta: 'Finalizar asignación' },
}

/* =========================================================================
   GPE — personal externo, memorandos, autorizaciones
   ========================================================================= */

/* -------------------------------------------------------------------------
   Cómo está autorizada una persona externa a entrar.

   GPE §10: "en Personal externo existe un apartado INGRESO donde se especifican el número de
   días que puede ingresar, pero eso depende del memorando como tal, no es una característica
   de la persona. Entonces este apartado tiene que ser mucho más claro: si es una persona
   asociada a un memorando, debe aparecer el memorando al que está asociado y puede haber una
   redirección a este para saber si todavía puede entrar o no."

   Lo que se mostraba antes ("3 días") era engañoso por partida doble: era un dato del
   memorando presentado como si fuera de la persona, y seguía diciendo "3 días" cuando el
   memorando ya había vencido y esa persona ya no podía entrar.
   ------------------------------------------------------------------------- */

interface VinculoMemorando {
  id_memorando?: string
  estado_acceso?: string
  memorando?: {
    id_memorando: string
    numero_memorando: string
    fecha_inicio: string
    fecha_fin: string
    estado_memorando: string
  } | null
}

interface PersonaExternaRow {
  vinculos?: VinculoMemorando[]
  visitas?: { fecha_visita: string; estado_autorizacion: string }[]
}

type ViaAcceso =
  | { tipo: 'MEMORANDO'; vinculo: VinculoMemorando; estado: string; bloqueado: boolean }
  | { tipo: 'VISITA'; fecha: string; estado: string }
  | { tipo: 'NINGUNA' }

/** La vía por la que esta persona puede entrar hoy, o la más reciente si ninguna sirve ya.
 *  El memorando manda sobre la autorización diaria, igual que en la Edge Function. */
function viaDeAcceso(r: PersonaExternaRow): ViaAcceso {
  const vinculos = r.vinculos ?? []
  const vigente = vinculos.find(
    (v) => v.memorando && estadoMemorandoEfectivo(v.memorando) === 'VIGENTE' && v.estado_acceso === 'ACTIVO',
  )
  const elegido = vigente ?? vinculos.find((v) => v.memorando)
  if (elegido?.memorando) {
    return {
      tipo: 'MEMORANDO',
      vinculo: elegido,
      estado: estadoMemorandoEfectivo(elegido.memorando),
      bloqueado: elegido.estado_acceso === 'BLOQUEADO',
    }
  }

  const visitas = r.visitas ?? []
  const hoy = hoyISO()
  const visitaHoy = visitas.find((v) => v.fecha_visita === hoy && v.estado_autorizacion !== 'REVOCADA')
  const ultima = visitaHoy ?? [...visitas].sort((a, b) => b.fecha_visita.localeCompare(a.fecha_visita))[0]
  if (ultima) {
    return { tipo: 'VISITA', fecha: ultima.fecha_visita, estado: estadoAutorizacionEfectivo(ultima) }
  }
  return { tipo: 'NINGUNA' }
}

/** Resumen de una línea para la columna del listado. */
function resumenAcceso(r: PersonaExternaRow): string {
  const via = viaDeAcceso(r)
  if (via.tipo === 'MEMORANDO') {
    if (via.bloqueado) return 'Acceso bloqueado en el memorando'
    const dias = diasDeVigencia(via.vinculo.memorando!.fecha_inicio, via.vinculo.memorando!.fecha_fin)
    const etiqueta = `Memorando ${via.vinculo.memorando!.numero_memorando}`
    return via.estado === 'VIGENTE'
      ? `${etiqueta} · ${dias === 1 ? '1 día' : `${dias} días`}`
      : `${etiqueta} · ${humanizar(via.estado).toLowerCase()}`
  }
  if (via.tipo === 'VISITA') {
    return via.estado === 'VIGENTE'
      ? 'Visita autorizada solo por hoy'
      : `Visita del ${fmtFecha(via.fecha)} · ${humanizar(via.estado).toLowerCase()}`
  }
  return 'Sin autorización de ingreso'
}

/** Bloque del panel de detalle: dice si puede entrar, por qué, y enlaza al memorando. */
function DetalleAcceso({ r }: { r: PersonaExternaRow }) {
  const via = viaDeAcceso(r)

  if (via.tipo === 'MEMORANDO') {
    const m = via.vinculo.memorando!
    const puedeEntrar = via.estado === 'VIGENTE' && !via.bloqueado
    return (
      <div className="space-y-1.5">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className={puedeEntrar ? 'font-medium text-emerald-700' : 'font-medium text-red'}>
            {puedeEntrar ? 'Puede ingresar' : 'No puede ingresar'}
          </span>
          <Badge value={via.estado} />
          {via.bloqueado && <Badge value="BLOQUEADO" />}
        </p>
        <p className="text-xs text-ink-soft">
          Autorizada por el memorando{' '}
          {/* Enlace a la ficha del memorando (GPE §10: "puede haber una redirección a este
              para saber si todavía puede entrar o no"). */}
          <Link
            to={`/m/GPE/memorandos?buscar=${encodeURIComponent(m.numero_memorando)}`}
            className="font-medium text-navy underline underline-offset-2 hover:text-blue-700"
          >
            {m.numero_memorando}
          </Link>
          , vigente del {fmtFecha(m.fecha_inicio)} al {fmtFecha(m.fecha_fin)}.
        </p>
        {via.bloqueado && (
          <p className="text-xs text-ink-soft">
            El memorando sigue vigente, pero a esta persona se le bloqueó el acceso en
            "Personas por memorando".
          </p>
        )}
      </div>
    )
  }

  if (via.tipo === 'VISITA') {
    const puedeEntrar = via.estado === 'VIGENTE'
    return (
      <div className="space-y-1.5">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className={puedeEntrar ? 'font-medium text-emerald-700' : 'font-medium text-red'}>
            {puedeEntrar ? 'Puede ingresar hoy' : 'No puede ingresar'}
          </span>
          <Badge value={via.estado} />
        </p>
        <p className="text-xs text-ink-soft">
          Sin memorando. Tiene una autorización de visita para el {fmtFecha(via.fecha)}, válida
          solo ese día. Para que pueda entrar más de un día hay que vincularla a un memorando.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <p className="font-medium text-red">No puede ingresar</p>
      <p className="text-xs text-ink-soft">
        No está vinculada a ningún memorando ni tiene una autorización de visita. Registra una
        de las dos cosas para que pueda entrar al campus.
      </p>
    </div>
  )
}

export const cfgPersonaExterna: ResourceConfig = {
  tabla: 'persona',
  titulo: 'Personal externo',
  singular: 'Persona externa',
  idField: 'id_persona',
  select: '*, categoria:categoria_persona(codigo_categoria), empresa:empresa(nombre), vinculos:persona_memorando(estado_acceso, memorando:memorando(id_memorando, numero_memorando, fecha_inicio, fecha_fin, estado_memorando)), visitas:autorizacion_visita_diaria(fecha_visita, estado_autorizacion)',
  orderBy: { columna: 'apellidos' },
  filtroFijo: { tipo_persona: 'EXTERNA' },
  permisos: { select: ['GPE_PERSONA_SELECT'], insert: ['GPE_PERSONA_INSERT'], update: ['GPE_PERSONA_UPDATE'] },
  defaultsInsert: { tipo_persona: 'EXTERNA', estado: 'ACTIVO' },
  buscarEn: ['cedula', 'nombres', 'apellidos', 'correo', 'empresa.nombre', 'vinculos.memorando.numero_memorando'],
  camposSensibles: ['id_categoria', 'id_empresa'],
  columnas: [
    { key: 'cedula', label: 'Cédula' },
    { key: 'nombres', label: 'Nombres', render: (r) => `${r.apellidos} ${r.nombres}` },
    { key: 'categoria', label: 'Categoría', render: (r) => humanizar(r.categoria?.codigo_categoria), valorExport: (r) => humanizar(r.categoria?.codigo_categoria) },
    { key: 'empresa', label: 'Empresa', render: (r) => r.empresa?.nombre ?? '—' },
    // Antes: "Ingreso" con un número de días que era del memorando, no de la persona, y que
    // seguía mostrándose aunque el memorando estuviera vencido (GPE §10).
    { key: 'acceso', label: 'Autorización de ingreso', render: (r) => resumenAcceso(r), valorExport: (r) => resumenAcceso(r) },
    { key: 'estado', label: 'Estado', badge: true },
  ],
  campoTituloDetalle: (r) => `${r.nombres} ${r.apellidos}`,
  campoSubtituloDetalle: (r) => <><Badge value={r.categoria?.codigo_categoria} /> <Badge value={r.estado} /></>,
  detalle: [
    { label: 'Cédula', render: (r) => r.cedula },
    { label: 'Correo', render: (r) => d(r.correo) },
    { label: 'Teléfono', render: (r) => d(r.telefono_contacto) },
    { label: 'Categoría', render: (r) => humanizar(r.categoria?.codigo_categoria) },
    { label: 'Empresa', render: (r) => r.empresa?.nombre ?? '—' },
    { label: 'Autorización de ingreso', render: (r) => <DetalleAcceso r={r} /> },
    { label: 'Registro', render: (r) => fmtFecha(r.fecha_registro) },
  ],
  campos: [
    { name: 'cedula', label: 'Cédula', required: true, editable: false, validar: validarCedula, hint: '10 dígitos; se verifica provincia y dígito verificador.', ayuda: '10 dígitos numéricos. Se comprueba que los dos primeros correspondan a una provincia del Ecuador (01 a 24, o 30 para documentos emitidos en el exterior), que el tercero sea menor que 6 (persona natural) y que el último dígito verificador cuadre con el algoritmo del Registro Civil.', placeholder: '1712345678' },
    { name: 'nombres', label: 'Nombres', required: true, editable: false, validar: validarNombre, ayuda: 'Solo letras, incluidas tildes y ñ, además de espacios, guiones y apóstrofes. Sin números. Mínimo 2 caracteres.' },
    { name: 'apellidos', label: 'Apellidos', required: true, editable: false, validar: validarNombre, ayuda: 'Solo letras, incluidas tildes y ñ, además de espacios, guiones y apóstrofes. Sin números. Mínimo 2 caracteres.' },
    // Ya no obligatorio (feedback GPE: registro ágil de visitas sin memorando — basta con
    // cédula + algún contacto, no hace falta correo si ya se da teléfono, o viceversa).
    // Dominio libre: un externo no tiene correo institucional por definición.
    { name: 'correo', label: 'Correo (opcional)', type: 'email', validar: validarCorreo, ayuda: 'Formato usuario@dominio.com. Cualquier dominio es válido: una persona externa no tiene por qué tener correo de la EPN.' },
    { name: 'telefono_contacto', label: 'Teléfono (opcional)', validar: validarTelefono, normalizar: normalizarTelefono, hint: 'Se guarda como +593…', ayuda: 'Celular de 10 dígitos (0987654321) o fijo con código de provincia (022345678). Puedes escribirlo con espacios o guiones. Se guarda siempre en formato internacional: +593987654321.', placeholder: '0987654321' },
    { name: 'id_categoria', label: 'Categoría (externa)', type: 'select', required: true, options: optCategorias('EXTERNA') },
    { name: 'id_empresa', label: 'Empresa (opcional)', type: 'select', options: optEmpresas },
    { name: 'sexo', label: 'Sexo', type: 'select', options: opcionesCatalogo(CAT.persona_sexo) },
    { name: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date', validar: validarFechaNacimiento, ayuda: 'No puede ser una fecha futura ni de hace más de 120 años. No hay edad mínima: el CEC registra a menores de edad en sus cursos.' },
    { name: 'direccion_domicilio', label: 'Dirección', colSpan: 2 },
  ],
  campoEstado: 'estado',
  // Brecha §6.1: baja de persona = INACTIVO (sin "temporal con duración"). Ver 99_DUDAS_FRONTEND.md.
  baja: { campoEstado: 'estado', valorBaja: 'INACTIVO', campoMotivo: 'detalle_estado', etiqueta: 'Dar de baja' },
}

export const cfgMemorando: ResourceConfig = {
  tabla: 'memorando',
  titulo: 'Memorandos',
  singular: 'Memorando',
  idField: 'id_memorando',
  select: '*, empresa:empresa(nombre)',
  orderBy: { columna: 'fecha_registro', ascendente: false },
  permisos: { select: ['GPE_MEMORANDO_SELECT'], insert: ['GPE_MEMORANDO_INSERT'], update: ['GPE_MEMORANDO_UPDATE'] },
  autoUsuarioRegistro: ['id_usuario_registro'],
  buscarEn: ['numero_memorando', 'dependencia_autorizada', 'empresa.nombre'],
  columnas: [
    { key: 'numero_memorando', label: 'Número' },
    { key: 'empresa', label: 'Empresa', render: (r) => r.empresa?.nombre ?? '—' },
    { key: 'dependencia_autorizada', label: 'Dependencia' },
    { key: 'vigencia', label: 'Vigencia', render: (r) => `${fmtFecha(r.fecha_inicio)} → ${fmtFecha(r.fecha_fin)}` },
    { key: 'estado_memorando', label: 'Estado', render: (r) => <Badge value={estadoMemorandoEfectivo(r)} /> },
  ],
  campoTituloDetalle: (r) => r.numero_memorando,
  campoSubtituloDetalle: (r) => <><Badge value={estadoMemorandoEfectivo(r)} /> · {r.empresa?.nombre}</>,
  detalle: [
    { label: 'Empresa', render: (r) => r.empresa?.nombre ?? '—' },
    { label: 'Dependencia autorizada', render: (r) => d(r.dependencia_autorizada) },
    { label: 'Vigencia', render: (r) => `${fmtFecha(r.fecha_inicio)} → ${fmtFecha(r.fecha_fin)}` },
    {
      label: 'Situación',
      render: (r) => {
        const estado = estadoMemorandoEfectivo(r)
        if (estado === 'ANULADO') {
          return (
            <span>
              Anulado{r.fecha_anulacion ? ` el ${fmtFecha(r.fecha_anulacion)}` : ''}.
              {r.motivo_anulacion ? ` Motivo: ${r.motivo_anulacion}` : ''}
            </span>
          )
        }
        if (estado === 'VENCIDO') return <span className="text-red">Venció el {fmtFecha(r.fecha_fin)}. Ya no autoriza el ingreso.</span>
        if (estado === 'PROGRAMADO') return <span>Todavía no empieza: autoriza el ingreso desde el {fmtFecha(r.fecha_inicio)}.</span>
        return <span className="text-emerald-700">Autoriza el ingreso hasta el {vigenteHastaTexto(r.fecha_fin)} inclusive.</span>
      },
    },
    { label: 'Registro', render: (r) => fmtFecha(r.fecha_registro) },
  ],
  campos: [
    // GPE §3: "El atributo numero_memorando ahora deberá ser un varchar para poder agregarlo a
    // mano, es decir que no puede ser automático". Antes se generaba solo (MEM-MRQUHXKD) y no
    // se parecía en nada al número del oficio real que la dependencia emite.
    // Sigue sin poder cambiarse una vez registrado: es la referencia del documento en papel.
    {
      name: 'numero_memorando', label: 'Número de memorando', required: true, editable: false,
      colSpan: 2, validar: validarNumeroMemorando,
      hint: 'Cópialo del oficio. No se puede cambiar después.',
      ayuda: 'El número tal como aparece en el memorando emitido por la dependencia. Entre 3 y 50 caracteres, con al menos un dígito. Se admiten letras, números, guiones, puntos y barras. No puede repetirse.',
      placeholder: 'EPN-DA-2026-0001-M',
    },
    { name: 'id_empresa', label: 'Empresa', type: 'select', required: true, options: optEmpresas },
    // Ya no obligatoria (feedback GPE): una persona puede acudir a más de una dependencia.
    { name: 'dependencia_autorizada', label: 'Dependencia autorizada (opcional)', colSpan: 2 },
    { name: 'fecha_inicio', label: 'Inicio de vigencia', type: 'date', required: true },
    {
      name: 'fecha_fin', label: 'Fin de vigencia', type: 'date', required: true,
      hint: 'El último día cuenta: se puede ingresar hasta esa fecha inclusive.',
      validar: (v, vals) => (vals.fecha_inicio && v < String(vals.fecha_inicio)
        ? 'El fin de vigencia no puede ser anterior al inicio.'
        : null),
    },
    // GPE §6: "Al momento de editar un memorando aparece un combo box Estado que realmente no
    // tiene sentido. El memorando realmente ya no está vigente pero el combo box aparece como
    // vigente." El estado no es una elección: sale de las fechas. Se muestra en gris con el
    // valor real, y para anularlo antes de tiempo está el botón del pie de la ficha.
    {
      name: 'estado_memorando', label: 'Estado', soloLectura: true, hideOnInsert: true,
      valorCalculado: (v) => humanizar(estadoMemorandoEfectivo(v as any)),
      hint: 'Lo calculan las fechas de vigencia. Para retirar la autorización antes de tiempo, usa "Anular memorando".',
    },
  ],
  campoEstado: 'estado_memorando',
  // Cambiar las fechas de vigencia o la empresa altera quién puede entrar al campus y hasta
  // cuándo (GPE §5).
  camposSensibles: ['fecha_inicio', 'fecha_fin', 'id_empresa'],
  accionDetalle: (r, ctx) => <AnularMemorando memorando={r} {...ctx} />,
}

export const cfgPersonaMemorando: ResourceConfig = {
  tabla: 'persona_memorando',
  titulo: 'Personas por memorando',
  singular: 'Vínculo persona–memorando',
  idField: 'id_persona_memorando',
  select: '*, persona:persona(nombres, apellidos, cedula, empresa:empresa(nombre)), memorando:memorando(id_memorando, numero_memorando, fecha_inicio, fecha_fin, estado_memorando)',
  permisos: { select: ['GPE_PERSONA_MEMORANDO_SELECT'], insert: ['GPE_PERSONA_MEMORANDO_INSERT'], update: ['GPE_PERSONA_MEMORANDO_UPDATE'] },
  buscarEn: ['persona.cedula', 'persona.apellidos', 'persona.empresa.nombre', 'memorando.numero_memorando'],
  columnas: [
    { key: 'persona', label: 'Persona', render: (r) => (r.persona ? `${r.persona.apellidos} ${r.persona.nombres}` : '—') },
    { key: 'cedula', label: 'Cédula', render: (r) => d(r.persona?.cedula) },
    { key: 'empresa', label: 'Empresa', render: (r) => d(r.persona?.empresa?.nombre) },
    { key: 'memorando', label: 'Memorando', render: (r) => r.memorando?.numero_memorando ?? '—' },
    // GPE §10: el vínculo por sí solo no dice si la persona puede entrar. Lo que decide es si
    // el memorando sigue vigente, y eso no se veía en ninguna parte de esta pantalla.
    {
      key: 'vigencia', label: '¿Puede entrar?',
      render: (r) => {
        if (r.estado_acceso === 'BLOQUEADO') return <><Badge value="BLOQUEADO" /> <span className="text-xs text-ink-soft">acceso retirado</span></>
        const estado = estadoMemorandoEfectivo(r.memorando ?? {})
        return estado === 'VIGENTE'
          ? <span className="text-emerald-700">Sí, hasta el {fmtFecha(r.memorando?.fecha_fin)}</span>
          : <><span className="text-red">No</span> <Badge value={estado} /></>
      },
      valorExport: (r) => (r.estado_acceso === 'BLOQUEADO' ? 'No, acceso bloqueado' : estadoMemorandoEfectivo(r.memorando ?? {}) === 'VIGENTE' ? `Sí, hasta ${r.memorando?.fecha_fin}` : `No, memorando ${humanizar(estadoMemorandoEfectivo(r.memorando ?? {})).toLowerCase()}`),
    },
  ],
  campoTituloDetalle: (r) => (r.persona ? `${r.persona.nombres} ${r.persona.apellidos}` : 'Vínculo'),
  campoSubtituloDetalle: (r) => <>Memorando {r.memorando?.numero_memorando ?? '—'} · <Badge value={estadoMemorandoEfectivo(r.memorando ?? {})} /></>,
  detalle: [
    { label: 'Cédula', render: (r) => d(r.persona?.cedula) },
    { label: 'Empresa', render: (r) => d(r.persona?.empresa?.nombre) },
    {
      label: 'Memorando',
      render: (r) => (r.memorando ? (
        <Link
          to={`/m/GPE/memorandos?buscar=${encodeURIComponent(r.memorando.numero_memorando)}`}
          className="font-medium text-navy underline underline-offset-2 hover:text-blue-700"
        >
          {r.memorando.numero_memorando}
        </Link>
      ) : '—'),
    },
    { label: 'Vigencia del memorando', render: (r) => (r.memorando ? `${fmtFecha(r.memorando.fecha_inicio)} → ${fmtFecha(r.memorando.fecha_fin)}` : '—') },
    // La ficha decía 'Estado de acceso: Activo' junto a un memorando vencido, que se lee como
    // que la persona puede entrar cuando no puede. El vínculo activo solo significa que no se
    // le retiró el acceso individualmente; quien manda es la vigencia del memorando, igual que
    // en la columna '¿Puede entrar?' de la lista.
    {
      label: '¿Puede entrar?',
      render: (r) => {
        if (r.estado_acceso === 'BLOQUEADO') return <><Badge value="BLOQUEADO" /> <span className="text-xs text-ink-soft">acceso retirado</span></>
        const estado = estadoMemorandoEfectivo(r.memorando ?? {})
        return estado === 'VIGENTE'
          ? <span className="text-emerald-700">Sí, hasta el {fmtFecha(r.memorando?.fecha_fin)}</span>
          : <><span className="text-red">No</span> <Badge value={estado} /> <span className="text-xs text-ink-soft">el memorando ya no autoriza</span></>
      },
    },
    { label: 'Vínculo con el memorando', render: (r) => <Badge value={r.estado_acceso} /> },
  ],
  campos: [
    // El memorando va primero: es el documento que se está tramitando, y saber cuál es ayuda a
    // decidir a quién vincular. Solo se ofrecen los que todavía autorizan algo — vincular a
    // alguien a un memorando vencido no le permite entrar, y era fácil hacerlo sin darse cuenta.
    { name: 'id_memorando', label: 'Memorando', type: 'select', required: true, editable: false, options: optMemorandosVigentes, hint: 'Solo se listan los memorandos vigentes o por empezar.' },
    // Selección múltiple con buscador (GPE §12): la etiqueta lleva cédula y empresa, que es
    // justo por lo que el equipo pidió poder buscar.
    {
      name: 'id_persona', label: 'Personas externas', type: 'select', required: true, editable: false,
      multiSelect: true, colSpan: 2, options: optPersonasExternasConEmpresa,
      placeholder: 'Buscar por apellido, cédula o empresa...',
      hint: 'Puedes vincular varias personas al mismo memorando de una vez.',
    },
    { name: 'estado_acceso', label: 'Estado de acceso', type: 'select', options: opcionesCatalogo(CAT.persona_memorando_estado), default: 'ACTIVO', hideOnInsert: true, hint: 'Bloquear impide entrar a esta persona sin afectar al resto del memorando.' },
  ],
  campoEstado: 'estado_acceso',
  baja: { campoEstado: 'estado_acceso', valorBaja: 'BLOQUEADO', etiqueta: 'Bloquear acceso' },
}

/* =========================================================================
   CAC — reglas de acceso
   ========================================================================= */

export const cfgReglaAcceso: ResourceConfig = {
  tabla: 'regla_acceso',
  titulo: 'Reglas de acceso',
  singular: 'Regla de acceso',
  idField: 'id_regla_acceso',
  // Las garitas de la regla viven ahora en una tabla aparte (RF-CA-007): una regla puede
  // aplicar en varias, y sin ninguna asociada aplica en todas.
  select: '*, categoria:categoria_persona(codigo_categoria), garitas:regla_acceso_punto_control(id_punto_control, punto:punto_control(nombre_punto))',
  orderBy: { columna: 'nombre_regla' },
  permisos: { select: ['CAC_REGLA_SELECT'], insert: ['CAC_REGLA_INSERT'], update: ['CAC_REGLA_UPDATE'] },
  buscarEn: ['nombre_regla', 'descripcion'],
  columnas: [
    { key: 'nombre_regla', label: 'Nombre' },
    { key: 'categoria', label: 'Categoría', render: (r) => humanizar(r.categoria?.codigo_categoria) },
    { key: 'garitas', label: 'Garitas', render: (r) => textoGaritas(r), valorExport: (r) => textoGaritas(r) },
    { key: 'horario', label: 'Horario', render: (r) => `${fmtHora(r.horario_inicio)}–${fmtHora(r.horario_fin)}` },
    { key: 'estado_regla', label: 'Estado', badge: true },
  ],
  campoTituloDetalle: (r) => r.nombre_regla,
  campoSubtituloDetalle: (r) => <Badge value={r.estado_regla} />,
  detalle: [
    { label: 'Categoría', render: (r) => humanizar(r.categoria?.codigo_categoria) },
    { label: 'Garitas', render: (r) => textoGaritas(r) },
    { label: 'Horario', render: (r) => horarioLegible(r) },
    { label: 'Requiere memorando', render: (r) => (r.requiere_memorando ? 'Sí' : 'No') },
    { label: 'Descripción', render: (r) => d(r.descripcion) },
  ],
  // Las garitas se gestionan desde la ficha, como las personas de un vehículo: son una
  // relación N:M, no un campo del formulario.
  detalleExtra: (r, ctx) => <GaritasDeRegla idRegla={r.id_regla_acceso} onCambio={ctx.recargar} />,
  campos: [
    { name: 'nombre_regla', label: 'Nombre de la regla', required: true, colSpan: 2, validar: validarNoVacio },
    { name: 'id_categoria', label: 'Categoría', type: 'select', required: true, options: optCategorias() },
    {
      name: 'horario_inicio', label: 'Horario inicio', type: 'time', required: true,
      // Un horario que cruza la medianoche es legítimo (el turno de noche), pero es tan fácil
      // de teclear por error que conviene decirlo en voz alta antes de guardar.
      aviso: (v, valores) =>
        v && valores.horario_fin && v > valores.horario_fin
          ? 'El horario cruza la medianoche: la regla valdrá desde esta hora hasta la hora de fin del día siguiente.'
          : null,
    },
    { name: 'horario_fin', label: 'Horario fin', type: 'time', required: true },
    {
      name: 'requiere_memorando', label: '¿Requiere memorando?', type: 'checkbox',
      hint: 'Si se marca, la validación exige un memorando vigente a nombre de la persona. No es informativo: sin memorando se deniega el ingreso.',
    },
    // Oculto en el alta: toda regla nueva nace ACTIVA (feedback CAC). Solo editable después.
    { name: 'estado_regla', label: 'Estado', type: 'select', options: opcionesCatalogo(CAT.regla_estado), default: 'ACTIVA', hideOnInsert: true },
    { name: 'descripcion', label: 'Descripción', type: 'textarea', required: true, colSpan: 3, validar: validarNoVacio },
  ],
  campoEstado: 'estado_regla',
  // Cambiar el horario o la categoría de una regla cambia quién entra al campus mañana por la
  // mañana, y no hay ninguna pantalla que avise de ello después.
  camposSensibles: ['horario_inicio', 'horario_fin', 'id_categoria', 'requiere_memorando'],
  baja: { campoEstado: 'estado_regla', valorBaja: 'INACTIVA', etiqueta: 'Inactivar regla' },
  // RF-CA-003 deja la regla inactiva sin borrarla; hacía falta el camino de vuelta (§D56).
  reactivar: { valorActivo: 'ACTIVA', etiqueta: 'Reactivar regla' },
}

/** "Todas las garitas" / "Garita Principal" / "3 garitas". Sin garitas asociadas la regla
 *  aplica en todos los puntos, así que decir "—" sería justo lo contrario de la verdad. */
function textoGaritas(r: any): string {
  const garitas = (r.garitas ?? []) as { punto?: { nombre_punto: string } | null }[]
  if (garitas.length === 0) return 'Todas las garitas'
  if (garitas.length === 1) return garitas[0].punto?.nombre_punto ?? '1 garita'
  return `${garitas.length} garitas`
}

/** Horario con la nota del cruce de medianoche, que si no se explica se lee como un error. */
function horarioLegible(r: any): string {
  const texto = `${fmtHora(r.horario_inicio)} – ${fmtHora(r.horario_fin)}`
  return r.horario_inicio > r.horario_fin ? `${texto} (del día siguiente)` : texto
}

/** Autorizaciones de visita diaria (GPE). El guardia las crea desde su vista operativa. */
export const cfgAutorizacion: ResourceConfig = {
  tabla: 'autorizacion_visita_diaria',
  titulo: 'Autorizaciones de visita',
  singular: 'Autorización',
  idField: 'id_autorizacion',
  select: '*, persona:persona(nombres, apellidos, cedula)',
  orderBy: { columna: 'fecha_visita', ascendente: false },
  permisos: { select: ['GPE_AUTORIZACION_SELECT'], insert: ['GPE_AUTORIZACION_INSERT'], update: ['GPE_AUTORIZACION_UPDATE'] },
  autoUsuarioRegistro: ['id_usuario_registro'],
  buscarEn: ['persona.cedula', 'persona.apellidos', 'motivo'],
  columnas: [
    { key: 'persona', label: 'Visitante', render: (r) => (r.persona ? `${r.persona.apellidos} ${r.persona.nombres}` : '—') },
    { key: 'cedula', label: 'Cédula', render: (r) => d(r.persona?.cedula) },
    { key: 'fecha_visita', label: 'Fecha de visita', render: (r) => fmtFecha(r.fecha_visita) },
    // El estado guardado solo distingue vigente de revocada; que la visita ya pasó lo dice la
    // fecha (GPE §8).
    { key: 'estado_autorizacion', label: 'Estado', render: (r) => <Badge value={estadoAutorizacionEfectivo(r)} />, valorExport: (r) => humanizar(estadoAutorizacionEfectivo(r)) },
  ],
  filtros: [
    { campo: 'fecha_visita', label: 'Fecha de visita', opciones: async () => {
      const { data } = await (supabase as any).from('autorizacion_visita_diaria').select('fecha_visita').order('fecha_visita', { ascending: false })
      const fechas = [...new Set(((data as { fecha_visita: string }[]) ?? []).map((a) => a.fecha_visita))]
      return fechas.map((f) => ({ value: f, label: fmtFecha(f) }))
    } },
  ],
  campoTituloDetalle: (r) => (r.persona ? `${r.persona.nombres} ${r.persona.apellidos}` : 'Autorización'),
  campoSubtituloDetalle: (r) => <><Badge value={estadoAutorizacionEfectivo(r)} /> · {fmtFecha(r.fecha_visita)}</>,
  detalle: [
    { label: 'Cédula', render: (r) => d(r.persona?.cedula) },
    { label: 'Fecha de visita', render: (r) => fmtFecha(r.fecha_visita) },
    {
      label: 'Situación',
      render: (r) => {
        const estado = estadoAutorizacionEfectivo(r)
        if (estado === 'REVOCADA') {
          return <span>Revocada.{r.motivo_revocacion ? ` Motivo: ${r.motivo_revocacion}` : ''}</span>
        }
        if (estado === 'CADUCADA') return <span className="text-red">La fecha de visita ya pasó. No autoriza el ingreso.</span>
        if (estado === 'PROGRAMADA') return <span>Autoriza el ingreso el {fmtFecha(r.fecha_visita)}, no antes.</span>
        return <span className="text-emerald-700">Autoriza el ingreso hoy, solo por hoy.</span>
      },
    },
    { label: 'Motivo de la visita', render: (r) => d(r.motivo) },
    { label: 'Registrada', render: (r) => fmtFecha(r.fecha_registro) },
  ],
  campos: [
    { name: 'id_persona', label: 'Visitante (persona externa)', type: 'select', required: true, editable: false, options: opcionesTabla('persona', 'id_persona', (p) => `${p.apellidos} ${p.nombres} · ${p.cedula}`, { tipo_persona: 'EXTERNA' }), colSpan: 2 },
    {
      name: 'fecha_visita', label: 'Fecha de visita', type: 'date', required: true, default: hoyISO(),
      hint: 'La autorización vale solo ese día.',
      validar: (v) => (v && v < hoyISO() ? 'La fecha de visita no puede ser anterior a hoy: la autorización nacería caducada.' : null),
    },
    { name: 'motivo', label: 'Motivo de la visita', type: 'textarea', required: true, colSpan: 3, validar: validarNoVacio, placeholder: 'Por ejemplo: entrega de documentos en Secretaría General.' },
    // GPE §8: "Al igual que Editar Memorando, Ingresos (visitas sin memorando) tiene el combo
    // box de Estado al querer registrar una autorización. No le veo mucho el sentido a esto."
    // No lo tiene: una autorización recién creada solo puede nacer vigente. El estado pasa a
    // calcularse desde la fecha y solo se muestra al editar, en gris. Para retirarla está el
    // botón "Revocar autorización" del pie de la ficha.
    {
      name: 'estado_autorizacion', label: 'Estado', soloLectura: true, hideOnInsert: true,
      valorCalculado: (v) => humanizar(estadoAutorizacionEfectivo(v as any)),
      hint: 'Lo calcula la fecha de visita. Para retirarla antes, usa "Revocar autorización".',
    },
  ],
  campoEstado: 'estado_autorizacion',
  camposSensibles: ['fecha_visita'],
  baja: {
    campoEstado: 'estado_autorizacion', valorBaja: 'REVOCADA',
    // El motivo se pedía en el modal y se tiraba a la basura: no había columna donde ponerlo.
    campoMotivo: 'motivo_revocacion', etiqueta: 'Revocar autorización',
  },
}
