import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * Lo que la garita ve al leer la placa de un externo.
 *
 * Para el personal interno el segundo factor del ingreso vehicular es el rostro. Un externo no
 * tiene registro biométrico (§D20), así que su segundo factor es el memorando: sin él no entra
 * conduciendo. Este panel es lo que le permite al guardia comprobarlo antes de decidir
 * (RF-CA-011) en vez de fiarse de una etiqueta.
 *
 * El caso sin memorando importa tanto como el otro: el guardia tiene que entender que ese coche
 * no pasa y que su gente puede entrar a pie.
 */

const { supabase, rpcLlamada, filas } = vi.hoisted(() => {
  const rpcLlamada: { nombre?: string; args?: unknown } = {}
  // Lo que devolverá la función de la base en cada prueba.
  const filas: { valor: unknown[] } = { valor: [] }
  return {
    rpcLlamada,
    filas,
    supabase: {
      rpc: (nombre: string, args: unknown) => {
        rpcLlamada.nombre = nombre
        rpcLlamada.args = args
        return Promise.resolve({ data: filas.valor, error: null })
      },
    },
  }
})

vi.mock('../lib/supabase', () => ({ supabase }))

const { MemorandoDelVehiculo } = await import('./MemorandoDelVehiculo')

const MEMORANDO_VIGENTE = {
  id_memorando: 'm-1',
  numero_memorando: 'EPN-DL-2026-002',
  empresa: 'DILIPA Cía. Ltda.',
  dependencia_autorizada: 'Dirección de Logística',
  fecha_inicio: '2026-07-21',
  fecha_fin: '2026-07-22',
  permite_acompanantes: true,
  personas_autorizadas: 2,
}

function montar() {
  return render(<MemorandoDelVehiculo idVehiculo="v-1" />)
}

describe('memorando que ampara al vehículo', () => {
  it('muestra el número, la empresa, la dependencia y hasta cuándo vale', async () => {
    filas.valor = [MEMORANDO_VIGENTE]
    montar()

    expect(await screen.findByText('EPN-DL-2026-002')).toBeInTheDocument()
    expect(screen.getByText('DILIPA Cía. Ltda.')).toBeInTheDocument()
    expect(screen.getByText(/Dirección de Logística/)).toBeInTheDocument()
    // Las fechas, sin el desfase de un día: el memorando vale hasta el 22, no hasta el 21.
    expect(screen.getByText(/del 21\/07\/2026 al 22\/07\/2026/)).toBeInTheDocument()
  })

  it('dice cuánta gente ampara y si admite acompañantes', async () => {
    filas.valor = [MEMORANDO_VIGENTE]
    montar()

    expect(await screen.findByText(/2 persona\(s\) amparada\(s\)/)).toBeInTheDocument()
    expect(screen.getByText(/admite acompañantes/)).toBeInTheDocument()
  })

  it('avisa de que no hay memorando y de que entonces el ingreso es a pie', async () => {
    filas.valor = []
    montar()

    expect(await screen.findByText(/Sin memorando vigente para este vehículo/)).toBeInTheDocument()
    expect(screen.getByText(/no pueden entrar conduciendo/)).toBeInTheDocument()
    expect(screen.getByText(/ingreso sería a pie/)).toBeInTheDocument()
  })

  it('pregunta por el vehículo que tiene delante', async () => {
    filas.valor = [MEMORANDO_VIGENTE]
    montar()
    await screen.findByText('EPN-DL-2026-002')

    // La vigencia la decide la base con la fecha de Ecuador, no el navegador: por eso se
    // consulta la función y no se filtra en el cliente.
    expect(rpcLlamada.nombre).toBe('memorandos_vigentes_de_vehiculo')
    expect(rpcLlamada.args).toEqual({ p_id_vehiculo: 'v-1' })
  })
})
