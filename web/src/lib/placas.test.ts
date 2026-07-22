import { describe, expect, it } from 'vitest'
import {
  GEOMETRIA_PLACA, VARIANTES_OCR, aplicarVariante, corregirPlacaOcr, extraerPlacaDeTexto,
  normalizarPlacaLeida, pareceePlacaEcuatoriana, type ImagenCruda,
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

describe('lo que teclea el guardia también se corrige', () => {
  // Lo encontró TestSprite: al escribir 'PDFI234' en el campo manual, la validación de formato
  // lo rechazaba con "Placa no válida" antes de que el corrector llegara a mirarlo. El sistema
  // sabía perfectamente que eso era PDF1234 y se negaba a usarlo. Un guardia confunde la I con
  // el 1 igual que un OCR, sobre todo copiando una placa a contraluz.
  it('una placa tecleada con la confusión típica queda en forma válida', () => {
    expect(corregirPlacaOcr('PDFI234')).toBe('PDF1234')
    expect(pareceePlacaEcuatoriana(corregirPlacaOcr('PDFI234'))).toBe(true)
    // Y sin corregir no habría pasado la validación de formato, que es lo que ocurría antes.
    expect(pareceePlacaEcuatoriana('PDFI234')).toBe(false)
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

// ---------------------------------------------------------------------------
// Preprocesado
// ---------------------------------------------------------------------------

/** Una imagen de prueba: franja oscura arriba, clara abajo, con contraste aplastado en el
 *  centro — parecido a lo que llega de una foto de pantalla. */
function imagenDePrueba(ancho = 8, alto = 8): ImagenCruda {
  const datos = new Uint8ClampedArray(ancho * alto * 4)
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4
      const v = y < alto / 2 ? 90 + (x % 2) * 8 : 150 + (x % 2) * 8
      datos[i] = v
      datos[i + 1] = v
      datos[i + 2] = v
      datos[i + 3] = 255
    }
  }
  return { datos, ancho, alto }
}

const valoresDe = (img: ImagenCruda) => {
  const vs = new Set<number>()
  for (let i = 0; i < img.datos.length; i += 4) vs.add(img.datos[i])
  return vs
}

describe('variantes de preprocesado', () => {
  it('las binarizadas dejan solo negro y blanco', () => {
    for (const variante of ['BINARIZADA', 'SUAVIZADA', 'REALZADA'] as const) {
      const img = imagenDePrueba()
      aplicarVariante(img, variante)
      const valores = [...valoresDe(img)].sort((a, b) => a - b)
      expect(valores.every((v) => v === 0 || v === 255)).toBe(true)
      expect(valores.length).toBeGreaterThan(1) // separó algo, no dejó la imagen de un color
    }
  })

  it('la variante GRIS no binariza: conserva los tonos intermedios', () => {
    // Es su razón de ser: cuando el brillo de la pantalla aplana el contraste, un umbral
    // global se lleva caracteres enteros por delante y en gris se salvan.
    const img = imagenDePrueba()
    aplicarVariante(img, 'GRIS')
    const valores = [...valoresDe(img)]
    expect(valores.some((v) => v !== 0 && v !== 255)).toBe(true)
  })

  it('deja la imagen en gris: los tres canales con el mismo valor y opaca', () => {
    const img = imagenDePrueba()
    aplicarVariante(img, 'SUAVIZADA')
    for (let i = 0; i < img.datos.length; i += 4) {
      expect(img.datos[i]).toBe(img.datos[i + 1])
      expect(img.datos[i + 1]).toBe(img.datos[i + 2])
      expect(img.datos[i + 3]).toBe(255)
    }
  })

  it('se prueban varias variantes, y la primera es la que mejor lee pantallas', () => {
    // El orden importa: ante empate de votos gana la primera, y la medida sobre el banco de
    // pruebas dice que SUAVIZADA es la que mejor se porta con fotos de pantalla.
    expect(VARIANTES_OCR.length).toBeGreaterThan(1)
    expect(VARIANTES_OCR[0]).toBe('SUAVIZADA')
  })
})

// ---------------------------------------------------------------------------
// Placas de motocicleta
// ---------------------------------------------------------------------------

describe('placa de moto: el código viene en dos líneas', () => {
  // Una placa de moto ecuatoriana no es una de auto más pequeña: lleva el código repartido en
  // dos renglones. El OCR devuelve entonces dos trozos de tres caracteres, y el filtro normal
  // los descarta por cortos — por eso hace falta unirlos antes de buscar.
  it('une los dos renglones cuando se pide modo multilínea', () => {
    expect(extraerPlacaDeTexto('ECUADOR\nXLL\n446\nCOTOPAXI', true)).toBe('XLL446')
    expect(extraerPlacaDeTexto('ECUADOR\nIA\n123B\nIMBABURA', true)).toBe('IA123B')
  })

  it('corrige las erratas del OCR también al unir los renglones', () => {
    // La I de la segunda línea está en zona de dígitos: es un 1.
    expect(extraerPlacaDeTexto('ECUADOR\nPCI\n5I4\nPICHINCHA', true)).toBe('PCI514')
  })

  it('no confunde ECUADOR ni la provincia con parte del código', () => {
    // Están impresos en la placa; si se colaran en la unión formarían placas fantasma.
    expect(extraerPlacaDeTexto('ECUADOR\nGUAYAS', true)).toBeNull()
  })

  it('sin modo multilínea, el formato de 2 letras devuelve una placa EQUIVOCADA', () => {
    // Este es el caso que más importa de todos, y no es que "no lea": es que lee MAL.
    //
    // Sin unir renglones, el último recurso pega todo el texto —"ECUADORIA123BIMBABURA"— y
    // busca el patrón dentro. Encuentra "RIA123", comiéndose la R final de ECUADOR y el
    // último carácter de la placa. Devuelve con aplomo una placa que no existe.
    //
    // Una lectura equivocada es peor que ninguna: si esa placa fantasma existiera en la base,
    // el sistema autorizaría al vehículo de otra persona.
    expect(extraerPlacaDeTexto('ECUADOR\nIA\n123B\nIMBABURA', false)).toBe('RIA123')
    expect(extraerPlacaDeTexto('ECUADOR\nIA\n123B\nIMBABURA', true)).toBe('IA123B')
  })

  it('el modo multilínea está apagado por defecto', () => {
    // La garantía de que arreglar las motos no cambió el camino de los autos: quien llame sin
    // el segundo argumento obtiene exactamente el comportamiento anterior.
    const texto = 'ECUADOR\nPDF-1234\nPICHINCHA'
    expect(extraerPlacaDeTexto(texto)).toBe(extraerPlacaDeTexto(texto, false))
    expect(extraerPlacaDeTexto(texto)).toBe('PDF1234')
  })
})

describe('geometría y modo de lectura por tipo de placa', () => {
  it('el auto conserva exactamente el marco y el modo que ya tenía', () => {
    // Si estos números cambian, el camino de auto —que funciona— se ha tocado.
    expect(GEOMETRIA_PLACA.AUTO).toEqual({
      anchoRel: 0.70, altoRel: 0.26, psm: '7', multilinea: false,
    })
  })

  it('la moto usa un marco casi cuadrado y el modo que ve varias líneas', () => {
    const moto = GEOMETRIA_PLACA.MOTO
    // La placa de moto es ~1.33:1; el marco tiene que acercarse a esa forma para que la
    // placa lo llene en vez de ocupar una cuarta parte.
    const relacionMarco = (moto.anchoRel * 4) / (moto.altoRel * 3) // sobre un vídeo 4:3
    expect(relacionMarco).toBeLessThan(1.6)
    // PSM 7 significa "una sola línea" y con él se lee el 0 % de las motos.
    expect(moto.psm).not.toBe('7')
    expect(moto.multilinea).toBe(true)
  })

  it('el marco de la moto es más alto y más estrecho que el del auto', () => {
    expect(GEOMETRIA_PLACA.MOTO.altoRel).toBeGreaterThan(GEOMETRIA_PLACA.AUTO.altoRel)
    expect(GEOMETRIA_PLACA.MOTO.anchoRel).toBeLessThan(GEOMETRIA_PLACA.AUTO.anchoRel)
  })
})
