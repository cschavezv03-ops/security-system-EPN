import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Los mensajes de error del inicio de sesión, uno por causa.
 *
 * Complementa a `supabase.test.ts`, que comprueba que cada código produce su texto. Lo que se
 * fija aquí es lo que esa comprobación no puede ver: que los mensajes sean **distintos entre
 * sí** y que ninguno prometa algo que no va a pasar.
 *
 * El bug que estas pruebas evitan que vuelva: a una cuenta bloqueada o dada de baja por un
 * administrador se le respondía **"correo o contraseña incorrectos"**. Era falso —la contraseña
 * estaba bien— y además dejaba a la persona intentándolo una y otra vez, convencida de que se
 * había equivocado al teclear, mientras el sistema le contaba intentos fallidos que nunca
 * cometió.
 *
 * Las cuatro causas son distintas y se arreglan de forma distinta:
 *
 *   bloqueado por el admin  -> lo desbloquea el administrador
 *   dado de baja            -> no tiene arreglo; la cuenta ya no sirve
 *   bloqueo por 5 intentos  -> se espera y se resuelve solo
 *   contraseña mal          -> lo arregla quien teclea
 *
 * Decirle a las cuatro lo mismo es no decir nada.
 */

const { setSession } = vi.hoisted(() => ({ setSession: vi.fn() }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { setSession, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  }),
}))

const { iniciarSesion } = await import('./supabase')

/** Simula la respuesta de la Edge Function `iniciar-sesion`. */
function responder(cuerpo: Record<string, unknown>, ok = false) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(cuerpo),
  }))
}

beforeEach(() => {
  setSession.mockReset().mockResolvedValue({ error: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cada causa de rechazo tiene su propio mensaje', () => {
  it('bloqueada por un administrador: no se le echa la culpa a la contraseña', async () => {
    responder({ error_code: 'account_blocked_by_admin' })
    const mensaje = await iniciarSesion('jungkook.jeon@epn.edu.ec', 'la-correcta')

    expect(mensaje).toMatch(/bloqueada por el administrador/i)
    // Lo que más importa: la contraseña era correcta, así que el mensaje no puede sugerir
    // lo contrario. Ese era justo el bug.
    expect(mensaje).not.toMatch(/incorrectos/i)
    expect(mensaje).toMatch(/desbloqueo/i)
  })

  it('dada de baja: habla de reactivación, no de desbloqueo', async () => {
    responder({ error_code: 'account_deactivated' })
    const mensaje = await iniciarSesion('gary.defas@epn.edu.ec', 'la-correcta')

    expect(mensaje).toMatch(/dada de baja/i)
    expect(mensaje).not.toMatch(/incorrectos/i)
    // Una cuenta dada de baja no se "desbloquea", se reactiva. Confundir los dos verbos manda
    // a la persona a pedir lo que no es.
    expect(mensaje).toMatch(/reactivaci/i)
    expect(mensaje).not.toMatch(/desbloque/i)
  })

  it('inactiva: se distingue de las otras dos', async () => {
    responder({ error_code: 'account_inactive' })
    const mensaje = await iniciarSesion('alguien@epn.edu.ec', 'la-correcta')

    expect(mensaje).toMatch(/inactiva/i)
    expect(mensaje).not.toMatch(/incorrectos/i)
  })

  it('bloqueo temporal por intentos: dice cuánto falta, porque se resuelve solo', async () => {
    responder({ error_code: 'account_locked', minutos_restantes: 12 })
    const mensaje = await iniciarSesion('alguien@epn.edu.ec', 'la-que-sea')

    expect(mensaje).toMatch(/temporalmente/i)
    expect(mensaje).toMatch(/12 minutos/)
    // Es el único caso en el que esperar sirve de algo, así que el tiempo es la información útil.
  })

  it('contraseña incorrecta: avisa de cuántos intentos quedan', async () => {
    responder({ error_code: 'invalid_credentials', intentos_restantes: 2 })
    const mensaje = await iniciarSesion('admin@epn.edu.ec', 'mal-tecleada')

    expect(mensaje).toMatch(/incorrectos/i)
    expect(mensaje).toMatch(/2 intentos/)
  })

  it('el singular y el plural están cuidados', async () => {
    responder({ error_code: 'invalid_credentials', intentos_restantes: 1 })
    expect(await iniciarSesion('a@epn.edu.ec', 'x')).toMatch(/1 intento antes/)

    responder({ error_code: 'account_locked', minutos_restantes: 1 })
    expect(await iniciarSesion('a@epn.edu.ec', 'x')).toMatch(/1 minuto,/)
  })

  it('los seis mensajes son distintos entre sí', async () => {
    // El bug original era exactamente este: causas distintas con el MISMO texto. Que cada
    // código tenga su mensaje no basta si dos acaban diciendo lo mismo.
    const mensajes: (string | null)[] = []
    for (const cuerpo of [
      { error_code: 'account_blocked_by_admin' },
      { error_code: 'account_deactivated' },
      { error_code: 'account_inactive' },
      { error_code: 'account_state_unavailable' },
      { error_code: 'account_locked', minutos_restantes: 5 },
      { error_code: 'invalid_credentials', intentos_restantes: 3 },
    ]) {
      responder(cuerpo)
      mensajes.push(await iniciarSesion('a@epn.edu.ec', 'x'))
    }

    expect(new Set(mensajes).size).toBe(6)
    expect(mensajes.every((m) => typeof m === 'string' && m.length > 0)).toBe(true)
    // Y ninguno de los cinco rechazos por estado puede sonar a contraseña equivocada.
    expect(mensajes.slice(0, 5).every((m) => !/incorrectos/i.test(m ?? ''))).toBe(true)
  })
})

describe('el camino correcto sigue funcionando', () => {
  it('con credenciales válidas instala la sesión y no devuelve error', async () => {
    responder({ access_token: 'token-a', refresh_token: 'token-r' }, true)

    const mensaje = await iniciarSesion('admin@epn.edu.ec', 'admin1234')

    expect(mensaje).toBeNull()
    expect(setSession).toHaveBeenCalledWith({
      access_token: 'token-a',
      refresh_token: 'token-r',
    })
  })

  it('si el servidor no responde, lo dice sin culpar a la contraseña', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))

    const mensaje = await iniciarSesion('admin@epn.edu.ec', 'admin1234')

    expect(mensaje).toMatch(/no se pudo conectar/i)
    expect(mensaje).not.toMatch(/incorrectos/i)
  })
})
