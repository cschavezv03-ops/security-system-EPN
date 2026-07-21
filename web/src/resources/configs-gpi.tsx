import type { ResourceConfig } from './types'
import { CAT, humanizar } from '../lib/catalogos'
import { fmtFecha } from '../lib/format'
import { Badge } from '../components/ui'
import { opcionesCatalogo, optCategorias, optEmpresas } from './opciones'
import { supabase } from '../lib/supabase'
import {
  normalizarTelefono, validarCedula, validarCorreo, validarCorreoInstitucional,
  validarFechaNacimiento, validarNoVacio, validarNombre, validarTelefono,
} from '../lib/validacion'

// Feedback GPI: solo "Masculino"/"Femenino" (sin "Otro", ver lib/catalogos.ts persona_sexo).
const OPCIONES_SEXO = [{ value: 'M', label: 'Masculino' }, { value: 'F', label: 'Femenino' }]

/* -------------------------------------------------------------------------
   Qué categorías usan cada campo (GPI: "los campos de la interfaz deben ser
   dinámicos ... dependiendo del tipo de persona que se elija habrá campos que
   serán bloqueados para que no se ingresen datos que no tienen que ver con
   dicho tipo de persona").
   ------------------------------------------------------------------------- */

/** El cargo aplica a administrativos y trabajadores; el docente usa su categoría académica. */
const CATEGORIAS_CARGO = ['ADMINISTRATIVO', 'TRABAJADOR']
const CATEGORIAS_ESTUDIANTE = ['ESTUDIANTE']
const CATEGORIAS_ESCALAFON = ['DOCENTE']
/** GPI: "a un docente debemos agregar un campo el cual es contrato ... al momento de registrar
 *  a un administrativo debemos agregar un campo el cual es contrato". Se suma a las dos
 *  categorías que ya lo tenían, donde también aplica. */
const CATEGORIAS_CONTRATO = ['DOCENTE', 'ADMINISTRATIVO', 'TRABAJADOR', 'EMPRESA_SERVICIO']
/** GPI: "al momento de registrar a un estudiante se debe agregar el campo unidad, ya que al
 *  igual que docente este debe poder elegir un dato del campo unidad, puede ser del CEC o de
 *  la EPN". Antes el estudiante no podía, y era justo quien más lo necesita (CEC). */
const CATEGORIAS_UNIDAD = ['DOCENTE', 'ADMINISTRATIVO', 'ESTUDIANTE']
/** GPI: "al momento de registrar datos de empresa externa se debe agregar un campo en el cual
 *  se pueda elegir a que empresa pertenece". */
const CATEGORIAS_EMPRESA = ['EMPRESA_SERVICIO']

/** Código de categoría a partir del id elegido en el formulario.
 *
 *  Los `<select>` de categoría guardan el uuid, pero todas las reglas de arriba se expresan en
 *  códigos legibles. Esta consulta es la que convierte uno en otro. */
async function categoriaPorId(idCategoria: string): Promise<string | null> {
  const { data } = await (supabase as any)
    .from('categoria_persona')
    .select('codigo_categoria')
    .eq('id_categoria', idCategoria)
    .maybeSingle()
  return data?.codigo_categoria ?? null
}

/** Igual, pero partiendo de la persona (lo usa la pantalla de datos internos). */
async function categoriaDePersona(idPersona: string): Promise<string | null> {
  const { data } = await (supabase as any)
    .from('persona')
    .select('categoria:categoria_persona(codigo_categoria)')
    .eq('id_persona', idPersona)
    .maybeSingle()
  return data?.categoria?.codigo_categoria ?? null
}

const d = (v: any) => (v == null || v === '' ? '—' : String(v))

