import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

/**
 * Pantallas de PCO: infraestructura física y asignaciones de guardia.
 *
 * Cubre los bugs que reportó el módulo y que resultaron tener dos causas distintas:
 *
 *  - Combos de cascada vacíos al EDITAR ("en la parte de Zona no aparece nada", "el campo Punto
 *    de control no tiene nada para seleccionar"). Causa: los filtros auxiliares no son columnas
 *    de la tabla, así que no venían en el registro y arrancaban en "".
 *  - El nombre del guardia, que era un problema de RLS: el embed devolvía null y la columna
 *    mostraba "—". Aquí se comprueba la parte de pantalla; la política se prueba contra la base.
 *
 * Y los cambios de criterio: sin combo de Estado al registrar, con Reactivar en la ficha, y la
 * jerarquía Campus -> Edificio -> Parqueadero en el combo de zona padre.
 */

const { supabase, updatesHechos } = vi.hoisted(() => {
  const updatesHechos: { tabla: string; valores: unknown }[] = []

  const CAMPUS = { id_zona: 'z-campus', nombre_zona: 'Campus EPN', tipo_zona: 'CAMPUS', estado_zona: 'ACTIVA', id_zona_padre: null }
  const EDIF20 = { id_zona: 'z-e20', nombre_zona: 'Edificio 20', tipo_zona: 'EDIFICIO', estado_zona: 'ACTIVA', id_zona_padre: 'z-campus', numero_edificio: 20 }
  const EDIF15 = { id_zona: 'z-e15', nombre_zona: 'Edificio 15', tipo_zona: 'EDIFICIO', estado_zona: 'ACTIVA', id_zona_padre: 'z-campus', numero_edificio: 15 }
  // Una zona ya inactivada: es la que debe ofrecer "Reactivar" y no "Inactivar".
  const PARQUE = { id_zona: 'z-parq', nombre_zona: 'Parqueadero Subsuelo', tipo_zona: 'PARQUEADERO', estado_zona: 'INACTIVA', id_zona_padre: 'z-e20' }

  const PUNTO_E20 = { id_punto_control: 'p-1', id_zona: 'z-e20', nombre_punto: 'Puerta Norte', estado_punto: 'ACTIVO', fecha_registro: '2026-07-01T00:00:00Z', zona: { nombre_zona: 'Edificio 20' } }
  // Una garita de entrada a la universidad: cuelga del CAMPUS, que es el tipo que se retiró del
  // formulario de alta. Este caso lo detectó TestSprite, no las pruebas de aquí (§V25).
  const PUNTO_CAMPUS = { id_punto_control: 'p-2', id_zona: 'z-campus', nombre_punto: 'Acceso A', estado_punto: 'ACTIVO', fecha_registro: '2026-07-01T00:00:00Z', zona: { nombre_zona: 'Campus EPN' } }
  // Con la nomenclatura EPN (a diferencia de "Puerta Norte", que es de antes de esa regla).
  const PUNTO_E20_EPN = { id_punto_control: 'p-4', id_zona: 'z-e20', nombre_punto: 'E20/P5/E010', estado_punto: 'ACTIVO', fecha_registro: '2026-07-01T00:00:00Z', zona: { nombre_zona: 'Edificio 20' } }

  const filasPorTabla: Record<string, Record<string, unknown>[]> = {
    zona: [CAMPUS, EDIF20, EDIF15, PARQUE],
    punto_control: [PUNTO_E20, PUNTO_CAMPUS, PUNTO_E20_EPN],
    dispositivo: [{
      id_dispositivo: 'd-1', id_punto_control: 'p-1', codigo_dispositivo: 'BIO-0001',
      direccion_ip: '10.0.0.10', tipo_tecnologia: 'BIOMETRIA_FACIAL', estado_dispositivo: 'OPERATIVO',
      punto: { nombre_punto: 'Puerta Norte', zona: { nombre_zona: 'Edificio 20' } },
    }],
    guardia_punto_control: [{
      id_asignacion: 'a-1', id_usuario: 'u-g1', id_punto_control: 'p-1',
      turno: '07:00–17:00', hora_inicio: '07:00:00', hora_fin: '17:00:00',
      fecha_inicio: '2026-07-01T00:00:00Z', fecha_fin: '2026-07-31T00:00:00Z',
      estado_asignacion: 'ACTIVA',
      guardia: {
        nombre_usuario: 'guardia_demo',
        correo_electronico: 'guardia.demo@epn.edu.ec',
        persona: { nombres: 'Guardia', apellidos: 'Demo', cedula: '1750000018' },
      },
      punto: { nombre_punto: 'Puerta Norte', estado_punto: 'ACTIVO' },
    }, {
      // Asignación impecable sobre un punto que está en mantenimiento: el guardia no puede
      // operar y hasta ahora nada lo decía en pantalla (§V29).
      id_asignacion: 'a-2', id_usuario: 'u-g2', id_punto_control: 'p-3',
      turno: '08:00–16:00', hora_inicio: '08:00:00', hora_fin: '16:00:00',
      fecha_inicio: '2026-07-01T00:00:00Z', fecha_fin: '2026-07-31T00:00:00Z',
      estado_asignacion: 'ACTIVA',
      guardia: {
        nombre_usuario: 'otro_guardia',
        correo_electronico: 'otro@epn.edu.ec',
        persona: { nombres: 'Otro', apellidos: 'Guardia', cedula: '1750000209' },
      },
      punto: { nombre_punto: 'Puerta en obras', estado_punto: 'MANTENIMIENTO' },
    }],
  }

  const cadena = (tabla: string) => {
    const todas = filasPorTabla[tabla] ?? []
    const filtros: [string, unknown][] = []
    const filtradas = () => todas.filter((f) => filtros.every(([c, v]) => f[c] === v))
    const chain: Record<string, unknown> = {}
    const mismo = () => chain
    Object.assign(chain, {
      select: mismo,
      eq: (col: string, val: unknown) => {
        filtros.push([col, val])
        return chain
      },
      neq: mismo, gte: mismo, order: mismo, ilike: mismo,
      // Con latencia a propósito: `derivarDeRegistro` es asíncrono y en el navegador tarda.
      // Sin esta espera el mock resolvía antes del primer render y ocultaba las carreras
      // entre los efectos del formulario, que es justo lo que falló en el preview.
      maybeSingle: () => new Promise((res) => setTimeout(() => res({ data: filtradas()[0] ?? null, error: null }), 30)),
      insert: () => Promise.resolve({ error: null }),
      update: (v: unknown) => {
        updatesHechos.push({ tabla, valores: v })
        return { eq: () => Promise.resolve({ error: null }) }
      },
      then: (r: (x: { data: unknown; error: null }) => unknown) =>
        new Promise((res) => setTimeout(() => res({ data: filtradas(), error: null }), 30)).then(r as any),
    })
    return chain
  }

  return {
    updatesHechos,
    supabase: {
      from: (t: string) => cadena(t),
      // El combo de guardias sale de un RPC porque PCO no puede leer usuario_rol.
      rpc: (nombre: string, args?: Record<string, unknown>) => {
        if (nombre === 'guardias_disponibles') {
          return Promise.resolve({
            data: [{ id_usuario: 'u-g1', nombre_usuario: 'guardia_demo', correo_electronico: 'guardia.demo@epn.edu.ec' }],
            error: null,
          })
        }
        if (nombre === 'buscar_guardia_por_cedula') {
          // Solo esta cédula es de un guardia; cualquier otra devuelve vacío, que es como se
          // comporta el RPC real (no expone el resto del directorio).
          const encontrado = args?.p_cedula === '1750000018'
          return Promise.resolve({
            data: encontrado
              ? [{ id_usuario: 'u-g1', nombre_completo: 'Guardia Demo', cedula: '1750000018', ya_asignado: false }]
              : [],
            error: null,
          })
        }
        return Promise.resolve({ data: [], error: null })
      },
    },
  }
})

