import type { ResourceConfig } from './types'
import { CAT } from '../lib/catalogos'
import { fmtFecha } from '../lib/format'
import { Badge } from '../components/ui'
import { opcionesCatalogo, optCategorias, opcionesTabla } from './opciones'
import { supabase } from '../lib/supabase'
import {
  normalizarTelefono, validarCedula, validarCorreo, validarCorreoInstitucional,
  validarFechaNacimiento, validarNoVacio, validarNombre, validarTelefono,
} from '../lib/validacion'

// Feedback GPI: solo "Masculino"/"Femenino" (sin "Otro", ver lib/catalogos.ts persona_sexo).
const OPCIONES_SEXO = [{ value: 'M', label: 'Masculino' }, { value: 'F', label: 'Femenino' }]

/** Categorías que corresponden a un cargo/unidad tipo "empleado" (feedback GPI: separar por
 *  categoría para no mostrar campos vacíos — estudiante no tiene cargo, docente no tiene contrato). */
const CATEGORIAS_CARGO = ['ADMINISTRATIVO', 'DOCENTE']
const CATEGORIAS_ESTUDIANTE = ['ESTUDIANTE']
const CATEGORIAS_ESCALAFON = ['DOCENTE']
const CATEGORIAS_CONTRATO = ['TRABAJADOR', 'EMPRESA_SERVICIO']

/** Código de categoría de una persona (usado para mostrar/ocultar campos del detalle interno
 *  según corresponda a docente/estudiante/empleado/trabajador — recomendación GPI). */
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
  select: '*, categoria:categoria_persona(nombre_categoria, codigo_categoria), biometria:registro_biometrico(id_registro, vigente)',
  orderBy: { columna: 'apellidos' },
  filtroFijo: { tipo_persona: 'INTERNA' },
  permisos: { select: ['GPI_PERSONA_SELECT'], insert: ['GPI_PERSONA_INSERT'], update: ['GPI_PERSONA_UPDATE'] },
  defaultsInsert: { tipo_persona: 'INTERNA', estado: 'ACTIVO' },
  buscarEn: ['cedula', 'nombres', 'apellidos', 'correo', 'codigo_unico'],
  columnas: [
    { key: 'cedula', label: 'Cédula' },
    { key: 'nombres', label: 'Nombre', render: (r) => `${r.apellidos} ${r.nombres}` },
    { key: 'categoria', label: 'Categoría', render: (r) => r.categoria?.codigo_categoria ?? '—' },
    { key: 'biometria', label: 'Biometría', render: (r) => (r.biometria?.some?.((b: any) => b.vigente) ? <Badge value="ACTIVA" /> : <span className="text-xs text-slate-400">Sin enrolar</span>) },
    { key: 'estado', label: 'Estado', badge: true },
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
    { label: 'Categoría', render: (r) => r.categoria?.nombre_categoria ?? '—' },
    { label: 'Biometría', render: (r) => (r.biometria?.some?.((b: any) => b.vigente) ? 'Enrolada' : 'Sin enrolar — usa la sección Biometría') },
    { label: 'Registro', render: (r) => fmtFecha(r.fecha_registro) },
  ],
  campos: [
    { name: 'cedula', label: 'Cédula', required: true, editable: false, validar: validarCedula, hint: '10 dígitos; se verifica provincia y dígito verificador.', placeholder: '1712345678' },
    // No editable (feedback GPI): identifica de forma única al estudiante, no debe cambiar tras el registro.
    { name: 'codigo_unico', label: 'Código único', editable: false, validar: validarNoVacio },
    { name: 'nombres', label: 'Nombres', required: true, editable: false, validar: validarNombre },
    { name: 'apellidos', label: 'Apellidos', required: true, editable: false, validar: validarNombre },
    // El personal interno usa correo institucional (@epn.edu.ec o @cec.edu.ec).
    { name: 'correo', label: 'Correo', type: 'email', required: true, validar: validarCorreoInstitucional, hint: 'Correo institucional EPN.' },
    // El de respaldo es el personal alternativo: cualquier dominio.
    { name: 'correo_respaldo', label: 'Correo alternativo', type: 'email', validar: validarCorreo },
    { name: 'telefono_contacto', label: 'Teléfono', validar: validarTelefono, normalizar: normalizarTelefono, hint: 'Se guarda como +593…', placeholder: '0987654321' },
    { name: 'telefono_respaldo', label: 'Teléfono alternativo', validar: validarTelefono, normalizar: normalizarTelefono, placeholder: '0987654321' },
    { name: 'id_categoria', label: 'Categoría (interna)', type: 'select', required: true, options: optCategorias('INTERNA') },
    { name: 'sexo', label: 'Sexo', type: 'select', options: OPCIONES_SEXO },
    // No editable (feedback GPI): un dato de identidad que no debería cambiar tras el registro.
    { name: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date', editable: false, validar: validarFechaNacimiento },
    { name: 'direccion_domicilio', label: 'Dirección', colSpan: 2 },
  ],
  campoEstado: 'estado',
  // Brecha §6.1: sin baja temporal con duración; INACTIVO + motivo en detalle_estado. Ver 99_DUDAS_FRONTEND.md.
  baja: { campoEstado: 'estado', valorBaja: 'INACTIVO', campoMotivo: 'detalle_estado', etiqueta: 'Dar de baja' },
}

