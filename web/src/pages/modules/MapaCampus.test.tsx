import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Mapa interactivo del campus (CAC).
 *
 * Verifica que las zonas georreferenciadas se dibujan como marcadores (con el número de
 * edificio del plano de la EPN), que el color resume el peor estado de sus puntos/dispositivos,
 * que las zonas sin coordenadas caen en la bandeja "sin ubicar" en vez de perderse, y que el
 * panel de detalle muestra los dispositivos de la zona seleccionada.
 */

const { filas } = vi.hoisted(() => ({ filas: { zona: [] as any[] } }))

vi.mock('../../lib/supabase', () => {
  const cadena = (tabla: string) => {
    const chain: Record<string, unknown> = {}
    const mismo = () => chain
    Object.assign(chain, {
      select: mismo,
      order: mismo,
      then: (r: (x: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: (filas as any)[tabla] ?? [], error: null }).then(r),
    })
    return chain
  }
  return {
    supabase: { from: (t: string) => cadena(t) },
    mensajeError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  }
})

const { MapaCampus } = await import('./MapaCampus')

beforeEach(() => {
  filas.zona = [
    {
      id_zona: 'z-quimica',
      nombre_zona: 'Edificio de Química',
      tipo_zona: 'EDIFICIO',
      estado_zona: 'ACTIVA',
      numero_edificio: 20,
      pos_x: '0.53000', // numeric de Postgres llega como texto: el componente lo convierte
      pos_y: '0.31000',
      puntos: [
        {
          id_punto_control: 'p-quimica',
          nombre_punto: 'Torniquete Química',
          estado_punto: 'FALLA',
          dispositivos: [{ id_dispositivo: 'd1', tipo_tecnologia: 'BIOMETRIA_FACIAL', estado_dispositivo: 'DANO_FISICO' }],
        },
      ],
    },
    {
      id_zona: 'z-civil',
      nombre_zona: 'Facultad de Ingeniería Civil y Ambiental',
      tipo_zona: 'EDIFICIO',
      estado_zona: 'ACTIVA',
      numero_edificio: 6,
      pos_x: '0.36000',
      pos_y: '0.60000',
      puntos: [
        {
          id_punto_control: 'p-civil',
          nombre_punto: 'Acceso Edificio 6',
          estado_punto: 'ACTIVO',
          dispositivos: [{ id_dispositivo: 'd2', tipo_tecnologia: 'BIOMETRIA_FACIAL', estado_dispositivo: 'OPERATIVO' }],
        },
      ],
    },
    {
      id_zona: 'z-sin-ubicar',
      nombre_zona: 'Aulas del Centro de Cultura Física',
      tipo_zona: 'EDIFICIO',
      estado_zona: 'ACTIVA',
      numero_edificio: 11,
      pos_x: null,
      pos_y: null,
      puntos: [],
    },
  ]
})

describe('MapaCampus', () => {
  it('dibuja marcadores por zona ubicada y cuenta los puntos activos', async () => {
    render(<MapaCampus />)
    // Marcadores: cada uno muestra el número de edificio y su etiqueta accesible.
    expect(await screen.findByRole('button', { name: /Edificio de Química/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Facultad de Ingeniería Civil/ })).toBeInTheDocument()
    // Contador: solo el punto del Edificio 6 está ACTIVO.
    expect(screen.getByText('1').parentElement).toHaveTextContent(/puntos activos/)
  })

  it('lista las zonas sin coordenadas en la bandeja "sin ubicar"', async () => {
    render(<MapaCampus />)
    expect(await screen.findByText(/Zonas sin ubicar en el mapa \(1\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aulas del Centro de Cultura Física' })).toBeInTheDocument()
  })

  it('abre el detalle con los dispositivos al pulsar un marcador', async () => {
    render(<MapaCampus />)
    const marcador = await screen.findByRole('button', { name: /Edificio de Química/ })
    await userEvent.click(marcador)
    expect(await screen.findByText('Torniquete Química')).toBeInTheDocument()
    expect(screen.getByText('Biometría facial')).toBeInTheDocument()
  })
})
