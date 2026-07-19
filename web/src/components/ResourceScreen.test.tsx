import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

/**
 * Comportamiento del motor de pantallas, con los tres cambios que pidieron GPE y GPI:
 *
 *  - Campos que aparecen y desaparecen según la categoría elegida (GPI: "los campos de la
 *    interfaz deben ser dinámicos ... habrá campos que serán bloqueados").
 *  - El estado del memorando, en gris y calculado (GPE §6).
 *  - Confirmación antes de tocar un dato sensible (GPE §5).
 *
 * Y la persistencia del borrador, que hasta ahora solo tenía el alta de usuarios.
 */

// `vi.hoisted` se eleva por encima de cualquier constante del módulo, así que los datos que
// use el mock tienen que declararse dentro.
const { supabase, insertsHechos, updatesHechos } = vi.hoisted(() => {
  const insertsHechos: unknown[] = []
  const updatesHechos: unknown[] = []

  const MEMORANDO_VENCIDO = {
    id_memorando: 'm-1',
    numero_memorando: 'EPN-DA-2026-0001-M',
    id_empresa: 'e-1',
    fecha_inicio: '2026-07-15',
    // Vencido respecto a la fecha simulada (18/07). La columna sigue diciendo VIGENTE, que es
    // justo el estado desincronizado que reportó el equipo.
    fecha_fin: '2026-07-17',
    estado_memorando: 'VIGENTE',
    dependencia_autorizada: null,
    empresa: { nombre: 'Servicios Integrales S.A.' },
  }

  const filasPorTabla: Record<string, unknown[]> = {
    memorando: [MEMORANDO_VENCIDO],
    categoria_persona: [
      { id_categoria: 'c-est', codigo_categoria: 'ESTUDIANTE', ambito: 'INTERNA', estado: 'ACTIVO' },
      { id_categoria: 'c-doc', codigo_categoria: 'DOCENTE', ambito: 'INTERNA', estado: 'ACTIVO' },
      { id_categoria: 'c-emp', codigo_categoria: 'EMPRESA_SERVICIO', ambito: 'INTERNA', estado: 'ACTIVO' },
    ],
    empresa: [{ id_empresa: 'e-1', nombre: 'Servicios Integrales S.A.', estado: 'ACTIVO' }],
    persona: [],
  }

  const cadena = (tabla: string) => {
    const todas = filasPorTabla[tabla] ?? []
    // Los `.eq()` se aplican de verdad. Con un mock que los ignorase, `maybeSingle()` devolvería
    // siempre la primera fila y la categoría derivada sería la misma eligiera lo que eligiera el
    // usuario: la prueba de campos dinámicos pasaría sin comprobar nada.
    const filtros: [string, unknown][] = []
    const filtradas = () =>
      todas.filter((f) => filtros.every(([col, val]) => (f as Record<string, unknown>)[col] === val))

    const chain: Record<string, unknown> = {}
    const mismo = () => chain
    Object.assign(chain, {
      select: mismo,
      eq: (col: string, val: unknown) => {
        filtros.push([col, val])
        return chain
      },
      neq: mismo,
      gte: mismo,
      order: mismo,
      maybeSingle: () => Promise.resolve({ data: filtradas()[0] ?? null, error: null }),
      insert: (v: unknown) => {
        insertsHechos.push({ tabla, valores: v })
        return Promise.resolve({ error: null })
      },
      update: (v: unknown) => {
        updatesHechos.push({ tabla, valores: v })
        return { eq: () => Promise.resolve({ error: null }) }
      },
      then: (resolver: (r: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: filtradas(), error: null }).then(resolver),
    })
    return chain
  }

  return {
    insertsHechos,
    updatesHechos,
    supabase: {
      from: (tabla: string) => cadena(tabla),
      rpc: () => Promise.resolve({ data: [], error: null }),
    },
  }
})

vi.mock('../lib/supabase', () => ({
  supabase,
  fromTable: (tabla: string) => supabase.from(tabla),
  mensajeError: (e: { message?: string }) => e?.message ?? 'Error',
}))

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    tiene: () => true,
    session: { user: { id: 'u-test' } },
    modulos: ['ADM', 'GPI', 'GPE'],
  }),
}))

