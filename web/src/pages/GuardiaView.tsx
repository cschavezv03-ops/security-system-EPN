import { useEffect, useRef, useState } from 'react'
import { Clock, DoorClosed, DoorOpen, IdCard, LogIn, LogOut, ScanFace, Search, UserPlus } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { validarCedula } from '../lib/validacion'
import { fmtFechaHora } from '../lib/format'
import { humanizar } from '../lib/catalogos'
import { CameraPanel, type CameraHandle } from '../components/Camera'
import { AutorizarVisita } from '../components/AutorizarVisita'
import { TopBar, PageContainer } from '../components/layout/Shell'
import {
  Badge, Button, Card, CenterSpinner, EmptyState, ErrorBanner, Field, Input, Select, useToast,
} from '../components/ui'

interface Asignacion {
  id_punto_control: string
  punto?: { nombre_punto: string; estado_punto: string } | null
  turno: string | null
}
interface PersonaLite {
  id_persona: string
  nombres: string
  apellidos: string
  cedula: string
  tipo_persona: string
}
interface Vigencia {
  via_vigencia: string | null
  vigente_hasta: string | null
}
interface ResultadoEvento {
  autorizado: boolean
  motivo: string | null
}

function GuardiaInner() {
  const { perfil, session } = useAuth()
  const toast = useToast()
  const [asignacion, setAsignacion] = useState<Asignacion | null>(null)
  const [cargandoAsig, setCargandoAsig] = useState(true)
  const [turno, setTurno] = useState<{ permitido: boolean; motivo: string | null } | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('guardia_punto_control')
        .select('id_punto_control, turno, punto:punto_control(nombre_punto, estado_punto)')
        .eq('estado_asignacion', 'ACTIVA')
        .limit(1)
        .maybeSingle()
      setAsignacion((data as Asignacion | null) ?? null)
      setCargandoAsig(false)
    })()

    // Verificación de turno con la HORA DEL SERVIDOR (req 34). Se revisa al entrar
    // y cada minuto por si el turno termina durante la jornada. El backend además
    // rechaza el registro fuera de turno (barrera dura en la Edge Function).
    const revisarTurno = async () => {
      const { data } = await supabase.rpc('verificar_turno_guardia_actual')
      if (data) setTurno(data as { permitido: boolean; motivo: string | null })
    }
    revisarTurno()
    const t = setInterval(revisarTurno, 60000)
    return () => clearInterval(t)
  }, [])

  const idPunto = asignacion?.id_punto_control
  const enTurno = turno?.permitido !== false

  return (
    <div>
      <TopBar />
      <PageContainer>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-navy">Garita — {perfil?.nombre_completo}</h1>
            <p className="text-sm text-ink-soft">Vista operativa del guardia</p>
          </div>
          {cargandoAsig ? (
            <Badge value="..." />
          ) : asignacion ? (
            <Card className="px-4 py-2">
              <p className="text-xs text-ink-soft">Punto asignado</p>
              <p className="flex items-center gap-2 font-semibold text-navy">
                {asignacion.punto?.nombre_punto ?? '—'} <Badge value={asignacion.punto?.estado_punto ?? '—'} />
              </p>
              {asignacion.turno && <p className="text-xs text-ink-soft">Turno: {asignacion.turno}</p>}
            </Card>
          ) : (
            <Badge value="Sin asignación activa" />
          )}
        </div>

        {!enTurno && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{turno?.motivo ?? 'Su turno no se encuentra habilitado a esta hora.'}</span>
          </div>
        )}

        {!asignacion ? (
          <EmptyState
            title="No tienes un punto de control asignado"
            hint="Un responsable de PCO o CAC debe asignarte un punto (guardia_punto_control) antes de registrar accesos."
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <BuscarPorCedula idPunto={idPunto!} uid={session!.user.id} enTurno={enTurno} onDone={() => toast('ok', 'Evento registrado.')} />
            <BiometriaGuardia idPunto={idPunto!} enTurno={enTurno} onDone={() => toast('ok', 'Evento registrado.')} />
            {/* GPE §13: el guardia ya tenía permiso para emitir autorizaciones de visita, pero
                ninguna pantalla donde hacerlo. Va aquí, en la garita, que es donde ocurre. */}
            <AutorizarVisita />
            <div className="lg:col-span-2">
              <EventosDelPunto idPunto={idPunto!} />
            </div>
          </div>
        )}
      </PageContainer>
    </div>
  )
}