vi.mock('../lib/supabase', () => ({
  supabase,
  fromTable: (t: string) => supabase.from(t),
  mensajeError: (e: { message?: string }) => e?.message ?? 'Error',
}))

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ tiene: () => true, session: { user: { id: 'u-pco' } }, modulos: ['PCO'] }),
}))

const { ResourceScreen } = await import('../components/ResourceScreen')
const { ToastProvider } = await import('../components/ui')
const { cfgZona, cfgPuntoControl, cfgDispositivo, cfgAsignacionGuardia } = await import('./configs')

function montar(config: Parameters<typeof ResourceScreen>[0]['config']) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ResourceScreen config={config} />
      </ToastProvider>
    </MemoryRouter>,
  )
}

/** Abre la ficha de una fila del listado y pulsa Editar. */
async function abrirEdicion(usuario: ReturnType<typeof userEvent.setup>, textoFila: RegExp) {
  await usuario.click(await screen.findByText(textoFila))
  await usuario.click(await screen.findByRole('button', { name: /^Editar$/i }))
}

beforeEach(() => {
  window.localStorage.clear()
  updatesHechos.length = 0
  vi.useFakeTimers({ shouldAdvanceTime: true })
  // Dentro del turno 07:00–17:00 en hora de Ecuador.
  vi.setSystemTime(new Date('2026-07-20T12:00:00-05:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('cascada al editar (el bug de los combos vacíos)', () => {
  it('al editar un punto de control anterior a la nomenclatura EPN, la Zona viene resuelta y con opciones', async () => {
    // "Puerta Norte" no trae E<edificio>/P<piso>/E<espacio> del que sacar el número de edificio
    // (es de antes de esa regla, como "Puerta - Laboratorio de Suelos" en el remoto): se sigue
    // editando eligiendo la zona de una lista, no resolviéndola sola.
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPuntoControl)

    await abrirEdicion(usuario, /Puerta Norte/)

    // El filtro auxiliar se deriva del registro: el punto vive en un edificio.
    const tipo = await screen.findByRole('combobox', { name: /Tipo de zona/i })
    await waitFor(() => expect(tipo).toHaveValue('EDIFICIO'))

    // Y la consecuencia de eso: el combo Zona tiene opciones y la del registro seleccionada.
    // Antes de este arreglo aquí no había ni una sola opción y no se podía guardar.
    const zona = screen.getByRole('combobox', { name: /^Zona/i })
    await waitFor(() => expect(zona).toHaveValue('z-e20'))
    expect(within(zona).getAllByRole('option').length).toBeGreaterThan(1)
  })

  it('al editar un punto con la nomenclatura EPN, la Zona se resuelve sola (nuevos requerimientos PCO)', async () => {
    // A diferencia de "Puerta Norte" (legado), este punto sí sigue el estándar E20/P.../E...:
    // el número de edificio se puede sacar de su propio nombre, así que "Zona" ya no es un
    // desplegable que elegir, es la confirmación de a qué edificio corresponde.
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPuntoControl)

    await abrirEdicion(usuario, /E20\/P5\/E010/)

    const tipo = await screen.findByRole('combobox', { name: /Tipo de zona/i })
    await waitFor(() => expect(tipo).toHaveValue('EDIFICIO'))

    const zona = screen.getByLabelText(/^Zona/i)
    expect(zona).toBeDisabled()
    await waitFor(() => expect(zona).toHaveValue('Edificio 20'))
  })

  it('al editar una garita que cuelga del campus, el Tipo de zona no se queda vacío', async () => {
    // Regresión encontrada por TestSprite: al retirar "Campus" del alta, el desplegable se
    // quedaba en "— Seleccionar —" para las seis garitas que sí cuelgan del campus, y como el
    // campo es obligatorio no se podían guardar sin moverlas de zona.
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPuntoControl)

    await abrirEdicion(usuario, /Acceso A/)

    const tipo = await screen.findByRole('combobox', { name: /Tipo de zona/i })
    await waitFor(() => expect(tipo).toHaveValue('CAMPUS'))
    await waitFor(() => expect(screen.getByRole('combobox', { name: /^Zona/i })).toHaveValue('z-campus'))
  })

  it('al editar un dispositivo, el Punto de control viene resuelto y con opciones', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgDispositivo)

    await abrirEdicion(usuario, /BIO-0001/)

    await waitFor(() => expect(screen.getByRole('combobox', { name: /^Zona/i })).toHaveValue('z-e20'))
    const punto = screen.getByRole('combobox', { name: /Punto de control/i })
    await waitFor(() => expect(punto).toHaveValue('p-1'))
    expect(within(punto).getAllByRole('option').length).toBeGreaterThan(1)
  })

  it('al editar una asignación, el Punto de control viene resuelto', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgAsignacionGuardia)

    await abrirEdicion(usuario, /Guardia Demo/)

    await waitFor(() => expect(screen.getByRole('combobox', { name: /Punto de control/i })).toHaveValue('p-1'))
  })
})

