/** Validación y normalización de datos de entrada.
 *
 *  Espejo exacto de las funciones SQL de `supabase/migrations/20260716010000_funciones_validacion.sql`.
 *  La BD es la que manda (la API REST está expuesta y no todo cliente pasa por este formulario);
 *  esto solo existe para que el usuario vea el error ANTES de enviar, con un mensaje en español.
 *
 *  Si cambias una regla aquí, cámbiala también en la migración.
 */

/** Devuelve `null` si el valor es válido, o el mensaje de error si no lo es. */
export type Validador = (valor: string) => string | null

// ---------------------------------------------------------------------------
// Cédula ecuatoriana
// ---------------------------------------------------------------------------

/** Provincias 01-24, más 30 para documentos emitidos en el exterior. */
function provinciaValida(cedula: string): boolean {
  const p = Number(cedula.slice(0, 2))
  return (p >= 1 && p <= 24) || p === 30
}

/** Algoritmo del Registro Civil: módulo 10 sobre los 9 primeros dígitos. */
export function esCedulaEcuatoriana(cedula: string): boolean {
  if (!/^[0-9]{10}$/.test(cedula)) return false
  if (!provinciaValida(cedula)) return false
  // Tercer dígito: < 6 = persona natural (6 = sector público, 9 = persona jurídica).
  if (Number(cedula[2]) >= 6) return false

  let suma = 0
  for (let i = 0; i < 9; i++) {
    let producto = Number(cedula[i]) * (i % 2 === 0 ? 2 : 1)
    if (producto > 9) producto -= 9
    suma += producto
  }
  return (10 - (suma % 10)) % 10 === Number(cedula[9])
}

export const validarCedula: Validador = (v) => {
  if (!v) return null
  if (!/^[0-9]+$/.test(v)) return 'La cédula solo puede contener dígitos.'
  if (v.length !== 10) return `La cédula debe tener 10 dígitos (tiene ${v.length}).`
  if (!provinciaValida(v)) return `Los dos primeros dígitos (${v.slice(0, 2)}) no corresponden a ninguna provincia del Ecuador.`
  if (Number(v[2]) >= 6) return 'El tercer dígito indica que no es la cédula de una persona natural.'
  if (!esCedulaEcuatoriana(v)) return 'El dígito verificador no es correcto: revisa que la cédula esté bien digitada.'
  return null
}

// ---------------------------------------------------------------------------
// RUC ecuatoriano
// ---------------------------------------------------------------------------

/** El tercer dígito define el tipo de contribuyente, y con él el algoritmo del verificador. */
export function esRucEcuatoriano(ruc: string): boolean {
  if (!/^[0-9]{13}$/.test(ruc)) return false
  if (!provinciaValida(ruc)) return false

  const tercero = Number(ruc[2])

  // Persona natural: los 10 primeros son una cédula válida + establecimiento.
  if (tercero < 6) {
    return esCedulaEcuatoriana(ruc.slice(0, 10)) && Number(ruc.slice(10, 13)) >= 1
  }

  // Sector público (verificador en la posición 9) o sociedad privada (posición 10).
  const esPublico = tercero === 6
  const coef = esPublico ? [3, 2, 7, 6, 5, 4, 3, 2] : [4, 3, 2, 7, 6, 5, 4, 3, 2]
  if (!esPublico && tercero !== 9) return false // 7 y 8 no son tipos asignados

  let suma = 0
  for (let i = 0; i < coef.length; i++) suma += Number(ruc[i]) * coef[i]
  const resto = suma % 11
  const dv = resto === 0 ? 0 : 11 - resto
  if (dv === 10) return false

  return esPublico
    ? dv === Number(ruc[8]) && Number(ruc.slice(9, 13)) >= 1
    : dv === Number(ruc[9]) && Number(ruc.slice(10, 13)) >= 1
}

export const validarRuc: Validador = (v) => {
  if (!v) return null
  if (!/^[0-9]+$/.test(v)) return 'El RUC solo puede contener dígitos.'
  if (v.length !== 13) return `El RUC debe tener 13 dígitos (tiene ${v.length}).`
  if (!provinciaValida(v)) return `Los dos primeros dígitos (${v.slice(0, 2)}) no corresponden a ninguna provincia del Ecuador.`
  if (!esRucEcuatoriano(v)) return 'El RUC no es válido: revisa el dígito verificador y que termine en el número de establecimiento (001).'
  return null
}

// ---------------------------------------------------------------------------
// Teléfono ecuatoriano (E.164)
// ---------------------------------------------------------------------------

