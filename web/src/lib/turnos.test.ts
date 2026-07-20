import { afterEach, describe, expect, it, vi } from 'vitest'
import { duracionTurnoMin, estaEnTurno, fmtFechaDia, horaEcuadorHHMM } from './format'
import {
  componerNombrePuntoEPN, esUbicacionEPN, normalizarUbicacionEPN, partesUbicacionEPN, validarUbicacionEPN,
} from './validacion'
import { CAT } from './catalogos'

/**
 * Turnos de guardia y ubicaciones de la EPN.
 *
 * Los turnos son espejo de `public.esta_en_turno(time, time, time)` y las ubicaciones de
 * `public.es_ubicacion_epn(text)`. Si estas pruebas y la base discrepan, manda la base.
 */

afterEach(() => {
  vi.useRealTimers()
})

describe('estaEnTurno', () => {
  it('un turno diurno contiene su franja y excluye el resto', () => {
    expect(estaEnTurno('07:00', '17:00', '12:00')).toBe(true)
    expect(estaEnTurno('07:00', '17:00', '06:59')).toBe(false)
    expect(estaEnTurno('07:00', '17:00', '22:00')).toBe(false)
  })

  it('la entrada cuenta como dentro y la salida como fuera', () => {
    // Sin este criterio, dos turnos consecutivos (07:00–15:00 y 15:00–23:00) se solaparían un
    // minuto y ambos guardias constarían en turno a las 15:00.
    expect(estaEnTurno('07:00', '17:00', '07:00')).toBe(true)
    expect(estaEnTurno('07:00', '17:00', '17:00')).toBe(false)
  })

  it('el turno nocturno cruza la medianoche', () => {
    // Este es el caso que el turno guardado como texto libre no sabía resolver (§V10).
    expect(estaEnTurno('22:00', '06:00', '23:30')).toBe(true)
    expect(estaEnTurno('22:00', '06:00', '02:00')).toBe(true)
    expect(estaEnTurno('22:00', '06:00', '05:59')).toBe(true)
    expect(estaEnTurno('22:00', '06:00', '06:00')).toBe(false)
    expect(estaEnTurno('22:00', '06:00', '12:00')).toBe(false)
  })

  it('sin horas no se puede afirmar nada: devuelve null, no false', () => {
    // Las asignaciones anteriores a la estructuración del turno tienen las horas en null (la
    // fila con turno "MATUTINO"). Decir "fuera de turno" sería inventarse un dato.
    expect(estaEnTurno(null, null)).toBeNull()
    expect(estaEnTurno('07:00', null)).toBeNull()
  })

  it('usa la hora de Ecuador, no la del navegador', () => {
    // 03:00 UTC del día 20 son las 22:00 del día 19 en Ecuador: dentro del turno nocturno. Con
    // la hora local de un navegador en UTC daría fuera, que es el fallo de §D52 aplicado a horas.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-20T03:00:00Z'))
    expect(horaEcuadorHHMM()).toBe('22:00')
    expect(estaEnTurno('22:00', '06:00')).toBe(true)
  })
})

describe('duracionTurnoMin', () => {
  it('mide un turno normal', () => {
    expect(duracionTurnoMin('07:00', '17:00')).toBe(600)
    expect(duracionTurnoMin('14:00', '20:00')).toBe(360)
  })

  it('el turno nocturno dura 8 horas, no menos 16', () => {
    // Es el fallo que tuvo la versión SQL: sumar 24 h a un `time` lo envuelve en vez de pasarlo
    // al día siguiente, así que 22:00→06:00 daba -960 minutos. Y una duración negativa nunca
    // supera el máximo, con lo que TODOS los turnos nocturnos se saltaban la validación de
    // jornada: uno de 22:00 a 21:00 (23 horas) se habría aceptado.
    expect(duracionTurnoMin('22:00', '06:00')).toBe(480)
    expect(duracionTurnoMin('22:00', '21:00')).toBe(1380)
  })

  it('sin alguna de las dos horas no mide nada', () => {
    expect(duracionTurnoMin(null, '17:00')).toBeNull()
    expect(duracionTurnoMin('07:00', null)).toBeNull()
  })
})

describe('fechas que representan un día, no un instante', () => {
  it('una vigencia que termina el 31 no se lee como el 30', () => {
    // `fecha_fin` es timestamptz pero significa "el día 31 de julio". Se guarda a medianoche UTC,
    // así que formatearla en la zona del navegador la retrasaba un día para cualquiera en
    // Ecuador: una asignación vigente hasta el 31/07 se leía "30/07". Cuarta aparición del error
    // de medianoche (§D52, §D59, §D69).
    expect(fmtFechaDia('2026-07-31T00:00:00+00:00')).toBe('31/07/2026')
    expect(fmtFechaDia('2026-07-01T00:00:00+00:00')).toBe('01/07/2026')
  })

  it('sin valor no inventa una fecha', () => {
    expect(fmtFechaDia(null)).toBe('—')
    expect(fmtFechaDia(undefined)).toBe('—')
  })
})

