import { useEffect, useState } from 'react'
import { FileText, Link2, Plus, X } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { CAT, humanizar } from '../lib/catalogos'
import { fmtFecha, fmtFechaDia, hoyISO } from '../lib/format'
import { Badge, Button, Field, Input, Select, useToast } from './ui'
import { BuscarPersonaPorCedula, type PersonaCedula } from './BuscarPersonaPorCedula'

interface Relacion {
  id_persona_vehiculo: string
  tipo_relacion: string
  estado_relacion: string
  fecha_inicio: string | null
  fecha_fin: string | null
  es_responsable_tramite: boolean
  persona?: { nombres: string; apellidos: string; cedula: string; tipo_persona: string } | null
}

/** Memorando que ampara a la persona CON este vehículo, tal como lo devuelve la base. */
interface MemorandoVigente {
  id_memorando: string
  numero_memorando: string
  fecha_inicio: string
  fecha_fin: string
}

/**
 * Personas asociadas a un vehículo, gestionadas desde la propia ficha del vehículo.
 *
 * Feedback ADM: "mantener visible a quién pertenece el vehículo mediante la columna
 * Propietario y unificar o enlazar claramente las asociaciones persona-vehículo desde la
 * misma vista". Antes había que salir a la pantalla "Asociaciones", buscar la placa entre
 * todas y volver; ahora vincular y revocar ocurre aquí, y la tarjeta suelta desapareció
 * del módulo.
 *
 * La persona se elige por cédula (`BuscarPersonaPorCedula`) en vez de con un combo con
 * todas las personas del sistema, por la misma razón que en el alta de usuarios.
 *
 * GPI y GPE pidieron lo mismo en esta ronda ("Revisar cómo está implementado el campo de
 * Vehículo y Asociaciones en ADM, debe implementarse de la misma manera en este apartado"),
 * así que el componente pasó a estar parametrizado por módulo: cada uno comprueba sus propios
 * permisos y solo ofrece personas de su ámbito.
 */
