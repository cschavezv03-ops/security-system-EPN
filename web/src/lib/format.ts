/** Formateo de fechas/horas para la UI (locale es-EC). */

export function fmtFecha(v?: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleDateString('es-EC', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/**
 * Formatea una columna que representa un DÍA, no un instante.
 *
 * `fecha_inicio` y `fecha_fin` de una asignación, la vigencia de un memorando o el día de una
 * autorización son `timestamptz` en la base, pero significan "el día 31 de julio", no "las 00:00
 * del 31". Se guardan a medianoche UTC, así que `fmtFecha` —que formatea en la zona del
 * navegador— los retrasa un día para cualquiera que esté en Ecuador: una asignación que termina
 * el 31/07 se leía "30/07".
 *
 * Es el mismo error de medianoche de §D52, §D59 y §D69, esta vez en la presentación. Al leer el
 * valor en UTC se recupera el día que se guardó.
 */
export function fmtFechaDia(v?: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleDateString('es-EC', {
    timeZone: 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
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

/**
 * Hora actual en Ecuador, como "HH:MM" en 24 horas.
 *
 * Espejo de `public.hora_ecuador()`. Mismo motivo que `hoyISO()` (§D52): el navegador puede
 * estar en cualquier zona y el servidor va en UTC, cinco horas por delante. Comparar un turno
 * contra la hora local del equipo daría "fuera de turno" a un guardia que sí está trabajando.
 */
export function horaEcuadorHHMM(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Guayaquil',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

/**
 * ¿Cae `hhmm` dentro del turno? Espejo de `public.esta_en_turno(time, time, time)`.
 *
 * Contempla el turno que cruza medianoche (22:00 → 06:00), donde la salida es "menor" que la
 * entrada y el intervalo son en realidad dos tramos del día.
 */
export function estaEnTurno(inicio?: string | null, fin?: string | null, hhmm = horaEcuadorHHMM()): boolean | null {
  if (!inicio || !fin) return null
  const min = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5))
  const [i, f, m] = [min(inicio), min(fin), min(hhmm)]
  return i < f ? m >= i && m < f : m >= i || m < f
}

/**
 * Duración de un turno en minutos. Espejo de `public.duracion_turno_min(time, time)`.
 *
 * El turno nocturno (22:00 → 06:00) dura 8 horas, no −16: se calcula sobre minutos desde
 * medianoche justamente para no repetir el fallo que tuvo la versión SQL, donde sumar 24 h a un
 * `time` envolvía el valor en vez de pasarlo al día siguiente.
 */
export function duracionTurnoMin(inicio?: string | null, fin?: string | null): number | null {
  if (!inicio || !fin) return null
  const min = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5))
  return (min(fin) - min(inicio) + 1440) % 1440
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
