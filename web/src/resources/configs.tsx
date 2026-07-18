import type { ResourceConfig } from './types'
import { CAT, humanizar } from '../lib/catalogos'
import { fmtFecha, fmtFechaHora, fmtHora, formatearMac, formatearIp } from '../lib/format'
import { Badge } from '../components/ui'
import { AsociacionesVehiculo } from '../components/AsociacionesVehiculo'
import {
  opcionesCatalogo, optCategorias, optEmpresas, optPuntosControl, optZonas, optRoles,
  opcionesTabla, optZonasPorTipo, optPuntosPorZona, optGuardiasDisponibles,
} from './opciones'
import { supabase } from '../lib/supabase'
import { hoyISO } from '../lib/format'
import {
  formatearPlaca, formatearPlacaInput, normalizarPlaca, normalizarTelefono,
  validarCedula, validarCodigoParametro, validarCodigoPermiso, validarCorreo,
  validarFechaNacimiento, validarIp, validarMac, validarNoVacio, validarNombre,
  validarPlaca, validarRuc, validarTelefono, validarValorParametro,
} from '../lib/validacion'

const d = (v: any) => (v == null || v === '' ? '—' : String(v))

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
    { key: 'ruc', label: 'RUC', render: (r) => d(r.ruc) },
    { key: 'tipo_servicio', label: 'Tipo de servicio', render: (r) => d(r.tipo_servicio) },
    { key: 'estado', label: 'Estado', badge: true },
  ],
  campoTituloDetalle: (r) => r.nombre,
  campoSubtituloDetalle: (r) => <Badge value={r.estado} />,
  detalle: [
    { label: 'RUC', render: (r) => d(r.ruc) },
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
    // Feedback ADM: las asociaciones persona-vehículo se gestionan desde la propia ficha
    // del vehículo. Solo en ADM: GPI y GPE conservan su pantalla de asociaciones, donde el
    // alta de vínculos forma parte de su flujo diario.
    detalleExtra:
      modulo === 'ADM'
        ? (r, { recargar }) => <AsociacionesVehiculo idVehiculo={r.id_vehiculo} onCambio={recargar} />
        : undefined,
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

export function cfgPersonaVehiculo(modulo: 'ADM' | 'GPI' | 'GPE'): ResourceConfig {
  return {
    tabla: 'persona_vehiculo',
    titulo: 'Asociaciones persona–vehículo',
    singular: 'Asociación',
    idField: 'id_persona_vehiculo',
    select: '*, persona:persona(nombres, apellidos, cedula), vehiculo:vehiculo(placa, tipo_vehiculo)',
    permisos: {
      select: [`${modulo}_PERSONA_VEHICULO_SELECT`],
      insert: [`${modulo}_PERSONA_VEHICULO_INSERT`],
      update: [`${modulo}_PERSONA_VEHICULO_UPDATE`],
    },
    autoUsuarioRegistro: ['id_usuario_registro'],
    buscarEn: ['persona.cedula', 'persona.apellidos', 'vehiculo.placa'],
    columnas: [
      { key: 'persona', label: 'Persona', render: (r) => (r.persona ? `${r.persona.nombres} ${r.persona.apellidos}` : '—') },
      { key: 'vehiculo', label: 'Vehículo', render: (r) => (r.vehiculo?.placa ? formatearPlaca(r.vehiculo.placa) : '—') },
      { key: 'tipo_relacion', label: 'Relación' },
      { key: 'estado_relacion', label: 'Estado', badge: true },
    ],
    campoTituloDetalle: (r) => (r.persona ? `${r.persona.nombres} ${r.persona.apellidos}` : 'Asociación'),
    campoSubtituloDetalle: (r) => <>Vehículo {r.vehiculo?.placa ? formatearPlaca(r.vehiculo.placa) : '—'} · <Badge value={r.tipo_relacion} /></>,
    detalle: [
      { label: 'Cédula', render: (r) => d(r.persona?.cedula) },
      { label: 'Vehículo', render: (r) => `${r.vehiculo?.placa ? formatearPlaca(r.vehiculo.placa) : '—'} (${d(r.vehiculo?.tipo_vehiculo)})` },
      { label: 'Responsable de trámite', render: (r) => (r.es_responsable_tramite ? 'Sí' : 'No') },
      { label: 'Vigencia', render: (r) => `${fmtFecha(r.fecha_inicio)} → ${r.fecha_fin ? fmtFecha(r.fecha_fin) : 'indefinida'}` },
    ],
    campos: [
      // Filtrado por ámbito del módulo (feedback GPE): GPI solo ve INTERNA, GPE solo EXTERNA —
      // evita vincular por error una persona que no es responsabilidad de ese módulo.
      {
        name: 'id_persona', label: 'Persona', type: 'select', required: true, editable: false,
        options: opcionesTabla('persona', 'id_persona', (p) => `${p.apellidos} ${p.nombres} · ${p.cedula}`,
          modulo === 'GPI' ? { tipo_persona: 'INTERNA' } : modulo === 'GPE' ? { tipo_persona: 'EXTERNA' } : undefined),
      },
      { name: 'id_vehiculo', label: 'Vehículo', type: 'select', required: true, editable: false, options: opcionesTabla('vehiculo', 'id_vehiculo', (v) => `${v.placa ? formatearPlaca(v.placa) : v.id_vehiculo} · ${v.tipo_vehiculo}`) },
      { name: 'tipo_relacion', label: 'Tipo de relación', type: 'select', required: true, options: opcionesCatalogo(CAT.persona_vehiculo_tipo) },
      { name: 'es_responsable_tramite', label: '¿Responsable del trámite?', type: 'checkbox' },
      { name: 'fecha_inicio', label: 'Inicio', type: 'date', required: true },
      { name: 'fecha_fin', label: 'Fin (opcional)', type: 'date' },
      { name: 'estado_relacion', label: 'Estado', type: 'select', options: opcionesCatalogo(CAT.persona_vehiculo_estado), default: 'ACTIVA' },
    ],
    campoEstado: 'estado_relacion',
    baja: { campoEstado: 'estado_relacion', valorBaja: 'REVOCADA', campoMotivo: 'motivo_revocacion', etiqueta: 'Revocar' },
  }
}

/* =========================================================================
   PCO — infraestructura física
   ========================================================================= */

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
    // Solo tiene sentido una jerarquía dentro de un parqueadero o un edificio (feedback PCO #2).
    { name: 'id_zona_padre', label: 'Zona padre', type: 'select', options: optZonas, visibleSi: (v) => v.tipo_zona === 'PARQUEADERO' || v.tipo_zona === 'EDIFICIO' },
    { name: 'estado_zona', label: 'Estado', type: 'select', options: opcionesCatalogo(CAT.zona_estado), default: 'ACTIVA' },
  ],
  campoEstado: 'estado_zona',
  baja: { campoEstado: 'estado_zona', valorBaja: 'INACTIVA', etiqueta: 'Inactivar' },
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
    { name: '_filtro_tipo_zona', label: 'Tipo de zona', type: 'select', required: true, persistir: false, options: opcionesCatalogo(CAT.zona_tipo), alCambiarLimpiar: ['id_zona'] },
    { name: 'id_zona', label: 'Zona', type: 'select', required: true, opcionesDependientes: (v) => optZonasPorTipo(v._filtro_tipo_zona) },
    // Autonumerado (feedback PCO #7): "Acceso A/B/C..." según cuántos ya existen en esa zona campus.
    { name: 'nombre_punto', label: 'Nombre', required: true, colSpan: 2, validar: validarNoVacio, autoSugerenciaDesde: { campo: 'id_zona', calcular: sugerirNombrePuntoCampus } },
    { name: 'estado_punto', label: 'Estado', type: 'select', options: opcionesCatalogo(CAT.punto_estado), default: 'ACTIVO' },
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
    { name: '_filtro_zona', label: 'Zona', type: 'select', required: true, persistir: false, opcionesDependientes: (v) => v.tipo_tecnologia === 'LPR_PLACAS' ? optZonasPorTipo('PARQUEADERO') : optZonas(), alCambiarLimpiar: ['id_punto_control'] },
    { name: 'id_punto_control', label: 'Punto de control', type: 'select', required: true, opcionesDependientes: (v) => optPuntosPorZona(v._filtro_zona) },
    { name: 'estado_dispositivo', label: 'Estado', type: 'select', options: opcionesCatalogo(CAT.dispositivo_estado), default: 'OPERATIVO' },
  ],
  campoEstado: 'estado_dispositivo',
}

