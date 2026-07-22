import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Pencil, Plus, Search, Ban, ArrowLeft, Download, RotateCcw } from 'lucide-react'
import { fromTable, mensajeError, supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useBorrador } from '../lib/useBorrador'
import { validarCedula } from '../lib/validacion'
import { normalizarBusqueda } from '../lib/busqueda'
import { hoyISO } from '../lib/format'
import type { FieldConfig, Opcion, ResourceConfig } from '../resources/types'
import { BuscarPersonaPorCedula, type PersonaCedula } from './BuscarPersonaPorCedula'
import {
  Badge, Button, Card, CenterSpinner, EmptyState, ErrorBanner, Field, Input, Modal,
  Select, SidePanel, Textarea, useToast,
} from './ui'

type Row = Record<string, any>

/** ¿La fila está dada de baja? Decide cuál de los dos botones —Inactivar o Reactivar— tiene
 *  sentido ofrecer en la ficha. */
function estaDadoDeBaja(config: ResourceConfig, row: Row | null): boolean {
  if (!config.baja || !row) return false
  return row[config.baja.campoEstado] === config.baja.valorBaja
}

/** Resuelve opciones (estáticas o async) de todos los campos select, una vez. */
function useFieldOptions(campos: FieldConfig[]) {
  const [opts, setOpts] = useState<Record<string, Opcion[]>>({})
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const entries = await Promise.all(
        campos
          .filter((c) => c.type === 'select' && c.options)
          .map(async (c) => {
            const o = typeof c.options === 'function' ? await c.options() : (c.options as Opcion[])
            return [c.name, o] as const
          }),
      )
      if (vivo) setOpts(Object.fromEntries(entries))
    })()
    return () => {
      vivo = false
    }
  }, [campos])
  return opts
}

/** Igual que useFieldOptions pero para los filtros de columna del listado (config.filtros). */
function useFiltroOptions(filtros: ResourceConfig['filtros']) {
  const [opts, setOpts] = useState<Record<string, Opcion[]>>({})
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const entries = await Promise.all(
        (filtros ?? []).map(async (f) => {
          const o = typeof f.opciones === 'function' ? await f.opciones() : f.opciones
          return [f.campo, o] as const
        }),
      )
      if (vivo) setOpts(Object.fromEntries(entries))
    })()
    return () => {
      vivo = false
    }
  }, [filtros])
  return opts
}

/**
 * Lee una ruta con puntos ("persona.cedula") sobre una fila.
 *
 * Atraviesa también las relaciones de muchos (PostgREST las embebe como array): en
 * "relaciones.persona.apellidos", `relaciones` es un array y se recorre elemento a elemento,
 * devolviendo la lista de valores. Sin esto la búsqueda por esa ruta no fallaba — devolvía
 * undefined en silencio, que es peor.
 */
const leerRuta = (r: Row, ruta: string): any =>
  ruta.split('.').reduce<any>((o, k) => {
    if (o == null) return undefined
    if (Array.isArray(o)) return o.map((x) => x?.[k]).filter((x) => x != null)
    return o[k]
  }, r)