const { ResourceScreen } = await import('./ResourceScreen')
const { ToastProvider } = await import('./ui')
const { cfgMemorando } = await import('../resources/configs')
const { cfgPersonaInterna } = await import('../resources/configs-gpi')

function montar(config: Parameters<typeof ResourceScreen>[0]['config']) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ResourceScreen config={config} />
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  insertsHechos.length = 0
  updatesHechos.length = 0
  // La fecha se fija para que "vencido" signifique siempre lo mismo: el memorando de prueba
  // caducó el 17/07 y aquí es 18/07. `shouldAdvanceTime` deja que el reloj corra igualmente,
  // porque el borrador se guarda con debounce y con timers congelados no llegaría a escribirse.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-07-18T09:00:00-05:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('formulario dinámico según la categoría (GPI)', () => {
  it('el código único solo aparece para estudiantes', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPersonaInterna)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Persona interna/i }))

    // Sin categoría elegida todavía, no hay razón para pedir un código de matrícula.
    expect(screen.queryByRole('textbox', { name: /Código único/i })).not.toBeInTheDocument()

    await usuario.selectOptions(screen.getByRole('combobox', { name: /^Categoría/i }), 'c-est')
    await waitFor(() => expect(screen.getByRole('textbox', { name: /Código único/i })).toBeInTheDocument())

    // Al pasar a docente el campo desaparece: "para el resto de personas este campo permanece
    // bloqueado".
    await usuario.selectOptions(screen.getByRole('combobox', { name: /^Categoría/i }), 'c-doc')
    await waitFor(() => expect(screen.queryByRole('textbox', { name: /Código único/i })).not.toBeInTheDocument())
  })

  it('la empresa solo se pide al personal de empresas de servicio', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPersonaInterna)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Persona interna/i }))
    await usuario.selectOptions(screen.getByRole('combobox', { name: /^Categoría/i }), 'c-doc')
    await waitFor(() => expect(screen.queryByRole('combobox', { name: /Empresa a la que pertenece/i })).not.toBeInTheDocument())

    await usuario.selectOptions(screen.getByRole('combobox', { name: /^Categoría/i }), 'c-emp')
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Empresa a la que pertenece/i })).toBeInTheDocument())
  })

  it('el sexo es obligatorio para cualquier persona interna', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPersonaInterna)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Persona interna/i }))
    await usuario.selectOptions(screen.getByRole('combobox', { name: /^Categoría/i }), 'c-doc')
    await usuario.type(screen.getByRole('textbox', { name: /Cédula/i }), '1750000232')
    await usuario.type(screen.getByRole('textbox', { name: /^Nombres/i }), 'Cecilia')
    await usuario.type(screen.getByRole('textbox', { name: /^Apellidos/i }), 'Paredes')
    await usuario.type(screen.getByRole('textbox', { name: /^Correo\s*\*?$/i }), 'cecilia.paredes@epn.edu.ec')

    await usuario.click(screen.getByRole('button', { name: 'Registrar' }))

    expect(await screen.findByText(/El campo "Sexo" es obligatorio/i)).toBeInTheDocument()
    expect(insertsHechos).toHaveLength(0)
  })
})

describe('estado del memorando (GPE §6)', () => {
  it('al editar, el estado se muestra en gris y con el valor real, no el guardado', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgMemorando)

    await usuario.click(await screen.findByText('EPN-DA-2026-0001-M'))
    await usuario.click(await screen.findByRole('button', { name: /Editar/i }))

    const estado = await screen.findByRole('textbox', { name: /^Estado/i })
    // La columna dice VIGENTE; la pantalla debe decir la verdad.
    expect(estado).toHaveValue('Vencido')
    expect(estado).toBeDisabled()
  })

  it('el número de memorando se teclea a mano y se valida', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgMemorando)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Memorando/i }))

    const numero = screen.getByRole('textbox', { name: /Número de memorando/i })
    // Antes venía relleno por un generador y no se podía tocar.
    expect(numero).toHaveValue('')
    expect(numero).toBeEnabled()

    await usuario.type(numero, 'MEMORANDO')
    await usuario.click(screen.getByRole('button', { name: 'Registrar' }))

    expect((await screen.findAllByText(/al menos un dígito/i)).length).toBeGreaterThan(0)
    expect(insertsHechos).toHaveLength(0)
  })
})

