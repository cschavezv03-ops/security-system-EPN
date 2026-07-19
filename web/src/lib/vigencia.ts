/** Estado real de memorandos y autorizaciones de visita.
 *
 *  Espejo de `public.estado_memorando_efectivo` y `public.estado_autorizacion_efectivo`
 *  (migraciones 20260718232455 y 20260718232531). La base es la que manda; esto existe para
 *  que la pantalla no tenga que preguntarle el estado a cada fila.
 *
 *  El problema que resuelven, tal como lo reportó el equipo de GPE: "El memorando realmente ya
 *  no está vigente pero el combo box aparece como vigente". La columna guardada solo recoge
 *  decisiones humanas (anular, revocar); lo que depende del calendario se calcula al mostrarlo.
 *  Una tarea diaria de pg_cron pone al día el valor almacenado, pero entre ejecución y
 *  ejecución la pantalla no debe mentir.
 */

import { hoyISO } from './format'

export type EstadoMemorando = 'VIGENTE' | 'VENCIDO' | 'ANULADO' | 'PROGRAMADO'
export type EstadoAutorizacion = 'VIGENTE' | 'REVOCADA' | 'PROGRAMADA' | 'CADUCADA'

/** `fecha_fin` es inclusiva (§D24): el último día el memorando todavía vale. */
export function estadoMemorandoEfectivo(
  r: { estado_memorando?: string | null; fecha_inicio?: string | null; fecha_fin?: string | null },
  hoy: string = hoyISO(),
): EstadoMemorando {
  if (r.estado_memorando === 'ANULADO') return 'ANULADO'
  if (!r.fecha_inicio || !r.fecha_fin) return (r.estado_memorando as EstadoMemorando) ?? 'VIGENTE'
  if (hoy < r.fecha_inicio) return 'PROGRAMADO'
  if (hoy > r.fecha_fin) return 'VENCIDO'
  return 'VIGENTE'
}

export function estadoAutorizacionEfectivo(
  r: { estado_autorizacion?: string | null; fecha_visita?: string | null },
  hoy: string = hoyISO(),
): EstadoAutorizacion {
  if (r.estado_autorizacion === 'REVOCADA') return 'REVOCADA'
  if (!r.fecha_visita) return (r.estado_autorizacion as EstadoAutorizacion) ?? 'VIGENTE'
  if (r.fecha_visita > hoy) return 'PROGRAMADA'
  if (r.fecha_visita < hoy) return 'CADUCADA'
  return 'VIGENTE'
}

/** ¿Esta vía de acceso permite entrar hoy? Es la pregunta que se hace el guardia. */
export const memorandoPermiteAcceso = (r: Parameters<typeof estadoMemorandoEfectivo>[0]): boolean =>
  estadoMemorandoEfectivo(r) === 'VIGENTE'

export const autorizacionPermiteAcceso = (r: Parameters<typeof estadoAutorizacionEfectivo>[0]): boolean =>
  estadoAutorizacionEfectivo(r) === 'VIGENTE'

/** Días de vigencia de un memorando, ambos extremos incluidos. */
export function diasDeVigencia(fechaInicio: string, fechaFin: string): number {
  return Math.round((+new Date(fechaFin) - +new Date(fechaInicio)) / 86400000) + 1
}

/** "17/07/2026 a las 18:00" — hasta cuándo puede entrar realmente alguien.
 *
 *  GPE §2 pide considerar "la hora que se añade como regla desde CAC": el último día de
 *  vigencia el acceso no llega hasta medianoche, sino hasta que cierra la regla de acceso de su
 *  categoría. `horaCorte` viene de `public.hora_corte_categoria`. */
export function vigenteHastaTexto(fechaFin: string, horaCorte?: string | null): string {
  const [a, m, d] = fechaFin.split('-')
  const fecha = `${d}/${m}/${a}`
  if (!horaCorte) return fecha
  return `${fecha} a las ${horaCorte.slice(0, 5)}`
}
