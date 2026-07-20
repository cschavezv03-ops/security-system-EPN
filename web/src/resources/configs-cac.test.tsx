import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

/**
 * Pantallas de CAC: reglas de acceso, historial y errores de reconocimiento.
 *
 * Cubre lo que cambió en esta ronda y que ninguna prueba anterior protegía:
 *
 *  - Una regla sin garitas asociadas aplica en TODAS. Es la diferencia entre una regla que no
 *    sirve para nada y una que vale en todo el campus, y como la ausencia de filas se ve igual
 *    que un dato que falta, es justo el sitio donde una regresión pasaría inadvertida.
 *  - El motivo del rechazo se muestra en castellano y en el listado (RNF-CA-004 / RF-CA-024).
 *    Antes vivía escondido en la ficha y como código en mayúsculas.
 *  - Un evento sin persona es "Persona desconocida", no un guion: RF-CA-021 registra intentos
 *    de gente no identificada, y pintarlos como un hueco los hace invisibles.
 *  - Reactivar una regla inactiva (RF-CA-003 no tenía vuelta atrás).
 *  - Que el borrador del formulario sobreviva a abandonar el alta a medias.
 */

const { supabase, insertsHechos, borradosHechos } = vi.hoisted(() => {
  const insertsHechos: { tabla: string; valores: unknown }[] = []
  const borradosHechos: { tabla: string }[] = []

  const CATEGORIA_DOCENTE = { id_categoria: 'c-doc', codigo_categoria: 'DOCENTE', ambito: 'INTERNA' }
  const CATEGORIA_VISITA = { id_categoria: 'c-vis', codigo_categoria: 'VISITANTE', ambito: 'EXTERNA' }

  const PUNTO_A = { id_punto_control: 'p-1', nombre_punto: 'Garita Principal', estado_punto: 'ACTIVO' }
  const PUNTO_B = { id_punto_control: 'p-2', nombre_punto: 'Acceso Sur', estado_punto: 'ACTIVO' }
  const PUNTO_OBRAS = { id_punto_control: 'p-3', nombre_punto: 'Puerta en obras', estado_punto: 'MANTENIMIENTO' }

  const filasPorTabla: Record<string, Record<string, unknown>[]> = {
    categoria_persona: [CATEGORIA_DOCENTE, CATEGORIA_VISITA],
    punto_control: [PUNTO_A, PUNTO_B, PUNTO_OBRAS],

    regla_acceso: [
      {
        // Sin garitas: aplica en todas. El caso que hay que distinguir de "no tiene ninguna".
        id_regla_acceso: 'r-todas', nombre_regla: 'ACCESO_DOCENTES', id_categoria: 'c-doc',
        horario_inicio: '05:30:00', horario_fin: '23:00:00', requiere_memorando: false,
        estado_regla: 'ACTIVA', descripcion: 'Ingreso ordinario del personal docente.',
        categoria: { codigo_categoria: 'DOCENTE' }, garitas: [],
      },
      {
        // Con una garita concreta.
        id_regla_acceso: 'r-una', nombre_regla: 'ACCESO_VISITANTES', id_categoria: 'c-vis',
        horario_inicio: '08:00:00', horario_fin: '17:00:00', requiere_memorando: true,
        estado_regla: 'ACTIVA', descripcion: 'Visitas en horario de oficina.',
        categoria: { codigo_categoria: 'VISITANTE' },
        garitas: [{ id_punto_control: 'p-1', punto: { nombre_punto: 'Garita Principal' } }],
      },
      {
        // Horario que cruza la medianoche, y regla ya inactivada: es la que debe ofrecer
        // "Reactivar" en vez de "Inactivar".
        id_regla_acceso: 'r-noche', nombre_regla: 'ACCESO_NOCTURNO', id_categoria: 'c-doc',
        horario_inicio: '22:00:00', horario_fin: '06:00:00', requiere_memorando: false,
        estado_regla: 'INACTIVA', descripcion: 'Turno de noche.',
        categoria: { codigo_categoria: 'DOCENTE' },
        garitas: [
          { id_punto_control: 'p-1', punto: { nombre_punto: 'Garita Principal' } },
          { id_punto_control: 'p-2', punto: { nombre_punto: 'Acceso Sur' } },
        ],
      },
    ],

    regla_acceso_punto_control: [
      { id_regla_acceso: 'r-una', id_punto_control: 'p-1' },
      { id_regla_acceso: 'r-noche', id_punto_control: 'p-1' },
      { id_regla_acceso: 'r-noche', id_punto_control: 'p-2' },
    ],

    evento_acceso: [
      {
        id_evento: 'e-1', fecha_hora: '2026-07-20T14:00:00Z', tipo_movimiento: 'INGRESO',
        tipo_acceso: 'PEATONAL', resultado: 'AUTORIZADO', motivo_resultado: null,
        origen_registro: 'MANUAL', es_conductor: false, placa_detectada: null,
        confianza_placa: null, confianza_biometria: 0.72,
        persona: { nombres: 'Alexander', apellidos: 'Guerra', cedula: '1750000257', categoria: { codigo_categoria: 'DOCENTE' } },
        punto: { nombre_punto: 'Garita Principal' }, vehiculo: null,
        salida: [{ fecha_hora: '2026-07-20T20:00:00Z', punto: { nombre_punto: 'Garita Principal' } }],
      },
      {
        // Evento SIN persona: el rostro no coincidió con nadie (RF-CA-021).
        id_evento: 'e-2', fecha_hora: '2026-07-20T15:00:00Z', tipo_movimiento: 'INGRESO',
        tipo_acceso: 'PEATONAL', resultado: 'DENEGADO',
        motivo_resultado: 'PERSONA_DESCONOCIDA: el rostro capturado no coincide con ninguna persona registrada',
        origen_registro: 'MANUAL', es_conductor: false, placa_detectada: null,
        confianza_placa: null, confianza_biometria: 0.21,
        persona: null, punto: { nombre_punto: 'Garita Principal' }, vehiculo: null, salida: [],
      },
      {
        // Intento vehicular con una placa que no está registrada.
        id_evento: 'e-3', fecha_hora: '2026-07-20T16:00:00Z', tipo_movimiento: 'INGRESO',
        tipo_acceso: 'VEHICULAR', resultado: 'DENEGADO',
        motivo_resultado: 'PLACA_NO_RECONOCIDA: la placa XYZ9999 no corresponde a ningun vehiculo registrado',
        origen_registro: 'MANUAL', es_conductor: true, placa_detectada: 'XYZ9999',
        confianza_placa: 0.91, confianza_biometria: null,
        persona: { nombres: 'Frank', apellidos: 'Jumbo', cedula: '1750000208', categoria: { codigo_categoria: 'ESTUDIANTE' } },
        punto: { nombre_punto: 'Garita Principal' }, vehiculo: null, salida: [],
      },
    ],

    error_reconocimiento: [
      {
        id_error: 'x-1', tipo_reconocimiento: 'PLACA', codigo_error: 'PLACA_NO_LEGIBLE',
        descripcion: 'El lector local no encontró ninguna placa en la imagen capturada.',
        fecha_hora: '2026-07-20T16:05:00Z',
        punto: { nombre_punto: 'Garita Principal' }, dispositivo: null,
      },
      {
        id_error: 'x-2', tipo_reconocimiento: 'FACIAL', codigo_error: 'CAMARA_NO_DISPONIBLE',
        descripcion: 'No se pudo abrir la cámara (requiere https o localhost).',
        fecha_hora: '2026-07-20T09:00:00Z',
        punto: { nombre_punto: 'Acceso Sur' }, dispositivo: null,
      },
      {
        // Un error con dispositivo asociado: se identifica por su MAC y su tecnología, porque
        // la tabla dispositivo NO tiene nombre. Pedir un nombre inexistente tumbaba la pantalla
        // entera con un 400 de PostgREST (INT-11); esta fila fija que se lea por MAC.
        id_error: 'x-3', tipo_reconocimiento: 'PLACA', codigo_error: 'LECTOR_SIN_RESPUESTA',
        descripcion: 'El lector de placas no respondió a tiempo.',
        fecha_hora: '2026-07-20T10:30:00Z',
        punto: { nombre_punto: 'Acceso Sur' },
        dispositivo: { codigo_mac: 'AA:BB:CC:DD:EE:FF', tipo_tecnologia: 'LPR_PLACAS' },
      },
    ],
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
      neq: mismo, gte: mismo, order: mismo, ilike: mismo, in: mismo, limit: mismo,
      maybeSingle: () => Promise.resolve({ data: filtradas()[0] ?? null, error: null }),
      insert: (v: unknown) => {
        insertsHechos.push({ tabla, valores: v })
        return Promise.resolve({ error: null })
      },
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      delete: () => {
        borradosHechos.push({ tabla })
        return { eq: () => ({ in: () => Promise.resolve({ error: null }) }) }
      },
      then: (r: (x: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: filtradas(), error: null }).then(r),
    })
    return chain
  }

  return {
    insertsHechos,
    borradosHechos,
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
  useAuth: () => ({ tiene: () => true, session: { user: { id: 'u-cac' } }, modulos: ['CAC'] }),
}))

