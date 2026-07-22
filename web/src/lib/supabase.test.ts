import { afterEach, describe, expect, it, vi } from 'vitest'
import { iniciarSesion } from './supabase'

afterEach(() => vi.unstubAllGlobals())

function responder(error_code: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    json: () => Promise.resolve({ error_code }),
  }))
}

describe('mensajes de estado al iniciar sesión', () => {
  it.each([
    ['account_blocked_by_admin', /bloqueada por el administrador/i],
    ['account_deactivated', /dada de baja/i],
    ['account_inactive', /cuenta está inactiva/i],
    ['account_state_unavailable', /no se pudo verificar el estado/i],
  ])('distingue %s de credenciales incorrectas', async (codigo, texto) => {
    responder(codigo)
    await expect(iniciarSesion('persona@epn.edu.ec', 'clave')).resolves.toMatch(texto)
  })
})
