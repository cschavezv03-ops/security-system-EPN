import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Search, Ban, ArrowLeft, Download } from 'lucide-react'
import { fromTable, mensajeError } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import type { FieldConfig, Opcion, ResourceConfig } from '../resources/types'
import {
  Badge, Button, Card, CenterSpinner, EmptyState, ErrorBanner, Field, Input, Modal,
  Select, SidePanel, Textarea, useToast,
} from './ui'

type Row = Record<string, any>

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

  const [rows, setRows] = useState<Row[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [seleccion, setSeleccion] = useState<Row | null>(null)
  const [vista, setVista] = useState<'lista' | 'form'>('lista')
  const [editando, setEditando] = useState<Row | null>(null)
  const [bajaOpen, setBajaOpen] = useState(false)
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
    const t = busqueda.trim().toLowerCase()
    // Segunda pasada ignorando separadores: la placa se guarda canónica ("PDF1234") pero el
    // usuario la teclea como la ve en el vehículo ("PDF-1234"). Mismo caso para MAC y cédula.
    const tPlano = t.replace(/[^a-z0-9]/g, '')
    if (t && config.buscarEn?.length) {
      out = out.filter((r) =>
        config.buscarEn!.some((campo) => {
          const v = String(leerRuta(r, campo) ?? '').toLowerCase()
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
        hint="Tu rol no incluye el permiso de lectura requerido. Si crees que es un error, contacta al administrador."
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
          <EmptyState title={busqueda ? 'Sin resultados' : `No hay ${config.titulo.toLowerCase()} registrados`} />
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
              {config.baja && puedeEditar && (
                <Button variant="danger" className="flex-1" onClick={() => setBajaOpen(true)}>
                  <Ban className="h-4 w-4" /> {config.baja.etiqueta ?? 'Dar de baja'}
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
              {config.detalle.map((d, i) => (
                <div key={i} className="grid grid-cols-3 gap-2 py-2">
                  <dt className="text-xs font-medium text-ink-soft">{d.label}</dt>
                  <dd className="col-span-2 text-sm text-navy">{d.render(seleccion)}</dd>
                </div>
              ))}
            </dl>
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
    return init
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dinamicas, setDinamicas] = useState<Record<string, Opcion[]>>({})

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

  const bloqueadoEnEdicion = (c: FieldConfig) => esEdicion && c.editable === false

  const guardar = async () => {
    setError(null)
    // Validación mínima de requeridos
    for (const c of config.campos) {
      if (c.visibleSi && !c.visibleSi(valores)) continue
      if (c.multiSelect && c.required && (valores[c.name] as string[])?.length === 0) {
        setError(`Selecciona al menos un valor en "${c.label}".`)
        return
      }
      if (c.required && !bloqueadoEnEdicion(c) && (valores[c.name] === '' || valores[c.name] == null)) {
        setError(`El campo "${c.label}" es obligatorio.`)
        return
      }
      // Validación de formato (espejo de los CHECK de la BD, ver web/src/lib/validacion.ts).
      // Los campos bloqueados en edición no se envían, así que no se validan.
      if (c.validar && !bloqueadoEnEdicion(c)) {
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

    // Selección múltiple (feedback GPE): un INSERT por cada valor elegido, mismo resto de campos.
    const campoMulti = !esEdicion ? config.campos.find((c) => c.multiSelect) : undefined
    if (campoMulti) {
      setGuardando(true)
      const seleccionados = valores[campoMulti.name] as string[]
      const base: Row = {}
      for (const c of config.campos) {
        if (c === campoMulti || c.persistir === false) continue
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
      onSaved()
      return
    }

    setGuardando(true)
    const payload: Row = {}
    for (const c of config.campos) {
      if (c.persistir === false) continue
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
      {esEdicion && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Los campos en gris no son editables por diseño (identidad del registro o política de permisos).
        </p>
      )}

      <div className="mb-5"><ErrorBanner message={error} /></div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {config.campos
          .filter((c) => esEdicion || !c.hideOnInsert)
          .filter((c) => !c.visibleSi || c.visibleSi(valores))
          .map((c) => {
          const disabled = bloqueadoEnEdicion(c)
          const span = c.colSpan === 3 ? 'lg:col-span-3' : c.colSpan === 2 ? 'sm:col-span-2' : ''
          return (
            <div key={c.name} className={span}>
              {c.type === 'checkbox' ? (
                <label className="flex items-center gap-2 pt-6 text-sm text-navy">
                  <input
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
                  required={c.required && !disabled}
                  hint={c.hint}
                  ayuda={c.ayuda}
                  error={erroresCampo[c.name]}
                >
                  {c.multiSelect && !esEdicion ? (
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                      {(opciones[c.name] ?? []).length === 0 && <p className="p-1 text-xs text-slate-400">Sin opciones disponibles.</p>}
                      {(opciones[c.name] ?? []).map((o) => {
                        const seleccionados = (valores[c.name] as string[]) ?? []
                        const marcado = seleccionados.includes(o.value)
                        return (
                          <label key={o.value} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={marcado}
                              onChange={(e) => set(c.name, e.target.checked ? [...seleccionados, o.value] : seleccionados.filter((v) => v !== o.value))}
                              className="h-4 w-4"
                            />
                            {o.label}
                          </label>
                        )
                      })}
                    </div>
                  ) : c.type === 'select' ? (
                    <Select
                      value={valores[c.name] ?? ''}
                      disabled={disabled}
                      onChange={(e) => set(c.name, e.target.value)}
                      placeholder="— Seleccionar —"
                      options={c.opcionesDependientes ? (dinamicas[c.name] ?? []) : opciones[c.name] ?? (Array.isArray(c.options) ? (c.options as Opcion[]) : [])}
                    />
                  ) : c.type === 'textarea' ? (
                    <Textarea
                      value={valores[c.name] ?? ''}
                      disabled={disabled}
                      placeholder={c.placeholder}
                      onChange={(e) => set(c.name, e.target.value)}
                    />
                  ) : c.type === 'timerange' ? (
                    <div className="flex items-center gap-2">
                      <Input
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
                      type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : c.type === 'time' ? 'time' : c.type === 'email' ? 'email' : 'text'}
                      value={valores[c.name] ?? ''}
                      disabled={disabled}
                      placeholder={c.placeholder}
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
    </Card>
  )
}

/* -------------------- Modal "Dar de baja" (Patrón D) -------------------- */
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
