import { describe, expect, it } from 'vitest'
import { fmtFecha, fmtFechaDia } from './format'

/**
 * Cómo se muestra una fecha que en la base es un DÍA, no un instante.
 *
 * El fallo que originó estas pruebas: se creó un memorando con vigencia del 21/07 al 22/07 y el
 * listado lo mostraba como "20/07 → 21/07", un día menos. La base guardaba `2026-07-21` y
 * `2026-07-22`, exactamente lo tecleado — mentía la pantalla.
 *
 * La causa: `new Date('2026-07-21')` es medianoche UTC por norma de JavaScript, y formatearla en
 * la zona de Ecuador (UTC-5) la devuelve al día anterior a las 19:00. Con las fechas de vigencia
 * de un memorando eso no es cosmético: es el dato con el que se decide si alguien entra.
 */

describe('fmtFecha con columnas de tipo date', () => {
  it('respeta el día tal como viene, sin correrlo por la zona horaria', () => {
    expect(fmtFecha('2026-07-21')).toBe('21/07/2026')
    expect(fmtFecha('2026-07-22')).toBe('22/07/2026')
  })

  it('no se equivoca en el cambio de mes ni de año', () => {
    // El 1 de enero es el caso donde el desfase saltaba a la vista: mostraba 31/12 del año
    // anterior.
    expect(fmtFecha('2026-01-01')).toBe('01/01/2026')
    expect(fmtFecha('2026-08-01')).toBe('01/08/2026')
    expect(fmtFecha('2026-12-31')).toBe('31/12/2026')
  })

  it('da el mismo día que fmtFechaDia: las dos vías coinciden', () => {
    // `fmtFechaDia` ya resolvía esto para las columnas timestamptz que significan un día. Que
    // ambas coincidan es lo que garantiza que no haya dos criterios distintos en pantalla.
    expect(fmtFecha('2026-07-21')).toBe(fmtFechaDia('2026-07-21T00:00:00Z'))
  })

  it('sigue formateando un instante completo como antes', () => {
    // Un timestamptz sí lleva hora, y ahí la zona del navegador es la interpretación correcta.
    expect(fmtFecha('2026-07-21T15:30:00Z')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
  })

  it('devuelve un guion si no hay fecha, y el texto crudo si no es una fecha', () => {
    expect(fmtFecha(null)).toBe('—')
    expect(fmtFecha('')).toBe('—')
    expect(fmtFecha('no es una fecha')).toBe('no es una fecha')
  })
})
