import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Pruebas del panel único de Usuarios (Requerimientos_ADM).
 *
 * Lo que protegen es concretamente lo que el equipo pidió comprobar antes de la entrega:
 * que el rol, la cédula y las fechas se vean en la MISMA pantalla, y que el alta busque a
 * la persona por cédula en vez de ofrecer un combo con todas.
 */

/** Filas que devolverá el mock de `usuario_sistema`. */
const USUARIOS = [
  {
    id_usuario: 'u-gary',
    nombre_usuario: 'gary.defas',
    correo_electronico: 'gary.defas@epn.edu.ec',
    estado_usuario: 'ACTIVO',
    requiere_cambio_password: false,
    fecha_ultimo_login: '2026-07-18T12:00:00Z',
    intentos_fallidos: 0,
    bloqueado_hasta: null,
    persona: { nombres: 'Gary', apellidos: 'Defas', cedula: '1750000109' },
    roles: [
      {
        id_usuario_rol: 'ur-1',
        estado_asignacion: 'ACTIVO',
        fecha_asignacion: '2026-07-14T10:00:00Z',
        fecha_revocacion: null,
        observacion: null,
        rol: { id_rol: 'r-dir', nombre_rol: 'DIRECTOR_ADMINISTRATIVO' },
      },
    ],
  },
  {
    id_usuario: 'u-sinrol',
    nombre_usuario: 'sin.rol',
    correo_electronico: 'sin.rol@epn.edu.ec',
    estado_usuario: 'ACTIVO',
    requiere_cambio_password: false,
    fecha_ultimo_login: null,
    intentos_fallidos: 0,
    bloqueado_hasta: null,
    persona: { nombres: 'Sin', apellidos: 'Rol', cedula: '1750000240' },
    roles: [],
  },
]

const PERSONA_BUSCADA = {
  id_persona: 'p-nueva',
  cedula: '1750000117',
  nombres: 'Lenin',
  apellidos: 'Amangandi',
  correo: 'lenin.amangandi@epn.edu.ec',
  tipo_persona: 'INTERNA',
  estado: 'ACTIVO',
  categoria: { codigo_categoria: 'ADMINISTRATIVO' },
}

const { supabase } = vi.hoisted(() => {
  /**
   * Constructor de consultas encadenables: select/eq/order devuelven la misma cadena.
   *
   * `maybeSingle()` tiene su propio resultado porque en PostgREST devuelve UNA fila o
   * null, no la lista: si devolviera la lista, la comprobación de "esta persona ya tiene
   * cuenta" daría siempre positiva y la prueba mediría el mock, no la pantalla.
   */
  const consulta = (
    resultado: { data: unknown; error: unknown },
    resultadoUnico: { data: unknown; error: unknown },
  ) => {
    const chain: Record<string, unknown> = {}
    const devolver = () => chain
    Object.assign(chain, {
      select: devolver,
      eq: devolver,
      order: devolver,
      update: devolver,
      insert: () => Promise.resolve({ error: null }),
      maybeSingle: () => Promise.resolve(resultadoUnico),
      // La cadena es "thenable": `await supabase.from(x).select(y)` la resuelve.
      then: (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) =>
        Promise.resolve(resultado).then(ok, mal),
    })
    return chain
  }

  // `vi.hoisted` corre antes que las constantes del módulo, así que las filas se inyectan
  // más abajo con `__set`. Aquí solo queda lo que no depende de ellas.
  const porTabla: Record<string, { data: unknown; error: unknown }> = {
    rol: {
      data: [
        { id_rol: 'r-dir', nombre_rol: 'DIRECTOR_ADMINISTRATIVO' },
        { id_rol: 'r-adm', nombre_rol: 'ADMINISTRADOR_SISTEMA' },
      ],
      error: null,
    },
  }

  // Resultado de `maybeSingle()`. Por defecto "no hay fila": es lo que devuelve la
  // consulta de cuenta existente para una persona que todavía no la tiene.
  const porTablaUnico: Record<string, { data: unknown; error: unknown }> = {}

  return {
    supabase: {
      from: (tabla: string) =>
        consulta(
          porTabla[tabla] ?? { data: [], error: null },
          porTablaUnico[tabla] ?? { data: null, error: null },
        ),
      rpc: () => Promise.resolve({ error: null }),
      auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 't' } } }) },
      /** Permite a cada prueba cambiar lo que devuelve una tabla. */
      __set: (tabla: string, resultado: { data: unknown; error: unknown }) => {
        porTabla[tabla] = resultado
      },
      __setUnico: (tabla: string, resultado: { data: unknown; error: unknown }) => {
        porTablaUnico[tabla] = resultado
      },
    },
  }
})