describe('el Estado desaparece del alta pero sigue en la edición', () => {
  it('registrar una zona no pregunta por el estado', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgZona)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Zona/i }))

    // Positiva primero: el formulario está en pantalla. Sin esto, la negativa de abajo se
    // cumpliría sola aunque no se hubiera abierto nada.
    expect(screen.getByRole('textbox', { name: /Nombre/i })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /^Estado/i })).not.toBeInTheDocument()
  })

  it('editar una zona sí permite cambiar el estado', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgZona)

    await abrirEdicion(usuario, /Campus EPN/)

    const estado = await screen.findByRole('combobox', { name: /^Estado/i })
    // Y solo con los dos estados que quedan: BLOQUEADA se retiró del catálogo.
    const opciones = within(estado).getAllByRole('option').map((o) => o.textContent)
    expect(opciones).toContain('Activa')
    expect(opciones).toContain('Inactiva')
    expect(opciones).not.toContain('Bloqueada')
  })

  it('registrar un punto de control ofrece los tres tipos de zona', async () => {
    // Cambiado en el v2: antes se ocultaba "Campus" al registrar, y eso dejaba a medio gestionar
    // las garitas de entrada a la universidad, que sí cuelgan del campus (§V25).
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPuntoControl)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Punto de control/i }))

    const tipo = await screen.findByRole('combobox', { name: /Tipo de zona/i })
    const opciones = within(tipo).getAllByRole('option').map((o) => o.textContent)
    expect(opciones).toContain('Campus')
    expect(opciones).toContain('Edificio')
    expect(opciones).toContain('Parqueadero')
  })
})