const { ResourceScreen } = await import('../components/ResourceScreen')
const { ToastProvider } = await import('../components/ui')
const { cfgReglaAcceso } = await import('./configs')
const { cfgEventoAcceso, cfgErrorReconocimiento } = await import('./configs-lectura')

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
  borradosHechos.length = 0
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-07-20T12:00:00-05:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('reglas de acceso: garitas (RF-CA-007)', () => {
  it('una regla sin garitas asociadas dice que aplica en todas, no un guion', async () => {
    // Cero filas en la tabla N:M significa "todas las garitas". Pintarlo como "—" diría justo
    // lo contrario de la verdad, y quien administra las reglas creería que esa regla no
    // autoriza nada.
    montar(cfgReglaAcceso)
    const fila = (await screen.findByText('ACCESO_DOCENTES')).closest('tr')!
    expect(within(fila).getByText('Todas las garitas')).toBeInTheDocument()
  })

  it('una regla con una sola garita la nombra, y con varias las cuenta', async () => {
    montar(cfgReglaAcceso)
    const unaGarita = (await screen.findByText('ACCESO_VISITANTES')).closest('tr')!
    expect(within(unaGarita).getByText('Garita Principal')).toBeInTheDocument()

    const variasGaritas = (await screen.findByText('ACCESO_NOCTURNO')).closest('tr')!
    expect(within(variasGaritas).getByText('2 garitas')).toBeInTheDocument()
  })

  it('la ficha permite marcar y guardar las garitas donde aplica la regla', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgReglaAcceso)

    await usuario.click(await screen.findByText('ACCESO_VISITANTES'))

    // El gestor de garitas vive dentro de la ficha, como las personas de un vehículo.
    const casilla = await screen.findByRole('checkbox', { name: /Acceso Sur/i })
    expect(casilla).not.toBeChecked()
    await usuario.click(casilla)

    await usuario.click(screen.getByRole('button', { name: /Guardar garitas/i }))

    await waitFor(() =>
      expect(insertsHechos.some((i) => i.tabla === 'regla_acceso_punto_control')).toBe(true),
    )
  })
})