export function ResourceScreen({ config }: { config: ResourceConfig }) {
  const { tiene } = useAuth()
  const toast = useToast()
  const puedeLeer = config.permisos.select.some(tiene)
  const puedeCrear = !!config.permisos.insert?.some(tiene)
  const puedeEditar = !!config.permisos.update?.some(tiene)
  const puedeExportar = !!config.exportarConPermiso?.some(tiene)

  // Un enlace puede llegar con la búsqueda ya puesta (?buscar=EPN-DA-2026-0001-M), que es como
  // la ficha de una persona externa lleva a "su" memorando sin obligar a teclearlo otra vez.
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [rows, setRows] = useState<Row[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState(() => searchParams.get('buscar') ?? '')
  const [seleccion, setSeleccion] = useState<Row | null>(null)
  const [vista, setVista] = useState<'lista' | 'form'>('lista')
  const [editando, setEditando] = useState<Row | null>(null)
  const [bajaOpen, setBajaOpen] = useState(false)
  const [reactivando, setReactivando] = useState(false)
  const [filtrosValor, setFiltrosValor] = useState<Record<string, string>>({})

  const opciones = useFieldOptions(config.campos)
  const opcionesFiltro = useFiltroOptions(config.filtros)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    let q = fromTable(config.tabla).select(config.select ?? '*')
    if (config.filtroFijo) for (const [k, v] of Object.entries(config.filtroFijo)) q = q.eq(k, v)
    if (config.orderBy) q = q.order(config.orderBy.columna, { ascending: config.orderBy.ascendente ?? true })
    const { data, error } = await q
    if (error) setError(mensajeError(error))
    setRows((data as Row[] | null) ?? [])
    setCargando(false)
  }, [config])

  useEffect(() => {
    if (puedeLeer) cargar()
    else setCargando(false)
  }, [puedeLeer, cargar])

  const filtradas = useMemo(() => {
    let out = rows
    const t = normalizarBusqueda(busqueda.trim())
    // Segunda pasada ignorando separadores: la placa se guarda canónica ("PDF1234") pero el
    // usuario la teclea como la ve en el vehículo ("PDF-1234"). Mismo caso para MAC y cédula.
    const tPlano = t.replace(/[^a-z0-9]/g, '')
    if (t && config.buscarEn?.length) {
      out = out.filter((r) =>
        config.buscarEn!.some((campo) => {
          const v = normalizarBusqueda(leerRuta(r, campo))
          return v.includes(t) || (tPlano.length > 0 && v.replace(/[^a-z0-9]/g, '').includes(tPlano))
        }),
      )
    }
    for (const [campo, valor] of Object.entries(filtrosValor)) {
      if (!valor) continue
      out = out.filter((r) => String(leerRuta(r, campo) ?? '') === valor)
    }
    return out
  }, [rows, busqueda, config.buscarEn, filtrosValor])

  /** ¿Hay algo escondiendo filas? Distingue "no hay datos" de "los has filtrado tú". */
  const hayFiltroActivo = !!busqueda.trim() || Object.values(filtrosValor).some((v) => !!v)

  const exportarCsv = () => {
    const encabezados = config.columnas.map((c) => c.label)
    const filas = filtradas.map((r) =>
      config.columnas.map((c) => {
        const v = c.valorExport ? c.valorExport(r) : c.render && !c.badge ? '' : String(r[c.key] ?? '')
        return `"${v.replaceAll('"', '""')}"`
      }),
    )
    const csv = [encabezados.join(','), ...filas.map((f) => f.join(','))].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${config.tabla}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!puedeLeer) {
    return (
      <EmptyState
        title="No tienes acceso a esta sección"
        hint="Pide acceso al administrador del sistema si crees que deberías verla."
      />
    )
  }

  if (vista === 'form') {
    return (
      <RecordForm
        config={config}
        opciones={opciones}
        registro={editando}
        onCancel={() => setVista('lista')}
        onSaved={async () => {
          setVista('lista')
          setEditando(null)
          await cargar()
          toast('ok', editando ? 'Cambios guardados.' : `${config.singular} registrado.`)
        }}
      />
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={`Buscar ${config.titulo.toLowerCase()}...`}
            className="pl-9"
          />
        </div>
        {config.filtros?.map((f) => (
          <Select
            key={f.campo}
            aria-label={f.label}
            value={filtrosValor[f.campo] ?? ''}
            onChange={(e) => setFiltrosValor((s) => ({ ...s, [f.campo]: e.target.value }))}
            placeholder={f.label}
            options={opcionesFiltro[f.campo] ?? []}
            className="w-auto min-w-[160px]"
          />
        ))}
        {puedeExportar && (
          <Button variant="secondary" onClick={exportarCsv}>
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        )}
        {puedeCrear && (
          <Button
            onClick={() => {
              // Si el recurso define un alta propia (ej. vehículo + propietario en una sola
              // transacción), se va allí en vez de abrir el formulario genérico, que insertaría
              // la fila suelta.
              if (config.altaRuta) {
                navigate(config.altaRuta)
                return
              }
              setEditando(null)
              setVista('form')
            }}
          >
            <Plus className="h-4 w-4" /> Registrar {config.singular}
          </Button>
        )}
      </div>

      <ErrorBanner message={error} />

      <Card className="mt-3 overflow-hidden">
        {cargando ? (
          <CenterSpinner label="Cargando..." />
        ) : filtradas.length === 0 ? (
          /* "No hay X registrados" solo cuando de verdad no hay ninguno. Antes ese mensaje
             salía también con un filtro puesto que no casaba con nada, así que la pantalla
             afirmaba que no existían datos mientras los ocultaba ella misma — pasó de verdad:
             con un filtro de zona aplicado, "Puntos de control" decía estar vacío teniendo seis.
             Si algo está filtrando, se dice cuántos hay y se ofrece quitar el filtro. */
          hayFiltroActivo ? (
            <EmptyState
              title="Sin resultados"
              hint={`Ninguno de los ${rows.length} ${config.titulo.toLowerCase()} coincide con lo que has filtrado.`}
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setBusqueda('')
                    setFiltrosValor({})
                  }}
                >
                  Quitar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState title={`No hay ${config.titulo.toLowerCase()} registrados`} />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-ink-soft">
                  {config.columnas.map((c) => (
                    <th key={c.key} className="px-4 py-2.5">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.map((r) => (
                  <tr
                    key={r[config.idField]}
                    onClick={() => setSeleccion(r)}
                    className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    {config.columnas.map((c) => (
                      <td key={c.key} className="px-4 py-2.5 text-navy">
                        {c.badge ? <Badge value={String(r[c.key] ?? '')} /> : c.render ? c.render(r) : (r[c.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-2 text-xs text-slate-400">{filtradas.length} registro(s)</p>

      {/* Panel lateral de detalle (Patrón A) */}
      <SidePanel
        open={!!seleccion}
        onClose={() => setSeleccion(null)}
        title={seleccion ? config.campoTituloDetalle(seleccion) : undefined}
        footer={
          (puedeEditar || config.baja || config.accionDetalle) && seleccion ? (
            <>
              {/* Acción propia del recurso (ej. cerrar una sesión). Se decide
                  dentro: puede no renderizar nada según el estado de la fila. */}
              {config.accionDetalle?.(seleccion, {
                recargar: cargar,
                cerrarPanel: () => setSeleccion(null),
              })}
              {puedeEditar && (
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setEditando(seleccion)
                    setSeleccion(null)
                    setVista('form')
                  }}
                >
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
              )}
              {/* Inactivar y Reactivar son excluyentes: se ofrece el que corresponda al estado
                  actual de la fila. Antes solo existía el de baja, así que inactivar una zona
                  no tenía vuelta atrás desde la ficha (feedback PCO). */}
              {config.baja && puedeEditar && !estaDadoDeBaja(config, seleccion) && (
                <Button
                  variant="danger"
                  className="flex-1"
                  disabled={!!config.baja.bloqueadaSi?.(seleccion)}
                  title={config.baja.bloqueadaSi?.(seleccion) ?? undefined}
                  onClick={() => setBajaOpen(true)}
                >
                  <Ban className="h-4 w-4" /> {config.baja.etiqueta ?? 'Dar de baja'}
                </Button>
              )}
              {config.baja && config.reactivar && puedeEditar && estaDadoDeBaja(config, seleccion) && (
                <Button
                  variant="secondary"
                  className="flex-1"
                  disabled={reactivando}
                  onClick={async () => {
                    setReactivando(true)
                    const { error } = await fromTable(config.tabla)
                      .update({ [config.baja!.campoEstado]: config.reactivar!.valorActivo })
                      .eq(config.idField, seleccion[config.idField])
                    setReactivando(false)
                    if (error) {
                      toast('error', mensajeError(error))
                      return
                    }
                    toast('ok', `${config.singular} reactivado.`)
                    setSeleccion(null)
                    await cargar()
                  }}
                >
                  <RotateCcw className="h-4 w-4" /> {config.reactivar.etiqueta ?? 'Reactivar'}
                </Button>
              )}
            </>
          ) : null
        }
      >
        {seleccion && (
          <div>
            {config.campoSubtituloDetalle && (
              <div className="mb-4 text-sm text-ink-soft">{config.campoSubtituloDetalle(seleccion)}</div>
            )}
            <dl className="divide-y divide-slate-100">
              {config.detalle.map((d, i) => d.visibleSi?.(seleccion) === false ? null : (
                <div key={i} className="grid grid-cols-3 gap-2 py-2">
                  <dt className="text-xs font-medium text-ink-soft">{d.label}</dt>
                  <dd className="col-span-2 text-sm text-navy">{d.render(seleccion)}</dd>
                </div>
              ))}
            </dl>
            {/* Bloque propio del recurso dentro del panel (ej. gestionar las personas
                asociadas a un vehículo sin salir de la ficha). A diferencia de
                `accionDetalle`, que vive en el pie entre los botones, esto ocupa el
                cuerpo y puede recargar el listado cuando cambia algo. */}
            {config.detalleExtra?.(seleccion, {
              recargar: cargar,
              cerrarPanel: () => setSeleccion(null),
            })}
          </div>
        )}
      </SidePanel>

      {config.baja && seleccion && (
        <BajaModal
          open={bajaOpen}
          config={config}
          registro={seleccion}
          onClose={() => setBajaOpen(false)}
          onDone={async () => {
            setBajaOpen(false)
            setSeleccion(null)
            await cargar()
            toast('ok', 'Baja registrada.')
          }}
        />
      )}
    </div>
  )
}

/* -------------------- Lista de selección múltiple con búsqueda -------------------- */
/**
 * GPE §12: "A la hora de vincular persona-memorando o persona-vehículo se podría tener un icono
 * de búsqueda para buscar por empresa o por cédula o por placa, para facilidad del registro."
 *
 * Antes era una lista de casillas con todas las personas externas del sistema, y encontrar a
 * alguien concreto era cuestión de bajar con la rueda del ratón. El filtro busca sobre la misma
 * etiqueta que se ve, que ya incluye apellidos, cédula y empresa; e ignora los separadores, para
 * que una cédula tecleada con guiones encuentre igual.
 */
function ListaSeleccionMultiple({
  opciones, seleccionados, onChange, placeholderBusqueda, id,
}: {
  opciones: Opcion[]
  seleccionados: string[]
  onChange: (valores: string[]) => void
  placeholderBusqueda?: string
  /** Va al campo de búsqueda: es el control que recibe el foco al pulsar la etiqueta. */
  id?: string
}) {
  const [filtro, setFiltro] = useState('')

  const visibles = useMemo(() => {
    const t = normalizarBusqueda(filtro.trim())
    if (!t) return opciones
    // Sin quitar las tildes, buscar "amangandi" no encontraría a "Amangandí", que es justo lo
    // que se teclea cuando se copia una cédula de un papel y el apellido de memoria.
    const plano = (s: string) => normalizarBusqueda(s).replace(/[^a-z0-9]/g, '')
    const tPlano = plano(t)
    return opciones.filter((o) => {
      const l = normalizarBusqueda(o.label)
      return l.includes(t) || (tPlano.length > 0 && plano(l).includes(tPlano))
    })
  }, [opciones, filtro])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input
          id={id}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder={placeholderBusqueda ?? 'Buscar por nombre, cédula o empresa...'}
          className="pl-9"
        />
      </div>
      <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
        {opciones.length === 0 ? (
          <p className="p-1 text-xs text-slate-400">Sin opciones disponibles.</p>
        ) : visibles.length === 0 ? (
          <p className="p-1 text-xs text-slate-400">Ningún resultado para "{filtro}".</p>
        ) : (
          visibles.map((o) => {
            const marcado = seleccionados.includes(o.value)
            return (
              <label key={o.value} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={(e) => onChange(e.target.checked ? [...seleccionados, o.value] : seleccionados.filter((v) => v !== o.value))}
                  className="h-4 w-4"
                />
                {o.label}
              </label>
            )
          })
        )}
      </div>
      {/* Las seleccionadas pueden quedar fuera del filtro actual: sin este recuento, marcar a
          tres personas y luego buscar a una cuarta daría la sensación de haberlas perdido. */}
      {seleccionados.length > 0 && (
        <p className="text-xs text-ink-soft">{seleccionados.length} seleccionada(s).</p>
      )}
    </div>
  )
}

/* -------------------- Formulario de registro / edición (Patrón B / C) -------------------- */
function RecordForm({
  config, opciones, registro, onCancel, onSaved,
}: {
  config: ResourceConfig
  opciones: Record<string, Opcion[]>
  registro: Row | null
  onCancel: () => void
  onSaved: () => void
}) {
  const { session } = useAuth()
  const esEdicion = !!registro
  const valoresIniciales = useRef<Row | null>(null)
  const [valores, setValores] = useState<Row>(() => {
    const init: Row = {}
    for (const c of config.campos) {
      if (c.multiSelect && !registro) {
        init[c.name] = [] as string[]
        continue
      }
      const def = typeof c.default === 'function' ? c.default() : c.default
      init[c.name] = registro ? registro[c.name] ?? '' : def ?? (c.type === 'checkbox' ? false : '')
    }
    valoresIniciales.current = init
    return init
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dinamicas, setDinamicas] = useState<Record<string, Opcion[]>>({})
  /** Cambios en campos sensibles pendientes de confirmar (GPE §5). */
  const [confirmacion, setConfirmacion] = useState<{ campo: string; antes: string; despues: string }[] | null>(null)

  // Borrador del alta. `useBorrador` existía desde la ronda de validaciones pero solo lo usaba
  // el alta de usuarios: en el resto de formularios, cambiar de pestaña a mitad de un registro
  // largo (una persona tiene once campos) obligaba a empezar de cero. Solo en el alta: restaurar
  // sobre una edición pisaría el registro real con datos que quizá ya cambió otra persona.
  const claveBorrador = !esEdicion && session?.user.id ? `${session.user.id}:${config.tabla}:nuevo` : null
  // Solo se guarda si el usuario ha escrito algo. Sin esta condición bastaba con abrir el
  // formulario y esperar un segundo para dejar un borrador con los valores por defecto, y a
  // partir de ahí el aviso "tienes un registro sin terminar" salía siempre, aunque nunca se
  // hubiera escrito nada. Un aviso que aparece siempre deja de significar algo.
  const hayCambios = useMemo(
    () => JSON.stringify(valores) !== JSON.stringify(valoresIniciales.current),
    [valores],
  )
  const borrador = useBorrador(claveBorrador, valores, { activo: hayCambios })
  const [avisoBorrador, setAvisoBorrador] = useState(borrador.hayBorrador)

  /** Error de formato por campo, mostrado bajo el input mientras se escribe. */
  const [erroresCampo, setErroresCampo] = useState<Record<string, string | null>>({})

  const set = (name: string, v: unknown) => {
    setValores((s) => {
      const next = { ...s, [name]: v }
      const campo = config.campos.find((c) => c.name === name)
      for (const otro of campo?.alCambiarLimpiar ?? []) next[otro] = ''

      // Validar en vivo contra el formulario COMPLETO (next, no s): hay reglas que dependen de
      // otro campo, como el valor de un parámetro según su tipo_dato.
      if (campo?.validar) {
        const texto = v == null ? '' : String(v)
        setErroresCampo((e) => ({ ...e, [name]: texto === '' ? null : campo.validar!(texto, next) }))
      }
      return next
    })
  }

  // Al EDITAR, rellena los campos auxiliares de cascada a partir del registro. No son columnas
  // de la tabla, así que no vienen en `registro` y arrancaban vacíos: eso dejaba sin opciones al
  // campo que colgaba de ellos ("Zona" en un punto de control, "Punto de control" en un
  // dispositivo) y, al ser obligatorios, impedía guardar la edición.
  useEffect(() => {
    if (!registro) return
    let vivo = true
    ;(async () => {
      const derivados = config.campos.filter((c) => c.derivarDeRegistro)
      if (derivados.length === 0) return
      const entries = await Promise.all(
        derivados.map(async (c) => [c.name, await c.derivarDeRegistro!(registro)] as const),
      )
      if (!vivo) return
      setValores((s) => {
        const next = { ...s }
        // Solo se rellena lo que sigue vacío: si el usuario ya eligió otra cosa mientras se
        // resolvía la consulta, manda lo suyo.
        for (const [name, valor] of entries) if (!next[name] && valor != null) next[name] = valor
        // El valor derivado forma parte del punto de partida: si no, el formulario se
        // consideraría "con cambios" nada más abrirlo y dejaría un borrador espurio.
        valoresIniciales.current = { ...(valoresIniciales.current ?? {}), ...next }
        return next
      })
    })()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registro])

  // Recalcula las opciones de los campos con cascada (opcionesDependientes) cada vez que
  // cambian los valores del formulario (ej. "Punto de control" según la "Zona" elegida).
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const dependientes = config.campos.filter((c) => c.opcionesDependientes)
      if (dependientes.length === 0) return
      const entries = await Promise.all(
        dependientes.map(async (c) => [c.name, await c.opcionesDependientes!(valores)] as const),
      )
      if (vivo) setDinamicas(Object.fromEntries(entries))
    })()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(valores)])

  // Auto-sugerencia (ej. siguiente nombre de punto de control): solo si el campo destino
  // sigue vacío, para no pisar algo que el usuario ya escribió.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      for (const c of config.campos) {
        if (!c.autoSugerenciaDesde) continue
        const valorOrigen = valores[c.autoSugerenciaDesde.campo]
        if (!valorOrigen || valores[c.name]) continue
        const sugerido = await c.autoSugerenciaDesde.calcular(valorOrigen, valores)
        if (vivo && sugerido && !valores[c.name]) set(c.name, sugerido)
      }
    })()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...config.campos.filter((c) => c.autoSugerenciaDesde).map((c) => valores[c.autoSugerenciaDesde!.campo])])

  // Valor derivado que SIEMPRE se recalcula (a diferencia de autoSugerenciaDesde), típicamente
  // un campo oculto que solo alimenta visibleSi de otros campos (ej. categoría de la persona).
  useEffect(() => {
    let vivo = true
    ;(async () => {
      for (const c of config.campos) {
        if (!c.derivarSiempreDesde) continue
        const valorOrigen = valores[c.derivarSiempreDesde.campo]
        const derivado = valorOrigen ? await c.derivarSiempreDesde.calcular(valorOrigen) : null
        if (vivo) set(c.name, derivado ?? '')
      }
    })()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...config.campos.filter((c) => c.derivarSiempreDesde).map((c) => valores[c.derivarSiempreDesde!.campo])])

  // Campos que el sistema arma a partir de otros y que SÍ se guardan (ej. el nombre de un punto
  // de control, "E20/P4/E004 – Laboratorio Alan Turing", compuesto de tres números y un texto).
  // Se recalculan en cuanto cambia cualquiera de sus piezas, para que lo que se ve en gris sea
  // exactamente lo que se va a guardar.
  useEffect(() => {
    for (const c of config.campos) {
      if (!c.componerDesde) continue
      // Un campo oculto no escribe en el formulario. Sin esto, al editar una garita del campus
      // —donde el nombre se teclea a mano— el campo compuesto, que solo aplica a los edificios,
      // borraba el nombre real: sus piezas estaban vacías y componía "".
      if (c.visibleSi && !c.visibleSi(valores)) continue
      const compuesto = c.componerDesde.componer(valores)
      if (compuesto !== (valores[c.name] ?? '')) set(c.name, compuesto)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    JSON.stringify(
      config.campos
        .filter((c) => c.componerDesde)
        .flatMap((c) => c.componerDesde!.campos.map((n) => valores[n])),
    ),
  ])

  const bloqueadoEnEdicion = (c: FieldConfig) => esEdicion && c.editable === false
  /** Deshabilitado en pantalla: por política de edición o por ser un valor que calcula el sistema.
   *  `componerDesde` también se deshabilita, pero a diferencia de `soloLectura` sí se guarda. */
  const deshabilitado = (c: FieldConfig) =>
    bloqueadoEnEdicion(c) || c.soloLectura === true || !!c.componerDesde || c.deshabilitadoSi?.(valores) === true

  /** Campos sensibles que el usuario acaba de cambiar (GPE §5). Vacío si no hay ninguno. */
  const cambiosSensibles = () => {
    if (!esEdicion || !config.camposSensibles?.length) return []
    return config.campos
      .filter((c) => config.camposSensibles!.includes(c.name) && !deshabilitado(c))
      .map((c) => {
        const antes = registro?.[c.name]
        const despues = valores[c.name]
        const norm = (v: unknown) => (v == null || v === '' ? '' : String(v))
        if (norm(antes) === norm(despues)) return null
        const etiquetaValor = (v: unknown) => {
          if (norm(v) === '') return '(vacío)'
          const opcion = (opciones[c.name] ?? []).find((o) => o.value === String(v))
          return opcion?.label ?? String(v)
        }
        return { campo: c.label, antes: etiquetaValor(antes), despues: etiquetaValor(despues) }
      })
      .filter((x): x is { campo: string; antes: string; despues: string } => x !== null)
  }

  const guardar = async () => {
    setError(null)
    // Validación mínima de requeridos
    for (const c of config.campos) {
      if (c.visibleSi && !c.visibleSi(valores)) continue
      if (c.multiSelect && c.required && (valores[c.name] as string[])?.length === 0) {
        setError(`Selecciona al menos un valor en "${c.label}".`)
        return
      }
      if (c.required && !deshabilitado(c) && (valores[c.name] === '' || valores[c.name] == null)) {
        setError(`El campo "${c.label}" es obligatorio.`)
        return
      }
      // Validación de formato (espejo de los CHECK de la BD, ver web/src/lib/validacion.ts).
      // Los campos bloqueados en edición no se envían, así que no se validan.
      if (c.validar && !deshabilitado(c)) {
        const v = valores[c.name]
        if (v != null && v !== '') {
          const problema = c.validar(String(v), valores)
          if (problema) {
            // El banner dice qué pasó; el error bajo el campo dice dónde.
            setErroresCampo((e) => ({ ...e, [c.name]: problema }))
            setError(`${c.label}: ${problema}`)
            return
          }
        }
      }
    }

    // Antes de escribir nada: si el usuario tocó un campo sensible, se le enseña exactamente
    // qué va a cambiar y de qué a qué (GPE §5). Confirmar vuelve a entrar aquí con la lista ya
    // resuelta, así que la comprobación no se repite en bucle.
    const sensibles = cambiosSensibles()
    if (sensibles.length > 0 && confirmacion === null) {
      setConfirmacion(sensibles)
      return
    }
    setConfirmacion(null)

    // Selección múltiple (feedback GPE): un INSERT por cada valor elegido, mismo resto de campos.
    const campoMulti = !esEdicion ? config.campos.find((c) => c.multiSelect) : undefined
    if (campoMulti) {
      setGuardando(true)
      const seleccionados = valores[campoMulti.name] as string[]
      const base: Row = {}
      for (const c of config.campos) {
        if (c === campoMulti || c.persistir === false || c.soloLectura) continue
        let v = valores[c.name]
        if (c.normalizar && typeof v === 'string' && v !== '') v = c.normalizar(v)
        if (v === '') v = null
        if (c.type === 'number' && v != null) v = Number(v)
        base[c.name] = v
      }
      if (config.defaultsInsert) Object.assign(base, config.defaultsInsert)
      if (config.autoUsuarioRegistro && session?.user.id)
        for (const col of config.autoUsuarioRegistro) base[col] = session.user.id
      const filas = seleccionados.map((valor) => ({ ...base, [campoMulti.name]: valor }))
      const res = await fromTable(config.tabla).insert(filas)
      setGuardando(false)
      if (res.error) {
        setError(mensajeError(res.error))
        return
      }
      borrador.descartar()
      onSaved()
      return
    }

    setGuardando(true)
    const payload: Row = {}
    for (const c of config.campos) {
      if (c.persistir === false || c.soloLectura) continue
      if (esEdicion && (c.insertOnly || bloqueadoEnEdicion(c))) continue
      let v = valores[c.name]
      if (c.normalizar && typeof v === 'string' && v !== '') v = c.normalizar(v)
      if (v === '') v = null
      if (c.type === 'number' && v != null) v = Number(v)
      payload[c.name] = v
    }
    if (!esEdicion) {
      if (config.defaultsInsert) Object.assign(payload, config.defaultsInsert)
      if (config.autoUsuarioRegistro && session?.user.id)
        for (const col of config.autoUsuarioRegistro) payload[col] = session.user.id
    }

    const res = esEdicion
      ? await fromTable(config.tabla).update(payload).eq(config.idField, registro![config.idField])
      : await fromTable(config.tabla).insert(payload)
    setGuardando(false)
    if (res.error) {
      setError(mensajeError(res.error))
      return
    }
    borrador.descartar()
    onSaved()
  }

  return (
    <Card className="p-6">
      <button onClick={onCancel} className="mb-4 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-navy">
        <ArrowLeft className="h-4 w-4" /> Volver al panel
      </button>
      <h2 className="mb-1 text-lg font-bold text-navy">
        {esEdicion ? `Editar ${config.singular}` : `Registrar ${config.singular}`}
      </h2>
      {/* GPE §7: el aviso "Los campos en gris no son editables por diseño (identidad del
          registro o política de permisos)" explicaba una decisión de diseño a quien solo
          quiere rellenar un formulario. Cada campo bloqueado dice ahora por sí mismo por qué
          lo está, en su propio `hint`. */}

      {avisoBorrador && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-navy">
          <span>Tienes un registro sin terminar de la última vez.</span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                const previo = borrador.restaurar()
                if (previo) setValores((s) => ({ ...s, ...previo }))
                setAvisoBorrador(false)
              }}
            >
              Recuperarlo
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                borrador.descartar()
                setAvisoBorrador(false)
              }}
            >
              Empezar de cero
            </Button>
          </div>
        </div>
      )}

      <div className="mb-5"><ErrorBanner message={error} /></div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {config.campos
          .filter((c) => esEdicion || !c.hideOnInsert)
          .filter((c) => !c.visibleSi || c.visibleSi(valores))
          .map((c) => {
          const disabled = deshabilitado(c)
          const span = c.colSpan === 3 ? 'lg:col-span-3' : c.colSpan === 2 ? 'sm:col-span-2' : ''
          // Sin `id` en el control y `htmlFor` en la etiqueta, un lector de pantalla no anuncia
          // de qué campo se trata: lee "cuadro de texto" y nada más. Ningún campo del formulario
          // genérico los tenía, así que ninguna de estas pantallas era navegable a ciegas.
          const campoId = `campo-${config.tabla}-${c.name}`
          return (
            <div key={c.name} className={span}>
              {c.type === 'checkbox' ? (
                <label className="flex items-center gap-2 pt-6 text-sm text-navy">
                  <input
                    id={campoId}
                    type="checkbox"
                    checked={!!valores[c.name]}
                    disabled={disabled}
                    onChange={(e) => set(c.name, e.target.checked)}
                    className="h-4 w-4"
                  />
                  {c.label}
                </label>
              ) : (
                <Field
                  label={c.label}
                  htmlFor={campoId}
                  required={c.required && !disabled}
                  // El aviso no sustituye al error: si hay error, manda el error. Solo se muestra
                  // cuando el valor es válido pero merece una segunda mirada (ej. horas extra).
                  hint={(!erroresCampo[c.name] && c.aviso?.(String(valores[c.name] ?? ''), valores)) || c.hint}
                  ayuda={c.ayuda}
                  error={erroresCampo[c.name]}
                >
                  {c.multiSelect && !esEdicion ? (
                    <ListaSeleccionMultiple
                      id={campoId}
                      opciones={opciones[c.name] ?? []}
                      seleccionados={(valores[c.name] as string[]) ?? []}
                      onChange={(v) => set(c.name, v)}
                      placeholderBusqueda={c.placeholder}
                    />
                  ) : c.soloLectura ? (
                    // Campo en gris con el valor que el sistema calcula (GPE §6). Se pinta como
                    // texto y no como <select>: ofrecer un desplegable que no se puede abrir
                    // era justo lo que confundía en "Editar Memorando".
                    <Input id={campoId} value={c.valorCalculado ? c.valorCalculado(valores) : String(valores[c.name] ?? '')} disabled readOnly />
                  ) : c.type === 'cedula-busqueda' ? (
                    c.buscarPersona ? (
                      <BuscarPersonaPorCedula
                        id={campoId}
                        label={c.label}
                        embebido
                        disabled={disabled}
                        soloActivas={c.buscarPersona.soloActivas}
                        soloTipo={c.buscarPersona.soloTipo}
                        personaInicial={registro?.persona as PersonaCedula | null}
                        onSelect={(persona) => set(c.name, persona?.id_persona ?? '')}
                      />
                    ) : (
                      <BuscarPorCedula
                        id={campoId}
                        campo={c}
                        idSeleccionado={valores[c.name] ?? ''}
                        disabled={disabled}
                        onSeleccion={(id) => set(c.name, id)}
                        registro={registro}
                      />
                    )
                  ) : c.type === 'select' ? (
                    <Select
                      id={campoId}
                      value={valores[c.name] ?? ''}
                      disabled={disabled}
                      onChange={(e) => set(c.name, e.target.value)}
                      placeholder="— Seleccionar —"
                      options={c.opcionesDependientes ? (dinamicas[c.name] ?? []) : opciones[c.name] ?? (Array.isArray(c.options) ? (c.options as Opcion[]) : [])}
                    />
                  ) : c.type === 'textarea' ? (
                    <Textarea
                      id={campoId}
                      value={valores[c.name] ?? ''}
                      disabled={disabled}
                      placeholder={c.placeholder}
                      onChange={(e) => set(c.name, e.target.value)}
                    />
                  ) : c.type === 'timerange' ? (
                    <div className="flex items-center gap-2">
                      <Input
                        id={campoId}
                        type="time"
                        disabled={disabled}
                        value={String(valores[c.name] ?? '').split('–')[0] ?? ''}
                        onChange={(e) => {
                          const fin = String(valores[c.name] ?? '').split('–')[1] ?? ''
                          set(c.name, `${e.target.value}–${fin}`)
                        }}
                      />
                      <span className="text-ink-soft">a</span>
                      <Input
                        type="time"
                        disabled={disabled}
                        value={String(valores[c.name] ?? '').split('–')[1] ?? ''}
                        onChange={(e) => {
                          const inicio = String(valores[c.name] ?? '').split('–')[0] ?? ''
                          set(c.name, `${inicio}–${e.target.value}`)
                        }}
                      />
                    </div>
                  ) : (
                    <Input
                      id={campoId}
                      type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : c.type === 'time' ? 'time' : c.type === 'email' ? 'email' : 'text'}
                      value={valores[c.name] ?? ''}
                      disabled={disabled}
                      placeholder={c.placeholder}
                      // El calendario no ofrece días pasados. La base también lo rechaza, pero
                      // que no se pueda elegir es distinto de que salte un error al guardar.
                      // Al EDITAR no se aplica: una asignación que empezó en el pasado tiene que
                      // poder abrirse sin obligar a cambiarle la fecha de inicio.
                      min={c.minHoy && c.type === 'date' && !esEdicion ? hoyISO() : undefined}
                      onChange={(e) => set(c.name, c.formatear ? c.formatear(e.target.value) : e.target.value)}
                    />
                  )}
                </Field>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Volver al panel</Button>
        <Button onClick={guardar} loading={guardando}>{esEdicion ? 'Guardar cambios' : 'Registrar'}</Button>
      </div>

      {/* GPE §5: confirmación antes de tocar un dato sensible. Enseña el valor de antes y el
          de después de cada campo, para que quien confirma sepa qué está aprobando. */}
      <Modal
        open={confirmacion !== null}
        onClose={() => setConfirmacion(null)}
        title="Confirmar cambios en datos sensibles"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmacion(null)}>Cancelar</Button>
            <Button onClick={guardar} loading={guardando}>Sí, guardar los cambios</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Vas a modificar {confirmacion?.length === 1 ? 'un dato que afecta' : 'datos que afectan'} al
            control de acceso de esta persona o a su identificación. Revisa antes de continuar:
          </p>
          <ul className="space-y-2">
            {confirmacion?.map((c) => (
              <li key={c.campo} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                <p className="font-medium text-navy">{c.campo}</p>
                <p className="text-ink-soft">
                  <span className="line-through">{c.antes}</span>
                  {' → '}
                  <span className="font-medium text-navy">{c.despues}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </Card>
  )
}

/* -------------------- Modal "Dar de baja" (Patrón D) -------------------- */
/**
 * Campo que busca a una persona por su cédula y guarda su id (`type: 'cedula-busqueda'`).
 *
 * PCO v2 pidió que al asignar un guardia se le identifique por cédula y que la pantalla diga si
 * está registrado o no, enseñando el nombre completo al lado. Sustituye al desplegable de
 * guardias, que obligaba a reconocer a alguien por su correo.
 *
 * La búsqueda se lanza sola al completar los diez dígitos: no hace falta un botón, y así no se
 * puede dejar una cédula a medias creyendo que ya se ha buscado.
 */
function BuscarPorCedula({
  id, campo, idSeleccionado, disabled, onSeleccion, registro,
}: {
  id: string
  campo: FieldConfig
  idSeleccionado: string
  disabled?: boolean
  onSeleccion: (id: string) => void
  registro: Row | null
}) {
  const [cedula, setCedula] = useState('')
  const [estado, setEstado] = useState<'vacio' | 'buscando' | 'encontrado' | 'no-encontrado'>('vacio')
  const [encontrado, setEncontrado] = useState<{ nombre: string; yaAsignado: boolean } | null>(null)

  // Al editar, el registro ya trae a la persona: se muestra su cédula y su nombre sin obligar a
  // volver a buscarla.
  useEffect(() => {
    const p = registro?.guardia?.persona
    if (!p?.cedula) return
    setCedula(p.cedula)
    setEncontrado({ nombre: `${p.nombres ?? ''} ${p.apellidos ?? ''}`.trim(), yaAsignado: false })
    setEstado('encontrado')
  }, [registro])

  const buscar = useCallback(async (valor: string) => {
    setEstado('buscando')
    const { data } = await (supabase as any).rpc(campo.buscarPorCedula!.rpc, { p_cedula: valor })
    const fila = ((data as any[]) ?? [])[0]
    if (!fila) {
      setEncontrado(null)
      setEstado('no-encontrado')
      onSeleccion('')
      return
    }
    setEncontrado({ nombre: fila.nombre_completo, yaAsignado: !!fila.ya_asignado })
    setEstado('encontrado')
    onSeleccion(fila.id_usuario)
  }, [campo.buscarPorCedula, onSeleccion])

  const alEscribir = (v: string) => {
    // Solo dígitos y como mucho diez: es una cédula, no un texto libre.
    const limpio = v.replace(/\D/g, '').slice(0, 10)
    setCedula(limpio)
    if (idSeleccionado) onSeleccion('')
    setEncontrado(null)
    if (limpio.length === 10) void buscar(limpio)
    else setEstado(limpio.length === 0 ? 'vacio' : 'buscando')
  }

  const errorFormato = cedula.length === 10 ? validarCedula(cedula) : null

  return (
    <div className="space-y-1">
      <Input
        id={id}
        inputMode="numeric"
        value={cedula}
        disabled={disabled}
        placeholder="1712345678"
        onChange={(e) => alEscribir(e.target.value)}
      />
      {cedula.length > 0 && cedula.length < 10 && (
        <p className="text-xs text-ink-soft">Faltan {10 - cedula.length} dígitos.</p>
      )}
      {errorFormato && <p className="text-xs text-red">{errorFormato}</p>}
      {!errorFormato && estado === 'encontrado' && encontrado && (
        <p className="text-xs font-medium text-emerald-700">
          Guardia encontrado: {encontrado.nombre}
          {encontrado.yaAsignado && (
            <span className="font-normal text-ink-soft"> · ya tiene una asignación activa</span>
          )}
        </p>
      )}
      {!errorFormato && estado === 'no-encontrado' && (
        <p className="text-xs text-red">
          {campo.buscarPorCedula?.textoNoEncontrado ?? 'Esa cédula no corresponde a ningún usuario registrado.'}
        </p>
      )}
    </div>
  )
}

function BajaModal({
  open, config, registro, onClose, onDone,
}: {
  open: boolean
  config: ResourceConfig
  registro: Row
  onClose: () => void
  onDone: () => void
}) {
  const baja = config.baja!
  const [motivo, setMotivo] = useState('')
  const [tipo, setTipo] = useState(baja.tipos?.[0]?.value ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      setMotivo('')
      setError(null)
      setTimeout(() => ref.current?.focus(), 50)
    }
  }, [open])

  const confirmar = async () => {
    if (!motivo.trim()) {
      setError('El motivo es obligatorio.')
      return
    }
    setGuardando(true)
    const payload: Row = { [baja.campoEstado]: baja.valorBaja }
    if (baja.campoMotivo) payload[baja.campoMotivo] = motivo.trim()
    const { error } = await fromTable(config.tabla).update(payload).eq(config.idField, registro[config.idField])
    setGuardando(false)
    if (error) {
      setError(mensajeError(error))
      return
    }
    onDone()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${baja.etiqueta ?? 'Dar de baja'} — ${config.singular}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="danger" onClick={confirmar} loading={guardando}>Confirmar baja</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">
          Esta acción cambia el estado a <b>{baja.valorBaja}</b>. No elimina el registro (sin borrado físico).
        </p>
        {baja.tipos && (
          <Field label="Tipo de baja">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)} options={baja.tipos} />
          </Field>
        )}
        <Field label="Motivo" required>
          <Textarea ref={ref} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Describe el motivo de la baja..." />
        </Field>
        <ErrorBanner message={error} />
      </div>
    </Modal>
  )
}
