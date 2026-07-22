import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * El buscador por cédula es la puerta por la que se eligen personas en casi todo el sistema, y
 * es también donde se separan las dos poblaciones: GPI trabaja con personal interno y GPE con
 * personal externo (§D20). Sin `soloTipo`, desde Personal Interno se podía terminar asociando el
 * vehículo de un docente a un visitante, y al revés.
 *
 * La regla vive además en la base (trigger `validar_ambito_persona_vehiculo`); esta prueba cubre
 * que la pantalla lo diga antes, y con un mensaje que explique qué pasó.
 */

const { supabase, persona } = vi.hoisted(() => {
  const persona = {
    id_persona: 'p-1', cedula: '1729307098', correo: 'renato.aguilar@epn.edu.ec',
    nombres: 'Renato André', apellidos: 'Aguilar Calderón',
    tipo_persona: 'INTERNA', estado: 'ACTIVO', categoria: { codigo_categoria: 'ADMINISTRATIVO' },
  }
  return {
    persona,
    supabase: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: persona, error: null }) }) }),
      }),
    },
  }
})

vi.mock('../lib/supabase', () => ({
  supabase,
  mensajeError: (e: { message?: string }) => e?.message ?? 'Error',
}))

const { BuscarPersonaPorCedula } = await import('./BuscarPersonaPorCedula')

const buscar = async (cedula: string) => {
  const usuario = userEvent.setup()
  await usuario.type(screen.getByPlaceholderText(/Número de cédula/i), cedula)
  await usuario.click(screen.getByRole('button', { name: /Buscar/i }))
}

describe('BuscarPersonaPorCedula: cada módulo ve solo a su población', () => {
  beforeEach(() => vi.clearAllMocks())

  it('en un ámbito de personal externo, rechaza una cédula de personal interno', async () => {
    const onSelect = vi.fn()
    render(<BuscarPersonaPorCedula onSelect={onSelect} soloTipo="EXTERNA" />)

    await buscar(persona.cedula)

    expect(await screen.findByText(/personal externo.*personal interno/i)).toBeInTheDocument()
    // No basta con avisar: la persona no queda seleccionada, así que no hay nada que vincular.
    expect(onSelect).toHaveBeenCalledWith(null)
    expect(screen.queryByText(/Renato André/)).not.toBeInTheDocument()
  })

  it('en su propio ámbito, la persona se selecciona con normalidad', async () => {
    const onSelect = vi.fn()
    render(<BuscarPersonaPorCedula onSelect={onSelect} soloTipo="INTERNA" />)

    await buscar(persona.cedula)

    expect(await screen.findByText(/Renato André/)).toBeInTheDocument()
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id_persona: 'p-1' }))
  })
})