export const cfgAsignacionGuardia: ResourceConfig = {
  tabla: 'guardia_punto_control',
  titulo: 'Asignaciones de guardia',
  singular: 'Asignación',
  idField: 'id_asignacion',
  select: '*, guardia:usuario_sistema!guardia_punto_control_id_usuario_fkey(nombre_usuario, correo_electronico), punto:punto_control(nombre_punto)',
  // Solo PCO asigna (feedback CAC: "quitar asignación de guardia" — ya revocado en rol_permiso).
  // CAC conserva SELECT únicamente, para supervisión.
  permisos: { select: ['PCO_ASIGNACION_SELECT', 'CAC_ASIGNACION_SELECT'], insert: ['PCO_ASIGNACION_INSERT'], update: ['PCO_ASIGNACION_UPDATE'] },
  autoUsuarioRegistro: ['id_usuario_registro'],
  buscarEn: ['guardia.correo_electronico', 'punto.nombre_punto', 'turno'],
  columnas: [
    { key: 'guardia', label: 'Guardia', render: (r) => r.guardia?.correo_electronico ?? '—' },
    { key: 'punto', label: 'Punto', render: (r) => r.punto?.nombre_punto ?? '—' },
    { key: 'turno', label: 'Turno', render: (r) => d(r.turno) },
    { key: 'estado_asignacion', label: 'Estado', badge: true },
  ],
  campoTituloDetalle: (r) => r.guardia?.correo_electronico ?? 'Asignación',
  campoSubtituloDetalle: (r) => <>Punto {r.punto?.nombre_punto ?? '—'} · <Badge value={r.estado_asignacion} /></>,
  detalle: [
    { label: 'Punto de control', render: (r) => r.punto?.nombre_punto ?? '—' },
    { label: 'Turno', render: (r) => d(r.turno) },
    { label: 'Vigencia', render: (r) => `${fmtFecha(r.fecha_inicio)} → ${r.fecha_fin ? fmtFecha(r.fecha_fin) : 'indefinida'}` },
  ],
  campos: [
    // Solo cuentas con rol GUARDIA_SEGURIDAD activo (feedback PCO #11: un Responsable de
    // Módulo no debe poder ser asignado como guardia).
    { name: 'id_usuario', label: 'Guardia', type: 'select', required: true, editable: false, options: optGuardiasDisponibles },
    // Cascada (feedback PCO #13): primero la zona, luego solo sus puntos de control.
    { name: '_filtro_zona', label: 'Zona', type: 'select', required: true, persistir: false, options: optZonas, alCambiarLimpiar: ['id_punto_control'] },
    { name: 'id_punto_control', label: 'Punto de control', type: 'select', required: true, opcionesDependientes: (v) => optPuntosPorZona(v._filtro_zona) },
    { name: 'turno', label: 'Turno', type: 'timerange' },
    { name: 'fecha_inicio', label: 'Inicio', type: 'date', required: true },
    // Obligatoria (feedback PCO #12): todos los guardias cumplen contrato con fecha de fin.
    { name: 'fecha_fin', label: 'Fin', type: 'date', required: true },
    { name: 'estado_asignacion', label: 'Estado', type: 'select', options: opcionesCatalogo(CAT.asignacion_estado), default: 'ACTIVA' },
  ],
  campoEstado: 'estado_asignacion',
  baja: { campoEstado: 'estado_asignacion', valorBaja: 'FINALIZADA', etiqueta: 'Finalizar asignación' },
}

