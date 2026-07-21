import { describe, expect, it, vi } from 'vitest'

/**
 * "Reactivar" personal (GPI/GPE) — simétrico con "Dar de baja".
 *
 * Reportado en pruebas: el backend permite que GPI/GPE reactiven a su propio personal
 * (RLS ya lo autoriza vía GPI_PERSONA_UPDATE / GPE_PERSONA_UPDATE; solo una persona con rol
 * de Responsable/Director/Administrador queda protegida, y eso lo aplica el trigger
 * proteger_personal_privilegiado, no el frontend). Lo que faltaba era que el botón
 * "Reactivar" existiera en la ficha — `ResourceScreen` ya sabe pintarlo (mismo patrón que
 * zona/regla_acceso), solo necesitaba `config.reactivar` en persona.
 */

vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) },
  fromTable: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
  mensajeError: () => 'Error',
}))

const { cfgPersonaInterna } = await import('./configs-gpi')
const { cfgPersonaExterna } = await import('./configs')

describe('Personal interno (GPI) y externo (GPE): baja y reactivación', () => {
  it('GPI puede dar de baja y reactivar sobre el mismo campo de estado', () => {
    expect(cfgPersonaInterna.baja).toEqual(
      expect.objectContaining({ campoEstado: 'estado', valorBaja: 'INACTIVO' }),
    )
    expect(cfgPersonaInterna.reactivar).toEqual(expect.objectContaining({ valorActivo: 'ACTIVO' }))
  })

  it('GPE puede dar de baja y reactivar sobre el mismo campo de estado', () => {
    expect(cfgPersonaExterna.baja).toEqual(
      expect.objectContaining({ campoEstado: 'estado', valorBaja: 'INACTIVO' }),
    )
    expect(cfgPersonaExterna.reactivar).toEqual(expect.objectContaining({ valorActivo: 'ACTIVO' }))
  })
})
