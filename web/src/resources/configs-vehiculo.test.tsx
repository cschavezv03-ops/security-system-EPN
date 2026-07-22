import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

/**
 * Vehículos: un vehículo no puede quedar sin propietario, y vincular una persona funciona.
 *
 * Dos fallos que reportó el equipo desde la pantalla de Vehículos:
 *  1. "Registrar Vehículo" abría el formulario genérico, que insertaba la fila de vehículo sola
 *     y dejaba vehículos huérfanos. El alta debe ir a la pantalla que crea vehículo + propietario
 *     en una sola transacción (`/vehiculos/nuevo`).
 *  2. Al vincular una persona a un vehículo salía "Falta completar un dato obligatorio" sin decir
 *     cuál: el INSERT no enviaba `id_usuario_registro` (NOT NULL en persona_vehiculo).
 */

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}))

const { supabase, insertsPersonaVehiculo, rpc, filas } = vi.hoisted(() => {
  const insertsPersonaVehiculo: Record<string, unknown>[] = []
  // Por defecto, la persona elegida no tiene ningún memorando que ampare el vehículo.
  const rpc = vi.fn(
    (): Promise<{ data: Record<string, unknown>[]; error: null }> =>
      Promise.resolve({ data: [], error: null }),
  )
  const filas: Record<string, Record<string, unknown>[]> = {
    vehiculo: [
      {
        id_vehiculo: 'v-1', placa: 'PDF1234', tipo_vehiculo: 'AUTOMOVIL', marca: 'Hyundai', modelo: 'Tucson',
        color: 'Gris', estado_vehiculo: 'ACTIVO', fecha_registro: '2026-07-20T00:00:00Z', relaciones: [],
      },
    ],
    persona_vehiculo: [],
  }
  const cadena = (tabla: string) => {
    const chain: Record<string, unknown> = {}
    const mismo = () => chain
    Object.assign(chain, {
      select: mismo, eq: mismo, neq: mismo, gte: mismo, order: mismo, ilike: mismo, in: mismo, limit: mismo,
      maybeSingle: () => Promise.resolve({ data: (filas[tabla] ?? [])[0] ?? null, error: null }),
      insert: (v: Record<string, unknown>) => {
        if (tabla === 'persona_vehiculo') insertsPersonaVehiculo.push(v)
        return Promise.resolve({ error: null })
      },
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      then: (r: (x: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: filas[tabla] ?? [], error: null }).then(r),
    })
    return chain
  }
  return {
    insertsPersonaVehiculo,
    rpc,
    filas,
    supabase: { from: (t: string) => cadena(t), rpc },
  }
})

vi.mock('../lib/supabase', () => ({
  supabase,
  fromTable: (t: string) => supabase.from(t),
  mensajeError: (e: { message?: string }) => e?.message ?? 'Error',
}))

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ tiene: () => true, session: { user: { id: 'u-adm-777' } }, modulos: ['ADM'] }),
}))

// La búsqueda de persona por cédula se sustituye por un botón que devuelve una persona fija:
// así la prueba del vínculo no depende del flujo de tecleo de la cédula.
vi.mock('../components/BuscarPersonaPorCedula', () => ({
  BuscarPersonaPorCedula: ({ onSelect }: { onSelect: (p: unknown) => void }) => (
    <button type="button" onClick={() => onSelect({ id_persona: 'p-99', nombres: 'Renato', apellidos: 'Aguilar', cedula: '1729307098' })}>
      elegir persona
    </button>
  ),
}))

const { ResourceScreen } = await import('../components/ResourceScreen')
const { AsociacionesVehiculo } = await import('../components/AsociacionesVehiculo')
const { ToastProvider } = await import('../components/ui')
const { cfgVehiculo } = await import('./configs')

const envolver = (ui: React.ReactNode) => render(<MemoryRouter><ToastProvider>{ui}</ToastProvider></MemoryRouter>)

beforeEach(() => {
  window.localStorage.clear()
  mockNavigate.mockClear()
  insertsPersonaVehiculo.length = 0
  filas.persona_vehiculo = []
  rpc.mockImplementation(() => Promise.resolve({ data: [], error: null }))
})
afterEach(() => vi.clearAllMocks())

describe('vehículos: el alta exige propietario (RF-CA-018)', () => {
  it('"Registrar Vehículo" lleva a la pantalla de alta con propietario, no al formulario suelto', async () => {
    const usuario = userEvent.setup()
    envolver(<ResourceScreen config={cfgVehiculo('ADM')} />)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Veh/i }))

    // Navega a la pantalla atómica de alta con propietario en vez de abrir el formulario genérico.
    // El módulo viaja en la ruta: decide entre qué población se busca al propietario.
    expect(mockNavigate).toHaveBeenCalledWith('/vehiculos/nuevo?modulo=ADM')
    // El formulario genérico no llegó a abrirse: su campo "Marca" no está en pantalla.
    expect(screen.queryByLabelText(/Marca/i)).not.toBeInTheDocument()
  })
})

