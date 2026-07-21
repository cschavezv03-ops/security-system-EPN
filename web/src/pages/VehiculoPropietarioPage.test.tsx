import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const { rpcHechas, navegar } = vi.hoisted(() => ({
  rpcHechas: [] as { nombre: string; args: Record<string, unknown> }[],
  navegar: vi.fn(),
}))

vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => navegar,
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (nombre: string, args: Record<string, unknown>) => {
      rpcHechas.push({ nombre, args })
      return Promise.resolve({ data: {}, error: null })
    },
  },
  mensajeError: (e: { message?: string }) => e?.message ?? 'Error',
}))

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    perfil: { id_usuario: 'u-gpi' },
    tiene: () => true,
  }),
}))

vi.mock('../components/BuscarPersonaPorCedula', () => ({
  BuscarPersonaPorCedula: ({ onSelect }: { onSelect: (p: unknown) => void }) => (
    <button
      type="button"
      onClick={() => onSelect({
        id_persona: 'p-interna', nombres: 'Cecilia', apellidos: 'Paredes', cedula: '1750000232',
      })}
    >
      seleccionar propietario
    </button>
  ),
}))

const { VehiculoPropietarioPage } = await import('./VehiculoPropietarioPage')
const { ToastProvider } = await import('../components/ui')

function montar() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <VehiculoPropietarioPage />
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  rpcHechas.length = 0
  navegar.mockClear()
})

describe('alta atómica de vehículo y propietario', () => {
  it('no llama la RPC sin la Fecha de fin obligatoria', async () => {
    const usuario = userEvent.setup()
    montar()

    await usuario.click(screen.getByRole('button', { name: /seleccionar propietario/i }))
    await usuario.type(screen.getByLabelText(/^Placa/i), 'ABC-1234')
    await usuario.click(screen.getByRole('button', { name: /Registrar vehículo y asociar/i }))

    expect(await screen.findByText(/Ingrese la fecha de fin de la relación/i)).toBeInTheDocument()
    expect(rpcHechas).toHaveLength(0)
  })

  it('envía p_fecha_fin a crear_vehiculo_con_propietario', async () => {
    const usuario = userEvent.setup()
    montar()

    await usuario.click(screen.getByRole('button', { name: /seleccionar propietario/i }))
    await usuario.type(screen.getByLabelText(/^Placa/i), 'ABC-1234')
    await usuario.type(screen.getByLabelText(/Fecha de fin/i), '2026-12-31')
    await usuario.click(screen.getByRole('button', { name: /Registrar vehículo y asociar/i }))

    await waitFor(() => expect(rpcHechas).toHaveLength(1))
    expect(rpcHechas[0]).toMatchObject({
      nombre: 'crear_vehiculo_con_propietario',
      args: {
        p_id_persona: 'p-interna',
        p_tipo_vehiculo: 'AUTOMOVIL',
        p_fecha_fin: expect.stringContaining('2026-12-31'),
      },
    })
  })
})