/** `0987654321` → `+593987654321`. Devuelve la entrada intacta si no reconoce el patrón. */
export function normalizarTelefono(valor: string): string {
  if (!valor || !valor.trim()) return ''
  let v = valor.replace(/[^0-9+]/g, '').replace(/(.)\++/g, '$1')

  if (/^\+593[0-9]{8,9}$/.test(v)) return v
  if (/^593[0-9]{8,9}$/.test(v)) return `+${v}`
  if (/^0[0-9]{8,9}$/.test(v)) return `+593${v.slice(1)}` // se cae el 0 troncal
  if (/^9[0-9]{8}$/.test(v)) return `+593${v}`
  if (/^[2-7][0-9]{7}$/.test(v)) return `+593${v}`
  return valor
}

/** Celular `+5939XXXXXXXX` o fijo `+593[2-7]XXXXXXX`. */
export function esTelefonoEc(v: string): boolean {
  return /^\+5939[0-9]{8}$/.test(v) || /^\+593[2-7][0-9]{7}$/.test(v)
}

export const validarTelefono: Validador = (v) => {
  if (!v) return null
  const n = normalizarTelefono(v)
  if (!esTelefonoEc(n)) {
    return 'Teléfono no válido. Usa celular (0987654321) o fijo con código de provincia (022345678); se guardará como +593…'
  }
  return null
}

// ---------------------------------------------------------------------------
// Correo
// ---------------------------------------------------------------------------

const RE_CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
/** epn.edu.ec (con o sin subdominio) o cec.edu.ec (el CEC es parte de la EPN). */
const RE_CORREO_EPN = /@([a-z0-9-]+\.)*(epn|cec)\.edu\.ec$/

export const esCorreo = (v: string): boolean => RE_CORREO.test(v)
export const esCorreoInstitucionalEpn = (v: string): boolean => esCorreo(v) && RE_CORREO_EPN.test(v.toLowerCase())

export const validarCorreo: Validador = (v) => {
  if (!v) return null
  if (!esCorreo(v)) return 'Correo no válido. Formato esperado: usuario@dominio.com'
  return null
}

export const validarCorreoInstitucional: Validador = (v) => {
  if (!v) return null
  if (!esCorreo(v)) return 'Correo no válido. Formato esperado: usuario@epn.edu.ec'
  if (!esCorreoInstitucionalEpn(v)) return 'Debe ser un correo institucional de la EPN (@epn.edu.ec o @cec.edu.ec).'
  return null
}

// ---------------------------------------------------------------------------
// Placa vehicular ecuatoriana
// ---------------------------------------------------------------------------

/** Las 24 letras de provincia asignadas por la ANT (D y F no se usan). */
const LETRAS_PROVINCIA = 'ABUCXHOEWGILRMVNQSPKTZYJ'

/** Forma canónica: mayúsculas, sin guion ni espacios (`PDF-1234` → `PDF1234`).
 *  Es la clave con la que el OCR de placas comparará contra la BD. */
