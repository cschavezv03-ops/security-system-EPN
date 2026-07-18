/**
 * Catálogos derivados de los CHECK reales del backend (consultados desde
 * information_schema el 2026-07-14). NO inventar valores: si el backend cambia
 * un CHECK, actualizar aquí. Ver docs/03_DECISIONES_Y_CORRECCIONES.md y el
 * Modelo de Datos Consolidado. Regla de implementación §5.2: no hardcodear
 * catálogos sin respaldo en el CHECK real — estos lo tienen.
 */

export const CAT = {
  persona_estado: ['ACTIVO', 'INACTIVO', 'DADO_DE_BAJA'],
  persona_tipo: ['INTERNA', 'EXTERNA'],
  // Feedback GPI: solo Masculino/Femenino (persona.sexo no tiene CHECK real en la BD; este
  // catálogo es puramente de UI, sin respaldo de constraint — corregido a lo que pide el equipo).
  persona_sexo: ['M', 'F'],
  categoria_ambito: ['INTERNA', 'EXTERNA'],
  categoria_codigo: [
    'DOCENTE', 'ESTUDIANTE', 'ADMINISTRATIVO', 'TRABAJADOR',
    'EMPRESA_SERVICIO', 'VISITANTE', 'PROVEEDOR', 'CONTRATISTA', 'CONDUCTOR',
  ],
  categoria_estado: ['ACTIVO', 'INACTIVO'],
  unidad: ['EPN', 'CEC'],
  empresa_estado: ['ACTIVO', 'INACTIVO'],
  vehiculo_tipo: ['AUTOMOVIL', 'MOTOCICLETA', 'CAMIONETA', 'BICICLETA', 'OTRO'],
  vehiculo_estado: ['ACTIVO', 'SUSPENDIDO', 'DADO_DE_BAJA'],
  persona_vehiculo_tipo: ['PROPIETARIO', 'CONDUCTOR_AUTORIZADO', 'PASAJERO', 'TEMPORAL'],
  persona_vehiculo_estado: ['ACTIVA', 'SUSPENDIDA', 'VENCIDA', 'REVOCADA'],
  zona_tipo: ['CAMPUS', 'EDIFICIO', 'PARQUEADERO'],
  zona_estado: ['ACTIVA', 'INACTIVA', 'BLOQUEADA'],
  punto_estado: ['ACTIVO', 'FALLA', 'MANTENIMIENTO'],
  dispositivo_tecnologia: ['BIOMETRIA_FACIAL', 'LPR_PLACAS'],
  dispositivo_estado: ['OPERATIVO', 'FALLA_DE_RED', 'DANO_FISICO'],
  asignacion_estado: ['ACTIVA', 'FINALIZADA'],
  regla_estado: ['ACTIVA', 'INACTIVA'],
  memorando_estado: ['VIGENTE', 'VENCIDO'],
  persona_memorando_estado: ['ACTIVO', 'BLOQUEADO'],
  autorizacion_estado: ['VIGENTE', 'REVOCADA'],
  evento_movimiento: ['INGRESO', 'SALIDA'],
  evento_origen: ['AUTOMATICA', 'MANUAL'],
  evento_resultado: ['AUTORIZADO', 'DENEGADO'],
  alerta_estado: ['PENDIENTE', 'ATENDIDA'],
  alerta_nivel: ['BAJO', 'MEDIO', 'ALTO', 'CRITICO'],
  alerta_tipo: [
    'BIOMETRIA_FALLIDA', 'PERSONA_NO_AUTORIZADA', 'MEMORANDO_VENCIDO', 'FUERA_DE_HORARIO',
    'PUNTO_SALIDA_INCORRECTO', 'DISPOSITIVO_NO_RECONOCIDO', 'VEHICULO_NO_AUTORIZADO',
    'VEHICULO_PERMANENCIA_EXCEDIDA', 'VEHICULO_ABANDONADO',
  ],
  usuario_estado: ['ACTIVO', 'INACTIVO', 'BLOQUEADO', 'DADO_DE_BAJA'],
  parametro_modulo: ['AUTENTICACION', 'SESION', 'SEGURIDAD', 'GENERAL'],
  parametro_tipo_dato: ['ENTERO', 'TEXTO', 'BOOLEANO', 'DECIMAL', 'FECHA'],
  parametro_estado: ['ACTIVO', 'INACTIVO', 'CRITICO'],
  rol_nombre: [
    'ADMINISTRADOR_SISTEMA', 'DIRECTOR_ADMINISTRATIVO', 'RESPONSABLE_PERSONAL_INTERNO',
    'RESPONSABLE_PERSONAL_EXTERNO', 'RESPONSABLE_PUNTOS_CONTROL', 'RESPONSABLE_CONTROL_ACCESOS',
    'GUARDIA_SEGURIDAD',
  ],
} as const

