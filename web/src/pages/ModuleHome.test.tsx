import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

/**
 * Navegación del módulo ADM (Requerimientos_ADM).
 *
 * El pedido "dejar este apartado únicamente con el nombre de Usuario" es una afirmación
 * sobre lo que se ve al entrar al módulo, así que se comprueba ahí: en las tarjetas.
 */

// El registro de pantallas arrastra a todo el motor de recursos, que crea el cliente de
// Supabase al importarse. Sin este mock, el import falla por falta de variables de entorno.
vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }) },
  fromTable: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
  mensajeError: (e: { message?: string }) => e?.message ?? 'Error',
}))

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    // Un administrador del sistema: ve todas las tarjetas de ADM.
    tiene: () => true,
    modulos: ['ADM', 'GPI', 'GPE', 'PCO', 'CAC'],
    rolLabel: 'Administrador del Sistema',
    perfil: { id_usuario: 'u-admin' },
  }),
}))

const { ModuleHome } = await import('./ModuleHome')

function montarModulo(codigo: string) {
  return render(
    <MemoryRouter initialEntries={[`/m/${codigo}`]}>
      <Routes>
        <Route path="/m/:codigo" element={<ModuleHome />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Módulo de Administración', () => {
  it('tiene un solo apartado de usuarios, sin "Asignaciones de rol" aparte', () => {
    montarModulo('ADM')

    expect(screen.getByRole('heading', { name: 'Usuarios' })).toBeInTheDocument()
    // La tarjeta separada obligaba a salir de Usuarios para ver el rol de una cuenta.
    expect(screen.queryByText('Asignaciones de rol')).not.toBeInTheDocument()
  })

  it('llama Auditoría a lo que antes era Bitácora', () => {
    montarModulo('ADM')

    expect(screen.getByRole('heading', { name: 'Auditoría' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Bitácora' })).not.toBeInTheDocument()
  })

  it('separa el personal interno del externo ya desde el nombre de la sección', () => {
    montarModulo('ADM')

    expect(screen.getByRole('heading', { name: 'Personal interno y externo' })).toBeInTheDocument()
  })

  it('no ofrece una tarjeta de asociaciones suelta: se gestionan desde el vehículo', () => {
    montarModulo('ADM')

    expect(screen.getByRole('heading', { name: 'Vehículos' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Asociaciones' })).not.toBeInTheDocument()
  })

  // GPI y GPE tenían su propia tarjeta "Asociaciones", a propósito: se había decidido que ahí
  // el alta de vínculos era trabajo diario y no una excepción administrativa. En esta ronda
  // ambos equipos pidieron lo contrario ("Revisar cómo está implementado el campo de Vehículo
  // y Asociaciones en ADM, debe implementarse de la misma manera en este apartado"), así que
  // la excepción desaparece y los tres módulos se comportan igual.
  it.each(['GPI', 'GPE'])('en %s las asociaciones se gestionan desde la ficha del vehículo', (modulo) => {
    montarModulo(modulo)

    expect(screen.getByRole('heading', { name: 'Vehículos' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Asociaciones' })).not.toBeInTheDocument()
  })

  it('las tarjetas describen la tarea, no cómo está construida', () => {
    // GPE §7: "Revisar que en todo este módulo no haya descripciones que no le interesan al
    // usuario final". A un guardia "Enrolamiento facial 1:N" no le dice nada.
    montarModulo('GPI')
    expect(screen.queryByText(/1:N/)).not.toBeInTheDocument()

    montarModulo('CAC')
    expect(screen.queryByText(/Categoría × punto × horario/)).not.toBeInTheDocument()
  })
})
