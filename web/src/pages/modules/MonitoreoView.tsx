import { useEffect, useState } from 'react'
import { AlertTriangle, Car, DoorOpen, ShieldAlert, Timer } from 'lucide-react'
import { supabase, mensajeError } from '../../lib/supabase'
import { fmtFechaHora } from '../../lib/format'
import { formatearPlaca } from '../../lib/validacion'
import { humanizar, MOTIVO_LEGIBLE } from '../../lib/catalogos'
import { Badge, Card, CenterSpinner, EmptyState, ErrorBanner, SidePanel } from '../../components/ui'
import { DetalleEvento } from '../../components/DetalleEvento'

interface VehiculoDentro {
  id_vehiculo: string
  placa: string | null
  horas_dentro: number | null
  limite_horas_aplicable: number | null
  tipo_persona_conductor: string | null
  // La vista traía solo el tipo (Interna/Externa): la columna decía "Conductor" pero no decía
  // quién era. Añadidos en la migración vista_vehiculos_dentro_con_conductor.
  nombres_conductor: string | null
  apellidos_conductor: string | null
  cedula_conductor: string | null
  fecha_ingreso: string | null
}
interface EventoReciente {
  tipo: 'evento'
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
/** Fallo técnico del reconocimiento (RF-CA-022: cámara caída, rostro no detectado en la
 *  imagen, servicio no disponible...), no un intento de acceso. Antes solo se veía en la
 *  pantalla dedicada de "Errores de reconocimiento"; aquí se mezcla con los eventos para que
 *  el panel de monitoreo muestre TODO lo que pasó en una garita, no solo los accesos resueltos. */
interface ErrorReciente {
  tipo: 'error'
  id_error: string
  fecha_hora: string
  tipo_reconocimiento: string
  codigo_error: string
  descripcion: string
  punto?: { nombre_punto: string } | null
}
type Movimiento = EventoReciente | ErrorReciente

export function MonitoreoView() {
  const [vehiculos, setVehiculos] = useState<VehiculoDentro[]>([])
  const [eventos, setEventos] = useState<Movimiento[]>([])
  const [alertasPend, setAlertasPend] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seleccionado, setSeleccionado] = useState<Movimiento | null>(null)

  const cargar = async () => {
    setCargando(true)
    const [veh, ev, errRec, al] = await Promise.all([
      supabase.from('vista_vehiculos_dentro').select('*').order('horas_dentro', { ascending: false }),
      supabase
        .from('evento_acceso')
        .select('id_evento, fecha_hora, tipo_movimiento, resultado, motivo_resultado, origen_registro, es_conductor, persona:persona(nombres, apellidos, cedula), punto:punto_control(nombre_punto), vehiculo:vehiculo(placa)')
        .order('fecha_hora', { ascending: false })
        .limit(15),
      supabase
        .from('error_reconocimiento')
        .select('id_error, fecha_hora, tipo_reconocimiento, codigo_error, descripcion, punto:punto_control(nombre_punto)')
        .order('fecha_hora', { ascending: false })
        .limit(15),
      supabase.from('alerta_seguridad').select('id_alerta', { count: 'exact', head: true }).eq('estado_alerta', 'PENDIENTE'),
    ])
    if (veh.error) setError(mensajeError(veh.error))
    setVehiculos((veh.data as VehiculoDentro[] | null) ?? [])
    const eventosData: Movimiento[] = ((ev.data ?? []) as any[]).map((e) => ({ tipo: 'evento', ...e }))
    const erroresData: Movimiento[] = ((errRec.data ?? []) as any[]).map((e) => ({ tipo: 'error', ...e }))
    setEventos(
      [...eventosData, ...erroresData]
        .sort((a, b) => new Date(b.fecha_hora).getTime() - new Date(a.fecha_hora).getTime())
        .slice(0, 15),
    )
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
                        <td className="px-4 py-2">
                          {v.apellidos_conductor ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium text-navy">{`${v.apellidos_conductor} ${v.nombres_conductor ?? ''}`.trim()}</span>
                              <span className="flex items-center gap-1.5 text-xs text-ink-soft">
                                {v.cedula_conductor}
                                <Badge value={v.tipo_persona_conductor} />
                              </span>
                            </div>
                          ) : (
                            <Badge value={v.tipo_persona_conductor} />
                          )}
                        </td>
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
              {eventos.map((e) => {
                const clave = e.tipo === 'evento' ? e.id_evento : e.id_error
                const activo = seleccionado != null && (seleccionado.tipo === 'evento' ? seleccionado.id_evento : seleccionado.id_error) === clave
                if (e.tipo === 'error') {
                  return (
                    <li
                      key={`error-${e.id_error}`}
                      onClick={() => setSeleccionado(e)}
                      className={'flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-50 ' + (activo ? 'bg-slate-50' : '')}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-amber-800">Error de reconocimiento {humanizar(e.tipo_reconocimiento).toLowerCase()}</p>
                        <p className="truncate text-xs text-ink-soft">{e.punto?.nombre_punto ?? '—'} · {fmtFechaHora(e.fecha_hora)}</p>
                        <p className="truncate text-xs text-amber-700">{humanizar(e.codigo_error)}</p>
                      </div>
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    </li>
                  )
                }
                const codigo = (e.motivo_resultado ?? '').split(':')[0].trim()
                return (
                  <li
                    key={e.id_evento}
                    onClick={() => setSeleccionado(e)}
                    className={'flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-50 ' + (activo ? 'bg-slate-50' : '')}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-navy">{e.persona ? `${e.persona.apellidos} ${e.persona.nombres}` : '—'}</p>
                      <p className="truncate text-xs text-ink-soft">{e.punto?.nombre_punto ?? '—'} · {fmtFechaHora(e.fecha_hora)}</p>
                      {e.resultado === 'DENEGADO' && codigo && (
                        <p className="truncate text-xs text-red">{MOTIVO_LEGIBLE[codigo] ?? humanizar(codigo)}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1.5"><Badge value={e.tipo_movimiento} /><Badge value={e.resultado} /></div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <SidePanel
        open={seleccionado !== null}
        onClose={() => setSeleccionado(null)}
        title={seleccionado?.tipo === 'error' ? 'Error de reconocimiento' : 'Detalle del movimiento'}
      >
        {seleccionado?.tipo === 'error' && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><dt className="text-xs text-ink-soft">Garita</dt><dd className="text-navy">{seleccionado.punto?.nombre_punto ?? '—'}</dd></div>
            <div><dt className="text-xs text-ink-soft">Fecha y hora</dt><dd className="text-navy">{fmtFechaHora(seleccionado.fecha_hora)}</dd></div>
            <div><dt className="text-xs text-ink-soft">Reconocimiento</dt><dd><Badge value={seleccionado.tipo_reconocimiento} /></dd></div>
            <div><dt className="text-xs text-ink-soft">Tipo de fallo</dt><dd className="text-navy">{humanizar(seleccionado.codigo_error)}</dd></div>
            <div className="col-span-2"><dt className="text-xs text-ink-soft">Detalle</dt><dd className="text-navy">{seleccionado.descripcion}</dd></div>
          </dl>
        )}
        {seleccionado?.tipo === 'evento' && <DetalleEvento idEvento={seleccionado.id_evento} />}
      </SidePanel>

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
