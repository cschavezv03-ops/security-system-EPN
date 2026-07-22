import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

/** Adónde navegó la pantalla; lo usa la prueba del alta con ruta propia. */
let navegadoA: string | null = null
vi.mock('react-router-dom', async () => {
  const real = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...real, useNavigate: () => (ruta: string) => { navegadoA = ruta } }
})

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
      { id_categoria: 'c-adm', codigo_categoria: 'ADMINISTRATIVO', ambito: 'INTERNA', estado: 'ACTIVO' },
      { id_categoria: 'c-tra', codigo_categoria: 'TRABAJADOR', ambito: 'INTERNA', estado: 'ACTIVO' },
    ],
    empresa: [{ id_empresa: 'e-1', nombre: 'Servicios Integrales S.A.', estado: 'ACTIVO' }],
    persona: [
      { id_persona: 'p-doc', nombres: 'Cecilia', apellidos: 'Paredes', cedula: '1750000232', correo: 'cecilia@epn.edu.ec', tipo_persona: 'INTERNA', estado: 'ACTIVO', categoria: { codigo_categoria: 'DOCENTE' } },
      { id_persona: 'p-est', nombres: 'Mateo', apellidos: 'Vega', cedula: '1750000240', correo: 'mateo@epn.edu.ec', tipo_persona: 'INTERNA', estado: 'ACTIVO', categoria: { codigo_categoria: 'ESTUDIANTE' } },
      { id_persona: 'p-adm', nombres: 'Ana', apellidos: 'López', cedula: '1750000257', correo: 'ana@epn.edu.ec', tipo_persona: 'INTERNA', estado: 'ACTIVO', categoria: { codigo_categoria: 'ADMINISTRATIVO' } },
      { id_persona: 'p-tra', nombres: 'Luis', apellidos: 'Mora', cedula: '1750000265', correo: 'luis@epn.edu.ec', tipo_persona: 'INTERNA', estado: 'ACTIVO', categoria: { codigo_categoria: 'TRABAJADOR' } },
      { id_persona: 'p-emp', nombres: 'Marta', apellidos: 'Paz', cedula: '1750000273', correo: 'marta@epn.edu.ec', tipo_persona: 'INTERNA', estado: 'ACTIVO', categoria: { codigo_categoria: 'EMPRESA_SERVICIO' } },
    ],
    persona_interna_detalle: [{
      id_persona: 'p-doc', unidad: 'EPN', cargo: 'Director histórico', carrera: null,
      curso: null, categoria_escalafon: 'Titular', contrato: 'FIJO', nombramiento: null,
      persona: {
        nombres: 'Cecilia', apellidos: 'Paredes', cedula: '1750000232',
        categoria: { codigo_categoria: 'DOCENTE' },
      },
    }],
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
const { cfgPersonaInterna, cfgPersonaInternaDetalle } = await import('../resources/configs-gpi')

function montar(config: Parameters<typeof ResourceScreen>[0]['config']) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ResourceScreen config={config} />
      </ToastProvider>
    </MemoryRouter>,
  )
}

async function buscarPersonaInterna(usuario: ReturnType<typeof userEvent.setup>, cedula: string) {
  const input = screen.getByRole('textbox', { name: /Cédula de la persona interna/i })
  await usuario.type(input, cedula)
  await usuario.click(screen.getByRole('button', { name: /^Buscar$/i }))
}

beforeEach(() => {
  window.localStorage.clear()
  navegadoA = null
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
  it('encuentra nombres aunque la búsqueda omita la tilde', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPersonaInterna)

    const buscar = await screen.findByPlaceholderText(/Buscar personal interno/i)
    await usuario.type(buscar, 'lopez')

    expect(await screen.findByText(/López Ana/i)).toBeInTheDocument()
    expect(screen.queryByText(/Paredes Cecilia/i)).not.toBeInTheDocument()
  })

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

  it('el combobox usa la etiqueta plural "Empresas de servicio"', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPersonaInterna)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Persona interna/i }))
    const categoria = screen.getByRole('combobox', { name: /^Categoría/i })

    expect(within(categoria).getByRole('option', { name: 'Empresas de servicio' })).toBeInTheDocument()
    expect(within(categoria).queryByRole('option', { name: 'Empresa de servicio' })).not.toBeInTheDocument()
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