describe('jerarquía de zonas en el combo de zona padre', () => {
  it('un edificio solo puede colgar de un campus', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgZona)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Zona/i }))
    await usuario.selectOptions(screen.getByRole('combobox', { name: /^Tipo/i }), 'EDIFICIO')

    const padre = await screen.findByRole('combobox', { name: /Zona padre/i })
    await waitFor(() => {
      const opciones = within(padre).getAllByRole('option').map((o) => o.textContent)
      expect(opciones).toContain('Campus EPN')
      expect(opciones).not.toContain('Edificio 20')
    })
  })

  it('un parqueadero solo puede colgar de un edificio', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgZona)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Zona/i }))
    await usuario.selectOptions(screen.getByRole('combobox', { name: /^Tipo/i }), 'PARQUEADERO')

    const padre = await screen.findByRole('combobox', { name: /Zona padre/i })
    await waitFor(() => {
      const opciones = within(padre).getAllByRole('option').map((o) => o.textContent)
      expect(opciones).toContain('Edificio 20')
      expect(opciones).not.toContain('Campus EPN')
    })
  })
})

describe('inactivar tiene vuelta atrás', () => {
  it('una zona activa ofrece Inactivar y no Reactivar', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgZona)

    await usuario.click(await screen.findByText(/Campus EPN/))

    expect(await screen.findByRole('button', { name: /Inactivar/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reactivar/i })).not.toBeInTheDocument()
  })

  it('una zona inactiva ofrece Reactivar, y al pulsarlo vuelve a ACTIVA', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgZona)

    await usuario.click(await screen.findByText(/Parqueadero Subsuelo/))

    const reactivar = await screen.findByRole('button', { name: /Reactivar/i })
    expect(screen.queryByRole('button', { name: /Inactivar/i })).not.toBeInTheDocument()

    await usuario.click(reactivar)

    await waitFor(() =>
      expect(updatesHechos).toContainEqual({ tabla: 'zona', valores: { estado_zona: 'ACTIVA' } }),
    )
  })
})