describe('vehículos: vincular una persona (vigencia e id_usuario_registro)', () => {
  it('exige Fecha de fin y la incluye junto al usuario registrador', async () => {
    const usuario = userEvent.setup()
    envolver(<AsociacionesVehiculo idVehiculo="v-1" onCambio={async () => {}} modulo="ADM" />)

    await usuario.click(await screen.findByRole('button', { name: /Vincular persona/i }))
    await usuario.click(await screen.findByRole('button', { name: /elegir persona/i }))
    await usuario.click(screen.getByRole('button', { name: /^Vincular$/i }))

    expect(await screen.findByText(/Ingrese la fecha de fin de la relación/i)).toBeInTheDocument()
    expect(insertsPersonaVehiculo).toHaveLength(0)

    await usuario.type(screen.getByLabelText(/Fecha de fin/i), '2026-12-31')
    await usuario.click(screen.getByRole('button', { name: /^Vincular$/i }))

    await waitFor(() => expect(insertsPersonaVehiculo.length).toBe(1))
    const payload = insertsPersonaVehiculo[0]
    expect(payload).toMatchObject({
      id_persona: 'p-99',
      id_vehiculo: 'v-1',
      fecha_fin: '2026-12-31',
      id_usuario_registro: 'u-adm-777',
    })
  })
})

describe('GPE: la vigencia de la asociación la manda el memorando', () => {
  it('rellena y bloquea las fechas con las del memorando que ampara a la persona con ese vehículo', async () => {
    const usuario = userEvent.setup()
    rpc.mockImplementation(() =>
      Promise.resolve({
        data: [{
          id_memorando: 'm-1',
          numero_memorando: 'EPN-DA-2026-002-M',
          fecha_inicio: '2026-07-21',
          fecha_fin: '2026-07-22',
        }],
        error: null,
      }),
    )

    envolver(<AsociacionesVehiculo idVehiculo="v-1" onCambio={async () => {}} modulo="GPE" />)
    await usuario.click(await screen.findByRole('button', { name: /Vincular persona/i }))
    await usuario.click(await screen.findByRole('button', { name: /elegir persona/i }))

    // La pantalla dice de dónde salen las fechas: sin eso, unos campos bloqueados sin
    // explicación parecen un fallo.
    expect(await screen.findByText(/entra amparado por el memorando/i)).toBeInTheDocument()
    expect(screen.getAllByText(/EPN-DA-2026-002-M/).length).toBeGreaterThan(0)

    const inicio = screen.getByLabelText(/Fecha de inicio/i) as HTMLInputElement
    const fin = screen.getByLabelText(/Fecha de fin/i) as HTMLInputElement
    await waitFor(() => expect(inicio.value).toBe('2026-07-21'))
    expect(fin.value).toBe('2026-07-22')
    expect(inicio).toBeDisabled()
    expect(fin).toBeDisabled()

    await usuario.click(screen.getByRole('button', { name: /^Vincular$/i }))

    await waitFor(() => expect(insertsPersonaVehiculo.length).toBe(1))
    expect(insertsPersonaVehiculo[0]).toMatchObject({
      fecha_inicio: '2026-07-21',
      fecha_fin: '2026-07-22',
    })
  })

  it('sin memorando que ampare al par persona-vehículo, las fechas se siguen tecleando', async () => {
    const usuario = userEvent.setup()
    envolver(<AsociacionesVehiculo idVehiculo="v-1" onCambio={async () => {}} modulo="GPE" />)

    await usuario.click(await screen.findByRole('button', { name: /Vincular persona/i }))
    await usuario.click(await screen.findByRole('button', { name: /elegir persona/i }))

    await waitFor(() => expect(screen.getByLabelText(/Fecha de fin/i)).not.toBeDisabled())
    expect(screen.queryByText(/amparado por el memorando/i)).not.toBeInTheDocument()
  })
})

describe('cada módulo asocia vehículos a su propia población', () => {
  it('GPE no ofrece vincular en un vehículo que ya es de personal interno', async () => {
    filas.persona_vehiculo = [{
      id_persona_vehiculo: 'pv-1', tipo_relacion: 'PROPIETARIO', estado_relacion: 'ACTIVA',
      fecha_inicio: '2026-07-20', fecha_fin: '2026-12-31', es_responsable_tramite: false,
      persona: { nombres: 'Cecilia', apellidos: 'Jaramillo', cedula: '1756814032', tipo_persona: 'INTERNA' },
    }]

    envolver(<AsociacionesVehiculo idVehiculo="v-1" onCambio={async () => {}} modulo="GPE" />)

    expect(await screen.findByText(/se gestionan desde Personal Interno/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Vincular persona/i })).not.toBeInTheDocument()
  })
})