export function AsociacionesVehiculo({
  idVehiculo,
  onCambio,
  modulo = 'ADM',
}: {
  idVehiculo: string
  /** Refresca el listado de vehículos: la columna Propietario depende de estas filas. */
  onCambio: () => Promise<void>
  /** Módulo desde el que se gestiona: decide los permisos y el ámbito de las personas. */
  modulo?: 'ADM' | 'GPI' | 'GPE'
}) {
  const { tiene, session } = useAuth()
  const toast = useToast()
  const puedeVincular = tiene(`${modulo}_PERSONA_VEHICULO_INSERT`)
  const puedeRevocar = tiene(`${modulo}_PERSONA_VEHICULO_UPDATE`)
  // GPI gestiona personal interno y GPE externo. ADM ve a todos: es la maestra.
  const soloTipo = modulo === 'GPI' ? 'INTERNA' : modulo === 'GPE' ? 'EXTERNA' : undefined

  const [relaciones, setRelaciones] = useState<Relacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [anadiendo, setAnadiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [persona, setPersona] = useState<PersonaCedula | null>(null)
  const [tipoRelacion, setTipoRelacion] = useState('PROPIETARIO')
  const [fechaInicio, setFechaInicio] = useState(hoyISO())
  const [fechaFin, setFechaFin] = useState('')
  const [memorando, setMemorando] = useState<MemorandoVigente | null>(null)

  /**
   * Al elegir a la persona se busca el memorando que la ampara CON este vehículo.
   *
   * Si existe, sus fechas son las de la asociación y los campos quedan bloqueados: el permiso
   * del vehículo caduca con el memorando, así que una relación que empiece antes o termine
   * después sería un permiso que nadie firmó. Antes se tecleaban a mano y no había nada que
   * las atara al oficio. El backend impone lo mismo (trigger
   * alinear_persona_vehiculo_con_memorando) para las escrituras que no pasen por aquí.
   */
  const elegirPersona = async (p: PersonaCedula | null) => {
    setPersona(p)
    setMemorando(null)
    setFechaInicio(hoyISO())
    setFechaFin('')
    if (!p) return
    const { data } = await supabase.rpc('memorandos_de_persona_y_vehiculo', {
      p_id_persona: p.id_persona,
      p_id_vehiculo: idVehiculo,
    } as never)
    const m = (data as unknown as MemorandoVigente[] | null)?.[0]
    if (!m) return
    setMemorando(m)
    setFechaInicio(m.fecha_inicio)
    setFechaFin(m.fecha_fin)
  }

  const cargar = async () => {
    setCargando(true)
    const { data, error: err } = await supabase
      .from('persona_vehiculo')
      .select('id_persona_vehiculo, tipo_relacion, estado_relacion, fecha_inicio, fecha_fin, es_responsable_tramite, persona:persona(nombres, apellidos, cedula, tipo_persona)')
      .eq('id_vehiculo', idVehiculo)
      .order('fecha_inicio', { ascending: false })
    if (err) setError(mensajeError(err))
    setRelaciones((data as unknown as Relacion[] | null) ?? [])
    setCargando(false)
  }

  useEffect(() => {
    void cargar()
    // Al cambiar de vehículo se cierra el formulario abierto: si no, la persona ya
    // buscada quedaría colgando sobre una ficha distinta.
    setAnadiendo(false)
    setPersona(null)
    setMemorando(null)
    setFechaInicio(hoyISO())
    setFechaFin('')
  }, [idVehiculo])

  const vincular = async () => {
    if (!persona) return
    if (!fechaInicio) {
      setError('Ingrese la fecha de inicio de la relación.')
      return
    }
    if (!fechaFin) {
      setError('Ingrese la fecha de fin de la relación.')
      return
    }
    // La igualdad se admite: un memorando puede autorizar la entrada de un solo día, y esa es
    // exactamente la vigencia que hereda la asociación.
    if (fechaFin < fechaInicio) {
      setError('La fecha de fin no puede ser anterior a la fecha de inicio.')
      return
    }
    setGuardando(true)
    setError(null)
    // id_usuario_registro es NOT NULL en persona_vehiculo y no tiene default: sin él el INSERT
    // fallaba con "Falta completar un dato obligatorio". El resto del sistema lo rellena con el
    // usuario autenticado (autoUsuarioRegistro en ResourceScreen); aquí, al ser un INSERT manual,
    // hay que ponerlo a mano.
    const { error: err } = await supabase.from('persona_vehiculo').insert({
      id_persona: persona.id_persona,
      id_vehiculo: idVehiculo,
      tipo_relacion: tipoRelacion,
      estado_relacion: 'ACTIVA',
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      id_usuario_registro: session?.user.id,
    } as never)
    setGuardando(false)
    if (err) {
      setError(mensajeError(err))
      return
    }
    toast('ok', `${persona.nombres} ${persona.apellidos} quedó vinculada al vehículo.`)
    setAnadiendo(false)
    setPersona(null)
    setMemorando(null)
    setFechaInicio(hoyISO())
    setFechaFin('')
    await cargar()
    await onCambio()
  }

  const revocar = async (r: Relacion) => {
    setGuardando(true)
    const { error: err } = await supabase
      .from('persona_vehiculo')
      .update({ estado_relacion: 'REVOCADA' } as never)
      .eq('id_persona_vehiculo', r.id_persona_vehiculo)
    setGuardando(false)
    if (err) {
      toast('error', mensajeError(err))
      return
    }
    toast('ok', 'Asociación revocada.')
    await cargar()
    await onCambio()
  }

  // Un vehículo no mezcla personal interno y externo (lo impone el trigger
  // validar_ambito_persona_vehiculo). Si el que se está viendo ya es de la otra población, este
  // módulo no puede añadirle a nadie: mejor decirlo que ofrecer un botón que siempre fallará.
  const deOtroAmbito =
    !!soloTipo &&
    relaciones.some((r) => r.estado_relacion === 'ACTIVA' && r.persona && r.persona.tipo_persona !== soloTipo)

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-navy">
          <Link2 className="h-4 w-4" /> Personas asociadas
        </h3>
        {puedeVincular && !anadiendo && !deOtroAmbito && (
          <Button variant="secondary" onClick={() => setAnadiendo(true)}>
            <Plus className="h-4 w-4" /> Vincular persona
          </Button>
        )}
      </div>

      {deOtroAmbito && (
        <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Este vehículo está asignado a {soloTipo === 'INTERNA' ? 'personal externo' : 'personal interno'}, así que sus
          personas se gestionan desde {soloTipo === 'INTERNA' ? 'Personal Externo' : 'Personal Interno'}.
        </p>
      )}

      {error && <p className="mb-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

      {anadiendo && (
        <div className="mb-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <BuscarPersonaPorCedula
            onSelect={elegirPersona}
            soloActivas
            soloTipo={soloTipo}
            label={soloTipo === 'INTERNA' ? 'Cédula de la persona interna' : soloTipo === 'EXTERNA' ? 'Cédula de la persona externa' : 'Cédula de la persona'}
          />
          {memorando && (
            <p className="flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Este vehículo entra amparado por el memorando <strong>{memorando.numero_memorando}</strong>, vigente
                del {fmtFecha(memorando.fecha_inicio)} al {fmtFecha(memorando.fecha_fin)}. La asociación toma esas
                mismas fechas: el permiso del vehículo caduca con el memorando.
              </span>
            </p>
          )}
          <Field label="Tipo de relación" htmlFor="tipo-relacion" required>
            <Select
              id="tipo-relacion"
              value={tipoRelacion}
              onChange={(e) => setTipoRelacion(e.target.value)}
              options={CAT.persona_vehiculo_tipo.map((v) => ({ value: v, label: humanizar(v) }))}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Fecha de inicio"
              htmlFor="fecha-inicio-relacion"
              required
              hint={memorando ? `Fecha de inicio del memorando ${memorando.numero_memorando}.` : undefined}
            >
              <Input
                id="fecha-inicio-relacion"
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                // El memorando puede empezar en el futuro; cuando manda él, el tope de "hoy"
                // no aplica.
                max={memorando ? undefined : hoyISO()}
                disabled={!!memorando}
              />
            </Field>
            <Field
              label="Fecha de fin"
              htmlFor="fecha-fin-relacion"
              required
              hint={memorando ? `Fecha de fin del memorando ${memorando.numero_memorando}.` : 'No puede ser anterior a la fecha de inicio.'}
            >
              <Input
                id="fecha-fin-relacion"
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                min={fechaInicio || undefined}
                disabled={!!memorando}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button onClick={vincular} loading={guardando} disabled={!persona}>Vincular</Button>
            <Button variant="ghost" onClick={() => { setAnadiendo(false); setPersona(null); setMemorando(null); setFechaInicio(hoyISO()); setFechaFin('') }}>Cancelar</Button>
          </div>
        </div>
      )}

      {cargando ? (
        <p className="text-xs text-ink-soft">Cargando asociaciones…</p>
      ) : relaciones.length === 0 ? (
        <p className="text-xs text-ink-soft">Este vehículo no tiene ninguna persona asociada.</p>
      ) : (
        <ul className="space-y-2">
          {relaciones.map((r) => (
            <li key={r.id_persona_vehiculo} className="flex items-start justify-between gap-2 rounded-md bg-slate-50 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-navy">
                  {r.persona ? `${r.persona.apellidos} ${r.persona.nombres}` : 'Persona desconocida'}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
                  {r.persona?.cedula} <Badge value={r.tipo_relacion} /> <Badge value={r.estado_relacion} />
                  {r.es_responsable_tramite && <span>· responsable del trámite</span>}
                  <span>· desde {fmtFechaDia(r.fecha_inicio)}</span>
                  <span>· hasta {r.fecha_fin ? fmtFechaDia(r.fecha_fin) : 'sin definir'}</span>
                </p>
              </div>
              {puedeRevocar && r.estado_relacion === 'ACTIVA' && (
                <button
                  type="button"
                  onClick={() => revocar(r)}
                  disabled={guardando}
                  className="rounded p-1 text-slate-400 hover:bg-white hover:text-rose-600 disabled:opacity-50"
                  aria-label={`Revocar la asociación de ${r.persona?.apellidos ?? 'la persona'}`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