/** Categorías por ámbito (EMPRESA_SERVICIO es EXTERNA en el backend real, §D20 / brecha §6.2). */
export const CATEGORIAS_INTERNAS = ['DOCENTE', 'ESTUDIANTE', 'ADMINISTRATIVO', 'TRABAJADOR']
export const CATEGORIAS_EXTERNAS = [
  'VISITANTE', 'PROVEEDOR', 'CONTRATISTA', 'CONDUCTOR', 'EMPRESA_SERVICIO',
]

/** Etiqueta legible para roles del sistema. */
export const ROL_LABEL: Record<string, string> = {
  ADMINISTRADOR_SISTEMA: 'Administrador del Sistema',
  DIRECTOR_ADMINISTRATIVO: 'Director Administrativo',
  RESPONSABLE_PERSONAL_INTERNO: 'Responsable de Personal Interno',
  RESPONSABLE_PERSONAL_EXTERNO: 'Responsable de Personal Externo',
  RESPONSABLE_PUNTOS_CONTROL: 'Responsable de Puntos de Control',
  RESPONSABLE_CONTROL_ACCESOS: 'Responsable de Control de Accesos',
  GUARDIA_SEGURIDAD: 'Guardia de Seguridad',
}

/**
 * Etiquetas de presentación de los valores de catálogo.
 *
 * La BD los guarda en MAYÚSCULAS y sin tildes por convención de CLAUDE.md
 * (`AUTENTICACION`, no `AUTENTICACIÓN`) — eso NO se toca: es el contrato del
 * backend. Pero el usuario no debería leer `DADO_DE_BAJA` ni `DANO_FISICO` en
 * pantalla, que es lo que pasaba porque `Badge` pintaba el valor crudo y
 * `humanizar()` solo bajaba a minúsculas (dejando "Autenticacion" sin tilde).
 *
 * Aquí vive la traducción, en un solo lugar. Cubre los 80 valores de catálogo
 * que devuelven los CHECK reales del backend (consultados desde pg_constraint
 * el 2026-07-16). Si el backend añade un valor nuevo y no está en este mapa,
 * `humanizar()` cae a la conversión automática: se verá aceptable aunque sin
 * tildes, nunca como el código crudo.
 */
