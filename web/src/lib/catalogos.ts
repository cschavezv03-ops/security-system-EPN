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
  // GPI: "un docente puede estar por un contrato Fijo o Temporal". Antes era texto libre y
  // había un docente con contrato "Si". Espejo de persona_interna_detalle_contrato_check.
  contrato_tipo: ['FIJO', 'TEMPORAL'],
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
  // Espejo de memorando_estado_memorando_check. PROGRAMADO no está aquí a propósito: no se
  // almacena nunca, lo calcula estado_memorando_efectivo() cuando la vigencia aún no empieza.
  memorando_estado: ['VIGENTE', 'VENCIDO', 'ANULADO'],
  persona_memorando_estado: ['ACTIVO', 'BLOQUEADO'],
  // Igual que el memorando: solo VIGENTE y REVOCADA se guardan; PROGRAMADA y CADUCADA salen
  // de la fecha de visita (estado_autorizacion_efectivo).
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
  // Espejo de parametro_sistema_unidad_medida_check (migración 20260718193730).
  parametro_unidad: [
    'MINUTOS', 'HORAS', 'DIAS', 'SEGUNDOS', 'INTENTOS', 'VEHICULOS',
    'PERSONAS', 'CARACTERES', 'PORCENTAJE', 'HORA_DEL_DIA', 'DISTANCIA', 'NINGUNA',
  ],
  rol_nombre: [
    'ADMINISTRADOR_SISTEMA', 'DIRECTOR_ADMINISTRATIVO', 'RESPONSABLE_PERSONAL_INTERNO',
    'RESPONSABLE_PERSONAL_EXTERNO', 'RESPONSABLE_PUNTOS_CONTROL', 'RESPONSABLE_CONTROL_ACCESOS',
    'GUARDIA_SEGURIDAD',
  ],
} as const

/** Categorías por ámbito.
 *
 *  EMPRESA_SERVICIO es INTERNA, no externa: la migración `empresa_servicio_a_interna` la movió
 *  de ámbito y `categoria_persona.ambito` lo confirma en la base. Estas dos listas se habían
 *  quedado con el reparto antiguo, y el documento de GPI lo señala al enumerar las categorías
 *  internas: "Docente, Estudiante, Administrativo, Trabajador, Empresa de Servicio". */
export const CATEGORIAS_INTERNAS = [
  'DOCENTE', 'ESTUDIANTE', 'ADMINISTRATIVO', 'TRABAJADOR', 'EMPRESA_SERVICIO',
]
export const CATEGORIAS_EXTERNAS = ['VISITANTE', 'PROVEEDOR', 'CONTRATISTA', 'CONDUCTOR']

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
  // Estados calculados desde la fecha (GPE §2 y §8): no existen como valor almacenado, los
  // devuelven estado_memorando_efectivo() y estado_autorizacion_efectivo().
  ANULADO: 'Anulado',
  PROGRAMADO: 'Programado',
  PROGRAMADA: 'Programada',
  CADUCADA: 'Caducada',
  // Tipo de contrato del personal interno (GPI).
  FIJO: 'Fijo',
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

  // Acciones de la auditoría (bitacora_sistema.accion). Las tres primeras las escribe el
  // trigger genérico; el resto son acciones con nombre propio del sistema.
  INSERT: 'Creación',
  UPDATE: 'Modificación',
  DELETE: 'Eliminación',
  BLOQUEO_POR_INTENTOS_FALLIDOS: 'Bloqueo por intentos fallidos',
  DESBLOQUEO_INTENTOS_FALLIDOS: 'Desbloqueo de intentos fallidos',
  CIERRE_ADMINISTRATIVO_SESION: 'Cierre administrativo de sesión',
  CIERRE_ADMINISTRATIVO: 'Cierre administrativo',
  REGISTRO_MANUAL_EVENTO_ACCESO: 'Registro manual de acceso',
  RECHAZO_DISPOSITIVO_NO_RECONOCIDO: 'Rechazo por dispositivo no reconocido',

  // Sesiones y bitácora
  CERRADA: 'Cerrada',
  CERRADA_CAMBIO_PASSWORD: 'Cerrada por cambio de contraseña',
  EXPIRADA: 'Expirada',
  EXITO: 'Éxito',
  ERROR: 'Error',

  // Estado mostrado cuando la cuenta tiene un bloqueo TEMPORAL por intentos
  // fallidos. No es un valor de la base: lo compone la interfaz combinando
  // estado_usuario con bloqueado_hasta (ver estadoEfectivo en UsuariosScreen).
  BLOQUEO_TEMPORAL: 'Bloqueo temporal',

  // Motivos de cierre de sesión (sesion.motivo_cierre)
  LOGOUT: 'Cierre de sesión',
  CIERRE_MANUAL: 'Cierre manual',
  EXPIRACION_ABSOLUTA: 'Expiración por tiempo',
  INACTIVIDAD: 'Inactividad',
  CAMBIO_PASSWORD: 'Cambio de contraseña',
  ACCESO_FUERA_DE_TURNO: 'Acceso fuera de turno',

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

  // Unidades de medida de los parámetros. HORA_DEL_DIA no es una magnitud: marca los
  // parámetros cuyo valor es un instante del día ("06:00"), como los turnos de guardia.
  MINUTOS: 'Minutos',
  HORAS: 'Horas',
  DIAS: 'Días',
  SEGUNDOS: 'Segundos',
  INTENTOS: 'Intentos',
  VEHICULOS: 'Vehículos',
  PERSONAS: 'Personas',
  CARACTERES: 'Caracteres',
  PORCENTAJE: 'Porcentaje',
  HORA_DEL_DIA: 'Hora del día',
  DISTANCIA: 'Distancia',
  NINGUNA: 'Ninguna',

  ...ROL_LABEL,
}