export const cfgPersonaInternaDetalle: ResourceConfig = {
  tabla: 'persona_interna_detalle',
  titulo: 'Datos internos (cargo / unidad)',
  singular: 'Detalle interno',
  idField: 'id_persona',
  select: '*, persona:persona(nombres, apellidos, cedula)',
  permisos: { select: ['GPI_PERSONA_DETALLE_SELECT'], insert: ['GPI_PERSONA_DETALLE_INSERT'], update: ['GPI_PERSONA_DETALLE_UPDATE'] },
  buscarEn: ['persona.cedula', 'persona.apellidos', 'cargo', 'unidad'],
  columnas: [
    { key: 'persona', label: 'Persona', render: (r) => (r.persona ? `${r.persona.apellidos} ${r.persona.nombres}` : '—') },
    { key: 'unidad', label: 'Unidad', render: (r) => d(r.unidad) },
    { key: 'cargo', label: 'Cargo', render: (r) => d(r.cargo) },
    { key: 'carrera', label: 'Carrera', render: (r) => d(r.carrera) },
  ],
  campoTituloDetalle: (r) => (r.persona ? `${r.persona.nombres} ${r.persona.apellidos}` : 'Detalle'),
  detalle: [
    { label: 'Cédula', render: (r) => d(r.persona?.cedula) },
    { label: 'Unidad', render: (r) => d(r.unidad) },
    { label: 'Cargo', render: (r) => d(r.cargo) },
    { label: 'Carrera', render: (r) => d(r.carrera) },
    { label: 'Curso', render: (r) => d(r.curso) },
    { label: 'Escalafón', render: (r) => d(r.categoria_escalafon) },
    { label: 'Contrato', render: (r) => d(r.contrato) },
    { label: 'Nombramiento', render: (r) => d(r.nombramiento) },
  ],
  campos: [
    { name: 'id_persona', label: 'Persona interna', type: 'select', required: true, editable: false, options: opcionesTabla('persona', 'id_persona', (p) => `${p.apellidos} ${p.nombres} · ${p.cedula}`, { tipo_persona: 'INTERNA' }) },
    // Oculto: solo alimenta visibleSi de los campos de abajo (recomendación GPI — separar por
    // categoría para evitar campos vacíos: estudiante no tiene cargo, docente no tiene contrato).
    { name: '_categoria', label: '', persistir: false, visibleSi: () => false, derivarSiempreDesde: { campo: 'id_persona', calcular: categoriaDePersona } },
    { name: 'unidad', label: 'Unidad', type: 'select', options: opcionesCatalogo(CAT.unidad), visibleSi: (v) => CATEGORIAS_CARGO.includes(v._categoria) },
    { name: 'cargo', label: 'Cargo', visibleSi: (v) => CATEGORIAS_CARGO.includes(v._categoria) },
    { name: 'carrera', label: 'Carrera', visibleSi: (v) => CATEGORIAS_ESTUDIANTE.includes(v._categoria) },
    { name: 'curso', label: 'Curso (solo estudiante CEC)', visibleSi: (v) => CATEGORIAS_ESTUDIANTE.includes(v._categoria) },
    { name: 'categoria_escalafon', label: 'Categoría / escalafón', visibleSi: (v) => CATEGORIAS_ESCALAFON.includes(v._categoria) },
    { name: 'contrato', label: 'Contrato', visibleSi: (v) => CATEGORIAS_CONTRATO.includes(v._categoria) },
    { name: 'nombramiento', label: 'Nombramiento', visibleSi: (v) => CATEGORIAS_CONTRATO.includes(v._categoria) },
  ],
}
