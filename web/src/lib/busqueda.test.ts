import { describe, expect, it } from 'vitest'
import { normalizarBusqueda } from './busqueda'

describe('normalizarBusqueda', () => {
  it('normaliza tildes sin alterar las letras', () => {
    expect(normalizarBusqueda('Calderón Álvarez')).toBe('calderon alvarez')
  })
})
