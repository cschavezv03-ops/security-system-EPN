import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * Lo que hay que poder responder al auditar un acceso.
 *
 * El panel de monitoreo solo mostraba lo que cabía en la fila —persona, garita, resultado—, así
 * que tres preguntas quedaban sin respuesta: por dónde salió quien entró por otro lado, qué
 * aparato lo leyó y quién respondía de esa garita a esa hora.
 */

const { supabase, respuesta } = vi.hoisted(() => {
  const respuesta: { valor: unknown } = { valor: null }
  return {
    respuesta,
    supabase: { rpc: () => Promise.resolve({ data: respuesta.valor, error: null }) },
  }
})

vi.mock('../lib/supabase', () => ({ supabase }))

const { DetalleEvento } = await import('./DetalleEvento')

const SALIDA_POR_OTRA_GARITA = {
  id_evento: 'ev-1',
  fecha_hora: '2026-07-21T21:44:00Z',
  tipo_movimiento: 'SALIDA',
  tipo_acceso: 'VEHICULAR',
  resultado: 'AUTORIZADO',
  motivo_resultado: null,
  origen_registro: 'AUTOMATICA',
  es_conductor: true,
  confianza_biometria: null,
  confianza_placa: 0.87,
  placa_detectada: 'PCR1234',
  persona: { cedula: '1718877465', nombres: 'Morty', apellidos: 'Smith', tipo_persona: 'EXTERNA', categoria: 'CONDUCTOR' },
  vehiculo: { placa: 'PCR1234', tipo_vehiculo: 'AUTOMOVIL', marca: 'Chevrolet', modelo: 'Sail', color: 'Blanco' },
  punto: { nombre_punto: 'Garita - Subsuelo EARME', zona: 'Parqueadero Subsuelo' },
  dispositivo: {
    codigo_dispositivo: 'LPR-EARME-01', tipo_tecnologia: 'LPR_PLACAS',
    codigo_mac: 'AA:BB:CC:DD:EE:FF', direccion_ip: '10.0.0.10', estado_dispositivo: 'OPERATIVO',
  },
  registrado_por: null,
  guardia_de_turno: [{ nombre_usuario: 'frank_jumbo', correo_electronico: 'frank.jumbo@epn.edu.ec', turno: '14:00–20:00' }],
  ingreso_relacionado: {
    fecha_hora: '2026-07-21T14:10:00Z',
    punto: 'Garita Principal',
    mismo_punto: false,
    horas_dentro: 7.5,
  },
  regla_aplicada: null,
  autorizacion_visita: null,
}

describe('trazabilidad de un movimiento', () => {
  it('dice por dónde salió y por dónde había entrado', async () => {
    respuesta.valor = SALIDA_POR_OTRA_GARITA
    render(<DetalleEvento idEvento="ev-1" />)

    expect(await screen.findByText('Por dónde salió')).toBeInTheDocument()
    expect(screen.getByText('Garita - Subsuelo EARME')).toBeInTheDocument()
    expect(screen.getByText('Garita Principal')).toBeInTheDocument()
    expect(screen.getByText(/7\.5 h/)).toBeInTheDocument()
  })

  it('avisa cuando la salida fue por una garita distinta', async () => {
    // Es el dato que hace saltar la alarma al revisar: entró por una puerta y salió por otra.
    respuesta.valor = SALIDA_POR_OTRA_GARITA
    render(<DetalleEvento idEvento="ev-1" />)

    expect(await screen.findByText(/salió por una garita distinta/i)).toBeInTheDocument()
  })

  it('identifica el aparato que hizo la lectura', async () => {
    respuesta.valor = SALIDA_POR_OTRA_GARITA
    render(<DetalleEvento idEvento="ev-1" />)

    expect(await screen.findByText('LPR-EARME-01')).toBeInTheDocument()
    expect(screen.getByText(/Lector de placas/i)).toBeInTheDocument()
  })

  it('dice quién cubría la garita aunque nadie lo registrara a mano', async () => {
    respuesta.valor = SALIDA_POR_OTRA_GARITA
    render(<DetalleEvento idEvento="ev-1" />)

    expect(await screen.findByText(/fue un registro automático/i)).toBeInTheDocument()
    expect(screen.getByText(/frank\.jumbo@epn\.edu\.ec/)).toBeInTheDocument()
    expect(screen.getByText(/14:00–20:00/)).toBeInTheDocument()
  })

  it('cuando lo registró un guardia, lo dice con su nombre', async () => {
    respuesta.valor = {
      ...SALIDA_POR_OTRA_GARITA,
      origen_registro: 'MANUAL',
      dispositivo: null,
      registrado_por: { nombre_usuario: 'guardia_demo', correo_electronico: 'guardia.demo@epn.edu.ec', persona: 'Ana Torres' },
    }
    render(<DetalleEvento idEvento="ev-1" />)

    expect(await screen.findByText('Ana Torres')).toBeInTheDocument()
    expect(screen.getByText(/lo registró una persona desde la garita/i)).toBeInTheDocument()
  })

  it('si la consulta no devuelve nada, no arrastra al panel que lo contiene', async () => {
    // Este bloque va incrustado dentro de otras fichas: si reventara, se llevaría por delante
    // el resto de la información, que sí se pudo cargar.
    respuesta.valor = null
    render(<DetalleEvento idEvento="ev-1" />)

    expect(await screen.findByText(/No se pudo cargar la trazabilidad/i)).toBeInTheDocument()
  })
})
