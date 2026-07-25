import { useEffect, useMemo, useState } from 'react'
import { Car, Fingerprint, MapPin, RefreshCw } from 'lucide-react'
import { supabase, mensajeError } from '../../lib/supabase'
import { Badge, Button, Card, CenterSpinner, EmptyState, ErrorBanner, SidePanel, cx } from '../../components/ui'

// Fondo del mapa: plano vectorial del campus diseñado desde cero (web/public/mapa-epn-campus.svg),
// inspirado en el plano oficial de la EPN pero sin números, pines ni leyenda — esos los aporta el
// sistema como marcadores. Las coordenadas pos_x/pos_y de las zonas coinciden con los edificios
// dibujados en el SVG (viewBox 1000x780). Ver docs/08_MAPA_INTERACTIVO.md.
const MAPA_FONDO = '/mapa-epn-campus.svg'

interface Dispositivo {
  id_dispositivo: string
  tipo_tecnologia: 'BIOMETRIA_FACIAL' | 'LPR_PLACAS'
  estado_dispositivo: string
}
interface Punto {
  id_punto_control: string
  nombre_punto: string
  estado_punto: string
  dispositivos: Dispositivo[]
}
interface Zona {
  id_zona: string
  nombre_zona: string
  tipo_zona: string
  estado_zona: string
  numero_edificio: number | null
  pos_x: number | null
  pos_y: number | null
  puntos: Punto[]
}

type Salud = 'OK' | 'ADVERTENCIA' | 'CRITICO' | 'INACTIVO'

// El "estado de salud" de una zona resume el peor estado de sus puntos y dispositivos, para
// decidir el color del marcador de un vistazo.
function saludDeZona(z: Zona): Salud {
  if (z.estado_zona === 'INACTIVA' || z.estado_zona === 'BLOQUEADA') return 'INACTIVO'
  const puntos = z.puntos ?? []
  const dispositivos = puntos.flatMap((p) => p.dispositivos ?? [])
  if (puntos.some((p) => p.estado_punto === 'FALLA') || dispositivos.some((d) => d.estado_dispositivo === 'DANO_FISICO')) {
    return 'CRITICO'
  }
  if (puntos.some((p) => p.estado_punto === 'MANTENIMIENTO') || dispositivos.some((d) => d.estado_dispositivo === 'FALLA_DE_RED')) {
    return 'ADVERTENCIA'
  }
  return 'OK'
}

const COLOR_MARCADOR: Record<Salud, string> = {
  OK: 'bg-emerald-500 ring-emerald-200',
  ADVERTENCIA: 'bg-amber-500 ring-amber-200',
  CRITICO: 'bg-red ring-red/30',
  INACTIVO: 'bg-slate-400 ring-slate-200',
}
const ETIQUETA_SALUD: Record<Salud, string> = {
  OK: 'Operativo',
  ADVERTENCIA: 'Con novedades',
  CRITICO: 'Crítico',
  INACTIVO: 'Inactivo / bloqueado',
}

function tecnologiasDeZona(z: Zona): Set<string> {
  return new Set((z.puntos ?? []).flatMap((p) => (p.dispositivos ?? []).map((d) => d.tipo_tecnologia)))
}

const SELECT_MAPA = `
  id_zona, nombre_zona, tipo_zona, estado_zona, numero_edificio, pos_x, pos_y,
  puntos:punto_control (
    id_punto_control, nombre_punto, estado_punto,
    dispositivos:dispositivo ( id_dispositivo, tipo_tecnologia, estado_dispositivo )
  )
`

