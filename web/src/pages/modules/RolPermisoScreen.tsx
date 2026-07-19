import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { supabase, mensajeError } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthProvider'
import { CenterSpinner, EmptyState, ErrorBanner, useToast } from '../../components/ui'

interface Rol { id_rol: string; nombre_rol: string }
interface Permiso { id_permiso: string; codigo_permiso: string }
interface RolPermiso { id_rol_permiso: string; id_rol: string; id_permiso: string; estado_asignacion: string }

/**
 * Matriz rol × permiso (feedback ADM §7.8/§9.13): los permisos ADM_ROL_PERMISO_SELECT/INSERT/
 * UPDATE ya existían en el catálogo, pero nunca hubo una pantalla — solo "Roles" y "Permisos"
 * por separado, sin forma de ver ni editar qué permiso tiene cada rol.
 */
export function RolPermisoScreen() {
  const { tiene } = useAuth()
  const toast = useToast()
  const puedeLeer = tiene('ADM_ROL_PERMISO_SELECT')
  const puedeEditar = tiene('ADM_ROL_PERMISO_INSERT') || tiene('ADM_ROL_PERMISO_UPDATE')

  const [roles, setRoles] = useState<Rol[]>([])
  const [permisos, setPermisos] = useState<Permiso[]>([])
  const [asignaciones, setAsignaciones] = useState<RolPermiso[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [pendiente, setPendiente] = useState<string | null>(null)

  const cargar = async () => {
    setCargando(true)
    const [r, p, rp] = await Promise.all([
      supabase.from('rol').select('id_rol, nombre_rol').eq('estado_rol', 'ACTIVO').order('nombre_rol'),
      supabase.from('permiso').select('id_permiso, codigo_permiso').eq('estado_permiso', 'ACTIVO').order('codigo_permiso'),
      supabase.from('rol_permiso').select('id_rol_permiso, id_rol, id_permiso, estado_asignacion'),
    ])
    if (r.error) setError(mensajeError(r.error))
    setRoles((r.data as Rol[] | null) ?? [])
    setPermisos((p.data as Permiso[] | null) ?? [])
    setAsignaciones((rp.data as RolPermiso[] | null) ?? [])
    setCargando(false)
  }

  useEffect(() => {
    if (puedeLeer) cargar()
    else setCargando(false)
  }, [puedeLeer])

  const permisosFiltrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return permisos
    return permisos.filter((p) => p.codigo_permiso.toLowerCase().includes(t))
  }, [permisos, busqueda])

  const mapa = useMemo(() => {
    const m = new Map<string, RolPermiso>()
    for (const a of asignaciones) m.set(`${a.id_rol}:${a.id_permiso}`, a)
    return m
  }, [asignaciones])

  const alternar = async (rol: Rol, permiso: Permiso) => {
    if (!puedeEditar) return
    const clave = `${rol.id_rol}:${permiso.id_permiso}`
    const actual = mapa.get(clave)
    const activo = actual?.estado_asignacion === 'ACTIVO'
    setPendiente(clave)
    const res = actual
      ? await supabase.from('rol_permiso').update({ estado_asignacion: activo ? 'REVOCADO' : 'ACTIVO' }).eq('id_rol_permiso', actual.id_rol_permiso)
      : await supabase.from('rol_permiso').insert({ id_rol: rol.id_rol, id_permiso: permiso.id_permiso, estado_asignacion: 'ACTIVO' })
    setPendiente(null)
    if (res.error) {
      toast('error', mensajeError(res.error))
      return
    }
    await cargar()
  }

  if (!puedeLeer) return <EmptyState title="No tienes acceso a los permisos por rol" hint="Pide acceso al administrador del sistema." />
  if (cargando) return <CenterSpinner label="Cargando matriz rol-permiso..." />

  return (
    <div>
      <ErrorBanner message={error} />
      <div className="relative mb-3 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Filtrar por código de permiso..."
          className="epn-input pl-9"
        />
      </div>
      {!puedeEditar && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Solo lectura: tu rol no tiene ADM_ROL_PERMISO_INSERT/UPDATE.
        </p>
      )}
      <div className="overflow-auto rounded-lg border border-slate-200" style={{ maxHeight: '70vh' }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-ink-soft">
              <th className="sticky left-0 z-20 min-w-[220px] bg-slate-50 px-3 py-2.5">Permiso</th>
              {roles.map((r) => (
                <th key={r.id_rol} className="min-w-[110px] px-2 py-2.5 text-center">{r.nombre_rol.replaceAll('_', ' ')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permisosFiltrados.map((p) => (
              <tr key={p.id_permiso} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-mono text-xs text-navy">{p.codigo_permiso}</td>
                {roles.map((r) => {
                  const clave = `${r.id_rol}:${p.id_permiso}`
                  const activo = mapa.get(clave)?.estado_asignacion === 'ACTIVO'
                  return (
                    <td key={r.id_rol} className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={activo}
                        disabled={!puedeEditar || pendiente === clave}
                        onChange={() => alternar(r, p)}
                        className="h-4 w-4"
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">{permisosFiltrados.length} permiso(s) × {roles.length} rol(es)</p>
    </div>
  )
}
