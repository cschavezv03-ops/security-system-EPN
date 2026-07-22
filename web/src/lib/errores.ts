/**
 * Traducción de errores del proveedor a español (req 25).
 *
 * Supabase Auth (GoTrue), PostgREST y PostgreSQL devuelven sus mensajes en
 * inglés y a veces con detalle técnico ("violates check constraint ..."). La
 * especificación exige que TODO lo visible esté en español y que no se muestren
 * errores crudos del proveedor ni de la base de datos.
 *
 * Regla de diseño: los errores que lanzan NUESTRAS funciones de base de datos ya
 * están escritos en español, así que se dejan pasar. Lo que se traduce o se
 * sustituye por un mensaje genérico es lo que genera el proveedor.
 */

interface ErrorCrudo {
  message?: string
  error_description?: string
  msg?: string
  hint?: string
  details?: string
  code?: string
  error_code?: string
  status?: number
  name?: string
}

const GENERICO = 'Ocurrió un error al procesar la solicitud. Inténtelo nuevamente.'
const SESION_EXPIRADA = 'Su sesión expiró. Inicie sesión nuevamente.'
const SIN_PERMISO = 'No tiene permiso para realizar esta acción.'

/**
 * Códigos estables de Supabase Auth. Se consultan ANTES que el texto porque no
 * dependen de la redacción del proveedor, que puede cambiar entre versiones.
 */
const AUTH_POR_CODIGO: Record<string, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_not_confirmed: 'Debe confirmar su correo electrónico antes de iniciar sesión.',
  user_not_found: 'No se encontró la cuenta indicada.',
  user_already_exists: 'Ya existe una cuenta con ese correo electrónico.',
  email_exists: 'Ya existe una cuenta con ese correo electrónico.',
  weak_password: 'La contraseña es demasiado débil. Elija una más segura.',
  same_password: 'La nueva contraseña debe ser distinta de la actual.',
  otp_expired: 'El enlace no es válido o ya expiró. Solicite uno nuevo.',
  user_banned: 'La cuenta está bloqueada. Comuníquese con el administrador.',
  session_not_found: SESION_EXPIRADA,
  session_expired: SESION_EXPIRADA,
  refresh_token_not_found: SESION_EXPIRADA,
  refresh_token_already_used: SESION_EXPIRADA,
  bad_jwt: SESION_EXPIRADA,
  no_authorization: SIN_PERMISO,
  not_admin: SIN_PERMISO,
  over_email_send_rate_limit: 'Se alcanzó el límite de correos permitidos. Espere unos minutos e inténtelo de nuevo.',
  over_request_rate_limit: 'Demasiados intentos. Espere unos minutos e inténtelo de nuevo.',
  signup_disabled: 'El registro de cuentas nuevas está deshabilitado.',
  validation_failed: 'Alguno de los datos ingresados no es válido.',
}

/** Mensajes de Supabase Auth. La clave se busca como subcadena, en minúsculas. */
const AUTH: [string, string][] = [
  ['invalid login credentials', 'Correo o contraseña incorrectos.'],
  ['email not confirmed', 'Debe confirmar su correo electrónico antes de iniciar sesión.'],
  ['auth session missing', SESION_EXPIRADA],
  ['session not found', SESION_EXPIRADA],
  ['invalid refresh token', SESION_EXPIRADA],
  ['refresh token not found', SESION_EXPIRADA],
  ['refresh_token_not_found', SESION_EXPIRADA],
  ['jwt expired', SESION_EXPIRADA],
  ['invalid claim', SESION_EXPIRADA],
  ['user already registered', 'Ya existe una cuenta con ese correo electrónico.'],
  ['user not found', 'No se encontró la cuenta indicada.'],
  ['new password should be different', 'La nueva contraseña debe ser distinta de la actual.'],
  ['password is known to be weak', 'Esa contraseña es insegura porque apareció en filtraciones conocidas. Elija otra.'],
  ['pwned', 'Esa contraseña es insegura porque apareció en filtraciones conocidas. Elija otra.'],
  ['email rate limit exceeded', 'Se alcanzó el límite de correos permitidos. Espere unos minutos e inténtelo de nuevo.'],
  ['over_email_send_rate_limit', 'Se alcanzó el límite de correos permitidos. Espere unos minutos e inténtelo de nuevo.'],
  ['over_request_rate_limit', 'Demasiados intentos. Espere unos minutos e inténtelo de nuevo.'],
  ['token has expired or is invalid', 'El enlace no es válido o ya expiró. Solicite uno nuevo.'],
  ['otp_expired', 'El enlace no es válido o ya expiró. Solicite uno nuevo.'],
  ['signups not allowed', 'El registro de cuentas nuevas está deshabilitado.'],
  ['unable to validate email address', 'El correo electrónico no tiene un formato válido.'],
  ['user is banned', 'La cuenta está bloqueada. Comuníquese con el administrador.'],
  ['database error saving new user', 'No se pudo crear la cuenta. Verifique que la persona exista y no tenga ya un usuario.'],
  ['email address is invalid', 'El correo electrónico no tiene un formato válido.'],
  ['captcha verification process failed', 'No se pudo verificar el captcha. Inténtelo nuevamente.'],
]