describe('asignaciones de guardia', () => {
  it('muestra el nombre y la cédula del guardia, no un identificador de cuenta', async () => {
    montar(cfgAsignacionGuardia)

    // El nombre de la persona, no "guardia_demo" ni el correo.
    expect(await screen.findByText(/Guardia Demo/)).toBeInTheDocument()
    // El identificador visible de una persona es siempre la cédula (RF de PCO).
    expect(screen.getByText('1750000018')).toBeInTheDocument()
  })

  it('separa la vigencia de la asignación de si está en turno ahora', async () => {
    // El v2 pedía que no se confundieran las dos cosas. Van en columnas distintas: "Asignación"
    // dice si está en vigor estos días, "Estado actual" si el guardia está cubriendo el punto
    // (nuevos requerimientos PCO: "quitar 'AHORA MISMO' y poner 'ESTADO ACTUAL'").
    montar(cfgAsignacionGuardia)

    expect(await screen.findByRole('columnheader', { name: /Asignación/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Estado actual/i })).toBeInTheDocument()

    // Son las 12:00 en Ecuador y el turno de Guardia Demo es 07:00–17:00: vigente y en turno.
    const fila = (await screen.findByText(/Guardia Demo/)).closest('tr') as HTMLElement
    expect(within(fila).getByText('Activa')).toBeInTheDocument()
    expect(within(fila).getByText('En turno')).toBeInTheDocument()
  })

  it('a las 22:00 la asignación sigue vigente pero el guardia ya no está en turno', async () => {
    // Es justo el caso que hacía ambigua la columna única: "Activa" no quiere decir "trabajando".
    vi.setSystemTime(new Date('2026-07-20T22:00:00-05:00'))
    montar(cfgAsignacionGuardia)

    const fila = (await screen.findByText(/Guardia Demo/)).closest('tr') as HTMLElement
    expect(within(fila).getByText('Activa')).toBeInTheDocument()
    expect(within(fila).getByText('Fuera de turno')).toBeInTheDocument()
  })

  it('muestra desde y hasta cuándo dura el turno', async () => {
    montar(cfgAsignacionGuardia)

    expect(await screen.findByRole('columnheader', { name: /Desde/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Hasta/i })).toBeInTheDocument()
    const fila = (await screen.findByText(/Guardia Demo/)).closest('tr') as HTMLElement
    expect(within(fila).getByText('01/07/2026')).toBeInTheDocument()
    expect(within(fila).getByText('31/07/2026')).toBeInTheDocument()
  })

  it('avisa cuando el punto está en mantenimiento y el guardia no puede operar', async () => {
    montar(cfgAsignacionGuardia)

    // Positiva primero: la asignación existe y se ve su punto.
    expect(await screen.findByText(/Puerta en obras/)).toBeInTheDocument()
    // Y el motivo por el que esa asignación no sirve, que antes no aparecía por ninguna parte.
    expect(screen.getByText(/no puede operar aquí/i)).toBeInTheDocument()
  })

  it('el punto operativo no lleva ningún aviso', async () => {
    montar(cfgAsignacionGuardia)

    const fila = (await screen.findByText(/Puerta Norte/)).closest('tr')
    expect(fila).not.toBeNull()
    expect(within(fila as HTMLElement).queryByText(/no puede operar/i)).not.toBeInTheDocument()
  })
})