describe('cambios en datos sensibles (GPE §5)', () => {
  it('pide confirmación mostrando el antes y el después', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgMemorando)

    await usuario.click(await screen.findByText('EPN-DA-2026-0001-M'))
    await usuario.click(await screen.findByRole('button', { name: /Editar/i }))

    const fechaFin = await screen.findByLabelText(/Fin de vigencia/i)
    await usuario.clear(fechaFin)
    await usuario.type(fechaFin, '2026-08-31')
    await usuario.click(screen.getByRole('button', { name: /Guardar cambios/i }))

    // Nada se ha escrito todavía: primero hay que confirmar.
    expect(await screen.findByText(/Confirmar cambios en datos sensibles/i)).toBeInTheDocument()
    expect(screen.getByText('2026-07-17')).toBeInTheDocument()
    expect(screen.getByText('2026-08-31')).toBeInTheDocument()
    expect(updatesHechos).toHaveLength(0)

    await usuario.click(screen.getByRole('button', { name: /Sí, guardar los cambios/i }))
    await waitFor(() => expect(updatesHechos).toHaveLength(1))
  })

  it('cancelar la confirmación no guarda nada', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgMemorando)

    await usuario.click(await screen.findByText('EPN-DA-2026-0001-M'))
    await usuario.click(await screen.findByRole('button', { name: /Editar/i }))

    const fechaFin = await screen.findByLabelText(/Fin de vigencia/i)
    await usuario.clear(fechaFin)
    await usuario.type(fechaFin, '2026-08-31')
    await usuario.click(screen.getByRole('button', { name: /Guardar cambios/i }))

    await usuario.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(updatesHechos).toHaveLength(0)
  })
})

describe('persistencia del formulario', () => {
  it('recupera lo escrito si se abandona el alta a medias', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { unmount } = montar(cfgMemorando)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Memorando/i }))
    await usuario.type(screen.getByRole('textbox', { name: /Número de memorando/i }), 'EPN-DA-2026-0099-M')

    // El borrador se guarda con debounce; sin esperar, no habría llegado a localStorage.
    await waitFor(
      () => expect(window.localStorage.getItem('epn.borrador:u-test:memorando:nuevo')).not.toBeNull(),
      { timeout: 2000 },
    )
    unmount()

    // Vuelve a entrar: la pantalla ofrece recuperar el registro sin terminar.
    const usuario2 = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgMemorando)
    await usuario2.click(await screen.findByRole('button', { name: /Registrar Memorando/i }))

    await usuario2.click(await screen.findByRole('button', { name: /Recuperarlo/i }))
    expect(screen.getByRole('textbox', { name: /Número de memorando/i })).toHaveValue('EPN-DA-2026-0099-M')
  })

  it('no guarda nada si el usuario solo abre el formulario y se va', async () => {
    // Antes bastaba con abrir "Registrar" y esperar un segundo para dejar un borrador con los
    // valores por defecto. A partir de ahí el aviso "tienes un registro sin terminar" salía
    // siempre, aunque nunca se hubiera escrito nada, y dejaba de significar algo.
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgMemorando)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Memorando/i }))
    await new Promise((r) => setTimeout(r, 1500))

    expect(window.localStorage.getItem('epn.borrador:u-test:memorando:nuevo')).toBeNull()
  })

  it('"Empezar de cero" descarta el borrador guardado', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { unmount } = montar(cfgMemorando)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Memorando/i }))
    await usuario.type(screen.getByRole('textbox', { name: /Número de memorando/i }), 'EPN-DA-2026-0099-M')
    await waitFor(
      () => expect(window.localStorage.getItem('epn.borrador:u-test:memorando:nuevo')).not.toBeNull(),
      { timeout: 2000 },
    )
    unmount()

    const usuario2 = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgMemorando)
    await usuario2.click(await screen.findByRole('button', { name: /Registrar Memorando/i }))
    await usuario2.click(await screen.findByRole('button', { name: /Empezar de cero/i }))

    expect(window.localStorage.getItem('epn.borrador:u-test:memorando:nuevo')).toBeNull()
    expect(screen.getByRole('textbox', { name: /Número de memorando/i })).toHaveValue('')
  })
})