/** Restricciones propias: nombre del constraint -> explicación para el usuario. */
const CONSTRAINTS: Record<string, string> = {
  persona_cedula_valida: 'La cédula no es válida.',
  persona_cedula_key: 'Ya existe una persona registrada con esa cédula.',
  persona_nombres_validos: 'Los nombres solo pueden contener letras, espacios, guiones y apóstrofes.',
  persona_apellidos_validos: 'Los apellidos solo pueden contener letras, espacios, guiones y apóstrofes.',
  persona_correo_valido: 'El correo electrónico no tiene un formato válido.',
  persona_correo_respaldo_valido: 'El correo de respaldo no tiene un formato válido.',
  persona_correo_institucional_si_interna: 'El personal interno debe tener un correo institucional de la EPN.',
  persona_telefono_contacto_valido: 'El teléfono de contacto no es válido.',
  persona_telefono_respaldo_valido: 'El teléfono de respaldo no es válido.',
  persona_sexo_valido: 'El sexo indicado no es válido.',
  empresa_ruc_estructural: 'El RUC no es válido.',
  empresa_ruc_key: 'Ya existe una empresa registrada con ese RUC.',
  empresa_nombre_no_vacio: 'El nombre de la empresa es obligatorio.',
  vehiculo_placa_valida: 'La placa no es válida para ese tipo de vehículo.',
  vehiculo_placa_presente_o_justificada: 'Debe indicar la placa o el motivo por el que el vehículo no la tiene.',
  idx_vehiculo_placa_activo: 'Ya existe un vehículo activo con esa placa.',
  uq_persona_vehiculo_activa: 'Esa persona ya tiene una relación activa con ese vehículo.',
  uq_vehiculo_propietario_activo: 'Ese vehículo ya tiene un propietario activo.',
  uq_usuario_rol_activo: 'El usuario ya tiene ese rol asignado.',
  usuario_sistema_correo_valido: 'El correo debe ser institucional de la EPN (@epn.edu.ec o @cec.edu.ec).',
  usuario_sistema_nombre_usuario_valido: 'El nombre de usuario solo admite minúsculas, dígitos, punto, guion y guion bajo.',
  usuario_sistema_nombre_usuario_key: 'Ya existe un usuario con ese nombre.',
  usuario_sistema_correo_electronico_key: 'Ese correo ya está asociado con otro usuario.',
  usuario_sistema_intentos_fallidos_no_negativo: 'El número de intentos fallidos no puede ser negativo.',
  dispositivo_mac_valida: 'La dirección MAC no es válida.',
  dispositivo_ip_valida: 'La dirección IP no es válida.',
  dispositivo_codigo_mac_key: 'Ya existe un dispositivo con esa dirección MAC.',
  dispositivo_direccion_ip_key: 'Ya existe un dispositivo registrado con esa dirección IP.',
  dispositivo_codigo_dispositivo_key: 'Ya existe un dispositivo con ese código.',
  parametro_sistema_valor_coherente: 'El valor no corresponde al tipo de dato del parámetro.',
  parametro_sistema_codigo_valido: 'El código del parámetro solo admite mayúsculas, dígitos y guion bajo.',
  permiso_codigo_valido: 'El código de permiso debe seguir el formato MODULO_ENTIDAD_ACCION.',
  gpc_fechas_coherentes: 'La fecha de fin no puede ser anterior a la de inicio.',
  persona_vehiculo_fechas_coherentes: 'La fecha de fin no puede ser anterior a la de inicio.',
  chk_memorando_fechas: 'La fecha de fin no puede ser anterior a la de inicio.',
  sesion_cierre_coherente: 'El estado de la sesión no es coherente con su fecha de cierre.',
  zona_nombre_zona_key: 'Ya existe una zona con ese nombre.',
  punto_control_nombre_punto_key: 'Ya existe un punto de control con ese nombre.',
  zona_numero_edificio_unico: 'Ya existe un edificio registrado con ese número.',
  zona_nombre_zona_con_mayuscula: 'El nombre debe empezar con mayúscula.',
  punto_control_nombre_punto_con_mayuscula: 'El nombre debe empezar con mayúscula.',
}