describe('reglas de acceso: alta y estado', () => {
  it('el alta no ofrece el combo de Estado: toda regla nace activa', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgReglaAcceso)

    await usuario.click(await screen.findByRole('button', { name: /Registrar|Nueva|Nuevo/i }))

    // Positiva antes que negativa: se comprueba que el formulario está montado de verdad
    // antes de afirmar que le falta un campo.
    expect(await screen.findByLabelText(/Nombre de la regla/i)).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /^Estado/i })).not.toBeInTheDocument()
  })

  it('una regla inactiva ofrece Reactivar, no Inactivar', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgReglaAcceso)

    await usuario.click(await screen.findByText('ACCESO_NOCTURNO'))

    expect(await screen.findByRole('button', { name: /Reactivar regla/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Inactivar regla/i })).not.toBeInTheDocument()
  })

  it('el horario que cruza la medianoche se explica en vez de parecer un error', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgReglaAcceso)

    await usuario.click(await screen.findByText('ACCESO_NOCTURNO'))
    expect(await screen.findByText(/del día siguiente/i)).toBeInTheDocument()
  })

  it('conserva lo escrito si se abandona el alta de una regla a medias', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const vista = montar(cfgReglaAcceso)

    await usuario.click(await screen.findByRole('button', { name: /Registrar|Nueva|Nuevo/i }))
    await usuario.type(await screen.findByLabelText(/Nombre de la regla/i), 'ACCESO_LABORATORIOS')

    // El borrador se guarda con retardo; sin esperar no habría llegado a localStorage.
    await waitFor(
      () => expect(window.localStorage.getItem('epn.borrador:u-cac:regla_acceso:nuevo')).not.toBeNull(),
      { timeout: 2000 },
    )
    vista.unmount()

    // Al volver, la pantalla avisa y deja decidir: recuperar el registro sin terminar o
    // empezar de cero. No restaura sola, que sería peor que perderlo.
    const usuario2 = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgReglaAcceso)
    await usuario2.click(await screen.findByRole('button', { name: /Registrar|Nueva|Nuevo/i }))
    await usuario2.click(await screen.findByRole('button', { name: /Recuperarlo/i }))

    expect(await screen.findByLabelText(/Nombre de la regla/i)).toHaveValue('ACCESO_LABORATORIOS')
  })
})

