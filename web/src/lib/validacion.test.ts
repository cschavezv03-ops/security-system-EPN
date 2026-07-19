import { describe, expect, it } from 'vitest'
import {
  esRellenoObvio,
  esCedulaEcuatoriana,
  validarCedula,
  esRucEstructural,
  rucPasaAlgoritmoLegado,
  validarRuc,
  advertenciaRuc,
  esPlacaVehiculo,
  validarPlacaTipo,
  normalizarPlaca,
  validarNombre,
  validarCorreo,
  validarNumeroMemorando,
  normalizarTelefono,
  esTelefonoEc,
  validarFechaNacimiento,
} from './validacion'

// ---------------------------------------------------------------------------
// Utilidad EXCLUSIVA de pruebas: genera cédulas sintéticas con dígito verificador
// correcto. No existe en producción (spec §10, §18). No representan personas reales.
// ---------------------------------------------------------------------------
function cedulaSintetica(prefijo9: string): string {
  if (!/^[0-9]{9}$/.test(prefijo9)) throw new Error('prefijo debe tener 9 dígitos')
  const coef = [2, 1, 2, 1, 2, 1, 2, 1, 2]
  let suma = 0
  for (let i = 0; i < 9; i++) {
    let p = Number(prefijo9[i]) * coef[i]
    if (p > 9) p -= 9
    suma += p
  }
  const dv = (10 - (suma % 10)) % 10
  return prefijo9 + String(dv)
}

const CED_VALIDA = cedulaSintetica('150000000') // provincia 15, tercer dígito 0
const CED_VALIDA_2 = cedulaSintetica('090000001') // provincia 09

describe('esRellenoObvio', () => {
  it('detecta dígitos repetidos', () => {
    expect(esRellenoObvio('2222222222')).toBe(true)
    expect(esRellenoObvio('0000000000')).toBe(true)
  })
  it('detecta secuencias ±1 completas', () => {
    expect(esRellenoObvio('0123456789')).toBe(true)
    expect(esRellenoObvio('9876543210')).toBe(true)
  })
  it('no marca datos normales', () => {
    expect(esRellenoObvio('1750000000')).toBe(false)
    expect(esRellenoObvio(CED_VALIDA)).toBe(false)
  })
})

describe('validación de cédula', () => {
  it('acepta una cédula sintética válida', () => {
    expect(esCedulaEcuatoriana(CED_VALIDA)).toBe(true)
    expect(validarCedula(CED_VALIDA)).toBeNull()
  })
  it('rechaza longitudes distintas de 10', () => {
    expect(validarCedula('152711695')).toMatch(/10 dígitos/)
    expect(validarCedula('17500000001')).toMatch(/10 dígitos/)
  })
  it('rechaza patrones de relleno aunque pasen el módulo 10', () => {
    // 2222222222 pasa el módulo 10 pero es relleno evidente.
    expect(esCedulaEcuatoriana('2222222222')).toBe(false)
    expect(validarCedula('2222222222')).toMatch(/relleno/)
  })
  it('rechaza provincia inválida (00, 25, 99)', () => {
    expect(validarCedula('0012345678')).toMatch(/provincia/)
    expect(validarCedula('2512345678')).toMatch(/provincia/)
    expect(validarCedula('9912345678')).toMatch(/provincia/)
  })
  it('rechaza tercer dígito >= 6 (no persona natural)', () => {
    expect(validarCedula('1760000000')).toMatch(/tercer dígito/)
  })
  it('rechaza dígito verificador alterado', () => {
    const malo = CED_VALIDA.slice(0, 9) + ((Number(CED_VALIDA[9]) + 1) % 10)
    expect(esCedulaEcuatoriana(malo)).toBe(false)
  })
  it('no exige cédula cuando el valor es vacío (obligatoriedad aparte)', () => {
    expect(validarCedula('')).toBeNull()
  })
})

describe('validación de RUC', () => {
  const rucNatural = CED_VALIDA + '001'
  it('acepta RUC de persona natural con cédula válida + 001', () => {
    expect(esRucEstructural(rucNatural)).toBe(true)
    expect(validarRuc(rucNatural)).toBeNull()
  })
  it('rechaza RUC natural con cédula inválida', () => {
    expect(esRucEstructural('2222222222001')).toBe(false)
  })
  it('rechaza longitudes distintas de 13', () => {
    expect(validarRuc(rucNatural.slice(0, 12))).toMatch(/13 dígitos/)
  })
  it('acepta sociedad estructuralmente válida aunque falle el módulo 11 (req 14)', () => {
    const socInventada = '0990000000001' // tercer dígito 9, sufijo 001
    expect(esRucEstructural(socInventada)).toBe(true)
    expect(validarRuc(socInventada)).toBeNull()
    // El algoritmo legado no la valida, pero eso es solo ADVERTENCIA, no rechazo.
    expect(rucPasaAlgoritmoLegado(socInventada)).toBe(false)
    expect(advertenciaRuc(socInventada)).toMatch(/NO_VERIFICADO/)
  })
})