/** Personal interno (persona con tipo_persona = INTERNA). Biometría se maneja en su propia pantalla. */
export const cfgPersonaInterna: ResourceConfig = {
  tabla: 'persona',
  titulo: 'Personal interno',
  singular: 'Persona interna',
  idField: 'id_persona',
  select: '*, categoria:categoria_persona(codigo_categoria), empresa:empresa(nombre), biometria:registro_biometrico(id_registro, vigente)',
  orderBy: { columna: 'apellidos' },
  filtroFijo: { tipo_persona: 'INTERNA' },
  permisos: { select: ['GPI_PERSONA_SELECT'], insert: ['GPI_PERSONA_INSERT'], update: ['GPI_PERSONA_UPDATE'] },
  defaultsInsert: { tipo_persona: 'INTERNA', estado: 'ACTIVO' },
  // El código único NO es una forma de identificar a una persona (§D57): se conserva como
  // dato académico del estudiante y se ve en su ficha, pero no se busca por él. A quien
  // se busca es por cédula o por nombre.
  buscarEn: ['cedula', 'nombres', 'apellidos', 'correo'],
  // GPE §5 / GPI: cambiar la categoría o el estado de una persona decide si entra al campus;
  // el correo institucional es con lo que se le identifica y notifica.
  camposSensibles: ['id_categoria', 'correo', 'id_empresa'],
  columnas: [
    { key: 'cedula', label: 'Cédula' },
    { key: 'nombres', label: 'Nombre', render: (r) => `${r.apellidos} ${r.nombres}` },
    { key: 'categoria', label: 'Categoría', render: (r) => humanizar(r.categoria?.codigo_categoria), valorExport: (r) => humanizar(r.categoria?.codigo_categoria) },
    { key: 'biometria', label: 'Biometría', render: (r) => (r.biometria?.some?.((b: any) => b.vigente) ? <Badge value="ACTIVA" /> : <span className="text-xs text-slate-400">Sin enrolar</span>) },
    { key: 'estado', label: 'Estado', badge: true },
  ],
  filtros: [
    { campo: 'categoria.codigo_categoria', label: 'Categoría', opciones: opcionesCatalogo(CAT.categoria_codigo.filter((c) => c !== 'VISITANTE' && c !== 'PROVEEDOR' && c !== 'CONTRATISTA' && c !== 'CONDUCTOR')) },
  ],
  campoTituloDetalle: (r) => `${r.nombres} ${r.apellidos}`,
  campoSubtituloDetalle: (r) => <><Badge value={r.categoria?.codigo_categoria} /> <Badge value={r.estado} /></>,
  detalle: [
    { label: 'Cédula', render: (r) => r.cedula },
    { label: 'Código único', render: (r) => d(r.codigo_unico) },
    { label: 'Correo', render: (r) => d(r.correo) },
    { label: 'Correo alternativo', render: (r) => d(r.correo_respaldo) },
    { label: 'Teléfono', render: (r) => d(r.telefono_contacto) },
    { label: 'Teléfono alternativo', render: (r) => d(r.telefono_respaldo) },
    { label: 'Sexo', render: (r) => humanizar(r.sexo) },
    { label: 'Fecha de nacimiento', render: (r) => (r.fecha_nacimiento ? fmtFecha(r.fecha_nacimiento) : '—') },
    { label: 'Dirección', render: (r) => d(r.direccion_domicilio) },
    { label: 'Categoría', render: (r) => humanizar(r.categoria?.codigo_categoria) },
    { label: 'Empresa', render: (r) => d(r.empresa?.nombre) },
    { label: 'Biometría', render: (r) => (r.biometria?.some?.((b: any) => b.vigente) ? 'Enrolada' : 'Sin enrolar — usa la sección Biometría') },
    { label: 'Registro', render: (r) => fmtFecha(r.fecha_registro) },
  ],
  campos: [
    // La categoría va primero porque decide qué campos se habilitan debajo.
    { name: 'id_categoria', label: 'Categoría', type: 'select', required: true, options: optCategorias('INTERNA'), hint: 'Determina qué datos se piden a continuación.' },
    // Campo oculto: traduce el uuid de la categoría al código con el que se escriben las
    // reglas de visibilidad. No se envía a la base (la columna real es id_categoria).
    { name: '_categoria', label: '', persistir: false, visibleSi: () => false, derivarSiempreDesde: { campo: 'id_categoria', calcular: categoriaPorId } },

    { name: 'cedula', label: 'Cédula', required: true, editable: false, validar: validarCedula, hint: '10 dígitos; se verifica provincia y dígito verificador. No se puede cambiar después.', ayuda: '10 dígitos numéricos. Se comprueba que los dos primeros correspondan a una provincia del Ecuador (01 a 24, o 30 para documentos emitidos en el exterior), que el tercero sea menor que 6 (persona natural) y que el último dígito verificador cuadre con el algoritmo del Registro Civil.', placeholder: '1712345678' },
    { name: 'nombres', label: 'Nombres', required: true, editable: false, validar: validarNombre, hint: 'No se puede cambiar después del registro.', ayuda: 'Solo letras, incluidas tildes y ñ, además de espacios, guiones y apóstrofes. Sin números. Mínimo 2 caracteres.' },
    { name: 'apellidos', label: 'Apellidos', required: true, editable: false, validar: validarNombre, hint: 'No se puede cambiar después del registro.', ayuda: 'Solo letras, incluidas tildes y ñ, además de espacios, guiones y apóstrofes. Sin números. Mínimo 2 caracteres.' },

    // GPI: "Ahora el campo de Código Único solo es utilizado por los estudiantes. Para el resto
    // de personas este campo permanece bloqueado." El trigger validar_codigo_unico_estudiante
    // lo garantiza también en la base.
    {
      name: 'codigo_unico', label: 'Código único', editable: false, validar: validarNoVacio,
      visibleSi: (v) => CATEGORIAS_ESTUDIANTE.includes(v._categoria),
      hint: 'Número de matrícula del estudiante. No se puede cambiar después.', placeholder: '202320947',
    },

    // El personal interno usa correo institucional (@epn.edu.ec o @cec.edu.ec).
    { name: 'correo', label: 'Correo', type: 'email', required: true, validar: validarCorreoInstitucional, hint: 'Correo institucional EPN.', ayuda: 'Debe ser una dirección institucional de la Politécnica: @epn.edu.ec (o un subdominio como @fis.epn.edu.ec) o @cec.edu.ec para el Centro de Educación Continua.' },
    // El de respaldo es el personal alternativo: cualquier dominio.
    { name: 'correo_respaldo', label: 'Correo alternativo', type: 'email', validar: validarCorreo, ayuda: 'Formato usuario@dominio.com. Cualquier dominio es válido: sirve para localizar a la persona si pierde el acceso al institucional.' },
    { name: 'telefono_contacto', label: 'Teléfono', validar: validarTelefono, normalizar: normalizarTelefono, hint: 'Se guarda como +593…', ayuda: 'Celular de 10 dígitos (0987654321) o fijo con código de provincia (022345678). Puedes escribirlo con espacios o guiones. Se guarda siempre en formato internacional: +593987654321.', placeholder: '0987654321' },
    { name: 'telefono_respaldo', label: 'Teléfono alternativo', validar: validarTelefono, normalizar: normalizarTelefono, ayuda: 'Celular de 10 dígitos (0987654321) o fijo con código de provincia (022345678). Puedes escribirlo con espacios o guiones. Se guarda siempre en formato internacional: +593987654321.', placeholder: '0987654321' },

    // GPI: obligatorio para cualquier tipo de persona interna, junto con cédula, nombres,
    // apellidos, categoría y correo.
    { name: 'sexo', label: 'Sexo', type: 'select', required: true, options: OPCIONES_SEXO },
    // No editable: dato de identidad que no cambia tras el registro. El CHECK
    // persona_fecha_nacimiento_valida impide fechas futuras también desde la API.
    { name: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date', editable: false, validar: validarFechaNacimiento, hint: 'No puede ser una fecha futura.', ayuda: 'No puede ser una fecha futura ni de hace más de 120 años. No hay edad mínima: el CEC registra a menores de edad en sus cursos.' },
    { name: 'direccion_domicilio', label: 'Dirección domiciliaria', colSpan: 2 },

    // GPI: el personal de una empresa de servicio pertenece a una de las empresas registradas
    // en Administración. La columna ya existía en `persona`, pero el formulario de personal
    // interno nunca la ofreció: solo el de personal externo.
    {
      name: 'id_empresa', label: 'Empresa a la que pertenece', type: 'select', options: optEmpresas,
      visibleSi: (v) => CATEGORIAS_EMPRESA.includes(v._categoria),
      hint: 'Empresas registradas en Administración.',
    },
  ],
  campoEstado: 'estado',
  // Brecha §6.1: sin baja temporal con duración; INACTIVO + motivo en detalle_estado. Ver 99_DUDAS_FRONTEND.md.
  baja: { campoEstado: 'estado', valorBaja: 'INACTIVO', campoMotivo: 'detalle_estado', etiqueta: 'Dar de baja' },
  // GPI reactiva a su propio personal, simétrico con "Dar de baja". La única restricción
  // vive en el backend: nadie sin ADM_PERSONA_UPDATE puede tocar el estado de una persona con
  // rol de Responsable/Director/Administrador (trigger proteger_personal_privilegiado) — ese
  // caso ya llega con el error del backend, no se duplica aquí en el frontend.
  reactivar: { valorActivo: 'ACTIVO', etiqueta: 'Reactivar' },
}

export const cfgPersonaInternaDetalle: ResourceConfig = {
  tabla: 'persona_interna_detalle',
  titulo: 'Datos internos (cargo / unidad)',
  singular: 'Detalle interno',
  idField: 'id_persona',
  select: '*, persona:persona(id_persona, nombres, apellidos, cedula, correo, tipo_persona, estado, categoria:categoria_persona(codigo_categoria))',
  permisos: { select: ['GPI_PERSONA_DETALLE_SELECT'], insert: ['GPI_PERSONA_DETALLE_INSERT'], update: ['GPI_PERSONA_DETALLE_UPDATE'] },
  buscarEn: ['persona.cedula', 'persona.apellidos', 'cargo', 'unidad'],
  columnas: [
    { key: 'persona', label: 'Persona', render: (r) => (r.persona ? `${r.persona.apellidos} ${r.persona.nombres}` : '—') },
    { key: 'categoria', label: 'Categoría', render: (r) => humanizar(r.persona?.categoria?.codigo_categoria), valorExport: (r) => humanizar(r.persona?.categoria?.codigo_categoria) },
    { key: 'unidad', label: 'Unidad', render: (r) => (r.unidad ? humanizar(r.unidad) : '—') },
    { key: 'cargo', label: 'Cargo', render: (r) => d(r.cargo) },
    { key: 'carrera', label: 'Carrera', render: (r) => d(r.carrera) },
  ],
  campoTituloDetalle: (r) => (r.persona ? `${r.persona.nombres} ${r.persona.apellidos}` : 'Detalle'),
  campoSubtituloDetalle: (r) => <Badge value={r.persona?.categoria?.codigo_categoria} />,
  detalle: [
    { label: 'Cédula', render: (r) => d(r.persona?.cedula) },
    { label: 'Unidad', render: (r) => (r.unidad ? humanizar(r.unidad) : '—') },
    {
      label: 'Cargo', render: (r) => d(r.cargo),
      visibleSi: (r) => CATEGORIAS_CARGO.includes(r.persona?.categoria?.codigo_categoria),
    },
    { label: 'Carrera', render: (r) => d(r.carrera) },
    { label: 'Curso', render: (r) => d(r.curso) },
    {
      label: 'Categoría', render: (r) => d(r.categoria_escalafon),
      visibleSi: (r) => CATEGORIAS_ESCALAFON.includes(r.persona?.categoria?.codigo_categoria),
    },
    {
      label: 'Contrato', render: (r) => (r.contrato ? humanizar(r.contrato) : '—'),
      visibleSi: (r) => CATEGORIAS_CONTRATO.includes(r.persona?.categoria?.codigo_categoria),
    },
  ],
  campos: [
    {
      name: 'id_persona', label: 'Cédula de la persona interna', type: 'cedula-busqueda',
      required: true, editable: false, buscarPersona: { soloTipo: 'INTERNA', soloActivas: true },
      hint: 'Al encontrarla se muestra su categoría, que determina qué campos se habilitan.',
    },
    // Oculto: solo alimenta las reglas `visibleSi` de abajo.
    { name: '_categoria', label: '', persistir: false, visibleSi: () => false, derivarSiempreDesde: { campo: 'id_persona', calcular: categoriaDePersona } },

    {
      name: 'unidad', label: 'Unidad', type: 'select', options: opcionesCatalogo(CAT.unidad),
      visibleSi: (v) => CATEGORIAS_UNIDAD.includes(v._categoria),
      alCambiarLimpiar: ['carrera', 'curso'],
      hint: 'EPN o Centro de Educación Continua (CEC). Al cambiarla se limpian los datos académicos incompatibles.',
    },
    { name: 'cargo', label: 'Cargo', visibleSi: (v) => CATEGORIAS_CARGO.includes(v._categoria) },
    {
      name: 'carrera', label: 'Carrera',
      visibleSi: (v) => CATEGORIAS_ESTUDIANTE.includes(v._categoria),
      deshabilitadoSi: (v) => v.unidad !== 'EPN',
      hint: 'Se habilita únicamente para estudiantes de la EPN.',
    },
    {
      name: 'curso', label: 'Curso',
      visibleSi: (v) => CATEGORIAS_ESTUDIANTE.includes(v._categoria),
      deshabilitadoSi: (v) => v.unidad !== 'CEC',
      hint: 'Se habilita únicamente para estudiantes del CEC.',
    },
    { name: 'categoria_escalafon', label: 'Categoría', visibleSi: (v) => CATEGORIAS_ESCALAFON.includes(v._categoria) },
    // GPI: catálogo Fijo/Temporal, no texto libre. Antes se podía escribir cualquier cosa y de
    // hecho había un docente con contrato "Si".
    { name: 'contrato', label: 'Contrato', type: 'select', options: opcionesCatalogo(CAT.contrato_tipo), visibleSi: (v) => CATEGORIAS_CONTRATO.includes(v._categoria) },
  ],
}
