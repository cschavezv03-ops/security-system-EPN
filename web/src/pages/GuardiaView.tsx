import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, Car, Clock, DoorClosed, DoorOpen, Footprints, IdCard, LogIn, LogOut, ScanFace,
  Search, UserPlus, Users, X,
} from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { validarCedula } from '../lib/validacion'
import { fmtFechaHora } from '../lib/format'
import { humanizar, MOTIVO_LEGIBLE } from '../lib/catalogos'
import { CameraPanel, type CameraHandle } from '../components/Camera'
import { LectorPlaca, ResultadoPlacaPanel, type ResultadoPlaca } from '../components/LectorPlaca'
import { FichaMemorando } from '../components/FichaMemorando'
import { MemorandoDelVehiculo } from '../components/MemorandoDelVehiculo'
import { OcupantesDelMemorando } from '../components/OcupantesDelMemorando'
import { AutorizarVisita } from '../components/AutorizarVisita'
import { TopBar, PageContainer } from '../components/layout/Shell'
import {
  Badge, Button, Card, CenterSpinner, EmptyState, ErrorBanner, Input, Select, useToast,
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
  estado?: string
}
interface Vigencia {
  via_vigencia: string | null
  vigente_hasta: string | null
}
interface ResultadoEvento {
  autorizado: boolean
  motivo: string | null
  /** Ingreso o salida. Sin esto el aviso decía "Acceso autorizado" en los dos casos y, al
   *  revisar lo ocurrido en la garita, no había forma de distinguir quién entró de quién
   *  salió. */
  movimiento?: 'INGRESO' | 'SALIDA'
  persona?: string
}

/** Ocupante en preparación dentro del flujo vehicular (RF-CA-016 / RF-CA-017). */
interface Ocupante {
  persona: PersonaLite
  esConductor: boolean
  /** Confianza del reconocimiento facial, si se identificó por rostro. */
  confianza?: number
  confirmadoPorGuardia?: boolean
}

type Modo = 'PEATONAL' | 'VEHICULAR'

function GuardiaInner() {
  const { perfil, session } = useAuth()
  const toast = useToast()
  const [asignacion, setAsignacion] = useState<Asignacion | null>(null)
  const [cargandoAsig, setCargandoAsig] = useState(true)
  const [turno, setTurno] = useState<{ permitido: boolean; motivo: string | null } | null>(null)
  const [modo, setModo] = useState<Modo>('PEATONAL')
  const [refrescar, setRefrescar] = useState(0)

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

    // Verificación de turno con la HORA DEL SERVIDOR (req 34). Se revisa al entrar y cada
    // minuto por si el turno termina durante la jornada. El backend además rechaza el registro
    // fuera de turno (barrera dura en la Edge Function).
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
  const hecho = () => { toast('ok', 'Evento registrado.'); setRefrescar((n) => n + 1) }

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
            hint="Un responsable de Puntos de Control debe asignarte un punto antes de registrar accesos."
          />
        ) : (
          <>
            {/* El ingreso peatonal y el vehicular son dos procesos distintos con validaciones
                distintas (RF-CA-016 exige las dos autenticaciones solo en el vehicular).
                Tenerlos en pestañas evita que el guardia registre a pie a alguien que llegó
                conduciendo, que es como se salta la doble autenticación sin querer. */}
            <div className="mb-4 inline-flex rounded-lg border border-slate-300 bg-white p-1" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={modo === 'PEATONAL'}
                onClick={() => setModo('PEATONAL')}
                className={
                  'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ' +
                  (modo === 'PEATONAL' ? 'bg-navy text-white' : 'text-ink-soft hover:bg-slate-100')
                }
              >
                <Footprints className="h-4 w-4" /> Ingreso peatonal
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={modo === 'VEHICULAR'}
                onClick={() => setModo('VEHICULAR')}
                className={
                  'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ' +
                  (modo === 'VEHICULAR' ? 'bg-navy text-white' : 'text-ink-soft hover:bg-slate-100')
                }
              >
                <Car className="h-4 w-4" /> Ingreso vehicular
              </button>
            </div>

            {modo === 'PEATONAL' ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <BuscarPorCedula idPunto={idPunto!} uid={session!.user.id} enTurno={enTurno} onDone={hecho} />
                <BiometriaGuardia idPunto={idPunto!} enTurno={enTurno} onDone={hecho} />
                {/* GPE §13: el guardia ya tenía permiso para emitir autorizaciones de visita,
                    pero ninguna pantalla donde hacerlo. Va aquí, que es donde ocurre. */}
                <AutorizarVisita />
              </div>
            ) : (
              <AccesoVehicular idPunto={idPunto!} enTurno={enTurno} onDone={hecho} />
            )}

            <div className="mt-6">
              <EventosDelPunto idPunto={idPunto!} refrescar={refrescar} />
            </div>
          </>
        )}
      </PageContainer>
    </div>
  )
}