describe('validación de placa por tipo', () => {
  it('normaliza a mayúsculas y sin separadores', () => {
    expect(normalizarPlaca('pdf-1234')).toBe('PDF1234')
    expect(normalizarPlaca(' pdf 1234 ')).toBe('PDF1234')
  })
  it('automóvil: 3 letras + 3/4 dígitos', () => {
    expect(esPlacaVehiculo('PDF1234', 'AUTOMOVIL')).toBe(true)
    expect(esPlacaVehiculo('PDF123', 'AUTOMOVIL')).toBe(true)
    expect(validarPlacaTipo('AUTOMOVIL')('AB123C')).toMatch(/no válida/)
  })
  it('motocicleta: acepta formato histórico AB123C', () => {
    expect(esPlacaVehiculo('AB123C', 'MOTOCICLETA')).toBe(true)
    expect(esPlacaVehiculo('PDF123', 'MOTOCICLETA')).toBe(true)
  })
  it('otros/bicicleta: no fuerza formato ordinario', () => {
    expect(esPlacaVehiculo('CD1234', 'OTRO')).toBe(true)
    expect(validarPlacaTipo('OTRO')('')).toBeNull()
  })
})

describe('validación de nombres', () => {
  it('acepta tildes, ñ, apóstrofe y guion', () => {
    expect(validarNombre('María José')).toBeNull()
    expect(validarNombre("O'Connor")).toBeNull()
    expect(validarNombre('De la Cruz-Paz')).toBeNull()
    expect(validarNombre('Núñez')).toBeNull()
  })
  it('rechaza números y símbolos inválidos', () => {
    expect(validarNombre('Juan123')).toMatch(/letras/)
    expect(validarNombre('a')).toMatch(/2 caracteres/)
  })
})

describe('correo y teléfono', () => {
  it('valida formato de correo', () => {
    expect(validarCorreo('user@dominio.com')).toBeNull()
    expect(validarCorreo('no-es-correo')).toMatch(/no válido/)
  })
  it('normaliza teléfono ecuatoriano a E.164', () => {
    expect(normalizarTelefono('0987654321')).toBe('+593987654321')
    expect(esTelefonoEc('+593987654321')).toBe(true)
  })
})

describe('fecha de nacimiento', () => {
  it('rechaza fechas futuras', () => {
    const futuro = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    expect(validarFechaNacimiento(futuro)).toMatch(/futura/)
  })
  it('acepta una fecha pasada razonable', () => {
    expect(validarFechaNacimiento('2000-05-15')).toBeNull()
  })
})

describe('número de memorando', () => {
  // GPE §3: el número pasa a teclearse a mano, así que la validación que antes garantizaba el
  // generador ahora tiene que hacerla el formulario (y el CHECK es_numero_memorando en la base).
  it('acepta el formato institucional de la Politécnica', () => {
    expect(validarNumeroMemorando('EPN-DA-2026-0001-M')).toBeNull()
    expect(validarNumeroMemorando('EPN-VRA-2026-0123')).toBeNull()
    expect(validarNumeroMemorando('MEM 045/2026')).toBeNull()
  })

  it('exige al menos un dígito: una palabra suelta no identifica un documento', () => {
    expect(validarNumeroMemorando('MEMORANDO')).toMatch(/dígito/)
  })

  it('rechaza lo que es demasiado corto o demasiado largo', () => {
    expect(validarNumeroMemorando('M1')).toMatch(/al menos 3/)
    expect(validarNumeroMemorando('M' + '1'.repeat(60))).toMatch(/50 caracteres/)
  })

  it('rechaza caracteres que no aparecen en un número de oficio', () => {
    expect(validarNumeroMemorando('MEM#2026*01')).toMatch(/Solo se permiten/)
    expect(validarNumeroMemorando('-MEM-2026-')).toMatch(/Solo se permiten/)
  })

  it('deja pasar el vacío: de la obligatoriedad se encarga `required`', () => {
    expect(validarNumeroMemorando('')).toBeNull()
  })
})
