import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Car, Fingerprint, MapPin, RefreshCw } from 'lucide-react'
import { supabase, mensajeError } from '../../lib/supabase'
import { Badge, Button, Card, EmptyState, ErrorBanner, SidePanel, cx } from '../../components/ui'

// Capa base del mapa: recreación VECTORIAL del plano del campus (web/public/mapa-epn-2.svg), para
// que se vea nítida a cualquier zoom (no pixelada como una imagen ráster). Se dibuja con Leaflet en
// modo CRS.Simple (coordenadas de imagen, sin proyección geográfica) mediante `L.svgOverlay`, que
// escala el SVG como vector puro. Las zonas del sistema se ubican con pos_x/pos_y (fracción 0..1
// desde la esquina superior izquierda) y se pintan como marcadores encima. Ver docs/08_MAPA_INTERACTIVO.md.
const MAPA_FONDO = '/mapa-epn-2.svg'
const IMG_W = 686
const IMG_H = 446

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

const COLOR_HEX: Record<Salud, string> = {
  OK: '#10b981',
  ADVERTENCIA: '#f59e0b',
  CRITICO: '#dc2626',
  INACTIVO: '#94a3b8',
}
const COLOR_PUNTO: Record<Salud, string> = {
  OK: 'bg-emerald-500',
  ADVERTENCIA: 'bg-amber-500',
  CRITICO: 'bg-red',
  INACTIVO: 'bg-slate-400',
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

// Fracción (fx, fy) desde la esquina superior izquierda de la imagen -> coordenada de Leaflet
// CRS.Simple. Con bounds [[0,0],[H,W]] el origen [0,0] es la esquina inferior izquierda, así que
// la fila (y) se invierte.
function aLatLng(fx: number, fy: number): L.LatLngExpression {
  return [IMG_H * (1 - fy), IMG_W * fx]
}

function iconoMarcador(z: Zona, salud: Salud): L.DivIcon {
  const etiqueta = z.numero_edificio != null ? String(z.numero_edificio) : 'P'
  const html = `<div style="width:26px;height:26px;border-radius:9999px;background:${COLOR_HEX[salud]};
    color:#fff;display:flex;align-items:center;justify-content:center;font:700 12px system-ui,sans-serif;
    box-shadow:0 1px 5px rgba(0,0,0,.45);border:2px solid #fff;cursor:pointer">${etiqueta}</div>`
  return L.divIcon({ html, className: '', iconSize: [26, 26], iconAnchor: [13, 13] })
}

export function MapaCampus() {
  const [zonas, setZonas] = useState<Zona[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seleccion, setSeleccion] = useState<Zona | null>(null)
  const [filtroTec, setFiltroTec] = useState<'TODAS' | 'BIOMETRIA_FACIAL' | 'LPR_PLACAS'>('TODAS')
  const [filtroSalud, setFiltroSalud] = useState<'TODOS' | Salud>('TODOS')

  const contenedorRef = useRef<HTMLDivElement | null>(null)
  const mapaRef = useRef<L.Map | null>(null)
  const capaMarcadoresRef = useRef<L.LayerGroup | null>(null)

  const cargar = async () => {
    setCargando(true)
    const { data, error: err } = await supabase.from('zona').select(SELECT_MAPA).order('numero_edificio', { ascending: true })
    if (err) setError(mensajeError(err))
    else setError(null)
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

  const ubicadas = useMemo(
    () => zonas.filter((z) => z.pos_x != null && z.pos_y != null && pasaFiltros(z)),
    [zonas, filtroTec, filtroSalud],
  )
  const sinUbicar = useMemo(
    () => zonas.filter((z) => (z.pos_x == null || z.pos_y == null) && z.tipo_zona !== 'CAMPUS'),
    [zonas],
  )

  const totalPuntos = zonas.flatMap((z) => z.puntos).length
  const puntosActivos = zonas.flatMap((z) => z.puntos).filter((p) => p.estado_punto === 'ACTIVO').length
  const totalDispositivos = zonas.flatMap((z) => z.puntos).flatMap((p) => p.dispositivos ?? []).length

  // Inicializa el mapa Leaflet una sola vez (la imagen del campus como capa base).
  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return
    const bounds: L.LatLngBoundsExpression = [[0, 0], [IMG_H, IMG_W]]
    const mapa = L.map(contenedorRef.current, {
      crs: L.CRS.Simple,
      minZoom: -2,
      maxZoom: 3,
      zoomSnap: 0.25,
      attributionControl: false,
      maxBounds: bounds,
      maxBoundsViscosity: 1,
    })
    // El plano es un SVG: se añade como svgOverlay (vector real -> nítido a cualquier zoom).
    let cancelado = false
    fetch(MAPA_FONDO)
      .then((r) => r.text())
      .then((txt) => {
        if (cancelado) return
        const svg = new DOMParser().parseFromString(txt, 'image/svg+xml').documentElement as unknown as SVGElement
        L.svgOverlay(svg, bounds, { interactive: false }).addTo(mapa)
      })
      .catch(() => {})
    mapa.fitBounds(bounds)
    mapa.setMinZoom(mapa.getZoom() - 0.5)
    capaMarcadoresRef.current = L.layerGroup().addTo(mapa)
    mapaRef.current = mapa
    // El contenedor puede montarse con tamaño 0 (dentro de una Card recién renderizada).
    const t = setTimeout(() => {
      mapa.invalidateSize()
      mapa.fitBounds(bounds)
    }, 0)
    return () => {
      cancelado = true
      clearTimeout(t)
      mapa.remove()
      mapaRef.current = null
      capaMarcadoresRef.current = null
    }
  }, [])

  // Repinta los marcadores cuando cambian los datos o los filtros.
  useEffect(() => {
    const capa = capaMarcadoresRef.current
    if (!capa) return
    capa.clearLayers()
    for (const z of ubicadas) {
      const salud = saludDeZona(z)
      L.marker(aLatLng(z.pos_x as number, z.pos_y as number), { icon: iconoMarcador(z, salud) })
        .bindTooltip(`${z.nombre_zona} — ${ETIQUETA_SALUD[salud]}`, { direction: 'top', offset: [0, -12] })
        .on('click', () => setSeleccion(z))
        .addTo(capa)
    }
  }, [ubicadas])

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} />

      {/* Cabecera: contadores + acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Contador valor={puntosActivos} etiqueta="puntos activos" tono="bg-emerald-50 text-emerald-700" />
          <Contador valor={totalPuntos} etiqueta="puntos de control" tono="bg-slate-100 text-slate-700" />
          <Contador valor={totalDispositivos} etiqueta="dispositivos" tono="bg-slate-100 text-slate-700" />
          {cargando && <span className="self-center text-sm text-slate-400">Cargando…</span>}
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

      {/* Mapa (Leaflet sobre la imagen del campus) */}
      <Card className="overflow-hidden">
        <div
          ref={contenedorRef}
          className="w-full"
          style={{ aspectRatio: `${IMG_W} / ${IMG_H}`, background: '#0c2340' }}
          aria-label="Mapa interactivo del campus"
        />
        {/* Leyenda */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 px-4 py-2 text-xs text-slate-600">
          {(['OK', 'ADVERTENCIA', 'CRITICO', 'INACTIVO'] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={cx('h-2.5 w-2.5 rounded-full', COLOR_PUNTO[s])} />
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

      {!cargando && ubicadas.length === 0 && sinUbicar.length === 0 && (
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