describe('nombre estándar EPN al registrar en un edificio', () => {
  it('pide tres números y compone el nombre, sin teclear separadores', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPuntoControl)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Punto de control/i }))
    await usuario.selectOptions(screen.getByRole('combobox', { name: /Tipo de zona/i }), 'EDIFICIO')

    await usuario.type(await screen.findByLabelText(/^Edificio/i), '20')
    await usuario.type(screen.getByLabelText(/^Piso/i), '4')
    await usuario.type(screen.getByLabelText(/Aula o espacio/i), '4')
    await usuario.type(screen.getByLabelText(/^Descripción/i), 'Laboratorio Alan Turing')

    // El nombre lo arma el sistema: el usuario nunca escribe "/" ni "–".
    await waitFor(() =>
      expect(screen.getByLabelText(/Nombre del punto/i)).toHaveValue('E20/P4/E004 – Laboratorio Alan Turing'),
    )
    expect(screen.getByLabelText(/Nombre del punto/i)).toBeDisabled()
  })

  it('en un campus nuevo el "Acceso X" se asigna solo, a partir de la descripción (nuevos requerimientos PCO)', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPuntoControl)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Punto de control/i }))
    await usuario.selectOptions(screen.getByRole('combobox', { name: /Tipo de zona/i }), 'CAMPUS')
    const zona = await screen.findByRole('combobox', { name: /^Zona/i })
    await waitFor(() => expect(within(zona).getAllByRole('option').length).toBeGreaterThan(1))
    await usuario.selectOptions(zona, 'z-campus')

    expect(screen.queryByLabelText(/Aula o espacio/i)).not.toBeInTheDocument()

    await usuario.type(await screen.findByLabelText(/^Descripción/i), 'Av. Ladrón de Guevara (Este)')

    // "Acceso A" (sin guion) es de antes de esta regla y no cuenta: la primera con el patrón
    // nuevo vuelve a empezar en A.
    await waitFor(() => expect(screen.getByLabelText(/^Acceso/i)).toHaveValue('Acceso A'))
    await waitFor(() =>
      expect(screen.getByLabelText(/Nombre del punto/i)).toHaveValue('Acceso A - Av. Ladrón de Guevara (Este)'),
    )
    expect(screen.getByLabelText(/Nombre del punto/i)).toBeDisabled()
  })

  it('al editar una garita del campus anterior a esta regla, el nombre sigue siendo editable', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPuntoControl)

    await abrirEdicion(usuario, /Acceso A/)

    await waitFor(() => expect(screen.getByRole('combobox', { name: /Tipo de zona/i })).toHaveValue('CAMPUS'))
    expect(screen.getByRole('textbox', { name: /^Nombre/i })).toHaveValue('Acceso A')
  })
})