export function MapaCampus() {
  const [zonas, setZonas] = useState<Zona[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seleccion, setSeleccion] = useState<Zona | null>(null)
  const [filtroTec, setFiltroTec] = useState<'TODAS' | 'BIOMETRIA_FACIAL' | 'LPR_PLACAS'>('TODAS')
  const [filtroSalud, setFiltroSalud] = useState<'TODOS' | Salud>('TODOS')

  const cargar = async () => {
    setCargando(true)
    const { data, error: err } = await supabase.from('zona').select(SELECT_MAPA).order('numero_edificio', { ascending: true })
    if (err) setError(mensajeError(err))
    else setError(null)
    // pos_x/pos_y llegan como texto (numeric de Postgres); se normalizan a número.
    const filas = ((data ?? []) as any[]).map((z) => ({
      ...z,
      pos_x: z.pos_x == null ? null : Number(z.pos_x),
      pos_y: z.pos_y == null ? null : Number(z.pos_y),
      puntos: z.puntos ?? [],
    })) as Zona[]
    setZonas(filas)
    setCargando(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const pasaFiltros = (z: Zona) => {
    if (filtroSalud !== 'TODOS' && saludDeZona(z) !== filtroSalud) return false
    if (filtroTec !== 'TODAS' && !tecnologiasDeZona(z).has(filtroTec)) return false
    return true
  }

  const ubicadas = useMemo(() => zonas.filter((z) => z.pos_x != null && z.pos_y != null && pasaFiltros(z)), [zonas, filtroTec, filtroSalud])
  const sinUbicar = useMemo(
    () => zonas.filter((z) => (z.pos_x == null || z.pos_y == null) && z.tipo_zona !== 'CAMPUS'),
    [zonas],
  )

  const totalPuntos = zonas.flatMap((z) => z.puntos).length
  const puntosActivos = zonas.flatMap((z) => z.puntos).filter((p) => p.estado_punto === 'ACTIVO').length
  const totalDispositivos = zonas.flatMap((z) => z.puntos).flatMap((p) => p.dispositivos ?? []).length

  if (cargando) return <CenterSpinner label="Cargando el mapa del campus…" />

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} />

      {/* Cabecera: contadores + acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Contador valor={puntosActivos} etiqueta="puntos activos" tono="bg-emerald-50 text-emerald-700" />
          <Contador valor={totalPuntos} etiqueta="puntos de control" tono="bg-slate-100 text-slate-700" />
          <Contador valor={totalDispositivos} etiqueta="dispositivos" tono="bg-slate-100 text-slate-700" />
        </div>
        <Button variant="ghost" onClick={cargar}>
          <RefreshCw className="h-4 w-4" /> Actualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Tecnología:</span>
          {(['TODAS', 'BIOMETRIA_FACIAL', 'LPR_PLACAS'] as const).map((t) => (
            <Chip key={t} activo={filtroTec === t} onClick={() => setFiltroTec(t)}>
              {t === 'TODAS' ? 'Todas' : t === 'BIOMETRIA_FACIAL' ? 'Biometría' : 'Placas'}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Estado:</span>
          {(['TODOS', 'OK', 'ADVERTENCIA', 'CRITICO', 'INACTIVO'] as const).map((s) => (
            <Chip key={s} activo={filtroSalud === s} onClick={() => setFiltroSalud(s)}>
              {s === 'TODOS' ? 'Todos' : ETIQUETA_SALUD[s]}
            </Chip>
          ))}
        </div>
      </div>

      {/* Mapa */}
      <Card className="overflow-hidden">
        <div className="relative mx-auto w-full max-w-2xl">
          <img src={MAPA_FONDO} alt="Plano del Campus Politécnico de la EPN" className="block h-auto w-full" />
          {ubicadas.map((z) => {
            const salud = saludDeZona(z)
            const tecs = tecnologiasDeZona(z)
            const Icono = tecs.has('LPR_PLACAS') && !tecs.has('BIOMETRIA_FACIAL') ? Car : Fingerprint
            return (
              <button
                key={z.id_zona}
                type="button"
                onClick={() => setSeleccion(z)}
                title={`${z.nombre_zona} — ${ETIQUETA_SALUD[salud]}`}
                aria-label={`${z.nombre_zona}, ${ETIQUETA_SALUD[salud]}`}
                className={cx(
                  'absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white shadow-md ring-2 transition hover:scale-110 focus:outline-none focus:ring-4',
                  COLOR_MARCADOR[salud],
                )}
                style={{ left: `${(z.pos_x as number) * 100}%`, top: `${(z.pos_y as number) * 100}%` }}
              >
                {z.numero_edificio != null ? (
                  <span className="text-[11px] font-bold leading-none">{z.numero_edificio}</span>
                ) : (
                  <Icono className="h-4 w-4" />
                )}
              </button>
            )
          })}
        </div>
        {/* Leyenda */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 px-4 py-2 text-xs text-slate-600">
          {(['OK', 'ADVERTENCIA', 'CRITICO', 'INACTIVO'] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={cx('h-2.5 w-2.5 rounded-full', COLOR_MARCADOR[s].split(' ')[0])} />
              {ETIQUETA_SALUD[s]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5"><Fingerprint className="h-3.5 w-3.5" /> Biometría</span>
          <span className="inline-flex items-center gap-1.5"><Car className="h-3.5 w-3.5" /> Placas</span>
        </div>
      </Card>

      {/* Zonas sin ubicar en el mapa */}
      {sinUbicar.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <MapPin className="h-4 w-4 text-amber-600" /> Zonas sin ubicar en el mapa ({sinUbicar.length})
          </h3>
          <p className="mb-2 text-xs text-slate-500">
            Estas zonas existen en el sistema pero todavía no tienen coordenadas, así que no se
            dibujan. Al asignarles posición aparecerán automáticamente.
          </p>
          <div className="flex flex-wrap gap-2">
            {sinUbicar.map((z) => (
              <button
                key={z.id_zona}
                type="button"
                onClick={() => setSeleccion(z)}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                {z.nombre_zona}
              </button>
            ))}
          </div>
        </Card>
      )}

      {ubicadas.length === 0 && sinUbicar.length === 0 && (
        <EmptyState title="Sin zonas para mostrar" hint="Registra zonas y puntos de control en el módulo PCO." />
      )}

      {/* Panel de detalle */}
      <SidePanel open={!!seleccion} onClose={() => setSeleccion(null)} title={seleccion?.nombre_zona}>
        {seleccion && <DetalleZona zona={seleccion} />}
      </SidePanel>
    </div>
  )
}

function DetalleZona({ zona }: { zona: Zona }) {
  const salud = saludDeZona(zona)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge value={zona.tipo_zona} />
        <Badge value={zona.estado_zona} />
        <span className="text-xs text-slate-500">{ETIQUETA_SALUD[salud]}</span>
      </div>
      {zona.numero_edificio != null && (
        <p className="text-sm text-slate-600">Edificio n.º {zona.numero_edificio} en el plano de la EPN.</p>
      )}

      <div>
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Puntos de control ({zona.puntos.length})</h4>
        {zona.puntos.length === 0 ? (
          <p className="text-sm text-slate-500">Esta zona no tiene puntos de control registrados.</p>
        ) : (
          <ul className="space-y-2">
            {zona.puntos.map((p) => (
              <li key={p.id_punto_control} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800">{p.nombre_punto}</span>
                  <Badge value={p.estado_punto} />
                </div>
                <ul className="mt-2 space-y-1">
                  {(p.dispositivos ?? []).length === 0 ? (
                    <li className="text-xs text-slate-400">Sin dispositivos.</li>
                  ) : (
                    (p.dispositivos ?? []).map((d) => (
                      <li key={d.id_dispositivo} className="flex items-center gap-2 text-xs text-slate-600">
                        {d.tipo_tecnologia === 'LPR_PLACAS' ? <Car className="h-3.5 w-3.5" /> : <Fingerprint className="h-3.5 w-3.5" />}
                        <span>{d.tipo_tecnologia === 'LPR_PLACAS' ? 'Lector de placas' : 'Biometría facial'}</span>
                        <Badge value={d.estado_dispositivo} className="ml-auto" />
                      </li>
                    ))
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Contador({ valor, etiqueta, tono }: { valor: number; etiqueta: string; tono: string }) {
  return (
    <span className={cx('inline-flex items-baseline gap-1.5 rounded-lg px-3 py-1.5', tono)}>
      <span className="text-lg font-bold leading-none">{valor}</span>
      <span className="text-xs">{etiqueta}</span>
    </span>
  )
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition',
        activo ? 'bg-slate-800 text-white ring-slate-800' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  )
}