export function normalizarPlaca(valor: string): string {
  if (!valor) return ''
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Presentación con guion para mostrar (`PDF1234` → `PDF-1234`). */
export function formatearPlaca(valor: string): string {
  const c = normalizarPlaca(valor)
  return /^[A-Z]{3}[0-9]{3,4}$/.test(c) ? `${c.slice(0, 3)}-${c.slice(3)}` : c
}

export function esPlacaEc(valor: string): boolean {
  const c = normalizarPlaca(valor)
  return new RegExp(`^[${LETRAS_PROVINCIA}][A-Z]{2}[0-9]{3,4}$`).test(c)
}

export const validarPlaca: Validador = (v) => {
  if (!v) return null
  const c = normalizarPlaca(v)
  if (!/^[A-Z]{3}[0-9]{3,4}$/.test(c)) {
    return 'Placa no válida. Formato ecuatoriano: 3 letras y 3 o 4 dígitos (ABC-1234).'
  }
  if (!LETRAS_PROVINCIA.includes(c[0])) {
    return `La primera letra (${c[0]}) no corresponde a ninguna provincia del Ecuador.`
  }
  return null
}

/** Autoformatea mientras se escribe: mayúsculas y guion tras la tercera letra. */
export function formatearPlacaInput(valor: string): string {
  const c = normalizarPlaca(valor).slice(0, 7)
  if (c.length <= 3) return c
  return `${c.slice(0, 3)}-${c.slice(3)}`
}

// ---------------------------------------------------------------------------
// Nombres de persona
// ---------------------------------------------------------------------------

const RE_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ '.-]*$/

export const validarNombre: Validador = (v) => {
  if (!v) return null
  const t = v.trim()
  if (t.length < 2) return 'Debe tener al menos 2 caracteres.'
  if (!RE_NOMBRE.test(t)) return 'Solo se permiten letras, espacios, guiones y apóstrofes (sin números).'
  return null
}

// ---------------------------------------------------------------------------
// Fecha de nacimiento
// ---------------------------------------------------------------------------

/** Sin edad mínima: el CEC de la EPN registra menores de edad. Solo descarta lo imposible. */
export const validarFechaNacimiento: Validador = (v) => {
  if (!v) return null
  const f = new Date(`${v}T00:00:00`)
  if (Number.isNaN(f.getTime())) return 'Fecha no válida.'
  const hoy = new Date()
  if (f > hoy) return 'La fecha de nacimiento no puede ser futura.'
  const limite = new Date()
  limite.setFullYear(limite.getFullYear() - 120)
  if (f < limite) return 'La fecha de nacimiento no es plausible (más de 120 años).'
  return null
}

// ---------------------------------------------------------------------------
// Identidad de dispositivos
// ---------------------------------------------------------------------------

export const validarMac: Validador = (v) => {
  if (!v) return null
  if (!/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(v.toUpperCase())) {
    return 'MAC no válida. Formato: AA:BB:CC:DD:EE:FF (6 pares hexadecimales).'
  }
  return null
}

export const validarIp: Validador = (v) => {
  if (!v) return null
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  const m = v.match(ipv4)
  if (m) {
    if (m.slice(1).every((o) => Number(o) <= 255 && String(Number(o)) === o)) return null
    return 'IP no válida: cada octeto debe estar entre 0 y 255.'
  }
  // IPv6: se delega en el navegador un chequeo básico de forma.
  if (/^[0-9A-Fa-f:]+$/.test(v) && v.includes(':')) return null
  return 'IP no válida. Formato esperado: 192.168.1.10'
}

// ---------------------------------------------------------------------------
// Códigos internos
// ---------------------------------------------------------------------------

export const validarNombreUsuario: Validador = (v) => {
  if (!v) return null
  if (!/^[a-z0-9]([a-z0-9._-]{1,48})[a-z0-9]$/.test(v)) {
    return 'Solo minúsculas, dígitos, punto, guion y guion bajo (3 a 50 caracteres, sin empezar ni terminar en símbolo).'
  }
  return null
}

/** Convención de CLAUDE.md: MODULO_ENTIDAD_ACCION. */
export const validarCodigoPermiso: Validador = (v) => {
  if (!v) return null
  if (!/^(ADM|GPI|GPE|PCO|CAC)_[A-Z0-9]+(_[A-Z0-9]+)+$/.test(v)) {
    return 'Formato esperado: MODULO_ENTIDAD_ACCION (ej. GPI_PERSONA_INSERT), con módulo ADM, GPI, GPE, PCO o CAC.'
  }
  return null
}

export const validarCodigoParametro: Validador = (v) => {
  if (!v) return null
  if (!/^[A-Z][A-Z0-9_]*$/.test(v)) return 'Solo mayúsculas, dígitos y guion bajo (ej. TIEMPO_SESION_MIN).'
  return null
}

/** El valor debe castear al `tipo_dato` declarado en la misma fila. */
export function validarValorParametro(tipoDato: string, valor: string): string | null {
  if (!valor) return null
  switch (tipoDato) {
    case 'ENTERO':
      return /^-?\d+$/.test(valor) ? null : 'El tipo de dato es ENTERO: el valor debe ser un número entero.'
    case 'DECIMAL':
      return /^-?\d+(\.\d+)?$/.test(valor) ? null : 'El tipo de dato es DECIMAL: el valor debe ser un número (ej. 0.38).'
    case 'BOOLEANO':
      return ['true', 'false'].includes(valor.toLowerCase()) ? null : 'El tipo de dato es BOOLEANO: el valor debe ser true o false.'
    case 'FECHA':
      return Number.isNaN(new Date(valor).getTime()) ? 'El tipo de dato es FECHA: usa el formato AAAA-MM-DD.' : null
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Genéricos
// ---------------------------------------------------------------------------

/** El `required` del formulario deja pasar " ": esto no. */
export const validarNoVacio: Validador = (v) => (v && !v.trim() ? 'No puede ser solo espacios.' : null)

export function normalizarEspacios(v: string): string {
  return v.replace(/\s+/g, ' ').trim()
}
