import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Biometría (GPI): borrar un enrolamiento que salió mal.
 *
 * Feedback del equipo: cuando la captura sale mal hay que poder quitarla, y eso tiene que
 * borrar la foto de Storage. La fila NO se elimina físicamente (principio del proyecto): se
 * desactiva (vigente=false), que es lo que corta el acceso, y la foto se borra del bucket.
 */

const { supabase, updates, removed } = vi.hoisted(() => {
  const updates: { vals: Record<string, unknown>; id: string }[] = []
  const removed: string[][] = []
  const PERSONAS = [
    {
      id_persona: 'p-1', nombres: 'Frank', apellidos: 'Jumbo', cedula: '1750000208',
      registro_biometrico: [{ id_registro: 'rb-1', vigente: true, path_storage: 'registro-biometrico/p-1/123.jpg' }],
    },
    { id_persona: 'p-2', nombres: 'Lenin', apellidos: 'Amangandi', cedula: '1750000117', registro_biometrico: [] },
  ]
  const from = (tabla: string) => {
    if (tabla === 'persona') {
      const chain: Record<string, unknown> = {}
      Object.assign(chain, { select: () => chain, eq: () => chain, order: () => Promise.resolve({ data: PERSONAS, error: null }) })
      return chain
    }
    if (tabla === 'registro_biometrico') {
      return { update: (vals: Record<string, unknown>) => ({ eq: (_c: string, id: string) => { updates.push({ vals, id }); return Promise.resolve({ error: null }) } }) }
    }
    return {}
  }
  const storage = { from: () => ({ remove: (paths: string[]) => { removed.push(paths); return Promise.resolve({ error: null }) } }) }
  return { updates, removed, supabase: { from, storage, rpc: () => Promise.resolve({ error: null }) } }
})

vi.mock('../../lib/supabase', () => ({
  supabase,
  mensajeError: (e: { message?: string }) => e?.message ?? 'Error',
}))
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ tiene: () => true }) }))
// La cámara arrastra face-api (pesado y con getUserMedia): se sustituye por un panel vacío.
vi.mock('../../components/Camera', () => ({ CameraPanel: () => <div data-testid="camara" /> }))

const { BiometriaScreen } = await import('./BiometriaScreen')
const { ToastProvider } = await import('../../components/ui')

const montar = () => render(<ToastProvider><BiometriaScreen /></ToastProvider>)

beforeEach(() => { updates.length = 0; removed.length = 0 })
afterEach(() => vi.clearAllMocks())

describe('biometría: borrar un enrolamiento', () => {
  it('elige a la persona mediante búsqueda por cédula y no mediante un combo', async () => {
    montar()

    expect(await screen.findByRole('textbox', { name: /Cédula de la persona interna/i })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /Persona interna/i })).not.toBeInTheDocument()
  })

  it('desactiva la fila (no la borra) y elimina la foto del bucket, sin el prefijo del bucket', async () => {
    const usuario = userEvent.setup()
    montar()

    const fila = (await screen.findByText('Jumbo Frank')).closest('tr')!
    expect(within(fila).getByText(/Activa/i)).toBeInTheDocument()

    await usuario.click(within(fila).getByRole('button', { name: /Borrar el enrolamiento de Jumbo Frank/i }))
    await usuario.click(await screen.findByRole('button', { name: /^Borrar enrolamiento$/i }))

    await waitFor(() => expect(updates.length).toBe(1))
    // La fila se DESACTIVA (vigente=false), no se elimina físicamente.
    expect(updates[0]).toEqual({ vals: { vigente: false }, id: 'rb-1' })
    // La foto se borra de Storage con la ruta SIN el prefijo del bucket.
    expect(removed).toEqual([['p-1/123.jpg']])
  })

  it('una persona sin enrolar no ofrece el botón de borrar', async () => {
    montar()
    const fila = (await screen.findByText('Amangandi Lenin')).closest('tr')!
    expect(within(fila).getByText(/Sin enrolar/i)).toBeInTheDocument()
    expect(within(fila).queryByRole('button', { name: /Borrar/i })).not.toBeInTheDocument()
  })
})