describe('nuevos requerimientos PCO', () => {
  it('el listado de dispositivos muestra el código y la zona, no la MAC', async () => {
    montar(cfgDispositivo)

    expect(await screen.findByRole('columnheader', { name: /^Código$/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /^Zona$/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Punto de control/i })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /^MAC$/i })).not.toBeInTheDocument()

    expect(await screen.findByText('BIO-0001')).toBeInTheDocument()
    expect(screen.getByText('Edificio 20')).toBeInTheDocument()
  })

  it('registrar un dispositivo no pide MAC: el código lo asigna la base', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgDispositivo)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Dispositivo/i }))

    expect(screen.queryByLabelText(/MAC/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Código/i)).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Dirección IP/i })).toBeInTheDocument()
  })

  it('al editar un dispositivo, el código se ve pero no se puede cambiar', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgDispositivo)

    await abrirEdicion(usuario, /BIO-0001/)

    const codigo = screen.getByLabelText(/^Código/i)
    expect(codigo).toHaveValue('BIO-0001')
    expect(codigo).toBeDisabled()
  })

  it('registrar un edificio pide su número, único', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgZona)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Zona/i }))
    expect(screen.queryByLabelText(/Número de edificio/i)).not.toBeInTheDocument()

    await usuario.selectOptions(screen.getByRole('combobox', { name: /^Tipo/i }), 'EDIFICIO')
    expect(await screen.findByLabelText(/Número de edificio/i)).toBeInTheDocument()
  })

  it('el nombre de una zona debe empezar con mayúscula', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgZona)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Zona/i }))
    await usuario.type(screen.getByRole('textbox', { name: /Nombre/i }), 'parqueadero norte')
    await usuario.selectOptions(screen.getByRole('combobox', { name: /^Tipo/i }), 'PARQUEADERO')
    const padre = await screen.findByRole('combobox', { name: /Zona padre/i })
    await waitFor(() => expect(within(padre).getAllByRole('option').length).toBeGreaterThan(1))
    await usuario.selectOptions(padre, 'z-e20')
    await usuario.click(await screen.findByRole('button', { name: /^Registrar$/i }))

    expect((await screen.findAllByText(/Debe empezar con mayúscula/i)).length).toBeGreaterThan(0)
  })
})

describe('buscar al guardia por su cédula', () => {
  it('encuentra al guardia y muestra su nombre', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgAsignacionGuardia)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Asignación/i }))
    await usuario.type(screen.getByLabelText(/Cédula del guardia/i), '1750000018')

    expect(await screen.findByText(/Guardia encontrado: Guardia Demo/i)).toBeInTheDocument()
  })

  it('avisa cuando la cédula no es de un guardia registrado', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgAsignacionGuardia)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Asignación/i }))
    // Cédula válida según el algoritmo del Registro Civil, pero que no es de ningún guardia:
    // así se comprueba el mensaje de "no registrado" y no el de formato incorrecto.
    await usuario.type(screen.getByLabelText(/Cédula del guardia/i), '1710034065')

    expect(await screen.findByText(/no corresponde a ningún guardia registrado/i)).toBeInTheDocument()
  })

  it('solo admite dígitos y como mucho diez', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgAsignacionGuardia)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Asignación/i }))
    const campo = screen.getByLabelText(/Cédula del guardia/i)
    await usuario.type(campo, 'AB17500000189999')

    expect(campo).toHaveValue('1750000018')
  })
})

describe('lista vacía por un filtro', () => {
  it('no dice que no hay registros cuando es el filtro el que los oculta', async () => {
    // Bug detectado por TestSprite: con un filtro de zona aplicado que no casaba con nada, la
    // pantalla de Puntos de control decía "No hay puntos de control registrados" teniendo seis.
    // Cualquiera concluiría que se perdieron los datos.
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPuntoControl)

    // Positiva primero: la lista trae datos antes de filtrar.
    expect(await screen.findByText(/Puerta Norte/)).toBeInTheDocument()

    await usuario.type(screen.getByPlaceholderText(/Buscar/i), 'zzzzz-no-existe')

    await waitFor(() => expect(screen.getByText(/Sin resultados/i)).toBeInTheDocument())
    expect(screen.queryByText(/No hay puntos de control registrados/i)).not.toBeInTheDocument()
    // Y se puede salir del callejón sin buscar el desplegable.
    expect(screen.getByRole('button', { name: /Quitar filtros/i })).toBeInTheDocument()
  })

  it('al quitar los filtros vuelven a verse las filas', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgPuntoControl)

    await usuario.type(await screen.findByPlaceholderText(/Buscar/i), 'zzzzz-no-existe')
    await waitFor(() => expect(screen.getByText(/Sin resultados/i)).toBeInTheDocument())

    await usuario.click(screen.getByRole('button', { name: /Quitar filtros/i }))

    await waitFor(() => expect(screen.getByText(/Puerta Norte/)).toBeInTheDocument())
  })
})