/** Traduce el motivo canónico de la Edge Function a algo que un guardia pueda leer de un
 *  vistazo (RNF-CA-004). El motivo viaja como `CODIGO: explicación`; el código pinta el color
 *  y el titular, la explicación va debajo. */
function ResultadoBanner({ resultado }: { resultado: ResultadoEvento }) {
  const [codigo, ...resto] = (resultado.motivo ?? '').split(':')
  const explicacion = resto.join(':').trim()
  const esSalida = resultado.movimiento === 'SALIDA'
  const titulo = resultado.autorizado
    ? (esSalida ? 'Salida autorizada' : 'Ingreso autorizado')
    : MOTIVO_LEGIBLE[codigo.trim()] ?? (esSalida ? 'Salida denegada' : 'Ingreso denegado')

  return (
    <div
      role="status"
      className={
        'mt-3 rounded-lg p-3 text-sm ' +
        (resultado.autorizado ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red')
      }
    >
      <p className="font-semibold">
        {resultado.autorizado ? '✔' : '✘'} {resultado.persona ? `${resultado.persona} — ` : ''}{titulo}
      </p>
      {explicacion && <p className="mt-0.5 text-xs opacity-90">{explicacion}</p>}
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
      .select('id_persona, nombres, apellidos, cedula, tipo_persona, estado')
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
    setResultado({ autorizado: !!oc?.autorizado, motivo: oc?.motivo ?? null, movimiento: tipo_movimiento })
    if (oc?.autorizado) onDone()
  }

  return (
    <Card className="p-5">
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-navy"><IdCard className="h-5 w-5" /> Buscar por cédula (externo)</h3>
      <p className="mb-4 text-xs text-ink-soft">El personal externo se identifica con su cédula, tecleada por el guardia.</p>
      <div className="flex gap-2">
        <Input value={cedula} onChange={(e) => setCedula(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} placeholder="Número de cédula" aria-label="Número de cédula" />
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

          {/* RF-CA-011: el memorando completo, antes de decidir. */}
          <FichaMemorando idPersona={persona.id_persona} />

          <div className="mt-4 flex gap-2">
            <Button className="flex-1" onClick={() => registrar('INGRESO')} loading={registrando} disabled={!enTurno}><LogIn className="h-4 w-4" /> Ingreso</Button>
            <Button variant="secondary" className="flex-1" onClick={() => registrar('SALIDA')} loading={registrando} disabled={!enTurno}><LogOut className="h-4 w-4" /> Salida</Button>
          </div>
          {!enTurno && <p className="mt-2 text-xs text-amber-700">Fuera de turno: no puede registrar movimientos.</p>}
        </div>
      )}

      {resultado && <ResultadoBanner resultado={resultado} />}
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
    // Sin correo autogenerado (req 38): un visitante externo no tiene correo institucional;
    // la columna persona.correo es NULL hasta que se registre uno real.
    const { data, error } = await supabase
      .from('persona')
      .insert({
        cedula: cedula.trim(), nombres: nombres.trim(), apellidos: apellidos.trim(),
        correo: null, tipo_persona: 'EXTERNA', estado: 'ACTIVO', id_categoria: idCategoria,
      })
      .select('id_persona, nombres, apellidos, cedula, tipo_persona, estado')
      .maybeSingle()
    setGuardando(false)
    if (error) { setError(mensajeError(error)); return }
    if (data) onCreada(data as PersonaLite)
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-medium text-navy"><UserPlus className="h-4 w-4" /> Visitante nuevo (cédula {cedula})</p>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Nombres" aria-label="Nombres" value={nombres} onChange={(e) => setNombres(e.target.value)} />
        <Input placeholder="Apellidos" aria-label="Apellidos" value={apellidos} onChange={(e) => setApellidos(e.target.value)} />
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
  const [match, setMatch] = useState<{ id_persona: string; confidence: number; persona?: PersonaLite } | null>(null)
  const [desconocido, setDesconocido] = useState<number | null>(null)
  const [resultado, setResultado] = useState<ResultadoEvento | null>(null)

  const identificar = async () => {
    setError(null); setMatch(null); setResultado(null); setDesconocido(null); setProc(true)
    try {
      const descriptor = await camRef.current!.descriptor()
      const { data, error } = await supabase.functions.invoke('validar-biometria', { body: { descriptor } })
      if (error) throw new Error(mensajeError(error))
      const r = data as { match: boolean; id_persona: string | null; confidence: number }
      if (r.match && r.id_persona) {
        const { data: p } = await supabase
          .from('persona')
          .select('id_persona, nombres, apellidos, cedula, tipo_persona, estado')
          .eq('id_persona', r.id_persona)
          .maybeSingle()
        setMatch({ id_persona: r.id_persona, confidence: r.confidence, persona: (p as PersonaLite) ?? undefined })
      } else {
        // RF-CA-021: el rostro no coincide con nadie. Deja de ser un mensaje de error suelto y
        // pasa a ser un evento registrable, que es lo que pide el requisito.
        setDesconocido(Number(r.confidence))
      }
    } catch (e) {
      const mensaje = mensajeError(e)
      setError(mensaje)
      // RF-CA-022: distinguir "no hay ninguna cara en la imagen" de un fallo del sistema.
      await supabase.from('error_reconocimiento').insert({
        tipo_reconocimiento: 'FACIAL',
        codigo_error: mensaje.includes('rostro') ? 'ROSTRO_NO_DETECTADO' : 'ERROR_INTERNO',
        descripcion: `Identificación facial en la garita: ${mensaje}`,
        id_punto_control: idPunto,
      })
    } finally { setProc(false) }
  }

  const registrar = async (tipo_movimiento: 'INGRESO' | 'SALIDA') => {
    if (!match) return
    setProc(true); setResultado(null)
    const { data, error } = await supabase.functions.invoke('registrar-evento-acceso', {
      body: {
        origen_registro: 'MANUAL', tipo_movimiento, id_punto_control: idPunto,
        ocupantes: [{ id_persona: match.id_persona, confidence: match.confidence }],
      },
    })
    setProc(false)
    if (error) { setError(mensajeError(error)); return }
    const oc = (data as any)?.ocupantes?.[0]
    setResultado({ autorizado: !!oc?.autorizado, motivo: oc?.motivo ?? null, movimiento: tipo_movimiento })
    if (oc?.autorizado) onDone()
  }

  const registrarDesconocido = async () => {
    setProc(true)
    const { data, error } = await supabase.functions.invoke('registrar-evento-acceso', {
      body: {
        origen_registro: 'MANUAL', tipo_movimiento: 'INGRESO', id_punto_control: idPunto,
        ocupantes: [{ desconocido: true }],
      },
    })
    setProc(false)
    if (error) { setError(mensajeError(error)); return }
    const oc = (data as any)?.ocupantes?.[0]
    setResultado({ autorizado: false, motivo: oc?.motivo ?? null, movimiento: 'INGRESO' })
    setDesconocido(null)
    onDone()
  }

  return (
    <Card className="p-5">
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-navy"><ScanFace className="h-5 w-5" /> Identificar por rostro (interno)</h3>
      <p className="mb-4 text-xs text-ink-soft">Solo para personal interno. El personal externo se identifica con su cédula.</p>
      <CameraPanel ref={camRef} />
      <Button className="mt-2 w-full" onClick={identificar} loading={proc}><ScanFace className="h-4 w-4" /> Capturar e identificar</Button>
      <div className="mt-3"><ErrorBanner message={error} /></div>

      {match && (
        <div className="mt-3 rounded-lg border border-slate-200 p-3">
          <p className="font-semibold text-navy">
            {match.persona ? `${match.persona.apellidos} ${match.persona.nombres}` : 'Persona reconocida'}
          </p>
          <p className="text-xs text-ink-soft">
            {match.persona?.cedula ? `Cédula ${match.persona.cedula} · ` : ''}confianza {match.confidence.toFixed(3)}
          </p>
          <div className="mt-3 flex gap-2">
            <Button className="flex-1" onClick={() => registrar('INGRESO')} loading={proc} disabled={!enTurno}><LogIn className="h-4 w-4" /> Ingreso</Button>
            <Button variant="secondary" className="flex-1" onClick={() => registrar('SALIDA')} loading={proc} disabled={!enTurno}><LogOut className="h-4 w-4" /> Salida</Button>
          </div>
          {!enTurno && <p className="mt-2 text-xs text-amber-700">Fuera de turno: no puede registrar movimientos.</p>}
        </div>
      )}

      {desconocido !== null && (
        <div className="mt-3 rounded-lg border border-red/40 bg-red-50 p-3">
          <p className="text-sm font-semibold text-red">Persona desconocida</p>
          <p className="mt-0.5 text-xs text-red/90">
            El rostro no coincide con ninguna persona registrada (mejor confianza {desconocido.toFixed(3)}).
          </p>
          <Button className="mt-3 w-full" variant="secondary" onClick={registrarDesconocido} loading={proc} disabled={!enTurno}>
            Registrar el intento
          </Button>
        </div>
      )}

      {resultado && <ResultadoBanner resultado={resultado} />}
    </Card>
  )
}

/* -------- Acceso vehicular: placa + conductor + pasajeros (RF-CA-015 a RF-CA-017) -------- */
function AccesoVehicular({ idPunto, enTurno, onDone }: { idPunto: string; enTurno: boolean; onDone: () => void }) {
  const camRef = useRef<CameraHandle>(null)
  const [placa, setPlaca] = useState<ResultadoPlaca | null>(null)
  const [ocupantes, setOcupantes] = useState<Ocupante[]>([])
  const [cedula, setCedula] = useState('')
  const [proc, setProc] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultados, setResultados] = useState<ResultadoEvento[]>([])

  const yaEsta = (id: string) => ocupantes.some((o) => o.persona.id_persona === id)
  const hayConductor = ocupantes.some((o) => o.esConductor)

  const anadir = (persona: PersonaLite, extra: Partial<Ocupante> = {}) => {
    if (yaEsta(persona.id_persona)) { setError(`${persona.nombres} ya está en la lista de ocupantes.`); return }
    setError(null)
    // El primero en subir es el conductor salvo que ya haya uno: es lo que ocurre en la
    // realidad y evita que el guardia tenga que marcarlo a mano en el caso normal.
    setOcupantes((prev) => [...prev, { persona, esConductor: !hayConductor, ...extra }])
  }

  const anadirPorCedula = async () => {
    if (!cedula.trim()) return
    setProc(true); setError(null)
    const { data, error: err } = await supabase
      .from('persona')
      .select('id_persona, nombres, apellidos, cedula, tipo_persona, estado')
      .eq('cedula', cedula.trim())
      .maybeSingle()
    setProc(false)
    if (err) { setError(mensajeError(err)); return }
    if (!data) { setError(`No hay ninguna persona registrada con la cédula ${cedula.trim()}.`); return }
    anadir(data as PersonaLite)
    setCedula('')
  }

  const anadirPorRostro = async () => {
    setProc(true); setError(null)
    try {
      const descriptor = await camRef.current!.descriptor()
      const { data, error: err } = await supabase.functions.invoke('validar-biometria', { body: { descriptor } })
      if (err) throw new Error(mensajeError(err))
      const r = data as { match: boolean; id_persona: string | null; confidence: number }
      if (!r.match || !r.id_persona) {
        setError(`El rostro no coincide con ninguna persona registrada (confianza ${Number(r.confidence).toFixed(3)}).`)
        return
      }
      const { data: p } = await supabase
        .from('persona')
        .select('id_persona, nombres, apellidos, cedula, tipo_persona, estado')
        .eq('id_persona', r.id_persona)
        .maybeSingle()
      if (p) anadir(p as PersonaLite, { confianza: r.confidence })
    } catch (e) {
      setError(mensajeError(e))
    } finally { setProc(false) }
  }

  const registrar = async (tipo_movimiento: 'INGRESO' | 'SALIDA') => {
    if (ocupantes.length === 0) { setError('Añada al menos un ocupante.'); return }
    setProc(true); setError(null); setResultados([])
    const { data, error: err } = await supabase.functions.invoke('registrar-evento-acceso', {
      body: {
        origen_registro: 'MANUAL',
        tipo_movimiento,
        id_punto_control: idPunto,
        id_vehiculo: placa?.vehiculo?.id_vehiculo,
        placa_detectada: placa?.lectura.placa,
        confianza_placa: placa?.lectura.confianza,
        ocupantes: ocupantes.map((o) => ({
          id_persona: o.persona.id_persona,
          es_conductor: o.esConductor,
          ...(o.confianza !== undefined ? { confidence: o.confianza } : {}),
          ...(o.confirmadoPorGuardia ? { confirmado_por_guardia: true } : {}),
        })),
      },
    })
    setProc(false)
    if (err) { setError(mensajeError(err)); return }

    const lista = ((data as any)?.ocupantes ?? []) as Array<{ id_persona: string; autorizado: boolean; motivo: string | null }>
    setResultados(
      lista.map((r) => {
        const ocupante = ocupantes.find((o) => o.persona.id_persona === r.id_persona)
        return {
          autorizado: r.autorizado,
          motivo: r.motivo,
          movimiento: tipo_movimiento,
          persona: ocupante ? `${ocupante.persona.apellidos} ${ocupante.persona.nombres}` : undefined,
        }
      }),
    )
    if (lista.some((r) => r.autorizado)) onDone()
  }

  const limpiar = () => { setPlaca(null); setOcupantes([]); setResultados([]); setError(null) }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-navy">
          <Car className="h-5 w-5" /> 1. Placa del vehículo
        </h3>
        <p className="mb-4 text-xs text-ink-soft">
          Encuadre la placa dentro del marco. Si la lectura falla, puede escribirla a mano.
        </p>
        {placa ? (
          <>
            <ResultadoPlacaPanel resultado={placa} onDescartar={() => setPlaca(null)} />
            {/* Para un externo el memorando ES el segundo factor, asi que el guardia tiene que
                verlo aquí: de qué empresa viene el coche, a qué dependencia acude y hasta
                cuando vale el permiso. */}
            {placa.vehiculo?.id_vehiculo && <MemorandoDelVehiculo idVehiculo={placa.vehiculo.id_vehiculo} />}
            {/* §D20: al externo lo identifica su cédula tecleada por el guardia. Hasta que la
                escriba y coincida con la que ampara el memorando, no puede añadir a nadie. */}
            {placa.vehiculo?.id_vehiculo && (
              <OcupantesDelMemorando
                idVehiculo={placa.vehiculo.id_vehiculo}
                yaAnadido={yaEsta}
                onAnadir={(p) =>
                  anadir({
                    id_persona: p.id_persona,
                    nombres: p.nombres,
                    apellidos: p.apellidos,
                    cedula: p.cedula,
                    tipo_persona: 'EXTERNA',
                  })
                }
              />
            )}
            {placa.personas.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-ink-soft">Personas asociadas a este vehículo</p>
                <ul className="space-y-1">
                  {placa.personas.map((p) => (
                    <li key={p.id_persona} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm">
                      <span>
                        {p.apellidos} {p.nombres}
                        <span className="ml-2 text-xs text-ink-soft">{humanizar(p.tipo_relacion)}</span>
                      </span>
                      {/* Al personal interno NO se le puede añadir desde aquí. El botón lo metía
                          de un clic, y eso deja sin efecto el reconocimiento facial, que es su
                          única forma de identificarse (§D20) y el segundo factor que exige
                          RNF-CA-005 a quien conduce. Se identifica con la cámara o no entra. */}
                      {p.tipo_persona === 'INTERNA' ? (
                        <span className="shrink-0 text-xs text-ink-soft">Se identifica por rostro</span>
                      ) : (
                        <span className="shrink-0 text-xs text-ink-soft">
                          {yaEsta(p.id_persona) ? 'Añadido' : 'Verifique su cédula abajo'}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                {placa.personas.some((p) => p.tipo_persona === 'INTERNA') && (
                  <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-ink-soft">
                    <b className="text-navy">El personal interno se añade por reconocimiento facial.</b>{' '}
                    Use "Añadir por rostro" en el panel de la derecha: la placa por sí sola no
                    autoriza a nadie, y quien conduce necesita las dos comprobaciones.
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <LectorPlaca idPuntoControl={idPunto} onIdentificada={setPlaca} />
        )}
      </Card>

      <Card className="p-5">
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-navy">
          <Users className="h-5 w-5" /> 2. Conductor y pasajeros
        </h3>
        <p className="mb-4 text-xs text-ink-soft">
          Cada ocupante se valida por separado. Si conduce personal interno, se identifica por
          rostro; si es personal externo, lo autoriza su memorando, que debe amparar esta placa.
        </p>

        <div className="mb-3">
          <CameraPanel ref={camRef} />
          <Button className="mt-2 w-full" variant="secondary" onClick={anadirPorRostro} loading={proc}>
            <ScanFace className="h-4 w-4" /> Añadir por rostro
          </Button>
        </div>

        <div className="flex gap-2">
          <Input
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && anadirPorCedula()}
            placeholder="Cédula del pasajero"
            aria-label="Cédula del pasajero"
          />
          <Button variant="secondary" onClick={anadirPorCedula} loading={proc} aria-label="Buscar pasajero por cédula">
            <Search className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3"><ErrorBanner message={error} /></div>

        {ocupantes.length > 0 && (
          <ul className="mt-3 space-y-2">
            {ocupantes.map((o) => (
              <li key={o.persona.id_persona} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-navy">{o.persona.apellidos} {o.persona.nombres}</p>
                    <p className="text-xs text-ink-soft">
                      Cédula {o.persona.cedula} · <Badge value={o.persona.tipo_persona} />
                      {o.confianza !== undefined && ` · rostro ${o.confianza.toFixed(3)}`}
                      {o.confianza === undefined && ' · identificado por cédula'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOcupantes((prev) => prev.filter((x) => x.persona.id_persona !== o.persona.id_persona))}
                    className="rounded p-1 text-ink-soft hover:bg-slate-100"
                    aria-label={`Quitar a ${o.persona.nombres} de los ocupantes`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-ink-soft">
                  <input
                    type="checkbox"
                    checked={o.esConductor}
                    onChange={(e) =>
                      setOcupantes((prev) =>
                        prev.map((x) =>
                          x.persona.id_persona === o.persona.id_persona
                            ? { ...x, esConductor: e.target.checked }
                            // Solo puede haber un conductor.
                            : e.target.checked ? { ...x, esConductor: false } : x,
                        ),
                      )
                    }
                  />
                  Conduce el vehículo
                </label>
                {o.esConductor && o.confianza === undefined && o.persona.tipo_persona === 'INTERNA' && (
                  <p className="mt-1 text-xs text-amber-700">
                    El conductor necesita reconocimiento facial además de la placa. Añádalo por rostro.
                  </p>
                )}
                {/* El externo no tiene rostro con el que contrastar: lo que lo autoriza a
                    circular es su memorando, y el guardia debe poder leerlo antes de decidir
                    (RF-CA-011). Si no aparece ninguno, ese ocupante solo puede entrar a pie. */}
                {o.persona.tipo_persona !== 'INTERNA' && (
                  <FichaMemorando idPersona={o.persona.id_persona} />
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={() => registrar('INGRESO')} loading={proc} disabled={!enTurno || ocupantes.length === 0}>
            <LogIn className="h-4 w-4" /> Registrar ingreso
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => registrar('SALIDA')} loading={proc} disabled={!enTurno || ocupantes.length === 0}>
            <LogOut className="h-4 w-4" /> Registrar salida
          </Button>
        </div>
        {!enTurno && <p className="mt-2 text-xs text-amber-700">Fuera de turno: no puede registrar movimientos.</p>}

        {resultados.length > 0 && (
          <div className="mt-2">
            {resultados.map((r, i) => <ResultadoBanner key={i} resultado={r} />)}
            <Button variant="secondary" className="mt-3 w-full" onClick={limpiar}>Registrar otro vehículo</Button>
          </div>
        )}
      </Card>
    </div>
  )
}

/** Un movimiento real (evento_acceso) o un fallo técnico de reconocimiento (error_reconocimiento,
 *  RF-CA-022: cámara caída, rostro no detectado en la imagen, servicio no disponible...). Antes
 *  el guardia no veía estos últimos aquí — se guardaban en la base pero solo aparecían en la
 *  pantalla dedicada de ADM/CAC — así que un fallo repetido en su propia garita pasaba
 *  desapercibido para quien más lo necesita ver: quien está frente a la cámara ese momento. */
type MovimientoPunto =
  | { tipo: 'evento'; id: string; fecha_hora: string; tipo_movimiento: string; tipo_acceso: string; resultado: string; motivo_resultado: string | null; placa_detectada: string | null; persona: { nombres: string; apellidos: string; cedula: string } | null }
  | { tipo: 'error'; id: string; fecha_hora: string; tipo_reconocimiento: string; codigo_error: string; descripcion: string }

/* -------- Movimientos recientes del punto (RF-CA-025, RF-CA-022; RLS filtra al punto asignado) -------- */
function EventosDelPunto({ idPunto, refrescar }: { idPunto: string; refrescar: number }) {
  const [movimientos, setMovimientos] = useState<MovimientoPunto[]>([])
  const [cargando, setCargando] = useState(true)

  const cargar = async () => {
    const [ev, err] = await Promise.all([
      supabase
        .from('evento_acceso')
        .select('id_evento, fecha_hora, tipo_movimiento, tipo_acceso, resultado, motivo_resultado, placa_detectada, persona:persona(nombres, apellidos, cedula)')
        .eq('id_punto_control', idPunto)
        .order('fecha_hora', { ascending: false })
        .limit(12),
      supabase
        .from('error_reconocimiento')
        .select('id_error, fecha_hora, tipo_reconocimiento, codigo_error, descripcion')
        .eq('id_punto_control', idPunto)
        .order('fecha_hora', { ascending: false })
        .limit(12),
    ])
    const eventos: MovimientoPunto[] = ((ev.data ?? []) as any[]).map((e) => ({ tipo: 'evento', id: e.id_evento, ...e }))
    const errores: MovimientoPunto[] = ((err.data ?? []) as any[]).map((e) => ({ tipo: 'error', id: e.id_error, ...e }))
    const combinados = [...eventos, ...errores]
      .sort((a, b) => new Date(b.fecha_hora).getTime() - new Date(a.fecha_hora).getTime())
      .slice(0, 12)
    setMovimientos(combinados)
    setCargando(false)
  }
  useEffect(() => { cargar(); const t = setInterval(cargar, 20000); return () => clearInterval(t) }, [idPunto, refrescar])

  return (
    <Card className="overflow-hidden">
      <h3 className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm font-semibold text-navy"><DoorOpen className="h-4 w-4" /> Movimientos recientes en el punto</h3>
      {cargando ? <CenterSpinner /> : movimientos.length === 0 ? <EmptyState title="Sin movimientos aún" /> : (
        <ul className="divide-y divide-slate-100">
          {movimientos.map((m) => {
            if (m.tipo === 'error') {
              return (
                <li key={`error-${m.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-amber-800">Error de reconocimiento {humanizar(m.tipo_reconocimiento).toLowerCase()}</p>
                    <p className="truncate text-xs text-ink-soft">{fmtFechaHora(m.fecha_hora)}</p>
                    <p className="truncate text-xs text-amber-700">{humanizar(m.codigo_error)}{m.descripcion ? ` — ${m.descripcion}` : ''}</p>
                  </div>
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                </li>
              )
            }
            const codigo = (m.motivo_resultado ?? '').split(':')[0].trim()
            return (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-navy">
                    {m.persona ? `${m.persona.apellidos} ${m.persona.nombres}` : 'Persona desconocida'}
                  </p>
                  <p className="truncate text-xs text-ink-soft">
                    {m.persona?.cedula ?? ''}
                    {m.placa_detectada ? ` · ${m.placa_detectada}` : ''} · {fmtFechaHora(m.fecha_hora)}
                  </p>
                  {m.resultado === 'DENEGADO' && codigo && (
                    <p className="truncate text-xs text-red">{MOTIVO_LEGIBLE[codigo] ?? humanizar(codigo)}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {m.tipo_acceso === 'VEHICULAR' ? <Car className="h-4 w-4 text-slate-500" /> : <Footprints className="h-4 w-4 text-slate-500" />}
                  {m.tipo_movimiento === 'INGRESO' ? <DoorOpen className="h-4 w-4 text-emerald-600" /> : <DoorClosed className="h-4 w-4 text-slate-500" />}
                  <Badge value={m.resultado} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

export function GuardiaView() {
  // El ToastProvider lo aporta App (envuelve toda la app autenticada).
  return <GuardiaInner />
}
