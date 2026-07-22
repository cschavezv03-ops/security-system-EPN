import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Los mensajes de error del inicio de sesión, uno por causa.
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
  it('bloqueada por un administrador: dice que NO es la contraseña y a quién acudir', async () => {
    responder({ error_code: 'account_blocked' })
    const mensaje = await iniciarSesion('jungkook.jeon@epn.edu.ec', 'la-correcta')

    expect(mensaje).toMatch(/bloqueada por un administrador/i)
    // Lo que más importa: que no se le eche la culpa a la contraseña, que es correcta.
    expect(mensaje).toMatch(/no es un problema de contraseña/i)
    expect(mensaje).not.toMatch(/incorrectos/i)
  })

  it('dada de baja: no promete un desbloqueo que no va a llegar', async () => {
    responder({ error_code: 'account_disabled' })
    const mensaje = await iniciarSesion('gary.defas@epn.edu.ec', 'la-correcta')

    expect(mensaje).toMatch(/dada de baja/i)
    expect(mensaje).not.toMatch(/incorrectos/i)
    // Una cuenta dada de baja no se "desbloquea": si el mensaje lo insinuara, la persona
    // esperaría a que le devolvieran un acceso que ya no existe.
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

  it('los cinco mensajes son distintos entre sí', async () => {
    const mensajes: (string | null)[] = []
    for (const cuerpo of [
      { error_code: 'account_blocked' },
      { error_code: 'account_disabled' },
      { error_code: 'account_inactive' },
      { error_code: 'account_locked', minutos_restantes: 5 },
      { error_code: 'invalid_credentials', intentos_restantes: 3 },
    ]) {
      responder(cuerpo)
      mensajes.push(await iniciarSesion('a@epn.edu.ec', 'x'))
    }

    expect(new Set(mensajes).size).toBe(5)
    expect(mensajes.every((m) => typeof m === 'string' && m.length > 0)).toBe(true)
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