describe('ubicación con la nomenclatura de la EPN', () => {
  it('acepta el formato oficial', () => {
    expect(esUbicacionEPN('E20/P3/E004')).toBe(true)
    expect(esUbicacionEPN('E1/P0/E001')).toBe(true)
  })

  it('exige los tres dígitos del espacio', () => {
    // "E4" y "E004" serían la misma aula escrita de dos formas.
    expect(esUbicacionEPN('E20/P3/E4')).toBe(false)
    expect(esUbicacionEPN('E20/P3/E04')).toBe(false)
  })

  it('rechaza lo que no es una ubicación', () => {
    expect(esUbicacionEPN('E0/P1/E001')).toBe(false) // no hay edificio 0
    expect(esUbicacionEPN('Edificio 20, piso 3')).toBe(false)
    expect(esUbicacionEPN('')).toBe(false)
  })

  it('normaliza lo tecleado antes de darlo por inválido', () => {
    expect(normalizarUbicacionEPN('e20 / p3 / e4')).toBe('E20/P3/E004')
    expect(normalizarUbicacionEPN('E20/P03/E004')).toBe('E20/P3/E004')
    expect(validarUbicacionEPN('e20 / p3 / e4')).toBeNull()
  })

  it('el validador explica el formato cuando no encaja', () => {
    expect(validarUbicacionEPN('E20-P3-E004')).toMatch(/E20\/P3\/E004/)
  })

  it('un campo vacío no es un error de formato', () => {
    // De eso se encarga `required`; si no, el error saldría antes de escribir nada.
    expect(validarUbicacionEPN('')).toBeNull()
  })
})

describe('nombre de un punto de control dentro de un edificio', () => {
  it('compone el nombre sin que el usuario teclee separadores', () => {
    // PCO v2: "el usuario solo ingresará los datos, pero no estos caracteres: /, -".
    expect(componerNombrePuntoEPN(20, 4, 4, 'Laboratorio Alan Turing')).toBe('E20/P4/E004 – Laboratorio Alan Turing')
    expect(componerNombrePuntoEPN('20', '4', '4')).toBe('E20/P4/E004')
  })

  it('rellena el espacio a tres dígitos', () => {
    expect(componerNombrePuntoEPN(1, 0, 7, '')).toBe('E1/P0/E007')
  })

  it('no enseña un código a medias mientras falten cifras', () => {
    // Sin esto el campo mostraría "E20/P/E000" mientras se rellena el formulario.
    expect(componerNombrePuntoEPN(20, '', 4)).toBe('')
    expect(componerNombrePuntoEPN('', '', '')).toBe('')
  })

  it('vuelve a descomponerlo para poder editarlo', () => {
    expect(partesUbicacionEPN('E20/P4/E004 – Laboratorio Alan Turing')).toEqual({
      edificio: '20', piso: '4', espacio: '4', descripcion: 'Laboratorio Alan Turing',
    })
    expect(partesUbicacionEPN('E20/P4/E004')).toEqual({
      edificio: '20', piso: '4', espacio: '4', descripcion: '',
    })
  })

  it('devuelve null para los nombres anteriores a la regla', () => {
    // Los dos puntos sembrados en edificios no siguen el estándar y no se les puede adivinar el
    // piso ni el aula (§V41): el formulario tiene que poder abrirlos igualmente.
    expect(partesUbicacionEPN('Puerta - Laboratorio de Suelos')).toBeNull()
    expect(partesUbicacionEPN('')).toBeNull()
  })

  it('lo que se compone se vuelve a descomponer igual', () => {
    const nombre = componerNombrePuntoEPN(15, 2, 12, 'Aula magna')
    expect(partesUbicacionEPN(nombre)).toEqual({
      edificio: '15', piso: '2', espacio: '12', descripcion: 'Aula magna',
    })
  })
})

describe('catálogos de PCO', () => {
  it('una zona solo puede estar activa o inactiva', () => {
    // BLOQUEADA se retiró: era indistinguible de INACTIVA. Espejo de zona_estado_zona_check.
    expect(CAT.zona_estado).toEqual(['ACTIVA', 'INACTIVA'])
  })

  it('un punto de control no puede estar en falla', () => {
    // Un punto de control es un lugar; lo que falla es el dispositivo que hay en él.
    expect(CAT.punto_estado).not.toContain('FALLA')
    expect(CAT.punto_estado).toEqual(['ACTIVO', 'MANTENIMIENTO'])
  })

  it('un dispositivo sí conserva sus averías', () => {
    expect(CAT.dispositivo_estado).toContain('FALLA_DE_RED')
    expect(CAT.dispositivo_estado).toContain('DANO_FISICO')
  })
})