/* =========================================================================
   GPE — personal externo, memorandos, autorizaciones
   ========================================================================= */

/** "Ingreso por días" (feedback GPE): null hasta vincularse a un memorando; 1 día para
 *  visitantes sin memorando (solo autorización diaria); multi-día calculado de las fechas
 *  del memorando vigente al que esté vinculada. */
function diasIngreso(r: { vinculos?: { memorando?: { fecha_inicio: string; fecha_fin: string } | null }[]; visitas?: unknown[] }): string {
  const memo = r.vinculos?.[0]?.memorando
  if (memo) {
    const dias = Math.round((+new Date(memo.fecha_fin) - +new Date(memo.fecha_inicio)) / 86400000) + 1
    return dias <= 1 ? '1 día' : `${dias} días`
  }
  if (r.visitas?.length) return '1 día'
  return '—'
}

export const cfgPersonaExterna: ResourceConfig = {
  tabla: 'persona',
  titulo: 'Personal externo',
  singular: 'Persona externa',
  idField: 'id_persona',
  select: '*, categoria:categoria_persona(codigo_categoria), empresa:empresa(nombre), vinculos:persona_memorando(memorando:memorando(fecha_inicio, fecha_fin)), visitas:autorizacion_visita_diaria(fecha_visita)',
  orderBy: { columna: 'apellidos' },
  filtroFijo: { tipo_persona: 'EXTERNA' },
  permisos: { select: ['GPE_PERSONA_SELECT'], insert: ['GPE_PERSONA_INSERT'], update: ['GPE_PERSONA_UPDATE'] },
  defaultsInsert: { tipo_persona: 'EXTERNA', estado: 'ACTIVO' },
  buscarEn: ['cedula', 'nombres', 'apellidos', 'correo'],
  columnas: [
    { key: 'cedula', label: 'Cédula' },
    { key: 'nombres', label: 'Nombres', render: (r) => `${r.apellidos} ${r.nombres}` },
    { key: 'categoria', label: 'Categoría', render: (r) => r.categoria?.codigo_categoria ?? '—' },
    { key: 'empresa', label: 'Empresa', render: (r) => r.empresa?.nombre ?? '—' },
    { key: 'dias', label: 'Ingreso', render: diasIngreso },
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
    { label: 'Ingreso por días', render: diasIngreso },
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

/** Estado mostrado en pantalla: si la fecha_fin ya pasó, se muestra VENCIDO aunque el campo
 *  guardado siga en VIGENTE (feedback GPE: no hay proceso automático que actualice el estado
 *  almacenado, así que el frontend no debe confiar ciegamente en él para decidir qué mostrar). */
function estadoMemorandoEfectivo(r: { estado_memorando: string; fecha_fin: string }): string {
  if (r.estado_memorando === 'VIGENTE' && r.fecha_fin < hoyISO()) return 'VENCIDO'
  return r.estado_memorando
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
    { label: 'Registro', render: (r) => fmtFecha(r.fecha_registro) },
  ],
  campos: [
    // Autogenerado (feedback GPE): evita problemas de validación/formato manual del número.
    { name: 'numero_memorando', label: 'Número de memorando', required: true, editable: false, hideOnInsert: true, default: () => `MEM-${Date.now().toString(36).toUpperCase()}` },
    { name: 'id_empresa', label: 'Empresa', type: 'select', required: true, options: optEmpresas },
    // Ya no obligatoria (feedback GPE): una persona puede acudir a más de una dependencia.
    { name: 'dependencia_autorizada', label: 'Dependencia autorizada (opcional)', colSpan: 2 },
    { name: 'fecha_inicio', label: 'Inicio de vigencia', type: 'date', required: true },
    { name: 'fecha_fin', label: 'Fin de vigencia', type: 'date', required: true, hint: 'fecha_fin inclusiva (§D24)' },
    // Oculto en el alta (feedback GPE): no tiene sentido crear un memorando ya vencido; el
    // estado nace VIGENTE (default de la BD) y "VENCIDO" se calcula en pantalla desde la fecha.
    { name: 'estado_memorando', label: 'Estado', type: 'select', options: opcionesCatalogo(CAT.memorando_estado), default: 'VIGENTE', hideOnInsert: true },
  ],
  campoEstado: 'estado_memorando',
}

export const cfgPersonaMemorando: ResourceConfig = {
  tabla: 'persona_memorando',
  titulo: 'Personas por memorando',
  singular: 'Vínculo persona–memorando',
  idField: 'id_persona_memorando',
  select: '*, persona:persona(nombres, apellidos, cedula), memorando:memorando(numero_memorando)',
  permisos: { select: ['GPE_PERSONA_MEMORANDO_SELECT'], insert: ['GPE_PERSONA_MEMORANDO_INSERT'], update: ['GPE_PERSONA_MEMORANDO_UPDATE'] },
  buscarEn: ['persona.cedula', 'persona.apellidos', 'memorando.numero_memorando'],
  columnas: [
    { key: 'persona', label: 'Persona', render: (r) => (r.persona ? `${r.persona.apellidos} ${r.persona.nombres}` : '—') },
    { key: 'cedula', label: 'Cédula', render: (r) => d(r.persona?.cedula) },
    { key: 'memorando', label: 'Memorando', render: (r) => r.memorando?.numero_memorando ?? '—' },
    { key: 'estado_acceso', label: 'Acceso', badge: true },
  ],
  campoTituloDetalle: (r) => (r.persona ? `${r.persona.nombres} ${r.persona.apellidos}` : 'Vínculo'),
  detalle: [
    { label: 'Cédula', render: (r) => d(r.persona?.cedula) },
    { label: 'Memorando', render: (r) => r.memorando?.numero_memorando ?? '—' },
    { label: 'Estado de acceso', render: (r) => <Badge value={r.estado_acceso} /> },
  ],
  campos: [
    // Selección múltiple (feedback GPE): vincular varias personas al mismo memorando de una vez.
    { name: 'id_persona', label: 'Personas externas', type: 'select', required: true, editable: false, multiSelect: true, options: opcionesTabla('persona', 'id_persona', (p) => `${p.apellidos} ${p.nombres} · ${p.cedula}`, { tipo_persona: 'EXTERNA' }) },
    { name: 'id_memorando', label: 'Memorando', type: 'select', required: true, editable: false, options: opcionesTabla('memorando', 'id_memorando', (m) => m.numero_memorando) },
    { name: 'estado_acceso', label: 'Estado de acceso', type: 'select', options: opcionesCatalogo(CAT.persona_memorando_estado), default: 'ACTIVO' },
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
  select: '*, categoria:categoria_persona(codigo_categoria), punto:punto_control(nombre_punto)',
  orderBy: { columna: 'nombre_regla' },
  permisos: { select: ['CAC_REGLA_SELECT'], insert: ['CAC_REGLA_INSERT'], update: ['CAC_REGLA_UPDATE'] },
  buscarEn: ['nombre_regla', 'descripcion'],
  columnas: [
    { key: 'nombre_regla', label: 'Nombre' },
    { key: 'categoria', label: 'Categoría', render: (r) => r.categoria?.codigo_categoria ?? '—' },
    { key: 'punto', label: 'Punto', render: (r) => r.punto?.nombre_punto ?? 'Todos' },
    { key: 'horario', label: 'Horario', render: (r) => `${fmtHora(r.horario_inicio)}–${fmtHora(r.horario_fin)}` },
    { key: 'estado_regla', label: 'Estado', badge: true },
  ],
  campoTituloDetalle: (r) => r.nombre_regla,
  campoSubtituloDetalle: (r) => <Badge value={r.estado_regla} />,
  detalle: [
    { label: 'Categoría', render: (r) => humanizar(r.categoria?.codigo_categoria) },
    { label: 'Punto de control', render: (r) => r.punto?.nombre_punto ?? 'Todos los puntos' },
    { label: 'Horario', render: (r) => `${fmtHora(r.horario_inicio)} – ${fmtHora(r.horario_fin)}` },
    { label: 'Requiere memorando', render: (r) => (r.requiere_memorando ? 'Sí' : 'No') },
    { label: 'Descripción', render: (r) => d(r.descripcion) },
  ],
  campos: [
    { name: 'nombre_regla', label: 'Nombre de la regla', required: true, colSpan: 2, validar: validarNoVacio },
    { name: 'id_categoria', label: 'Categoría', type: 'select', required: true, options: optCategorias() },
    { name: 'id_punto_control', label: 'Punto de control (opcional = todos)', type: 'select', options: optPuntosControl },
    { name: 'horario_inicio', label: 'Horario inicio', type: 'time', required: true },
    { name: 'horario_fin', label: 'Horario fin', type: 'time', required: true },
    { name: 'requiere_memorando', label: '¿Requiere memorando?', type: 'checkbox' },
    // Oculto en el alta: toda regla nueva nace ACTIVA (feedback CAC). Solo editable después.
    { name: 'estado_regla', label: 'Estado', type: 'select', options: opcionesCatalogo(CAT.regla_estado), default: 'ACTIVA', hideOnInsert: true },
    { name: 'descripcion', label: 'Descripción', type: 'textarea', required: true, colSpan: 3 },
  ],
  campoEstado: 'estado_regla',
  baja: { campoEstado: 'estado_regla', valorBaja: 'INACTIVA', etiqueta: 'Inactivar regla' },
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
    { key: 'estado_autorizacion', label: 'Estado', badge: true },
  ],
  campoTituloDetalle: (r) => (r.persona ? `${r.persona.nombres} ${r.persona.apellidos}` : 'Autorización'),
  campoSubtituloDetalle: (r) => <><Badge value={r.estado_autorizacion} /> · {fmtFecha(r.fecha_visita)}</>,
  detalle: [
    { label: 'Cédula', render: (r) => d(r.persona?.cedula) },
    { label: 'Fecha de visita', render: (r) => fmtFecha(r.fecha_visita) },
    { label: 'Motivo', render: (r) => d(r.motivo) },
    { label: 'Registrada', render: (r) => fmtFecha(r.fecha_registro) },
  ],
  campos: [
    { name: 'id_persona', label: 'Visitante (persona externa)', type: 'select', required: true, editable: false, options: opcionesTabla('persona', 'id_persona', (p) => `${p.apellidos} ${p.nombres} · ${p.cedula}`, { tipo_persona: 'EXTERNA' }), colSpan: 2 },
    { name: 'fecha_visita', label: 'Fecha de visita', type: 'date', required: true, default: hoyISO() },
    { name: 'motivo', label: 'Motivo', type: 'textarea', required: true, colSpan: 3, validar: validarNoVacio },
    { name: 'estado_autorizacion', label: 'Estado', type: 'select', options: opcionesCatalogo(CAT.autorizacion_estado), default: 'VIGENTE' },
  ],
  campoEstado: 'estado_autorizacion',
  baja: { campoEstado: 'estado_autorizacion', valorBaja: 'REVOCADA', etiqueta: 'Revocar autorización' },
}
