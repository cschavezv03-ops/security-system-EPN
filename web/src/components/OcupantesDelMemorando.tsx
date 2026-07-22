import { useEffect, useState } from 'react'
import { IdCard } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Button, Input, Spinner } from './ui'

export interface PersonaAmparada {
  id_persona: string
  cedula: string
  nombres: string
  apellidos: string
  numero_memorando: string
}

/**
 * Los ocupantes que el memorando autoriza, y la comprobación de su cédula.
 *
 * Antes, al leer la placa, la garita listaba a las personas asociadas al vehículo con un botón
 * "Añadir" que las metía de un clic. Eso se saltaba lo único que identifica a un externo: §D20
 * dice que el personal externo se identifica **con su cédula, tecleada por el guardia**. Un
 * botón que añade a alguien porque su nombre está en la pantalla no comprueba nada — bastaría
 * con conocer la placa para que subiera cualquiera.
 *
 * Ahora el guardia tiene que pedir el documento y teclear el número. El botón solo se habilita
 * cuando coincide con la cédula que el memorando ampara. Además la lista sale del **memorando**
 * y no de `persona_vehiculo`: estar asociado a un coche no autoriza a entrar, lo que autoriza
 * es el oficio.
 */
export function OcupantesDelMemorando({
  idVehiculo, yaAnadido, onAnadir,
}: {
  idVehiculo: string
  yaAnadido: (idPersona: string) => boolean
  onAnadir: (persona: PersonaAmparada) => void
}) {
  const [personas, setPersonas] = useState<PersonaAmparada[]>([])
  const [cargando, setCargando] = useState(true)
  /** Lo tecleado para cada persona, por id. */
  const [tecleado, setTecleado] = useState<Record<string, string>>({})

  useEffect(() => {
    let vigente = true
    ;(async () => {
      setCargando(true)
      const { data } = await supabase.rpc('personas_amparadas_por_vehiculo', {
        p_id_vehiculo: idVehiculo,
      } as never)
      if (!vigente) return
      setPersonas((data as PersonaAmparada[] | null) ?? [])
      setCargando(false)
    })()
    return () => { vigente = false }
  }, [idVehiculo])

  if (cargando) return <div className="mt-3"><Spinner /></div>
  if (personas.length === 0) return null

  return (
    <div className="mt-3">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-soft">
        <IdCard className="h-3.5 w-3.5" /> Ocupantes que ampara el memorando
      </p>
      <p className="mb-2 text-xs text-ink-soft">
        Pida el documento y escriba la cédula. Solo se puede añadir a quien la presente.
      </p>

      <ul className="space-y-2">
        {personas.map((p) => {
          const escrito = (tecleado[p.id_persona] ?? '').replace(/\D/g, '')
          const coincide = escrito === p.cedula
          const anadido = yaAnadido(p.id_persona)
          // Solo se avisa del desajuste cuando ya hay cédula completa: hacerlo a cada tecla
          // convertiría el aviso en ruido mientras se escribe.
          const noCoincide = escrito.length >= 10 && !coincide

          return (
            <li key={p.id_persona} className="rounded-md border border-slate-200 px-3 py-2">
              <p className="text-sm font-medium text-navy">{p.apellidos} {p.nombres}</p>
              <p className="mb-2 text-xs text-ink-soft">Memorando {p.numero_memorando}</p>

              {anadido ? (
                <p className="text-xs font-medium text-emerald-700">
                  ✔ Cédula verificada · añadido a los ocupantes
                </p>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Input
                      id={`cedula-ocupante-${p.id_persona}`}
                      inputMode="numeric"
                      maxLength={10}
                      value={tecleado[p.id_persona] ?? ''}
                      onChange={(e) =>
                        setTecleado((t) => ({ ...t, [p.id_persona]: e.target.value.replace(/\D/g, '').slice(0, 10) }))
                      }
                      placeholder="Cédula del documento"
                      aria-label={`Cédula de ${p.apellidos} ${p.nombres}`}
                    />
                    <Button variant="secondary" disabled={!coincide} onClick={() => onAnadir(p)}>
                      Añadir
                    </Button>
                  </div>
                  {noCoincide && (
                    <p className="mt-1 text-xs text-red">
                      No coincide con la cédula que ampara el memorando.
                    </p>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