describe('datos internos por perfil (últimos cambios GPI)', () => {
  it('para Administrativo, Unidad ofrece únicamente EPN', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPersonaInternaDetalle)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Detalle interno/i }))
    await buscarPersonaInterna(usuario, '1750000257')

    const unidad = await screen.findByRole('combobox', { name: /^Unidad/i })
    await waitFor(() => expect(within(unidad).getAllByRole('option').length).toBeGreaterThan(1))
    expect(within(unidad).getByRole('option', { name: 'EPN' })).toBeInTheDocument()
    expect(within(unidad).queryByRole('option', { name: 'CEC' })).not.toBeInTheDocument()
  })

  it('el detalle docente omite Cargo aunque exista como dato histórico', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPersonaInternaDetalle)

    await usuario.click(await screen.findByText('Paredes Cecilia'))
    const panel = screen.getByRole('heading', { name: 'Cecilia Paredes' }).closest('.fixed')

    expect(panel).not.toBeNull()
    expect(within(panel as HTMLElement).queryByText('Cargo', { selector: 'dt' })).not.toBeInTheDocument()
    expect(within(panel as HTMLElement).getByText('Categoría', { selector: 'dt' })).toBeInTheDocument()
    expect(within(panel as HTMLElement).queryByText('Nombramiento')).not.toBeInTheDocument()
  })

  it('el docente ve Categoría, pero no Cargo ni Nombramiento', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPersonaInternaDetalle)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Detalle interno/i }))
    expect(screen.queryByRole('combobox', { name: /Persona interna/i })).not.toBeInTheDocument()
    await buscarPersonaInterna(usuario, '1750000232')

    expect(await screen.findByText(/Cédula 1750000232 · Categoría: Docente/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('textbox', { name: /^Categoría/i })).toBeInTheDocument())
    expect(screen.queryByRole('textbox', { name: /^Cargo/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /^Nombramiento/i })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /^Contrato/i })).toBeInTheDocument()
  })

  it('habilita Curso para CEC y Carrera para EPN, limpiando el dato anterior', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPersonaInternaDetalle)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Detalle interno/i }))
    await buscarPersonaInterna(usuario, '1750000240')

    const unidad = await screen.findByRole('combobox', { name: /^Unidad/i })
    const carrera = screen.getByRole('textbox', { name: /^Carrera/i })
    const curso = screen.getByRole('textbox', { name: /^Curso/i })

    expect(carrera).toBeDisabled()
    expect(curso).toBeDisabled()

    await usuario.selectOptions(unidad, 'CEC')
    await waitFor(() => expect(curso).toBeEnabled())
    expect(carrera).toBeDisabled()
    await usuario.type(curso, 'Robótica educativa')

    await usuario.selectOptions(unidad, 'EPN')
    await waitFor(() => expect(carrera).toBeEnabled())
    expect(curso).toBeDisabled()
    expect(curso).toHaveValue('')
  })

  it('el trabajador usa Cargo y ninguna categoría laboral ofrece Nombramiento', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPersonaInternaDetalle)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Detalle interno/i }))
    await buscarPersonaInterna(usuario, '1750000265')

    await waitFor(() => expect(screen.getByRole('textbox', { name: /^Cargo/i })).toBeInTheDocument())
    expect(screen.queryByRole('textbox', { name: /^Nombramiento/i })).not.toBeInTheDocument()

    const nombramiento = cfgPersonaInternaDetalle.campos.find((c) => c.name === 'nombramiento')
    expect(nombramiento).toBeUndefined()
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

  it('el alta lleva a la pantalla propia, no al formulario genérico', async () => {
    // Un memorando con vehículo son tres filas que nacen juntas (memorando, vehículo y su
    // responsable). El formulario genérico solo sabe insertar en una tabla, así que el botón
    // navega a /memorandos/nuevo. Que el número siga siendo tecleado a mano y validado se
    // comprueba en validacion.test.ts y en la propia pantalla.
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgMemorando)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Memorando/i }))

    expect(navegadoA).toBe('/memorandos/nuevo')
    // Y desde luego no se abrió el formulario de siempre.
    expect(screen.queryByRole('button', { name: 'Registrar' })).not.toBeInTheDocument()
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
    const { unmount } = montar(cfgPersonaInterna)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Persona interna/i }))
    await usuario.type(screen.getByRole('textbox', { name: /Cédula/i }), '1750000232')

    // El borrador se guarda con debounce; sin esperar, no habría llegado a localStorage.
    await waitFor(
      () => expect(window.localStorage.getItem('epn.borrador:u-test:persona:nuevo')).not.toBeNull(),
      { timeout: 2000 },
    )
    unmount()

    // Vuelve a entrar: la pantalla ofrece recuperar el registro sin terminar.
    const usuario2 = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPersonaInterna)
    await usuario2.click(await screen.findByRole('button', { name: /Registrar Persona interna/i }))

    await usuario2.click(await screen.findByRole('button', { name: /Recuperarlo/i }))
    expect(screen.getByRole('textbox', { name: /Cédula/i })).toHaveValue('1750000232')
  })

  it('no guarda nada si el usuario solo abre el formulario y se va', async () => {
    // Antes bastaba con abrir "Registrar" y esperar un segundo para dejar un borrador con los
    // valores por defecto. A partir de ahí el aviso "tienes un registro sin terminar" salía
    // siempre, aunque nunca se hubiera escrito nada, y dejaba de significar algo.
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgMemorando)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Memorando/i }))
    await new Promise((r) => setTimeout(r, 1500))

    expect(window.localStorage.getItem('epn.borrador:u-test:persona:nuevo')).toBeNull()
  })

  it('"Empezar de cero" descarta el borrador guardado', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { unmount } = montar(cfgPersonaInterna)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Persona interna/i }))
    await usuario.type(screen.getByRole('textbox', { name: /Cédula/i }), '1750000232')
    await waitFor(
      () => expect(window.localStorage.getItem('epn.borrador:u-test:persona:nuevo')).not.toBeNull(),
      { timeout: 2000 },
    )
    unmount()

    const usuario2 = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPersonaInterna)
    await usuario2.click(await screen.findByRole('button', { name: /Registrar Persona interna/i }))
    await usuario2.click(await screen.findByRole('button', { name: /Empezar de cero/i }))

    expect(window.localStorage.getItem('epn.borrador:u-test:persona:nuevo')).toBeNull()
    expect(screen.getByRole('textbox', { name: /Cédula/i })).toHaveValue('')
  })
})