// `vi.hoisted` se evalúa antes que las constantes del módulo, así que las referencias se
// inyectan aquí, ya con los valores construidos arriba.
/* eslint-disable @typescript-eslint/no-explicit-any */
;(supabase as any).__set('usuario_sistema', { data: USUARIOS, error: null })
;(supabase as any).__setUnico('persona', { data: PERSONA_BUSCADA, error: null })
;(supabase as any).__set('categoria_persona', {
  data: [
    { id_categoria: 'c-adm', codigo_categoria: 'ADMINISTRATIVO' },
    { id_categoria: 'c-tra', codigo_categoria: 'TRABAJADOR' },
  ],
  error: null,
})
/* eslint-enable @typescript-eslint/no-explicit-any */

vi.mock('../../lib/supabase', () => ({
  supabase,
  mensajeError: (e: { message?: string }) => e?.message ?? 'Error',
}))

const PERMISOS = new Set([
  'ADM_USUARIO_SELECT', 'ADM_USUARIO_INSERT', 'ADM_USUARIO_ROL_SELECT',
  'ADM_USUARIO_ROL_INSERT', 'ADM_USUARIO_ROL_UPDATE',
])

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({
    tiene: (p: string) => PERMISOS.has(p),
    perfil: { id_usuario: 'u-admin' },
  }),
}))

const { UsuariosScreen } = await import('./UsuariosScreen')

afterEach(() => {
  ;(supabase as any).__setUnico('persona', { data: PERSONA_BUSCADA, error: null })
})

