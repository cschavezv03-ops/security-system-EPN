import { useEffect, useState } from 'react'
import { Camera, Clock, DoorOpen, IdCard, MapPin, ShieldCheck, UserCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { humanizar } from '../lib/catalogos'
import { fmtFecha, fmtFechaHora } from '../lib/format'
import { formatearPlaca } from '../lib/validacion'
import { Badge, Spinner } from './ui'

interface Detalle {
  id_evento: string
  fecha_hora: string
  tipo_movimiento: string
  tipo_acceso: string
  resultado: string
  motivo_resultado: string | null
  origen_registro: string
  es_conductor: boolean
  confianza_biometria: number | null
  confianza_placa: number | null
  placa_detectada: string | null
  persona: { cedula: string; nombres: string; apellidos: string; tipo_persona: string; categoria: string | null } | null
  vehiculo: { placa: string | null; tipo_vehiculo: string; marca: string | null; modelo: string | null; color: string | null } | null
  punto: { nombre_punto: string; zona: string | null }
  dispositivo: { codigo_dispositivo: string | null; tipo_tecnologia: string; codigo_mac: string; direccion_ip: string; estado_dispositivo: string } | null
  registrado_por: { nombre_usuario: string; correo_electronico: string; persona: string | null } | null
  guardia_de_turno: { nombre_usuario: string; correo_electronico: string; turno: string | null }[]
  ingreso_relacionado: { fecha_hora: string; punto: string; mismo_punto: boolean; horas_dentro: number } | null
  regla_aplicada: { nombre_regla: string; horario: string; requiere_memorando: boolean } | null
  autorizacion_visita: { fecha_visita: string; motivo: string } | null
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{etiqueta}</dt>
      <dd className="text-sm text-navy">{children}</dd>
    </div>
  )
}

function Seccion({ icono, titulo, children }: { icono: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-slate-100 pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-navy">{icono} {titulo}</p>
      {children}
    </div>
  )
}

/**
 * Todo lo que se sabe de un ingreso o una salida.
 *
 * El panel de monitoreo mostraba lo que cabía en la propia fila —persona, punto, resultado—, y
 * eso deja sin responder las preguntas que se hace quien audita un acceso: por dónde salió
 * quien entró por otro lado, qué aparato lo leyó, y quién respondía de esa garita a esa hora.
 *
 * Lo arma `detalle_evento_acceso` en una sola consulta: cruzar esto desde el navegador serían
 * seis consultas y la de "quién estaba de turno" no se puede resolver sin repetir la lógica de
 * los turnos que cruzan la medianoche.
 */
