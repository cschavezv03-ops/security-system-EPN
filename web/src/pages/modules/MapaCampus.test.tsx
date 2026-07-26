import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * Mapa interactivo del campus (CAC).
 *
 * El mapa se dibuja con Leaflet sobre la imagen del campus; sus internos (canvas, tamaño del
 * contenedor) no funcionan de forma fiable en jsdom, así que aquí se mockea Leaflet y se verifica
 * la capa que sí es determinista: los contadores (que resumen el estado agregado de las zonas) y
 * que las zonas sin coordenadas caen en la bandeja "sin ubicar" en vez de perderse.
 */

vi.mock('leaflet/dist/leaflet.css', () => ({}))
vi.mock('leaflet', () => {
  const marker = () => {
    const m: any = {}
    m.bindTooltip = () => m
    m.on = () => m
    m.addTo = () => m
    return m
  }
  const layerGroup = () => {
    const g: any = {}
    g.addTo = () => g
    g.clearLayers = () => g
    g.addLayer = () => g
    return g
  }
  const map = () => {
    const mp: any = {}
    for (const k of ['fitBounds', 'setMaxBounds', 'setMinZoom', 'setMaxZoom', 'invalidateSize', 'remove']) mp[k] = () => mp
    mp.getZoom = () => 0
    return mp
  }
  const overlay = { addTo: () => {} }
  const L = {
    map,
    imageOverlay: () => overlay,
    svgOverlay: () => overlay,
    layerGroup,
    marker,
    divIcon: () => ({}),
    CRS: { Simple: {} },
  }
  return { default: L, ...L }
})

// El componente hace fetch del SVG del plano; en jsdom no hay red, así que se mockea.
vi.stubGlobal('fetch', () => Promise.resolve({ text: () => Promise.resolve('<svg viewBox="0 0 686 446"></svg>') }))

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
  it('cuenta los puntos activos a partir del estado agregado de las zonas', async () => {
    render(<MapaCampus />)
    // Solo el punto del Edificio 6 está ACTIVO.
    expect(await screen.findByText('1')).toBeInTheDocument()
    expect(screen.getByText('1').parentElement).toHaveTextContent(/puntos activos/)
  })

  it('lista las zonas sin coordenadas en la bandeja "sin ubicar"', async () => {
    render(<MapaCampus />)
    expect(await screen.findByText(/Zonas sin ubicar en el mapa \(1\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aulas del Centro de Cultura Física' })).toBeInTheDocument()
  })
})
