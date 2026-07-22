import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

/**
 * La Garita: el flujo que recorre el guardia con alguien esperando delante.
 *
 * Lo que se protege aquí es la navegación, que es donde una regresión se traduce en un fallo
 * de seguridad y no en un error visible:
 *
 *  - Peatonal y vehicular son procesos distintos. Si el guardia pudiera registrar por la vía
 *    peatonal a quien llegó conduciendo, se saltaría la doble autenticación de RNF-CA-005 sin
 *    darse cuenta de que lo está haciendo.
 *  - El conductor interno identificado solo por cédula tiene que avisar de que le falta el
 *    rostro (RF-CA-016), en la propia pantalla y antes de intentar registrar.
 *  - Cada ocupante viaja con su propio resultado (RF-CA-017).
 *  - Los motivos se muestran en castellano (RNF-CA-004).
 */

const { supabase, invocaciones, filasPorTabla } = vi.hoisted(() => {
  const invocaciones: { funcion: string; body: any }[] = []

  const PERSONAS: Record<string, any> = {
    '1750000257': {
      id_persona: 'per-guerra', nombres: 'Alexander', apellidos: 'Guerra',
      cedula: '1750000257', tipo_persona: 'INTERNA', estado: 'ACTIVO',
    },
    '1750000208': {
      id_persona: 'per-jumbo', nombres: 'Frank', apellidos: 'Jumbo',
      cedula: '1750000208', tipo_persona: 'INTERNA', estado: 'ACTIVO',
    },
  }

  const filasPorTabla: Record<string, any[]> = {
    guardia_punto_control: [{
      // `estado_asignacion` hace falta aunque la vista no lo pinte: la consulta filtra por él,
      // y sin la columna el doble devuelve cero filas y la garita se queda sin punto asignado.
      id_punto_control: 'p-1', turno: '06:00–18:00', estado_asignacion: 'ACTIVA',
      punto: { nombre_punto: 'Garita Principal', estado_punto: 'ACTIVO' },
    }],
    evento_acceso: [],
    persona: Object.values(PERSONAS),
    persona_memorando: [],
    categoria_persona: [{ id_categoria: 'c-vis', codigo_categoria: 'VISITANTE', ambito: 'EXTERNA' }],
    vista_vigencia_acceso: [],
    error_reconocimiento: [],
  }

  const cadena = (tabla: string) => {
    const filtros: [string, unknown][] = []
    const filtradas = () => (filasPorTabla[tabla] ?? []).filter((f) => filtros.every(([c, v]) => f[c] === v))
    const chain: Record<string, unknown> = {}
    const mismo = () => chain
    Object.assign(chain, {
      select: mismo,
      eq: (col: string, val: unknown) => { filtros.push([col, val]); return chain },
      neq: mismo, gte: mismo, order: mismo, limit: mismo, in: mismo, ilike: mismo,
      maybeSingle: () => Promise.resolve({ data: filtradas()[0] ?? null, error: null }),
      insert: () => Promise.resolve({ error: null }),
      then: (r: (x: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: filtradas(), error: null }).then(r),
    })
    return chain
  }

  return {
    invocaciones,
    filasPorTabla,
    supabase: {
      from: (t: string) => cadena(t),
      rpc: (nombre: string) =>
        Promise.resolve({
          data: nombre === 'verificar_turno_guardia_actual' ? { permitido: true, motivo: null } : [],
          error: null,
        }),
      functions: {
        invoke: (funcion: string, opciones: { body: any }) => {
          invocaciones.push({ funcion, body: opciones.body })

          if (funcion === 'reconocer-placa') {
            return Promise.resolve({
              data: {
                motor: 'MANUAL',
                lectura: { placa: 'PDF1234', confianza: 1, motor: 'MANUAL' },
                vehiculo: {
                  id_vehiculo: 'v-1', placa: 'PDF1234', estado_vehiculo: 'ACTIVO',
                  distancia: 0, corregida: false,
                },
                personas_asociadas: [{
                  ...PERSONAS['1750000257'], tipo_relacion: 'PROPIETARIO',
                }],
                ambigua: false,
                requiere_confirmacion: false,
              },
              error: null,
            })
          }

          if (funcion === 'registrar-evento-acceso') {
            // Cada ocupante con su propio veredicto: el conductor pasa, el pasajero no.
            const ocupantes = (opciones.body.ocupantes ?? []).map((o: any, i: number) => ({
              id_evento: `e-${i}`,
              id_persona: o.id_persona,
              autorizado: i === 0,
              motivo: i === 0
                ? null
                : 'FUERA_DE_HORARIO: la hora actual esta fuera del horario permitido para su categoria',
            }))
            return Promise.resolve({ data: { ocupantes }, error: null })
          }

          return Promise.resolve({ data: {}, error: null })
        },
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
  useAuth: () => ({
    tiene: () => true,
    session: { user: { id: 'u-guardia' } },
    perfil: { nombre_completo: 'Guardia Demo', nombre_usuario: 'guardia_demo' },
    rolLabel: 'Guardia de Seguridad',
    modulos: ['CAC'],
  }),
}))

// La cámara y los modelos de reconocimiento no existen en jsdom: se sustituyen por un doble
// que devuelve lo que devolvería el aparato. Lo que se prueba aquí es el flujo, no el OCR
// (eso vive en placas.test.ts, sin navegador de por medio).
vi.mock('../components/Camera', () => ({
  CameraPanel: () => <div data-testid="camara" />,
}))

vi.mock('../components/LectorPlaca', async () => {
  const real = await vi.importActual<typeof import('../components/LectorPlaca')>('../components/LectorPlaca')
  return {
    ...real,
    LectorPlaca: ({ onIdentificada }: { onIdentificada: (r: any) => void }) => (
      <button
        type="button"
        onClick={() =>
          onIdentificada({
            lectura: { placa: 'PDF1234', confianza: 1, motor: 'MANUAL' },
            vehiculo: { id_vehiculo: 'v-1', placa: 'PDF1234', estado_vehiculo: 'ACTIVO', distancia: 0, corregida: false },
            personas: [{
              id_persona: 'per-guerra', nombres: 'Alexander', apellidos: 'Guerra',
              cedula: '1750000257', tipo_persona: 'INTERNA', estado: 'ACTIVO',
              tipo_relacion: 'PROPIETARIO',
            }],
            detalle: null,
          })
        }
      >
        Capturar placa
      </button>
    ),
  }
})

const { GuardiaView } = await import('./GuardiaView')
const { ToastProvider } = await import('../components/ui')

function montar() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <GuardiaView />
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  invocaciones.length = 0
  filasPorTabla.error_reconocimiento = []
})

