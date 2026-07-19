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

/** Patrón de relleno evidente: todos los dígitos iguales, o secuencia ±1 completa.
 *  Espejo de `public.es_relleno_obvio(text)`. Atrapa `2222222222` (que sí pasa el
 *  módulo 10) y `0123456789`; `1234567890` lo rechaza el módulo 10 por el salto 9→0. */
export function esRellenoObvio(num: string): boolean {
  if (!/^[0-9]+$/.test(num) || num.length < 2) return false
  if (new RegExp(`^(.)\\1{${num.length - 1}}$`).test(num)) return true
  let asc = true
  let desc = true
  for (let i = 1; i < num.length; i++) {
    const prev = Number(num[i - 1])
    const d = Number(num[i])
    if (d !== prev + 1) asc = false
    if (d !== prev - 1) desc = false
  }
  return asc || desc
}

/** Algoritmo del Registro Civil: módulo 10 sobre los 9 primeros dígitos. */
export function esCedulaEcuatoriana(cedula: string): boolean {
  if (!/^[0-9]{10}$/.test(cedula)) return false
  if (esRellenoObvio(cedula)) return false
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
  if (esRellenoObvio(v)) return 'La cédula no puede ser un valor de relleno (dígitos repetidos o en secuencia).'
  if (!provinciaValida(v)) return `Los dos primeros dígitos (${v.slice(0, 2)}) no corresponden a ninguna provincia del Ecuador.`
  if (Number(v[2]) >= 6) return 'El tercer dígito indica que no es la cédula de una persona natural.'
  if (!esCedulaEcuatoriana(v)) return 'El dígito verificador no es correcto: revisa que la cédula esté bien digitada.'
  return null
}

// ---------------------------------------------------------------------------
// RUC ecuatoriano
// ---------------------------------------------------------------------------

/** Validación ESTRUCTURAL del RUC (espejo de `public.es_ruc_estructural`).
 *  Es la única que decide si un RUC se acepta. Para sociedades NO corre el módulo 11:
 *  el SRI reconoce RUC de sociedad válidos que no lo cumplen (req 14). La existencia
 *  oficial se rastrea aparte en `empresa.estado_verificacion_ruc`. */
export function esRucEstructural(ruc: string): boolean {
  if (!/^[0-9]{13}$/.test(ruc)) return false
  if (esRellenoObvio(ruc.slice(0, 10))) return false
  if (!provinciaValida(ruc)) return false

  const tercero = Number(ruc[2])
  // Persona natural: los 10 primeros SÍ deben ser una cédula válida.
  if (tercero < 6) {
    return esCedulaEcuatoriana(ruc.slice(0, 10)) && /^[0-9]{3}$/.test(ruc.slice(10, 13)) && Number(ruc.slice(10, 13)) >= 1
  }
  // Sector público: establecimiento de 4 dígitos.
  if (tercero === 6) {
    return /^[0-9]{4}$/.test(ruc.slice(9, 13)) && Number(ruc.slice(9, 13)) >= 1
  }
  // Sociedad privada / extranjera: establecimiento de 3 dígitos. Sin módulo 11.
  if (tercero === 9) {
    return /^[0-9]{3}$/.test(ruc.slice(10, 13)) && Number(ruc.slice(10, 13)) >= 1
  }
  return false
}

/** Algoritmo LEGADO (módulo 10 natural / módulo 11 sociedad). Solo ADVERTENCIA:
 *  no se usa para rechazar sociedades (req 14). Espejo de `es_ruc_ecuatoriano`. */
export function rucPasaAlgoritmoLegado(ruc: string): boolean {
  if (!/^[0-9]{13}$/.test(ruc)) return false
  if (!provinciaValida(ruc)) return false
  const tercero = Number(ruc[2])
  if (tercero < 6) return esCedulaEcuatoriana(ruc.slice(0, 10)) && Number(ruc.slice(10, 13)) >= 1
  const esPublico = tercero === 6
  const coef = esPublico ? [3, 2, 7, 6, 5, 4, 3, 2] : [4, 3, 2, 7, 6, 5, 4, 3, 2]
  if (!esPublico && tercero !== 9) return false
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
  if (esRellenoObvio(v.slice(0, 10))) return 'El RUC no puede ser un valor de relleno.'
  if (!provinciaValida(v)) return `Los dos primeros dígitos (${v.slice(0, 2)}) no corresponden a ninguna provincia del Ecuador.`
  if (!esRucEstructural(v)) return 'El RUC no es válido: revisa el tipo de contribuyente (3.er dígito) y el número de establecimiento.'
  return null
}