describe('jornada del guardia', () => {
  it('rechaza un turno de más de 12 horas', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgAsignacionGuardia)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Asignación/i }))
    await usuario.type(screen.getByLabelText(/Entrada/i), '06:00')
    await usuario.type(screen.getByLabelText(/Salida/i), '20:00')

    // 14 horas: es el turno que tenía registrado frank.jumbo antes de esta ronda.
    expect(await screen.findByText(/no puede durar 14\.0 horas/i)).toBeInTheDocument()
  })

  it('avisa de las horas extra sin bloquear entre 8 y 12 horas', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgAsignacionGuardia)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Asignación/i }))
    await usuario.type(screen.getByLabelText(/Entrada/i), '07:00')
    await usuario.type(screen.getByLabelText(/Salida/i), '17:00')

    // 10 horas: legal, pero son dos de horas extra y quien lo registra debe saberlo.
    expect(await screen.findByText(/horas extra/i)).toBeInTheDocument()
    expect(screen.queryByText(/no puede durar/i)).not.toBeInTheDocument()
  })

  it('una jornada ordinaria no dice nada', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgAsignacionGuardia)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Asignación/i }))
    await usuario.type(screen.getByLabelText(/Entrada/i), '08:00')
    await usuario.type(screen.getByLabelText(/Salida/i), '16:00')

    // Positiva primero: el campo tiene el valor que se tecleó.
    expect(screen.getByLabelText(/Salida/i)).toHaveValue('16:00')
    expect(screen.queryByText(/horas extra/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/no puede durar/i)).not.toBeInTheDocument()
  })

  it('el turno nocturno de 8 horas es válido, no uno de 16', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgAsignacionGuardia)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Asignación/i }))
    await usuario.type(screen.getByLabelText(/Entrada/i), '22:00')
    await usuario.type(screen.getByLabelText(/Salida/i), '06:00')

    expect(screen.getByLabelText(/Salida/i)).toHaveValue('06:00')
    expect(screen.queryByText(/no puede durar/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/horas extra/i)).not.toBeInTheDocument()
  })
})

describe('persistencia del formulario', () => {
  it('conserva lo escrito si se abandona el alta de una zona a medias', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const vista = montar(cfgZona)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Zona/i }))
    await usuario.type(screen.getByRole('textbox', { name: /Nombre/i }), 'Edificio 6 - Química')
    await usuario.selectOptions(screen.getByRole('combobox', { name: /^Tipo/i }), 'EDIFICIO')

    // El borrador se guarda con retardo; sin esperar no habría llegado a localStorage.
    await waitFor(
      () => expect(window.localStorage.getItem('epn.borrador:u-pco:zona:nuevo')).not.toBeNull(),
      { timeout: 2000 },
    )
    vista.unmount()

    // Al volver, la pantalla avisa y deja decidir: recuperar el registro sin terminar o no.
    const usuario2 = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgZona)
    await usuario2.click(await screen.findByRole('button', { name: /Registrar Zona/i }))
    await usuario2.click(await screen.findByRole('button', { name: /Recuperarlo/i }))

    expect(screen.getByRole('textbox', { name: /Nombre/i })).toHaveValue('Edificio 6 - Química')
    // El tipo también se conserva: si no, la zona padre volvería a quedar sin opciones.
    expect(screen.getByRole('combobox', { name: /^Tipo/i })).toHaveValue('EDIFICIO')
  })

  it('no deja borrador si solo se abre el formulario y se cierra', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const vista = montar(cfgZona)

    await usuario.click(await screen.findByRole('button', { name: /Registrar Zona/i }))
    await vi.advanceTimersByTimeAsync(1200)
    vista.unmount()

    montar(cfgZona)
    await usuario.click(await screen.findByRole('button', { name: /Registrar Zona/i }))

    expect(screen.getByRole('textbox', { name: /Nombre/i })).toHaveValue('')
  })
})
