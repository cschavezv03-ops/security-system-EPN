import { describe, expect, it } from 'vitest'
import {
  corregirPlacaOcr, extraerPlacaDeTexto, normalizarPlacaLeida, pareceePlacaEcuatoriana,
} from './placas'

/**
 * El OCR no falla al azar: confunde caracteres que se parecen, y siempre los mismos. Estas
 * pruebas fijan ese comportamiento porque es de donde sale el acierto del lector con placas
 * reales — y porque `corregirPlacaOcr` es el espejo en TypeScript de `public.corregir_placa_ocr`
 * en SQL: si las dos se separan, el frontend y el backend resolverían placas distintas para la
 * misma foto.
 */
describe('corrección posicional de la lectura', () => {
  it('convierte los dígitos leídos en la zona de letras', () => {
    // Placa real PDF1234 leída como P0F1234: un cero donde va una D.
    expect(corregirPlacaOcr('P0F1234')).toBe('POF1234')
    expect(corregirPlacaOcr('1BC1234')).toBe('IBC1234')
    expect(corregirPlacaOcr('5BC1234')).toBe('SBC1234')
  })

  it('convierte las letras leídas en la zona de dígitos', () => {
    expect(corregirPlacaOcr('PDFI234')).toBe('PDF1234')
    expect(corregirPlacaOcr('PDF1Z34')).toBe('PDF1234')
    expect(corregirPlacaOcr('PCI5I4')).toBe('PCI514')
    expect(corregirPlacaOcr('PDFO123')).toBe('PDF0123')
  })

  it('no toca una placa que ya está bien', () => {
    expect(corregirPlacaOcr('PDF1234')).toBe('PDF1234')
    expect(corregirPlacaOcr('PCI514')).toBe('PCI514')
  })

  it('acepta la placa con guion o en minúsculas', () => {
    expect(corregirPlacaOcr('pdf-1234')).toBe('PDF1234')
    expect(corregirPlacaOcr(' PDF 1234 ')).toBe('PDF1234')
  })

  it('deja intacto lo que no tiene longitud de placa', () => {
    // Corregir una lectura de tres caracteres sería inventar: no hay forma de saber qué
    // posiciones son letras y cuáles dígitos.
    expect(corregirPlacaOcr('PDF')).toBe('PDF')
    expect(corregirPlacaOcr('PDF123456789')).toBe('PDF123456789')
    expect(corregirPlacaOcr('')).toBe('')
  })
})

describe('forma de la placa ecuatoriana', () => {
  it('acepta los formatos vigentes', () => {
    expect(pareceePlacaEcuatoriana('PDF1234')).toBe(true)  // 3 letras + 4 dígitos
    expect(pareceePlacaEcuatoriana('PCI514')).toBe(true)   // 3 letras + 3 dígitos
    expect(pareceePlacaEcuatoriana('PB123C')).toBe(true)   // motocicleta histórica
  })

  it('rechaza una primera letra que no es de ninguna provincia', () => {
    // D y F no se asignan como letra de provincia.
    expect(pareceePlacaEcuatoriana('DDF1234')).toBe(false)
    expect(pareceePlacaEcuatoriana('FDF1234')).toBe(false)
  })

  it('rechaza lo que no tiene forma de placa', () => {
    expect(pareceePlacaEcuatoriana('ECUADOR')).toBe(false)
    expect(pareceePlacaEcuatoriana('12345')).toBe(false)
    expect(pareceePlacaEcuatoriana('')).toBe(false)
  })
})

describe('extracción de la placa del texto del OCR', () => {
  it('encuentra la placa entre el resto de lo impreso en la matrícula', () => {
    // Una placa ecuatoriana lleva impreso el país arriba y la provincia abajo, así que el OCR
    // nunca devuelve solo la placa: si se tomara el texto entero, no habría lectura válida.
    expect(extraerPlacaDeTexto('ECUADOR\nPDF-1234\nPICHINCHA')).toBe('PDF1234')
    expect(extraerPlacaDeTexto('REPUBLICA DEL ECUADOR PCI 514')).toBe('PCI514')
  })

  it('corrige la lectura sucia mientras la extrae', () => {
    expect(extraerPlacaDeTexto('ECUADOR PDFI234 PICHINCHA')).toBe('PDF1234')
  })

  it('prefiere la lectura larga sobre su prefijo', () => {
    // Sin esto, "PDF1234" podría resolverse como "PDF123" —una placa distinta y quizá de
    // otra persona— porque los dos encajan en el patrón.
    expect(extraerPlacaDeTexto('PDF1234')).toBe('PDF1234')
  })

  it('devuelve null cuando no hay nada con forma de placa', () => {
    expect(extraerPlacaDeTexto('ECUADOR PICHINCHA')).toBeNull()
    expect(extraerPlacaDeTexto('')).toBeNull()
  })
})

describe('normalización', () => {
  it('deja la forma canónica con la que se compara contra la base', () => {
    expect(normalizarPlacaLeida('pdf-1234')).toBe('PDF1234')
    expect(normalizarPlacaLeida('P D F 1 2 3 4')).toBe('PDF1234')
    expect(normalizarPlacaLeida('')).toBe('')
  })
})