/** Extrae el nombre del constraint de un mensaje de PostgreSQL. */
function nombreConstraint(texto: string): string | null {
  const m = texto.match(/constraint "([^"]+)"/i) ?? texto.match(/violates unique constraint "([^"]+)"/i)
  return m ? m[1] : null
}

/**
 * ¿El texto parece ya redactado en español? Los mensajes de nuestras funciones de
 * base de datos lo están; sirve para no ocultarlos tras un mensaje genérico.
 */
function pareceEspanol(texto: string): boolean {
  if (/[áéíóúñ¿¡]/i.test(texto)) return true
  return /\b(no|ya|debe|puede|tiene|esta|está|sesion|sesión|contrasena|contraseña|usuario|persona|vehiculo|vehículo|cedula|cédula|maximo|máximo|turno|permiso|fecha|correo|placa|activa|activo)\b/i.test(
    texto,
  )
}

/**
 * Convierte cualquier error en un mensaje en español apto para mostrar al usuario.
 * Nunca devuelve SQL, nombres de tabla, tokens ni trazas.
 */
export function traducirError(error: unknown): string {
  if (!error) return GENERICO

  // Errores de red del navegador (fetch).
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return 'No se pudo conectar con el servidor. Revise su conexión a internet.'
  }

  const e = (typeof error === 'object' ? error : {}) as ErrorCrudo
  const bruto = (e.message || e.error_description || e.msg || (typeof error === 'string' ? error : '') || '').trim()
  const texto = bruto.toLowerCase()
  const codigo = e.code ?? ''

  // Código estable del proveedor: es lo más fiable, se consulta primero.
  const codigoAuth = e.error_code ?? codigo
  if (codigoAuth && AUTH_POR_CODIGO[codigoAuth]) return AUTH_POR_CODIGO[codigoAuth]

  if (!bruto) return GENERICO

  if (/failed to fetch|networkerror|load failed/i.test(bruto)) {
    return 'No se pudo conectar con el servidor. Revise su conexión a internet.'
  }

  // Longitud mínima de contraseña: se conserva el número que informa el proveedor.
  const corta = bruto.match(/password should be at least (\d+)/i)
  if (corta) return `La contraseña debe tener al menos ${corta[1]} caracteres.`

  // Espera obligatoria por rate limiting.
  const espera = bruto.match(/only request this after (\d+) seconds?/i)
  if (espera) return `Por seguridad, espere ${espera[1]} segundos antes de volver a intentarlo.`

  for (const [clave, traduccion] of AUTH) {
    if (texto.includes(clave)) return traduccion
  }

  // Violación de RLS: el usuario no tiene permiso sobre esa fila.
  if (/row-level security|row level security/i.test(bruto)) return SIN_PERMISO

  // Restricciones de la base: se traduce por nombre de constraint.
  if (/violates (unique|check|foreign key|not-null)/i.test(bruto) || ['23505', '23514', '23503', '23502'].includes(codigo)) {
    const nombre = nombreConstraint(bruto)
    if (nombre && CONSTRAINTS[nombre]) return CONSTRAINTS[nombre]
    if (codigo === '23505' || /violates unique/i.test(bruto)) return 'Ya existe un registro con ese valor.'
    if (codigo === '23503' || /violates foreign key/i.test(bruto)) {
      return 'No se puede completar la operación porque el registro está relacionado con otros datos.'
    }
    if (codigo === '23502' || /violates not-null/i.test(bruto)) return 'Falta completar un dato obligatorio.'
    // CHECK sin nombre conocido: si el texto es nuestro (español), se muestra.
    return pareceEspanol(bruto) ? bruto : 'Alguno de los datos ingresados no es válido.'
  }

  switch (codigo) {
    case 'PGRST116':
      return 'No se encontró el registro solicitado.'
    case 'PGRST301':
      return SESION_EXPIRADA
    case '42501':
      return SIN_PERMISO
    case '22P02':
      return 'Alguno de los valores tiene un formato incorrecto.'
    case '23514':
      return 'Alguno de los datos ingresados no es válido.'
  }

  if (e.status === 401 || e.status === 403) return SIN_PERMISO
  if (e.status === 429) return 'Demasiados intentos. Espere unos minutos e inténtelo de nuevo.'

  // Mensajes de nuestras propias funciones: ya vienen en español.
  if (pareceEspanol(bruto)) return bruto

  // Cualquier otra cosa: nunca se muestra el texto crudo del proveedor.
  if (typeof console !== 'undefined') console.warn('Error sin traducción:', bruto, e)
  return GENERICO
}