/**
 * Etiqueta de una COLUMNA de la base para mostrarla al usuario.
 *
 * La usa la pantalla de Auditoría: `v_auditoria.cambios` trae los cambios como
 * [{campo, antes, despues}] con el nombre real de la columna, y "descripcion" o
 * "estado_usuario" no son textos presentables. Traducir esto en SQL habría obligado a
 * duplicar en la base el catálogo que ya vive en este archivo.
 *
 * Si una columna no está en el mapa se cae a la conversión automática, igual que
 * `humanizar`: legible aunque sin tildes, nunca el nombre crudo con guiones bajos.
 */
export const ETIQUETA_CAMPO: Record<string, string> = {
  ambito: 'Ámbito',
  apellidos: 'Apellidos',
  cargo: 'Cargo',
  carrera: 'Carrera',
  categoria_escalafon: 'Categoría / escalafón',
  contrato: 'Contrato',
  curso: 'Curso',
  dependencia_autorizada: 'Dependencia autorizada',
  estado_acceso: 'Estado de acceso',
  estado_autorizacion: 'Estado de la autorización',
  estado_memorando: 'Estado del memorando',
  fecha_anulacion: 'Fecha de anulación',
  fecha_visita: 'Fecha de visita',
  id_empresa: 'Empresa',
  motivo: 'Motivo',
  motivo_anulacion: 'Motivo de anulación',
  nombramiento: 'Nombramiento',
  numero_memorando: 'Número de memorando',
  unidad: 'Unidad',
  bloqueado_hasta: 'Bloqueada hasta',
  cedula: 'Cédula',
  codigo_categoria: 'Código de categoría',
  codigo_parametro: 'Código del parámetro',
  codigo_permiso: 'Código del permiso',
  codigo_unico: 'Código único',
  color: 'Color',
  correo: 'Correo',
  correo_electronico: 'Correo electrónico',
  correo_respaldo: 'Correo de respaldo',
  descripcion: 'Descripción',
  detalle_estado: 'Detalle del estado',
  direccion_domicilio: 'Dirección del domicilio',
  editable: 'Editable',
  es_responsable_tramite: 'Responsable del trámite',
  estado: 'Estado',
  estado_asignacion: 'Estado de la asignación',
  estado_parametro: 'Estado del parámetro',
  estado_permiso: 'Estado del permiso',
  estado_relacion: 'Estado de la relación',
  estado_rol: 'Estado del rol',
  estado_sesion: 'Estado de la sesión',
  estado_usuario: 'Estado del usuario',
  estado_vehiculo: 'Estado del vehículo',
  estado_verificacion_ruc: 'Verificación del RUC',
  fecha_asignacion: 'Fecha de asignación',
  fecha_cierre: 'Fecha de cierre',
  fecha_fin: 'Fecha de fin',
  fecha_inicio: 'Fecha de inicio',
  fecha_nacimiento: 'Fecha de nacimiento',
  fecha_revocacion: 'Fecha de revocación',
  fecha_ultimo_login: 'Último inicio de sesión',
  intentos_fallidos: 'Intentos fallidos',
  marca: 'Marca',
  modelo: 'Modelo',
  modulo_aplicacion: 'Módulo',
  motivo_cierre: 'Motivo de cierre',
  motivo_revocacion: 'Motivo de revocación',
  nombre: 'Nombre',
  nombre_parametro: 'Nombre del parámetro',
  nombre_rol: 'Nombre del rol',
  nombre_usuario: 'Nombre de usuario',
  nombres: 'Nombres',
  observacion: 'Observación',
  placa: 'Placa',
  requiere_cambio_password: 'Requiere cambiar la contraseña',
  ruc: 'RUC',
  sexo: 'Sexo',
  telefono_contacto: 'Teléfono de contacto',
  telefono_respaldo: 'Teléfono de respaldo',
  tipo_dato: 'Tipo de dato',
  tipo_persona: 'Tipo de persona',
  tipo_relacion: 'Tipo de relación',
  tipo_servicio: 'Tipo de servicio',
  tipo_vehiculo: 'Tipo de vehículo',
  unidad_medida: 'Unidad de medida',
  user_agent: 'Navegador',
  valor_parametro: 'Valor',
  vigente: 'Vigente',
}

/** Etiqueta legible de una columna: `estado_usuario` → "Estado del usuario". */
export function etiquetaCampo(campo?: string | null): string {
  if (!campo) return '—'
  if (ETIQUETA_CAMPO[campo]) return ETIQUETA_CAMPO[campo]
  return campo
    .toLowerCase()
    .split('_')
    .join(' ')
    .replace(/^\w/, (c) => c.toUpperCase())
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