describe('UsuariosScreen', () => {
  it('muestra rol, cédula y fecha de asignación en la misma tabla', async () => {
    render(<UsuariosScreen />)

    const fila = (await screen.findByText('gary.defas')).closest('tr')!
    // El requisito es justamente este: sin salir de "Usuarios" se ve a quién pertenece la
    // cuenta, con qué documento y desde cuándo tiene el rol.
    expect(within(fila).getByText('1750000109')).toBeInTheDocument()
    expect(within(fila).getByText('Director Administrativo')).toBeInTheDocument()
    expect(within(fila).getByText(/desde/i)).toBeInTheDocument()
  })

  it('avisa de las cuentas que no tienen ningún rol', async () => {
    render(<UsuariosScreen />)

    const fila = (await screen.findByText('sin.rol')).closest('tr')!
    // Una cuenta sin rol entra al sistema y no ve nada: tiene que saltar a la vista.
    expect(within(fila).getByText(/sin rol asignado/i)).toBeInTheDocument()
  })

  it('la ficha del usuario permite cambiar y revocar el rol sin cambiar de pantalla', async () => {
    const usuario = userEvent.setup()
    render(<UsuariosScreen />)

    await usuario.click(await screen.findByText('gary.defas'))

    expect(await screen.findByText('Rol de la cuenta')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /revocar el rol director administrativo/i })).toBeInTheDocument()
  })

  it('con un rol ya asignado, la acción es CAMBIAR y avisa de que sustituye al anterior', async () => {
    // Una cuenta solo puede tener un rol activo: elegir otro no suma, reemplaza. Decirlo
    // después de pulsar sería tarde — el rol anterior ya estaría revocado.
    const usuario = userEvent.setup()
    render(<UsuariosScreen />)

    await usuario.click(await screen.findByText('gary.defas'))
    await usuario.click(await screen.findByRole('button', { name: /cambiar rol/i }))

    expect(await screen.findByText(/sustituirá al rol actual/i)).toBeInTheDocument()
    expect(screen.getByText('Director Administrativo', { selector: 'b' })).toBeInTheDocument()
  })

  it('el alta busca la persona por cédula y no ofrece un combo con todas', async () => {
    const usuario = userEvent.setup()
    render(<UsuariosScreen />)

    await usuario.click(await screen.findByRole('button', { name: /crear usuario/i }))

    expect(await screen.findByLabelText(/cédula de la persona/i)).toBeInTheDocument()
    // El combo antiguo cargaba todas las personas del sistema: no debe volver.
    expect(screen.queryByLabelText(/^persona$/i)).not.toBeInTheDocument()
  })

  it('el alta rápida de una persona no pide escoger categoría', async () => {
    const usuario = userEvent.setup()
    ;(supabase as any).__setUnico('persona', { data: null, error: null })
    render(<UsuariosScreen />)

    await usuario.click(await screen.findByRole('button', { name: /crear usuario/i }))
    await usuario.type(await screen.findByLabelText(/cédula de la persona/i), '1750000117')
    await usuario.click(screen.getByRole('button', { name: /buscar/i }))

    expect(await screen.findByText(/Registrar a esta persona/i)).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /categoría/i })).not.toBeInTheDocument()
    expect(screen.getByText(/se asigna automáticamente según el rol/i)).toBeInTheDocument()

  })

  it('propone el nombre de usuario a partir de la persona encontrada', async () => {
    const usuario = userEvent.setup()
    render(<UsuariosScreen />)

    await usuario.click(await screen.findByRole('button', { name: /crear usuario/i }))
    await usuario.type(await screen.findByLabelText(/cédula de la persona/i), '1750000117')
    await usuario.click(screen.getByRole('button', { name: /buscar/i }))

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /nombre de usuario/i })).toHaveValue('lenin.amangandi'),
    )
  })

  it('conserva el borrador del alta si se abandona el formulario', async () => {
    const usuario = userEvent.setup()
    const { unmount } = render(<UsuariosScreen />)

    await usuario.click(await screen.findByRole('button', { name: /crear usuario/i }))
    await usuario.type(await screen.findByRole('textbox', { name: /nombre de usuario/i }), 'nuevo.usuario')

    // useBorrador guarda con retardo; se espera a que aparezca en el almacenamiento.
    await waitFor(
      () => expect(localStorage.getItem('epn.borrador:u-admin:ADM:usuario_sistema:nuevo')).toContain('nuevo.usuario'),
      { timeout: 3000 },
    )

    unmount()
    const usuario2 = userEvent.setup()
    render(<UsuariosScreen />)
    await usuario2.click(await screen.findByRole('button', { name: /crear usuario/i }))

    expect(await screen.findByRole('textbox', { name: /nombre de usuario/i })).toHaveValue('nuevo.usuario')
  })

  /**
   * REGRESIÓN de la incidencia de lady.celina / lady.velasquez.
   *
   * El buscador encontraba a la persona pero dejaba el correo vacío, así que había que
   * teclearlo a mano. Ahí se coló la errata que dejó la cuenta entrando con un correo
   * distinto al de la persona durante días.
   */
  it('propone el correo de la persona encontrada, no lo deja en blanco', async () => {
    const usuario = userEvent.setup()
    render(<UsuariosScreen />)

    await usuario.click(await screen.findByRole('button', { name: /crear usuario/i }))
    await usuario.type(await screen.findByLabelText(/cédula de la persona/i), '1750000117')
    await usuario.click(screen.getByRole('button', { name: /buscar/i }))

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /correo institucional/i })).toHaveValue('lenin.amangandi@epn.edu.ec'),
    )
  })

  it('nunca guarda datos sensibles en el borrador', async () => {
    const usuario = userEvent.setup()
    render(<UsuariosScreen />)

    await usuario.click(await screen.findByRole('button', { name: /crear usuario/i }))
    await usuario.type(await screen.findByRole('textbox', { name: /correo institucional/i }), 'nuevo@epn.edu.ec')

    await waitFor(
      () => expect(localStorage.getItem('epn.borrador:u-admin:ADM:usuario_sistema:nuevo')).toBeTruthy(),
      { timeout: 3000 },
    )
    const guardado = localStorage.getItem('epn.borrador:u-admin:ADM:usuario_sistema:nuevo')!
    expect(guardado.toLowerCase()).not.toContain('password')
    expect(guardado.toLowerCase()).not.toContain('contrase')
  })
})
