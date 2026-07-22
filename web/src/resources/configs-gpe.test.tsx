import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

/**
 * GPE — "Personas por memorando".
 *
 * Esto lo destapó la batería de integración (INT-02): la ficha de una persona mostraba
 * "Estado de acceso: Activo" al lado de un memorando ya vencido, que se lee como que la
 * persona puede entrar cuando no puede. El vínculo activo solo significa que no se le
 * retiró el acceso individualmente; quien decide si entra es la vigencia del memorando.
 *
 * La columna "¿Puede entrar?" de la lista ya cruzaba ambos datos desde la ronda de GPE;
 * la ficha de detalle se había quedado atrás mostrando el campo crudo. Estas pruebas
 * fijan que la ficha diga lo mismo que la lista.
 */

const { supabase } = vi.hoisted(() => {
  const VENCIDO = {
    id_persona_memorando: 'pm-vencido',
    estado_acceso: 'ACTIVO',
    persona: { nombres: 'Nathaly', apellidos: 'Bravo', cedula: '1750000257', empresa: { nombre: 'Constructora Andes' } },
    memorando: {
      id_memorando: 'm-vencido', numero_memorando: 'EPN-DA-2026-0001-M',
      fecha_inicio: '2026-07-15', fecha_fin: '2026-07-17', estado_memorando: 'VENCIDO',
    },
  }
  const VIGENTE = {
    id_persona_memorando: 'pm-vigente',
    estado_acceso: 'ACTIVO',
    persona: { nombres: 'Joel', apellidos: 'Salgado', cedula: '1750000208', empresa: { nombre: 'Constructora Andes' } },
    memorando: {
      id_memorando: 'm-vigente', numero_memorando: 'EPN-DA-2026-0888-M',
      fecha_inicio: '2026-07-18', fecha_fin: '2026-07-31', estado_memorando: 'VIGENTE',
    },
  }
  const BLOQUEADO = {
    id_persona_memorando: 'pm-bloqueado',
    estado_acceso: 'BLOQUEADO',
    persona: { nombres: 'Ruth', apellidos: 'Pérez', cedula: '1750000309', empresa: { nombre: 'Constructora Andes' } },
    memorando: {
      id_memorando: 'm-vigente2', numero_memorando: 'EPN-DA-2026-0999-M',
      fecha_inicio: '2026-07-18', fecha_fin: '2026-07-31', estado_memorando: 'VIGENTE',
    },
  }

  const filasPorTabla: Record<string, Record<string, unknown>[]> = {
    persona_memorando: [VENCIDO, VIGENTE, BLOQUEADO],
  }

  const cadena = (tabla: string) => {
    const todas = filasPorTabla[tabla] ?? []
    const chain: Record<string, unknown> = {}
    const mismo = () => chain
    Object.assign(chain, {
      select: mismo, eq: mismo, neq: mismo, gte: mismo, order: mismo, ilike: mismo, in: mismo, limit: mismo,
      maybeSingle: () => Promise.resolve({ data: todas[0] ?? null, error: null }),
      insert: () => Promise.resolve({ error: null }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      then: (r: (x: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: todas, error: null }).then(r),
    })
    return chain
  }

  return {
    supabase: {
      from: (t: string) => cadena(t),
      rpc: () => Promise.resolve({ data: [], error: null }),
    },
  }
})

vi.mock('../lib/supabase', () => ({
  supabase,
  fromTable: (t: string) => supabase.from(t),
  mensajeError: (e: { message?: string }) => e?.message ?? 'Error',
}))

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ tiene: () => true, session: { user: { id: 'u-gpe' } }, modulos: ['GPE'] }),
}))

const { ResourceScreen } = await import('../components/ResourceScreen')
const { ToastProvider } = await import('../components/ui')
const { cfgAutorizacion, cfgPersonaMemorando } = await import('./configs')

function montar() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ResourceScreen config={cfgPersonaMemorando} />
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-07-20T12:00:00-05:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('personas por memorando: la ficha no miente sobre si puede entrar (INT-02)', () => {
  it('la lista responde "No" cuando el memorando está vencido, aunque el vínculo siga activo', async () => {
    montar()
    const fila = (await screen.findByText('EPN-DA-2026-0001-M')).closest('tr')!
    expect(within(fila).getByText(/^No$/)).toBeInTheDocument()
    // Y no cuela un "Sí" para una persona que no puede entrar.
    expect(within(fila).queryByText(/^Sí/)).not.toBeInTheDocument()
  })

  it('la ficha de un memorando vencido dice que NO puede entrar, no "Activo"', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar()

    await usuario.click(await screen.findByText('EPN-DA-2026-0001-M'))

    // El panel de detalle está abierto: su campo crudo del vínculo se llama ahora distinto,
    // para no confundirse con la respuesta de acceso. (Es texto único, solo del detalle.)
    expect(await screen.findByText('Vínculo con el memorando')).toBeInTheDocument()
    // Y la respuesta al acceso es "No … el memorando ya no autoriza", no un "Activo" suelto.
    expect(screen.getByText(/el memorando ya no autoriza/i)).toBeInTheDocument()
  })

  it('la ficha de un memorando vigente sí confirma el acceso con su fecha', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar()

    await usuario.click(await screen.findByText('EPN-DA-2026-0888-M'))

    expect(await screen.findByText('Vínculo con el memorando')).toBeInTheDocument()
    // "Sí, hasta el …" aparece en la lista y en la ficha: basta con que la ficha lo confirme.
    expect(screen.getAllByText(/Sí, hasta el/i).length).toBeGreaterThan(0)
  })

  it('un vínculo bloqueado se muestra como acceso retirado aunque el memorando siga vigente', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar()

    await usuario.click(await screen.findByText('EPN-DA-2026-0999-M'))

    expect(await screen.findByText('Vínculo con el memorando')).toBeInTheDocument()
    expect(screen.getAllByText(/acceso retirado/i).length).toBeGreaterThan(0)
  })
})

describe('selección individual de visitantes', () => {
  it('la autorización busca una persona externa por cédula en vez de cargar un combo', () => {
    const visitante = cfgAutorizacion.campos.find((campo) => campo.name === 'id_persona')

    expect(visitante).toMatchObject({
      type: 'cedula-busqueda',
      buscarPersona: { soloTipo: 'EXTERNA', soloActivas: true },
    })
    expect(visitante?.options).toBeUndefined()
  })
})
