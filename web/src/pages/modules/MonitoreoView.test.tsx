import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Panel de monitoreo (CAC).
 *
 * RF-CA-022: los fallos técnicos del reconocimiento (cámara caída, ningún rostro en la
 * imagen...) se guardaban en `error_reconocimiento`, pero el panel de "Eventos recientes"
 * solo consultaba `evento_acceso` — un fallo repetido en una garita podía pasar
 * desapercibido para quien supervisa CAC. Se mezclan ambas fuentes en una sola lista,
 * ordenada por fecha, y se muestra el motivo de un DENEGADO sin tener que abrir el detalle.
 */

const { filasPorTabla } = vi.hoisted(() => ({
  filasPorTabla: {
    vista_vehiculos_dentro: [] as any[],
    evento_acceso: [] as any[],
    error_reconocimiento: [] as any[],
    alerta_seguridad: [] as any[],
  },
}))

vi.mock('../../lib/supabase', () => {
  const cadena = (tabla: string) => {
    const filtros: [string, unknown][] = []
    const filtradas = () => (filasPorTabla as any)[tabla].filter((f: any) => filtros.every(([c, v]) => f[c] === v))
    const chain: Record<string, unknown> = {}
    const mismo = () => chain
    Object.assign(chain, {
      select: mismo,
      eq: (col: string, val: unknown) => { filtros.push([col, val]); return chain },
      order: mismo,
      limit: mismo,
      then: (r: (x: { data: unknown; error: null; count: number }) => unknown) =>
        Promise.resolve({ data: filtradas(), error: null, count: filtradas().length }).then(r),
    })
    return chain
  }
  return {
    supabase: { from: (t: string) => cadena(t) },
    mensajeError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  }
})

const { MonitoreoView } = await import('./MonitoreoView')

beforeEach(() => {
  filasPorTabla.vista_vehiculos_dentro = []
  filasPorTabla.evento_acceso = [{
    id_evento: 'ev-1',
    fecha_hora: '2026-07-20T21:25:00Z',
    tipo_movimiento: 'INGRESO',
    resultado: 'DENEGADO',
    motivo_resultado: 'PERSONA_DESCONOCIDA: el rostro capturado no coincide con ninguna persona registrada',
    origen_registro: 'AUTOMATICA',
    es_conductor: false,
    persona: null,
    punto: { nombre_punto: 'Garita Principal' },
    vehiculo: null,
  }]
  filasPorTabla.error_reconocimiento = [{
    id_error: 'err-1',
    fecha_hora: '2026-07-20T21:30:00Z',
    tipo_reconocimiento: 'FACIAL',
    codigo_error: 'ROSTRO_NO_DETECTADO',
    descripcion: 'Identificación facial en la garita: no se detectó ningún rostro en la imagen.',
    punto: { nombre_punto: 'Garita Principal' },
  }]
  filasPorTabla.alerta_seguridad = []
})

describe('Eventos recientes (RF-CA-022 + RF-CA-021)', () => {
  it('mezcla los errores de reconocimiento con los eventos de acceso, más recientes primero', async () => {
    render(<MonitoreoView />)

    const lista = await screen.findAllByRole('listitem')
    // El error (21:30) es más reciente que el evento denegado (21:25): va primero.
    expect(lista[0]).toHaveTextContent(/Error de reconocimiento facial/i)
    expect(lista[0]).toHaveTextContent(/Rostro no detectado/i)
    expect(lista[1]).toHaveTextContent('Garita Principal')
  })

  it('muestra el motivo de un evento denegado directamente en la lista, sin abrir el detalle', async () => {
    render(<MonitoreoView />)

    expect(await screen.findByText(/Persona desconocida: el rostro no coincide con ningún registro/i)).toBeInTheDocument()
  })

  it('el detalle de un error de reconocimiento muestra su punto de control y su descripción', async () => {
    const usuario = userEvent.setup()
    render(<MonitoreoView />)

    await usuario.click(await screen.findByText(/Error de reconocimiento facial/i))

    // El detalle se abre en el panel lateral, como en el resto de módulos: al pie de la página
    // quedaba tan abajo que parecía que pulsar la fila no hacía nada.
    expect(await screen.findByRole('heading', { name: 'Error de reconocimiento' })).toBeInTheDocument()
    expect(screen.getByText(/no se detectó ningún rostro en la imagen/i)).toBeInTheDocument()
  })
})