describe('historial de accesos (RF-CA-024)', () => {
  it('un evento sin persona se lee como "Persona desconocida"', async () => {
    // RF-CA-021 registra a quien no se pudo identificar. Si la columna mostrara un guion, esos
    // intentos parecerían filas incompletas y nadie los miraría.
    montar(cfgEventoAcceso())
    expect(await screen.findByText('Persona desconocida')).toBeInTheDocument()
  })

  it('el motivo del rechazo sale en el listado y en castellano', async () => {
    montar(cfgEventoAcceso())

    // Positiva primero: la fila existe.
    const fila = (await screen.findByText(/Jumbo/)).closest('tr')!
    // Y el motivo se ve traducido, no como el código crudo de la Edge Function.
    expect(within(fila).getByText(/La placa no corresponde a esta persona/i)).toBeInTheDocument()
    expect(within(fila).queryByText(/^PLACA_NO_RECONOCIDA$/)).not.toBeInTheDocument()
  })

  it('distingue el acceso peatonal del vehicular', async () => {
    montar(cfgEventoAcceso())
    const filaVehicular = (await screen.findByText(/Jumbo/)).closest('tr')!
    expect(within(filaVehicular).getByText(/Vehicular/i)).toBeInTheDocument()

    const filaPeatonal = (await screen.findByText(/Guerra/)).closest('tr')!
    expect(within(filaPeatonal).getByText(/Peatonal/i)).toBeInTheDocument()
  })

  it('la ficha muestra la hora de salida ligada al ingreso', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgEventoAcceso())

    await usuario.click(await screen.findByText(/Guerra/))

    expect(await screen.findByText(/Hora de salida/i)).toBeInTheDocument()
    // El ingreso tiene salida registrada, así que no puede decir "Sigue dentro".
    expect(screen.queryByText(/Sigue dentro/i)).not.toBeInTheDocument()
  })

  it('un ingreso autorizado sin salida dice que la persona sigue dentro', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgEventoAcceso())

    // El evento denegado de Jumbo no tiene salida ni la tendrá: no llegó a entrar.
    await usuario.click(await screen.findByText(/Jumbo/))
    expect(await screen.findByText(/Placa leída/i)).toBeInTheDocument()
    expect(screen.getByText(/XYZ-9999/)).toBeInTheDocument()
  })
})

describe('errores de reconocimiento (RF-CA-022)', () => {
  it('lista los fallos técnicos con su garita y su tipo', async () => {
    montar(cfgErrorReconocimiento())

    const filaPlaca = (await screen.findByText(/no encontró ninguna placa/i)).closest('tr')!
    expect(within(filaPlaca).getByText('Garita Principal')).toBeInTheDocument()
    expect(within(filaPlaca).getByText(/Placa no legible/i)).toBeInTheDocument()

    // Con tilde: el código del catálogo es CAMARA_NO_DISPONIBLE, pero la pantalla lo traduce
    // por `ETIQUETA`. Sin esa entrada, `humanizar` cae a la conversión automática y escribe
    // "Camara" — legible, pero mal escrito, y en una pantalla que lee un guardia.
    const filaCamara = (await screen.findByText(/No se pudo abrir la cámara/i)).closest('tr')!
    expect(within(filaCamara).getByText('Cámara no disponible')).toBeInTheDocument()
  })

  it('la ficha identifica el dispositivo por su MAC, no por un nombre inexistente (INT-11)', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montar(cfgErrorReconocimiento())

    await usuario.click(await screen.findByText(/El lector de placas no respondió/i))

    // La ficha del error muestra el dispositivo por su MAC y su tecnología. Antes la pantalla
    // pedía dispositivo(nombre_dispositivo), una columna que no existe, y PostgREST devolvía
    // 400: el listado entero se quedaba vacío con un banner de error.
    expect(await screen.findByText(/AA:BB:CC:DD:EE:FF/)).toBeInTheDocument()
  })

  it('es un histórico: no ofrece registrar ni editar', async () => {
    montar(cfgErrorReconocimiento())

    // Positiva antes que negativa: la pantalla cargó y tiene datos.
    expect(await screen.findByText(/no encontró ninguna placa/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Registrar|Nuevo|Nueva/i })).not.toBeInTheDocument()
  })
})