describe('navegación entre los dos tipos de ingreso', () => {
  it('arranca en peatonal, con las herramientas del ingreso a pie', async () => {
    montar()
    expect(await screen.findByRole('tab', { name: /Ingreso peatonal/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /Ingreso vehicular/i })).toHaveAttribute('aria-selected', 'false')

    // Positiva antes que negativa: existe lo del modo peatonal...
    expect(await screen.findByText(/Buscar por cédula/i)).toBeInTheDocument()
    // ...y no existe lo del vehicular, que es lo que se quiere comprobar.
    expect(screen.queryByText(/Placa del vehículo/i)).not.toBeInTheDocument()
  })

  it('al pasar a vehicular aparece la placa y el paso de ocupantes', async () => {
    const usuario = userEvent.setup()
    montar()

    await usuario.click(await screen.findByRole('tab', { name: /Ingreso vehicular/i }))

    expect(await screen.findByText(/1\. Placa del vehículo/i)).toBeInTheDocument()
    expect(screen.getByText(/2\. Conductor y pasajeros/i)).toBeInTheDocument()
    // Y la búsqueda por cédula suelta del modo peatonal ya no está: registrar a pie a alguien
    // que llegó en coche es exactamente lo que esta separación evita.
    expect(screen.queryByText(/Buscar por cédula \(externo\)/i)).not.toBeInTheDocument()
  })

  it('vuelve al modo peatonal sin perder el estado de la pantalla', async () => {
    const usuario = userEvent.setup()
    montar()

    await usuario.click(await screen.findByRole('tab', { name: /Ingreso vehicular/i }))
    await usuario.click(await screen.findByRole('tab', { name: /Ingreso peatonal/i }))

    expect(await screen.findByText(/Buscar por cédula/i)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Ingreso peatonal/i })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('flujo vehicular (RF-CA-015 a RF-CA-017)', () => {
  it('la placa identificada ofrece añadir a las personas asociadas al vehículo', async () => {
    const usuario = userEvent.setup()
    montar()

    await usuario.click(await screen.findByRole('tab', { name: /Ingreso vehicular/i }))
    await usuario.click(await screen.findByRole('button', { name: /Capturar placa/i }))

    expect(await screen.findByText(/Personas asociadas a este vehículo/i)).toBeInTheDocument()
    expect(screen.getByText(/Guerra Alexander/)).toBeInTheDocument()
  })

  it('avisa de que al conductor interno le falta el rostro (RNF-CA-005)', async () => {
    const usuario = userEvent.setup()
    montar()

    await usuario.click(await screen.findByRole('tab', { name: /Ingreso vehicular/i }))

    // Se añade por cédula, no por rostro: es el caso que la doble autenticación debe atajar.
    await usuario.type(await screen.findByLabelText(/Cédula del pasajero/i), '1750000257')
    await usuario.click(screen.getByRole('button', { name: /Buscar pasajero por cédula/i }))
    await usuario.keyboard('{Enter}')

    // El primero en subir queda marcado como conductor, y por eso salta el aviso.
    expect(await screen.findByText(/necesita reconocimiento facial/i)).toBeInTheDocument()
  })

  it('cada ocupante recibe su propio resultado (RF-CA-017)', async () => {
    const usuario = userEvent.setup()
    montar()

    await usuario.click(await screen.findByRole('tab', { name: /Ingreso vehicular/i }))
    await usuario.click(await screen.findByRole('button', { name: /Capturar placa/i }))
    // El botón "Añadir" del recuadro de la placa desapareció: metía a alguien de un clic y eso
    // dejaba sin efecto el reconocimiento facial del personal interno. Ahora el guardia teclea
    // la cédula, que es lo que hace frente al documento.
    await usuario.type(await screen.findByLabelText(/Cédula del pasajero/i), '1750000257')
    await usuario.click(screen.getByRole('button', { name: /Buscar pasajero por cédula/i }))

    // Un segundo ocupante, por cédula.
    await usuario.type(await screen.findByLabelText(/Cédula del pasajero/i), '1750000208')
    await usuario.keyboard('{Enter}')
    await screen.findByText(/Jumbo Frank/)

    await usuario.click(await screen.findByRole('button', { name: /Registrar ingreso/i }))

    // El doble tiene preparado un veredicto distinto por ocupante, y los dos deben verse.
    await waitFor(() => expect(screen.getByText(/Ingreso autorizado/i)).toBeInTheDocument())

    // El motivo del segundo llega traducido, no como código en mayúsculas (RNF-CA-004). El
    // titular y la explicación dicen los dos "fuera del horario", así que se busca el titular
    // completo, que es el que lleva el nombre de la persona delante.
    expect(await screen.findByText(/Jumbo Frank — Fuera del horario permitido/i)).toBeInTheDocument()
    expect(screen.queryByText(/FUERA_DE_HORARIO/)).not.toBeInTheDocument()
  })

  it('manda la placa leída al registrar, aunque el vehículo esté identificado', async () => {
    const usuario = userEvent.setup()
    montar()

    await usuario.click(await screen.findByRole('tab', { name: /Ingreso vehicular/i }))
    await usuario.click(await screen.findByRole('button', { name: /Capturar placa/i }))
    // El botón "Añadir" del recuadro de la placa desapareció: metía a alguien de un clic y eso
    // dejaba sin efecto el reconocimiento facial del personal interno. Ahora el guardia teclea
    // la cédula, que es lo que hace frente al documento.
    await usuario.type(await screen.findByLabelText(/Cédula del pasajero/i), '1750000257')
    await usuario.click(screen.getByRole('button', { name: /Buscar pasajero por cédula/i }))
    await usuario.click(await screen.findByRole('button', { name: /Registrar ingreso/i }))

    await waitFor(() => {
      const registro = invocaciones.find((i) => i.funcion === 'registrar-evento-acceso')
      expect(registro).toBeDefined()
      // La placa leída viaja siempre: es lo que permite investigar después un intento con una
      // matrícula que no resolvió a ningún vehículo (RF-CA-023).
      expect(registro!.body.placa_detectada).toBe('PDF1234')
      expect(registro!.body.id_vehiculo).toBe('v-1')
    })
  })
})

describe('el turno del guardia', () => {
  it('registra los movimientos cuando el turno está habilitado', async () => {
    const usuario = userEvent.setup()
    montar()

    await usuario.click(await screen.findByRole('tab', { name: /Ingreso vehicular/i }))
    await usuario.click(await screen.findByRole('button', { name: /Capturar placa/i }))
    // El botón "Añadir" del recuadro de la placa desapareció: metía a alguien de un clic y eso
    // dejaba sin efecto el reconocimiento facial del personal interno. Ahora el guardia teclea
    // la cédula, que es lo que hace frente al documento.
    await usuario.type(await screen.findByLabelText(/Cédula del pasajero/i), '1750000257')
    await usuario.click(screen.getByRole('button', { name: /Buscar pasajero por cédula/i }))

    const boton = await screen.findByRole('button', { name: /Registrar ingreso/i })
    expect(boton).not.toBeDisabled()
  })
})

describe('movimientos recientes (RF-CA-025)', () => {
  it('la lista está presente en los dos modos', async () => {
    const usuario = userEvent.setup()
    montar()

    expect(await screen.findByText(/Movimientos recientes en el punto/i)).toBeInTheDocument()

    await usuario.click(screen.getByRole('tab', { name: /Ingreso vehicular/i }))
    expect(await screen.findByText(/Movimientos recientes en el punto/i)).toBeInTheDocument()
  })

  // RF-CA-022: antes un fallo técnico del reconocimiento (cámara caída, ningún rostro en la
  // imagen...) se guardaba en error_reconocimiento pero el guardia nunca lo veía en su propia
  // pantalla — solo aparecía en la pantalla dedicada de ADM/CAC. Se mezcla aquí, en el mismo
  // punto de control donde ocurrió.
  it('muestra los errores de reconocimiento del propio punto, no solo los eventos', async () => {
    filasPorTabla.error_reconocimiento = [{
      id_error: 'err-1',
      fecha_hora: '2026-07-20T12:00:00Z',
      tipo_reconocimiento: 'FACIAL',
      codigo_error: 'ROSTRO_NO_DETECTADO',
      descripcion: 'Identificación facial en la garita: no se detectó ningún rostro en la imagen.',
      id_punto_control: 'p-1',
    }]
    montar()

    expect(await screen.findByText(/Error de reconocimiento facial/i)).toBeInTheDocument()
    expect(screen.getByText(/Rostro no detectado/i)).toBeInTheDocument()
  })
})

describe('lo que el guardia lee tras registrar', () => {
  it('una salida dice "Salida autorizada", no "Acceso autorizado"', async () => {
    // Sin esto los dos movimientos daban el mismo mensaje, y al repasar lo ocurrido en la
    // garita no había forma de saber si esa persona entró o salió.
    const usuario = userEvent.setup()
    montar()

    await usuario.click(await screen.findByRole('tab', { name: /Ingreso vehicular/i }))
    await usuario.click(await screen.findByRole('button', { name: /Capturar placa/i }))
    await usuario.type(await screen.findByLabelText(/Cédula del pasajero/i), '1750000257')
    await usuario.click(screen.getByRole('button', { name: /Buscar pasajero por cédula/i }))
    await usuario.click(await screen.findByRole('button', { name: /Registrar salida/i }))

    await waitFor(() => expect(screen.getByText(/Salida autorizada/i)).toBeInTheDocument())
    expect(screen.queryByText(/Acceso autorizado/i)).not.toBeInTheDocument()
  })
})

describe('el personal interno no se añade desde la placa', () => {
  it('no ofrece "Añadir" y explica que se identifica por rostro', async () => {
    // El botón metía a la persona de un clic. Para el personal interno eso deja sin efecto el
    // reconocimiento facial, que es su única forma de identificarse (§D20) y el segundo factor
    // que RNF-CA-005 exige a quien conduce.
    const usuario = userEvent.setup()
    montar()

    await usuario.click(await screen.findByRole('tab', { name: /Ingreso vehicular/i }))
    await usuario.click(await screen.findByRole('button', { name: /Capturar placa/i }))

    // La persona asociada a la placa sigue viéndose: el guardia necesita saber de quién es.
    expect(await screen.findByText(/Guerra/)).toBeInTheDocument()
    // Pero no hay forma de añadirla desde ahí.
    expect(screen.queryByRole('button', { name: /^Añadir$/i })).not.toBeInTheDocument()
    expect(screen.getAllByText(/Se identifica por rostro/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/se añade por reconocimiento facial/i)).toBeInTheDocument()
  })
})
