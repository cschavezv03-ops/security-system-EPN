import { useEffect, useState } from 'react'
import { Car, DoorOpen, ShieldAlert, Timer } from 'lucide-react'
import { supabase, mensajeError } from '../../lib/supabase'
import { fmtFechaHora } from '../../lib/format'
import { formatearPlaca } from '../../lib/validacion'
import { Badge, Card, CenterSpinner, EmptyState, ErrorBanner } from '../../components/ui'

interface VehiculoDentro {
  id_vehiculo: string
  placa: string | null
  horas_dentro: number | null
  limite_horas_aplicable: number | null
  tipo_persona_conductor: string | null
  fecha_ingreso: string | null
}
interface EventoReciente {
  id_evento: string
  fecha_hora: string
  tipo_movimiento: string
  resultado: string
  motivo_resultado: string | null
  origen_registro: string
  es_conductor: boolean
  persona?: { nombres: string; apellidos: string; cedula: string } | null
  punto?: { nombre_punto: string } | null
  vehiculo?: { placa: string } | null
}

export function MonitoreoView() {
  const [vehiculos, setVehiculos] = useState<VehiculoDentro[]>([])
  const [eventos, setEventos] = useState<EventoReciente[]>([])
  const [alertasPend, setAlertasPend] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seleccionado, setSeleccionado] = useState<EventoReciente | null>(null)

  const cargar = async () => {
    setCargando(true)
    const [veh, ev, al] = await Promise.all([
      supabase.from('vista_vehiculos_dentro').select('*').order('horas_dentro', { ascending: false }),
      supabase
        .from('evento_acceso')
        .select('id_evento, fecha_hora, tipo_movimiento, resultado, motivo_resultado, origen_registro, es_conductor, persona:persona(nombres, apellidos, cedula), punto:punto_control(nombre_punto), vehiculo:vehiculo(placa)')
        .order('fecha_hora', { ascending: false })
        .limit(15),
      supabase.from('alerta_seguridad').select('id_alerta', { count: 'exact', head: true }).eq('estado_alerta', 'PENDIENTE'),
    ])
    if (veh.error) setError(mensajeError(veh.error))
    setVehiculos((veh.data as VehiculoDentro[] | null) ?? [])
    setEventos((ev.data as EventoReciente[] | null) ?? [])
    setAlertasPend(al.count ?? 0)
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 30000) // refresco periódico (30 s)
    return () => clearInterval(t)
  }, [])

  if (cargando) return <CenterSpinner label="Cargando panel de monitoreo..." />

  const excedidos = vehiculos.filter((v) => v.horas_dentro != null && v.limite_horas_aplicable != null && v.horas_dentro > v.limite_horas_aplicable)

  return (
    <div>
      <ErrorBanner message={error} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icono={<Car className="h-5 w-5" />} label="Vehículos dentro" valor={vehiculos.length} />
        <Stat icono={<Timer className="h-5 w-5" />} label="Permanencia excedida" valor={excedidos.length} tono={excedidos.length ? 'warn' : 'ok'} />
        <Stat icono={<ShieldAlert className="h-5 w-5" />} label="Alertas pendientes" valor={alertasPend} tono={alertasPend ? 'bad' : 'ok'} />
        <Stat icono={<DoorOpen className="h-5 w-5" />} label="Eventos (últimos)" valor={eventos.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <h3 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-navy">Vehículos dentro del campus</h3>
          {vehiculos.length === 0 ? (
            <EmptyState title="No hay vehículos dentro" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-ink-soft">
                    <th className="px-4 py-2">Placa</th>
                    <th className="px-4 py-2">Conductor</th>
                    <th className="px-4 py-2">Horas</th>
                    <th className="px-4 py-2">Límite</th>
                  </tr>
                </thead>
                <tbody>
                  {vehiculos.map((v) => {
                    const excede = v.horas_dentro != null && v.limite_horas_aplicable != null && v.horas_dentro > v.limite_horas_aplicable
                    return (
                      <tr key={v.id_vehiculo} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2 font-medium text-navy">{v.placa ? formatearPlaca(v.placa) : '—'}</td>
                        <td className="px-4 py-2"><Badge value={v.tipo_persona_conductor ?? '—'} /></td>
                        <td className={'px-4 py-2 ' + (excede ? 'font-semibold text-red' : '')}>{v.horas_dentro?.toFixed(1) ?? '—'} h</td>
                        <td className="px-4 py-2 text-ink-soft">{v.limite_horas_aplicable ?? '—'} h</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <h3 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-navy">Eventos recientes</h3>
          {eventos.length === 0 ? (
            <EmptyState title="Sin eventos recientes" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {eventos.map((e) => (
                <li
                  key={e.id_evento}
                  onClick={() => setSeleccionado(e)}
                  className={
                    'flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-50 ' +
                    (seleccionado?.id_evento === e.id_evento ? 'bg-slate-50' : '')
                  }
                >
                  <div>
                    <p className="font-medium text-navy">{e.persona ? `${e.persona.apellidos} ${e.persona.nombres}` : '—'}</p>
                    <p className="text-xs text-ink-soft">{e.punto?.nombre_punto ?? '—'} · {fmtFechaHora(e.fecha_hora)}</p>
                  </div>
                  <div className="flex gap-1.5"><Badge value={e.tipo_movimiento} /><Badge value={e.resultado} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {seleccionado && (
        <Card className="mt-6 p-5">
          <h3 className="mb-3 text-sm font-semibold text-navy">Detalle del evento seleccionado</h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-ink-soft">Persona</dt><dd className="text-navy">{seleccionado.persona ? `${seleccionado.persona.apellidos} ${seleccionado.persona.nombres}` : '—'}</dd></div>
            <div><dt className="text-xs text-ink-soft">Cédula</dt><dd className="text-navy">{seleccionado.persona?.cedula ?? '—'}</dd></div>
            <div><dt className="text-xs text-ink-soft">Punto de control</dt><dd className="text-navy">{seleccionado.punto?.nombre_punto ?? '—'}</dd></div>
            <div><dt className="text-xs text-ink-soft">Fecha y hora</dt><dd className="text-navy">{fmtFechaHora(seleccionado.fecha_hora)}</dd></div>
            <div><dt className="text-xs text-ink-soft">Movimiento</dt><dd><Badge value={seleccionado.tipo_movimiento} /></dd></div>
            <div><dt className="text-xs text-ink-soft">Resultado</dt><dd><Badge value={seleccionado.resultado} /></dd></div>
            <div><dt className="text-xs text-ink-soft">Origen de registro</dt><dd><Badge value={seleccionado.origen_registro} /></dd></div>
            <div><dt className="text-xs text-ink-soft">Vehículo</dt><dd className="text-navy">{seleccionado.vehiculo?.placa ? formatearPlaca(seleccionado.vehiculo.placa) : '— (peatonal)'}</dd></div>
            {seleccionado.vehiculo && <div><dt className="text-xs text-ink-soft">Es conductor</dt><dd className="text-navy">{seleccionado.es_conductor ? 'Sí' : 'No'}</dd></div>}
            {seleccionado.motivo_resultado && <div className="col-span-2 sm:col-span-4"><dt className="text-xs text-ink-soft">Motivo</dt><dd className="text-navy">{seleccionado.motivo_resultado}</dd></div>}
          </dl>
        </Card>
      )}
      <p className="mt-3 text-xs text-slate-400">Se actualiza automáticamente cada 30 segundos.</p>
    </div>
  )
}

function Stat({ icono, label, valor, tono = 'neutral' }: { icono: React.ReactNode; label: string; valor: number; tono?: 'ok' | 'warn' | 'bad' | 'neutral' }) {
  const color = tono === 'bad' ? 'text-red' : tono === 'warn' ? 'text-amber-600' : tono === 'ok' ? 'text-emerald-600' : 'text-navy'
  return (
    <Card className="p-4">
      <div className={'mb-1 flex items-center gap-2 ' + color}>{icono}<span className="text-xs font-medium text-ink-soft">{label}</span></div>
      <p className={'text-2xl font-bold ' + color}>{valor}</p>
    </Card>
  )
}