export function DetalleEvento({ idEvento }: { idEvento: string }) {
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vigente = true
    ;(async () => {
      setCargando(true)
      const { data } = await supabase.rpc('detalle_evento_acceso', { p_id_evento: idEvento } as never)
      if (!vigente) return
      setDetalle((data as Detalle | null) ?? null)
      setCargando(false)
    })()
    return () => { vigente = false }
  }, [idEvento])

  if (cargando) return <div className="py-4"><Spinner /></div>
  // `punto` es lo único que la consulta siempre trae, porque un evento no existe sin garita.
  // Comprobarlo evita que una respuesta inesperada tumbe con ella el panel entero donde este
  // bloque está incrustado: el resto de la ficha debe seguir leyéndose.
  if (!detalle?.punto) {
    return <p className="py-4 text-sm text-ink-soft">No se pudo cargar la trazabilidad de este movimiento.</p>
  }

  const esSalida = detalle.tipo_movimiento === 'SALIDA'

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Dato etiqueta="Persona">
          {detalle.persona ? `${detalle.persona.apellidos} ${detalle.persona.nombres}` : 'No identificada'}
        </Dato>
        <Dato etiqueta="Cédula">{detalle.persona?.cedula ?? '—'}</Dato>
        <Dato etiqueta="Movimiento"><Badge value={detalle.tipo_movimiento} /></Dato>
        <Dato etiqueta="Resultado"><Badge value={detalle.resultado} /></Dato>
      </dl>

      {detalle.motivo_resultado && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-ink-soft">{detalle.motivo_resultado}</p>
      )}

      <Seccion icono={<MapPin className="h-3.5 w-3.5" />} titulo={esSalida ? 'Por dónde salió' : 'Por dónde entró'}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Dato etiqueta="Garita">{detalle.punto.nombre_punto}</Dato>
          <Dato etiqueta="Zona">{detalle.punto.zona ?? '—'}</Dato>
          <Dato etiqueta="Fecha y hora">{fmtFechaHora(detalle.fecha_hora)}</Dato>
          <Dato etiqueta="Tipo de acceso"><Badge value={detalle.tipo_acceso} /></Dato>
        </dl>
      </Seccion>

      {/* Una salida solo se entiende junto a su ingreso. Y que sea por otra garita es
          precisamente lo que hay que poder ver de un vistazo. */}
      {detalle.ingreso_relacionado && (
        <Seccion icono={<DoorOpen className="h-3.5 w-3.5" />} titulo="Ingreso con el que se corresponde">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Dato etiqueta="Entró por">{detalle.ingreso_relacionado.punto}</Dato>
            <Dato etiqueta="Hora de entrada">{fmtFechaHora(detalle.ingreso_relacionado.fecha_hora)}</Dato>
            <Dato etiqueta="Tiempo dentro">{detalle.ingreso_relacionado.horas_dentro} h</Dato>
            <Dato etiqueta="¿Misma garita?">
              {detalle.ingreso_relacionado.mismo_punto
                ? 'Sí'
                : <span className="text-amber-700">No — salió por una garita distinta</span>}
            </Dato>
          </dl>
        </Seccion>
      )}

      <Seccion icono={<Camera className="h-3.5 w-3.5" />} titulo="Cómo se registró">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Dato etiqueta="Origen"><Badge value={detalle.origen_registro} /></Dato>
          {detalle.dispositivo ? (
            <>
              <Dato etiqueta="Dispositivo">
                {detalle.dispositivo.codigo_dispositivo ?? detalle.dispositivo.codigo_mac}
              </Dato>
              <Dato etiqueta="Tecnología">{humanizar(detalle.dispositivo.tipo_tecnologia)}</Dato>
              <Dato etiqueta="Estado del dispositivo"><Badge value={detalle.dispositivo.estado_dispositivo} /></Dato>
            </>
          ) : (
            <div className="col-span-2">
              <dt className="text-xs text-ink-soft">Dispositivo</dt>
              <dd className="text-sm text-ink-soft">
                Sin dispositivo: lo registró una persona desde la garita.
              </dd>
            </div>
          )}
          {detalle.confianza_biometria != null && (
            <Dato etiqueta="Coincidencia del rostro">{detalle.confianza_biometria.toFixed(3)}</Dato>
          )}
          {detalle.confianza_placa != null && (
            <Dato etiqueta="Lectura de la placa">{detalle.confianza_placa.toFixed(2)}</Dato>
          )}
        </dl>
      </Seccion>

      <Seccion icono={<UserCheck className="h-3.5 w-3.5" />} titulo="Quién respondía">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Dato etiqueta="Lo registró">
            {detalle.registrado_por
              ? (detalle.registrado_por.persona ?? detalle.registrado_por.nombre_usuario)
              : 'Nadie: fue un registro automático'}
          </Dato>
          <Dato etiqueta="De turno en la garita">
            {detalle.guardia_de_turno.length === 0 ? (
              <span className="text-amber-700">Sin guardia asignado a esa hora</span>
            ) : (
              <ul className="space-y-0.5">
                {detalle.guardia_de_turno.map((g) => (
                  <li key={g.correo_electronico}>
                    {g.correo_electronico}
                    {g.turno && <span className="ml-1 text-xs text-ink-soft">({g.turno})</span>}
                  </li>
                ))}
              </ul>
            )}
          </Dato>
        </dl>
      </Seccion>

      {detalle.vehiculo && (
        <Seccion icono={<IdCard className="h-3.5 w-3.5" />} titulo="Vehículo">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Dato etiqueta="Placa">{detalle.vehiculo.placa ? formatearPlaca(detalle.vehiculo.placa) : '—'}</Dato>
            <Dato etiqueta="Leída como">
              {detalle.placa_detectada ? formatearPlaca(detalle.placa_detectada) : '—'}
            </Dato>
            <Dato etiqueta="Vehículo">
              {[humanizar(detalle.vehiculo.tipo_vehiculo), detalle.vehiculo.marca, detalle.vehiculo.modelo]
                .filter(Boolean).join(' · ')}
            </Dato>
            <Dato etiqueta="Iba al volante">{detalle.es_conductor ? 'Sí' : 'No'}</Dato>
          </dl>
        </Seccion>
      )}

      {(detalle.regla_aplicada || detalle.autorizacion_visita) && (
        <Seccion icono={<ShieldCheck className="h-3.5 w-3.5" />} titulo="Con qué respaldo pasó">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            {detalle.regla_aplicada && (
              <>
                <Dato etiqueta="Regla aplicada">{detalle.regla_aplicada.nombre_regla}</Dato>
                <Dato etiqueta="Horario permitido">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {detalle.regla_aplicada.horario}
                  </span>
                </Dato>
              </>
            )}
            {detalle.autorizacion_visita && (
              <Dato etiqueta="Autorización de visita">
                {fmtFecha(detalle.autorizacion_visita.fecha_visita)} · {detalle.autorizacion_visita.motivo}
              </Dato>
            )}
          </dl>
        </Seccion>
      )}
    </div>
  )
}