/** Advertencia no bloqueante para sociedades cuyo RUC es estructuralmente válido pero
 *  no pasa el módulo 11. La verificación oficial (SRI) queda como NO_VERIFICADO. */
export function advertenciaRuc(v: string): string | null {
  if (!v || !esRucEstructural(v)) return null
  const tercero = Number(v[2])
  if ((tercero === 6 || tercero === 9) && !rucPasaAlgoritmoLegado(v)) {
    return 'El RUC es estructuralmente válido pero no pasa el algoritmo tradicional. Su existencia no está verificada con el SRI (NO_VERIFICADO).'
  }
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

/** Valida la placa según el tipo de vehículo. Espejo de `public.es_placa_vehiculo`.
 *  Ordinaria (auto/camioneta): 3 letras + 3/4 dígitos. Motocicleta: también el
 *  histórico 2 letras + 3 dígitos + 1 letra (AB123C). BICICLETA/OTRO: no se fuerza
 *  un patrón (placas especiales, temporales o inexistentes). */
export function esPlacaVehiculo(valor: string, tipo: string): boolean {
  const c = normalizarPlaca(valor)
  if (!c) return true // la obligatoriedad la decide otra regla
  if (tipo === 'AUTOMOVIL' || tipo === 'CAMIONETA') {
    return new RegExp(`^[${LETRAS_PROVINCIA}][A-Z]{2}[0-9]{3,4}$`).test(c)
  }
  if (tipo === 'MOTOCICLETA') {
    return (
      new RegExp(`^[${LETRAS_PROVINCIA}][A-Z]{2}[0-9]{3,4}$`).test(c) ||
      new RegExp(`^[${LETRAS_PROVINCIA}][A-Z][0-9]{3}[A-Z]$`).test(c)
    )
  }
  return /^[A-Z0-9]{3,8}$/.test(c)
}

/** Validador ordinario (auto). Se conserva por compatibilidad. */
export const validarPlaca: Validador = (v) => validarPlacaTipo('AUTOMOVIL')(v)

/** Fábrica de validador de placa parametrizado por tipo de vehículo. */
export function validarPlacaTipo(tipo: string): Validador {
  return (v) => {
    if (!v) return null
    const c = normalizarPlaca(v)
    if (esPlacaVehiculo(v, tipo)) {
      if ((tipo === 'AUTOMOVIL' || tipo === 'CAMIONETA' || tipo === 'MOTOCICLETA') && !LETRAS_PROVINCIA.includes(c[0])) {
        return `La primera letra (${c[0]}) no corresponde a ninguna provincia del Ecuador.`
      }
      return null
    }
    if (tipo === 'MOTOCICLETA') {
      return 'Placa de moto no válida. Formatos: 3 letras + 3/4 dígitos (ABC-123) o 2 letras + 3 dígitos + 1 letra (AB-123C).'
    }
    if (tipo === 'AUTOMOVIL' || tipo === 'CAMIONETA') {
      return 'Placa no válida. Formato ecuatoriano: 3 letras y 3 o 4 dígitos (ABC-1234).'
    }
    return 'Placa no válida.'
  }
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
// Número de memorando
// ---------------------------------------------------------------------------

/** Espejo de `public.es_numero_memorando`.
 *
 *  No hay un patrón institucional único (§V3: cada dependencia numera a su manera), así que
 *  solo se comprueba la forma mínima. El requisito de llevar al menos un dígito es lo que
 *  distingue un número de oficio de una palabra suelta. */
export const validarNumeroMemorando: Validador = (v) => {
  if (!v) return null
  const t = v.trim()
  if (t.length < 3) return 'El número de memorando debe tener al menos 3 caracteres.'
  if (t.length > 50) return `El número de memorando no puede pasar de 50 caracteres (tiene ${t.length}).`
  if (!/^[A-Za-z0-9][A-Za-z0-9 ./-]*[A-Za-z0-9]$/.test(t)) {
    return 'Solo se permiten letras, dígitos, guiones, puntos, barras y espacios; debe empezar y terminar en letra o dígito.'
  }
  if (!/[0-9]/.test(t)) return 'El número de memorando debe incluir al menos un dígito.'
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