export const ETIQUETA: Record<string, string> = {
  // Estados generales
  ACTIVO: 'Activo',
  ACTIVA: 'Activa',
  INACTIVO: 'Inactivo',
  INACTIVA: 'Inactiva',
  BLOQUEADO: 'Bloqueado',
  BLOQUEADA: 'Bloqueada',
  DADO_DE_BAJA: 'Dado de baja',
  SUSPENDIDO: 'Suspendido',
  SUSPENDIDA: 'Suspendida',
  VENCIDO: 'Vencido',
  VENCIDA: 'Vencida',
  VIGENTE: 'Vigente',
  REVOCADO: 'Revocado',
  REVOCADA: 'Revocada',
  FINALIZADA: 'Finalizada',
  PENDIENTE: 'Pendiente',
  ATENDIDA: 'Atendida',
  TEMPORAL: 'Temporal',
  OTRO: 'Otro',
  GENERAL: 'General',

  // Persona
  INTERNA: 'Interna',
  EXTERNA: 'Externa',
  M: 'Masculino',
  F: 'Femenino',
  DOCENTE: 'Docente',
  ESTUDIANTE: 'Estudiante',
  ADMINISTRATIVO: 'Administrativo',
  TRABAJADOR: 'Trabajador',
  EMPRESA_SERVICIO: 'Empresa de servicio',
  VISITANTE: 'Visitante',
  PROVEEDOR: 'Proveedor',
  CONTRATISTA: 'Contratista',
  CONDUCTOR: 'Conductor',
  EPN: 'EPN',
  CEC: 'CEC',

  // Vehículo
  AUTOMOVIL: 'Automóvil',
  MOTOCICLETA: 'Motocicleta',
  CAMIONETA: 'Camioneta',
  BICICLETA: 'Bicicleta',
  PROPIETARIO: 'Propietario',
  CONDUCTOR_AUTORIZADO: 'Conductor autorizado',
  PASAJERO: 'Pasajero',

  // Zonas y puntos de control
  CAMPUS: 'Campus',
  EDIFICIO: 'Edificio',
  PARQUEADERO: 'Parqueadero',
  FALLA: 'Falla',
  MANTENIMIENTO: 'Mantenimiento',
  OPERATIVO: 'Operativo',
  FALLA_DE_RED: 'Falla de red',
  DANO_FISICO: 'Daño físico',
  BIOMETRIA_FACIAL: 'Biometría facial',
  LPR_PLACAS: 'Lector de placas (LPR)',

  // Eventos de acceso
  INGRESO: 'Ingreso',
  SALIDA: 'Salida',
  AUTORIZADO: 'Autorizado',
  DENEGADO: 'Denegado',
  AUTOMATICA: 'Automática',
  MANUAL: 'Manual',

  // Alertas
  BAJO: 'Bajo',
  MEDIO: 'Medio',
  ALTO: 'Alto',
  CRITICO: 'Crítico',
  BIOMETRIA_FALLIDA: 'Biometría fallida',
  PERSONA_NO_AUTORIZADA: 'Persona no autorizada',
  MEMORANDO_VENCIDO: 'Memorando vencido',
  FUERA_DE_HORARIO: 'Fuera de horario',
  PUNTO_SALIDA_INCORRECTO: 'Punto de salida incorrecto',
  DISPOSITIVO_NO_RECONOCIDO: 'Dispositivo no reconocido',
  VEHICULO_NO_AUTORIZADO: 'Vehículo no autorizado',
  VEHICULO_PERMANENCIA_EXCEDIDA: 'Vehículo con permanencia excedida',
  VEHICULO_ABANDONADO: 'Vehículo abandonado',

  // Sesiones y bitácora
  CERRADA: 'Cerrada',
  CERRADA_CAMBIO_PASSWORD: 'Cerrada por cambio de contraseña',
  EXPIRADA: 'Expirada',
  EXITO: 'Éxito',
  ERROR: 'Error',

  // Contraseña / verificación
  REALIZADO: 'Realizado',
  NO_VERIFICADO: 'No verificado',
  VALIDO: 'Válido',
  INVALIDO: 'Inválido',
  SERVICIO_NO_DISPONIBLE: 'Servicio no disponible',

  // Parámetros del sistema
  AUTENTICACION: 'Autenticación',
  SESION: 'Sesión',
  SEGURIDAD: 'Seguridad',
  ENTERO: 'Entero',
  TEXTO: 'Texto',
  BOOLEANO: 'Booleano',
  DECIMAL: 'Decimal',
  FECHA: 'Fecha',

  ...ROL_LABEL,
}

/**
 * Etiqueta legible de un valor de catálogo: `DADO_DE_BAJA` → "Dado de baja",
 * `AUTENTICACION` → "Autenticación".
 *
 * Si el valor no está en ETIQUETA, cae a la conversión automática
 * (MAYUSCULAS_CON_GUION → "Mayusculas con guion"): sin tildes, pero legible.
 */
export function humanizar(valor?: string | null): string {
  if (!valor) return '—'
  if (ETIQUETA[valor]) return ETIQUETA[valor]
  return valor
    .toLowerCase()
    .split('_')
    .join(' ')
    .replace(/^\w/, (c) => c.toUpperCase())
}
