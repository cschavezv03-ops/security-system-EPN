import { fromTable, supabase } from '../lib/supabase'
import type { Opcion } from './types'
import { humanizar } from '../lib/catalogos'

/** Convierte un arreglo de códigos de catálogo en opciones {value,label} humanizadas. */
export function opcionesCatalogo(valores: readonly string[]): Opcion[] {
  return valores.map((v) => ({ value: v, label: humanizar(v) }))
}

/** Opciones desde una tabla: value = idField, label construido con `etiqueta`. */
export function opcionesTabla(
  tabla: string,
  idField: string,
  etiqueta: (row: any) => string,
  filtro?: Record<string, string>,
): () => Promise<Opcion[]> {
  return async () => {
    let q = fromTable(tabla).select('*')
    if (filtro) for (const [k, v] of Object.entries(filtro)) q = q.eq(k, v)
    const { data } = await q
    return ((data as any[]) ?? []).map((r) => ({ value: r[idField], label: etiqueta(r) }))
  }
}

export const optCategorias = (ambito?: 'INTERNA' | 'EXTERNA') =>
  opcionesTabla('categoria_persona', 'id_categoria', (r) => humanizar(r.codigo_categoria), ambito ? { ambito } : undefined)

export const optEmpresas = opcionesTabla('empresa', 'id_empresa', (r) => r.nombre, { estado: 'ACTIVO' })
export const optZonas = opcionesTabla('zona', 'id_zona', (r) => `${r.nombre_zona} · ${r.tipo_zona}`)
export const optPuntosControl = opcionesTabla('punto_control', 'id_punto_control', (r) => r.nombre_punto)
export const optRoles = opcionesTabla('rol', 'id_rol', (r) => r.nombre_rol, { estado_rol: 'ACTIVO' })
export const optPermisos = opcionesTabla('permiso', 'id_permiso', (r) => r.codigo_permiso, { estado_permiso: 'ACTIVO' })

/** Zonas de un tipo dado (cascada tipo→zona al registrar un punto de control). */
export async function optZonasPorTipo(tipoZona: string): Promise<Opcion[]> {
  if (!tipoZona) return []
  const { data } = await fromTable('zona').select('*').eq('tipo_zona', tipoZona)
  return ((data as any[]) ?? []).map((r) => ({ value: r.id_zona, label: r.nombre_zona }))
}

/** Puntos de control de una zona dada (cascada zona→punto al asignar dispositivo/guardia). */
export async function optPuntosPorZona(idZona: string): Promise<Opcion[]> {
  if (!idZona) return []
  const { data } = await fromTable('punto_control').select('*').eq('id_zona', idZona)
  return ((data as any[]) ?? []).map((r) => ({ value: r.id_punto_control, label: r.nombre_punto }))
}

/** Solo cuentas con rol GUARDIA_SEGURIDAD activo (RPC guardias_disponibles — PCO no puede leer
 *  usuario_rol directamente, RLS doc 02). Evita asignar por error a un Responsable de Módulo. */
export async function optGuardiasDisponibles(): Promise<Opcion[]> {
  const { data } = await (supabase as any).rpc('guardias_disponibles')
  return ((data as any[]) ?? []).map((r) => ({ value: r.id_usuario, label: r.correo_electronico }))
}
