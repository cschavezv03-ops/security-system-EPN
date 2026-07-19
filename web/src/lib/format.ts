/** Formateo de fechas/horas para la UI (locale es-EC). */

export function fmtFecha(v?: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleDateString('es-EC', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function fmtFechaHora(v?: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleString('es-EC', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

/** Recorta una hora "HH:MM:SS" a "HH:MM". */
export function fmtHora(v?: string | null): string {
  if (!v) return '—'
  return v.slice(0, 5)
}

export function iniciales(nombres?: string | null, apellidos?: string | null): string {
  const a = (nombres || '').trim().charAt(0)
  const b = (apellidos || '').trim().charAt(0)
  return (a + b).toUpperCase() || '?'
}

/** Fecha de hoy en formato YYYY-MM-DD (para inputs date / autorizaciones). */
/**
 * Fecha de hoy **en Ecuador**, como AAAA-MM-DD.
 *
 * Usaba `toISOString()`, que da la fecha en UTC. Como Ecuador va cinco horas por detrás, a
 * partir de las 19:00 hora local devolvía ya el día siguiente, y eso llegaba a decisiones de
 * acceso: una autorización de visita para hoy se mostraba como "Caducada" durante las últimas
 * cinco horas de cada jornada, y el valor por defecto al registrar una visita era mañana.
 *
 * Espejo de `public.hoy_ecuador()`. Se usa el nombre de la zona y no un desplazamiento fijo:
 * Ecuador continental no aplica horario de verano hoy, pero eso puede cambiar.
 */
export function hoyISO(): string {
  // en-CA formatea como AAAA-MM-DD, que es justo lo que espera un <input type="date">.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Autoformatea una MAC mientras se escribe: agrega ":" cada 2 hex y fuerza mayúsculas
 *  (feedback PCO #9). Descarta cualquier caracter no hexadecimal. */
export function formatearMac(v: string): string {
  const hex = v.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12)
  return hex.match(/.{1,2}/g)?.join(':') ?? hex
}

/** Autoformatea una IPv4 mientras se escribe: sugiere el "." al completar un octeto de 3
 *  dígitos, respetando los puntos que el usuario ya tecleó (feedback PCO #9). */
export function formatearIp(v: string): string {
  const limpio = v.replace(/[^0-9.]/g, '')
  const octetos = limpio.split('.').slice(0, 4).map((o) => o.slice(0, 3))
  let out = octetos.join('.')
  const ultimo = octetos[octetos.length - 1]
  if (ultimo?.length === 3 && octetos.length < 4 && !limpio.endsWith('.')) out += '.'
  return out
}