/* -------- Búsqueda por cédula (personal EXTERNO, §D20) -------- */
function BuscarPorCedula({ idPunto, uid, enTurno, onDone }: { idPunto: string; uid: string; enTurno: boolean; onDone: () => void }) {
  const [cedula, setCedula] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [persona, setPersona] = useState<PersonaLite | null>(null)
  const [vigencia, setVigencia] = useState<Vigencia | null>(null)
  const [noEncontrada, setNoEncontrada] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoEvento | null>(null)
  const [registrando, setRegistrando] = useState(false)

  const buscar = async () => {
    setError(null); setResultado(null); setPersona(null); setVigencia(null); setNoEncontrada(false)
    if (!cedula.trim()) return
    setBuscando(true)
    const { data, error } = await supabase
      .from('persona')
      .select('id_persona, nombres, apellidos, cedula, tipo_persona')
      .eq('cedula', cedula.trim())
      .maybeSingle()
    if (error) setError(mensajeError(error))
    if (data) {
      setPersona(data as PersonaLite)
      const { data: vig } = await supabase
        .from('vista_vigencia_acceso')
        .select('via_vigencia, vigente_hasta')
        .eq('id_persona', (data as PersonaLite).id_persona)
        .maybeSingle()
      setVigencia((vig as Vigencia | null) ?? null)
    } else {
      setNoEncontrada(true)
    }
    setBuscando(false)
  }

  const registrar = async (tipo_movimiento: 'INGRESO' | 'SALIDA') => {
    if (!persona) return
    setRegistrando(true); setError(null); setResultado(null)
    // Escritura SIEMPRE por Edge Function (regla §5.1), nunca INSERT directo a evento_acceso.
    const { data, error } = await supabase.functions.invoke('registrar-evento-acceso', {
      body: {
        origen_registro: 'MANUAL',
        tipo_movimiento,
        id_punto_control: idPunto,
        ocupantes: [{ cedula: persona.cedula }],
      },
    })
    setRegistrando(false)
    if (error) { setError(mensajeError(error)); return }
    const oc = (data as any)?.ocupantes?.[0]
    setResultado({ autorizado: !!oc?.autorizado, motivo: oc?.motivo ?? null })
    if (oc?.autorizado) onDone()
  }

  return (
    <Card className="p-5">
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-navy"><IdCard className="h-5 w-5" /> Buscar por cédula (externo)</h3>
      <p className="mb-4 text-xs text-ink-soft">El personal externo se identifica con su cédula, tecleada por el guardia.</p>
      <div className="flex gap-2">
        <Input value={cedula} onChange={(e) => setCedula(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} placeholder="Número de cédula" />
        <Button onClick={buscar} loading={buscando}><Search className="h-4 w-4" /></Button>
      </div>

      <div className="mt-4"><ErrorBanner message={error} /></div>

      {noEncontrada && <NuevoVisitante cedula={cedula} uid={uid} onCreada={(p) => { setPersona(p); setNoEncontrada(false); setVigencia(null) }} />}

      {persona && (
        <div className="mt-4 rounded-lg border border-slate-200 p-4">
          <p className="font-semibold text-navy">{persona.apellidos} {persona.nombres}</p>
          <p className="text-xs text-ink-soft">Cédula {persona.cedula} · <Badge value={persona.tipo_persona} /></p>
          <div className="mt-2 text-sm">
            Vigencia: {vigencia?.via_vigencia ? <Badge value={vigencia.via_vigencia} /> : <span className="text-red">Sin vía de acceso vigente</span>}
          </div>
          <div className="mt-4 flex gap-2">
            <Button className="flex-1" onClick={() => registrar('INGRESO')} loading={registrando} disabled={!enTurno}><LogIn className="h-4 w-4" /> Ingreso</Button>
            <Button variant="secondary" className="flex-1" onClick={() => registrar('SALIDA')} loading={registrando} disabled={!enTurno}><LogOut className="h-4 w-4" /> Salida</Button>
          </div>
          {!enTurno && <p className="mt-2 text-xs text-amber-700">Fuera de turno: no puede registrar movimientos.</p>}
        </div>
      )}

      {resultado && (
        <div className={'mt-4 rounded-lg p-3 text-sm font-medium ' + (resultado.autorizado ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red')}>
          {resultado.autorizado ? '✔ AUTORIZADO' : '✘ DENEGADO'} {resultado.motivo ? `— ${resultado.motivo}` : ''}
        </div>
      )}
    </Card>
  )
}

/* -------- Registro rápido de visitante nuevo (§D6, permiso CAC_PERSONA_EXTERNA_INSERT) -------- */
function NuevoVisitante({ cedula, uid, onCreada }: { cedula: string; uid: string; onCreada: (p: PersonaLite) => void }) {
  const { tiene } = useAuth()
  const [nombres, setNombres] = useState('')
  const [apellidos, setApellidos] = useState('')
  const [idCategoria, setIdCategoria] = useState('')
  const [cats, setCats] = useState<{ value: string; label: string }[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('categoria_persona').select('id_categoria, codigo_categoria').eq('ambito', 'EXTERNA').then(({ data }) => {
      const opts = (data ?? []).map((c: any) => ({ value: c.id_categoria, label: humanizar(c.codigo_categoria) }))
      setCats(opts)
      const visitante = (data ?? []).find((c: any) => c.codigo_categoria === 'VISITANTE')
      if (visitante) setIdCategoria(visitante.id_categoria)
    })
  }, [])

  if (!tiene('CAC_PERSONA_EXTERNA_INSERT')) {
    return <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">Cédula no encontrada. No tienes permiso para registrar visitantes nuevos.</p>
  }

  const crear = async () => {
    setError(null)
    if (!nombres.trim() || !apellidos.trim() || !idCategoria) { setError('Completa nombres, apellidos y categoría.'); return }
    const errCed = validarCedula(cedula.trim())
    if (errCed) { setError(errCed); return }
    setGuardando(true)
    // Sin correo autogenerado (req 38): un visitante externo no tiene correo
    // institucional; la columna persona.correo es NULL hasta que se registre uno real.
    const { data, error } = await supabase
      .from('persona')
      .insert({
        cedula: cedula.trim(), nombres: nombres.trim(), apellidos: apellidos.trim(),
        correo: null, tipo_persona: 'EXTERNA', estado: 'ACTIVO', id_categoria: idCategoria,
      })
      .select('id_persona, nombres, apellidos, cedula, tipo_persona')
      .maybeSingle()
    setGuardando(false)
    if (error) { setError(mensajeError(error)); return }
    if (data) onCreada(data as PersonaLite)
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-medium text-navy"><UserPlus className="h-4 w-4" /> Visitante nuevo (cédula {cedula})</p>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Nombres" value={nombres} onChange={(e) => setNombres(e.target.value)} />
        <Input placeholder="Apellidos" value={apellidos} onChange={(e) => setApellidos(e.target.value)} />
        <Select value={idCategoria} onChange={(e) => setIdCategoria(e.target.value)} placeholder="Categoría" options={cats} />
      </div>
      <div className="mt-2"><ErrorBanner message={error} /></div>
      <Button className="mt-3 w-full" onClick={crear} loading={guardando}>Registrar y continuar</Button>
    </div>
  )
}

/* -------- Identificación biométrica (personal INTERNO) -------- */
function BiometriaGuardia({ idPunto, enTurno, onDone }: { idPunto: string; enTurno: boolean; onDone: () => void }) {
  const camRef = useRef<CameraHandle>(null)
  const [proc, setProc] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [match, setMatch] = useState<{ id_persona: string; confidence: number } | null>(null)
  const [resultado, setResultado] = useState<ResultadoEvento | null>(null)

  const identificar = async () => {
    setError(null); setMatch(null); setResultado(null); setProc(true)
    try {
      const descriptor = await camRef.current!.descriptor()
      const { data, error } = await supabase.functions.invoke('validar-biometria', { body: { descriptor } })
      if (error) throw new Error(mensajeError(error))
      if ((data as any).match) setMatch({ id_persona: (data as any).id_persona, confidence: (data as any).confidence })
      else setError(`Rostro no reconocido (confidence ${Number((data as any).confidence).toFixed(3)}).`)
    } catch (e) { setError(mensajeError(e)) } finally { setProc(false) }
  }

  const registrar = async (tipo_movimiento: 'INGRESO' | 'SALIDA') => {
    if (!match) return
    setProc(true); setResultado(null)
    const { data, error } = await supabase.functions.invoke('registrar-evento-acceso', {
      body: { origen_registro: 'MANUAL', tipo_movimiento, id_punto_control: idPunto, ocupantes: [{ id_persona: match.id_persona, confidence: match.confidence }] },
    })
    setProc(false)
    if (error) { setError(mensajeError(error)); return }
    const oc = (data as any)?.ocupantes?.[0]
    setResultado({ autorizado: !!oc?.autorizado, motivo: oc?.motivo ?? null })
    if (oc?.autorizado) onDone()
  }

  return (
    <Card className="p-5">
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-navy"><ScanFace className="h-5 w-5" /> Identificar por rostro (interno)</h3>
      <p className="mb-4 text-xs text-ink-soft">Solo personal interno. La identificación 1:N ocurre en el backend.</p>
      <CameraPanel ref={camRef} />
      <Button className="mt-2 w-full" onClick={identificar} loading={proc}><ScanFace className="h-4 w-4" /> Capturar e identificar</Button>
      <div className="mt-3"><ErrorBanner message={error} /></div>
      {match && (
        <div className="mt-3 rounded-lg border border-slate-200 p-3">
          <p className="text-sm text-navy">Reconocido · confianza {match.confidence.toFixed(3)}</p>
          <div className="mt-3 flex gap-2">
            <Button className="flex-1" onClick={() => registrar('INGRESO')} loading={proc} disabled={!enTurno}><LogIn className="h-4 w-4" /> Ingreso</Button>
            <Button variant="secondary" className="flex-1" onClick={() => registrar('SALIDA')} loading={proc} disabled={!enTurno}><LogOut className="h-4 w-4" /> Salida</Button>
          </div>
          {!enTurno && <p className="mt-2 text-xs text-amber-700">Fuera de turno: no puede registrar movimientos.</p>}
        </div>
      )}
      {resultado && (
        <div className={'mt-3 rounded-lg p-3 text-sm font-medium ' + (resultado.autorizado ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red')}>
          {resultado.autorizado ? '✔ AUTORIZADO' : '✘ DENEGADO'} {resultado.motivo ? `— ${resultado.motivo}` : ''}
        </div>
      )}
    </Card>
  )
}

/* -------- Eventos recientes del punto (RLS filtra al punto asignado) -------- */
function EventosDelPunto({ idPunto }: { idPunto: string }) {
  const [eventos, setEventos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  const cargar = async () => {
    const { data } = await supabase
      .from('evento_acceso')
      .select('id_evento, fecha_hora, tipo_movimiento, resultado, persona:persona(nombres, apellidos, cedula)')
      .eq('id_punto_control', idPunto)
      .order('fecha_hora', { ascending: false })
      .limit(12)
    setEventos(data ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar(); const t = setInterval(cargar, 20000); return () => clearInterval(t) }, [idPunto])

  return (
    <Card className="overflow-hidden">
      <h3 className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm font-semibold text-navy"><DoorOpen className="h-4 w-4" /> Movimientos recientes en el punto</h3>
      {cargando ? <CenterSpinner /> : eventos.length === 0 ? <EmptyState title="Sin movimientos aún" /> : (
        <ul className="divide-y divide-slate-100">
          {eventos.map((e) => (
            <li key={e.id_evento} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div>
                <p className="font-medium text-navy">{e.persona ? `${e.persona.apellidos} ${e.persona.nombres}` : '—'}</p>
                <p className="text-xs text-ink-soft">{e.persona?.cedula ?? ''} · {fmtFechaHora(e.fecha_hora)}</p>
              </div>
              <div className="flex gap-1.5">
                {e.tipo_movimiento === 'INGRESO' ? <DoorOpen className="h-4 w-4 text-emerald-600" /> : <DoorClosed className="h-4 w-4 text-slate-500" />}
                <Badge value={e.resultado} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function GuardiaView() {
  // El ToastProvider lo aporta App (envuelve toda la app autenticada).
  return <GuardiaInner />
}
