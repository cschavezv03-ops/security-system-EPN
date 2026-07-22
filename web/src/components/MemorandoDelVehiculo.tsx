import { useEffect, useState } from 'react'
import { Building2, FileText, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmtFecha } from '../lib/format'
import { Spinner } from './ui'

interface MemorandoVehiculo {
  id_memorando: string
  numero_memorando: string
  empresa: string | null
  dependencia_autorizada: string | null
  fecha_inicio: string
  fecha_fin: string
  permite_acompanantes: boolean
  personas_autorizadas: number
}

/**
 * El respaldo del vehículo que el guardia tiene delante.
 *
 * Para el personal interno el segundo factor del ingreso vehicular es el rostro; para un
 * externo no puede serlo (§D20: no tiene registro biométrico), así que lo es **el memorando**.
 * Por eso, en cuanto se lee la placa, la garita tiene que poder contestar sin salir de la
 * pantalla: qué documento autoriza a este coche, de qué empresa viene, para qué dependencia y
 * hasta cuándo vale.
 *
 * Si no aparece nada, la respuesta también es útil y es la que importa: ese vehículo no tiene
 * memorando vigente detrás y su gente solo puede entrar a pie.
 */
export function MemorandoDelVehiculo({ idVehiculo }: { idVehiculo: string }) {
  const [memorandos, setMemorandos] = useState<MemorandoVehiculo[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vigente = true
    ;(async () => {
      setCargando(true)
      const { data } = await supabase.rpc('memorandos_vigentes_de_vehiculo', {
        p_id_vehiculo: idVehiculo,
      } as never)
      if (!vigente) return
      setMemorandos((data as MemorandoVehiculo[] | null) ?? [])
      setCargando(false)
    })()
    return () => { vigente = false }
  }, [idVehiculo])

  if (cargando) return <div className="mt-3"><Spinner /></div>

  if (memorandos.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
        <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
          <FileText className="h-4 w-4" /> Sin memorando vigente para este vehículo
        </p>
        <p className="mt-1 text-xs text-amber-800">
          Si sus ocupantes son personal externo, no pueden entrar conduciendo: el ingreso sería a
          pie. Si son personal interno, el vehículo se valida por la placa y el rostro, como
          siempre.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-2">
      {memorandos.map((m) => (
        <div key={m.id_memorando} className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-navy">
            <FileText className="h-4 w-4" /> {m.numero_memorando}
          </p>
          <dl className="mt-1.5 space-y-1 text-xs text-ink-soft">
            <div className="flex items-start gap-1.5">
              <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <dd className="text-navy">{m.empresa ?? 'Sin empresa registrada'}</dd>
            </div>
            {m.dependencia_autorizada && (
              <div>
                <dt className="inline">Acude a: </dt>
                <dd className="inline text-navy">{m.dependencia_autorizada}</dd>
              </div>
            )}
            <div>
              <dt className="inline">Autoriza el ingreso: </dt>
              <dd className="inline text-navy">
                del {fmtFecha(m.fecha_inicio)} al {fmtFecha(m.fecha_fin)} inclusive
              </dd>
            </div>
            <div className="flex items-start gap-1.5">
              <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <dd className="text-navy">
                {m.personas_autorizadas} persona(s) amparada(s)
                {m.permite_acompanantes ? ' · admite acompañantes' : ' · sin acompañantes declarados'}
              </dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  )
}
