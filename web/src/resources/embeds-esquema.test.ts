import { describe, expect, it } from 'vitest'
// Import `?raw` de Vite: trae el fichero como string sin depender de node:fs (el front
// no incluye @types/node, y así el typecheck del build sigue limpio).
import tiposSrc from '../lib/database.types.ts?raw'

/**
 * Integridad de los `select` del frontend contra el esquema real de la base.
 *
 * Lo destapó la batería de integración (INT-11): la pantalla de "Errores de reconocimiento"
 * pedía `dispositivo:dispositivo(nombre_dispositivo)`, una columna que no existe. PostgREST
 * responde 400 y la pantalla ENTERA se queda vacía con un banner genérico — el mismo síntoma
 * que un dato que falta o una fila bloqueada por RLS, así que es de los errores más difíciles
 * de localizar mirando la interfaz.
 *
 * En vez de proteger solo esa pantalla, esta prueba recorre TODOS los `select` de todas las
 * configs y comprueba, columna por columna y relación por relación, que existen en el esquema.
 * La fuente de la verdad es `database.types.ts`, que se regenera desde la base (`supabase gen
 * types`), así que la prueba envejece con el esquema sin mantenimiento manual.
 */

// --- Esquema: {tabla|vista -> Set<columnas>} leído de los bloques Row de los tipos ----------
function parsearEsquema(src: string): Record<string, Set<string>> {
  const esquema: Record<string, Set<string>> = {}
  // Cada entidad: `nombre: {` seguido en algún punto de `Row: { ... }`.
  const re = /(\w+): \{\s*\n\s*Row: \{([\s\S]*?)\n\s*\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const [, tabla, cuerpo] = m
    const cols = new Set<string>()
    for (const linea of cuerpo.split('\n')) {
      const c = linea.match(/^\s*(\w+):/)
      if (c) cols.add(c[1])
    }
    if (cols.size) esquema[tabla] = cols
  }
  return esquema
}

// --- FK: {tabla -> {columna|foreignKeyName -> tabla referenciada}} --------------------------
// Sirve para resolver embeds por columna FK (`padre:id_zona_padre(...)`) y por hint de FK
// (`usuario_sistema!sesion_id_usuario_fkey`).
function parsearRelaciones(src: string): { porColumna: Record<string, string>; porFk: Record<string, string> } {
  const porColumna: Record<string, string> = {}
  const porFk: Record<string, string> = {}
  const re = /foreignKeyName: "(\w+)"\s*\n\s*columns: \["(\w+)"\]\s*\n\s*isOneToOne: \w+\s*\n\s*referencedRelation: "(\w+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const [, fk, col, ref] = m
    // La primera relación de cada columna gana (evita las vistas que comparten FK).
    if (!(col in porColumna)) porColumna[col] = ref
    if (!(fk in porFk)) porFk[fk] = ref
  }
  return { porColumna, porFk }
}

const ESQUEMA = parsearEsquema(tiposSrc)
const { porColumna: FK_COL, porFk: FK_HINT } = parsearRelaciones(tiposSrc)

/** Resuelve el nombre real de tabla de un token de embed `alias:tabla!hint`. */
function tablaDeToken(token: string, contexto: string): string {
  let nombre = token.includes(':') ? token.split(':').slice(1).join(':') : token
  let hint: string | undefined
  if (nombre.includes('!')) {
    ;[nombre, hint] = nombre.split('!')
  }
  nombre = nombre.trim()
  if (ESQUEMA[nombre]) return nombre // es un nombre de tabla directo
  if (hint && FK_HINT[hint]) return FK_HINT[hint]
  if (FK_COL[nombre]) return FK_COL[nombre] // embed por columna FK
  return nombre // desconocido: se reportará
}

/** Parsea un `select` de PostgREST y devuelve los problemas encontrados. */
function validarSelect(select: string, tablaBase: string): string[] {
  const problemas: string[] = []
  let i = 0
  const n = select.length

  function parsear(ctx: string) {
    while (i < n) {
      const resto = select.slice(i)
      const m = resto.match(/^\s*([^,()]*?)\s*(\(|,|\)|$)/)
      if (!m) { i++; continue }
      const token = m[1].trim()
      const sep = m[2]
      i += m[0].length
      if (sep === '(') {
        const t2 = tablaDeToken(token, ctx)
        if (!ESQUEMA[t2]) {
          problemas.push(`relación desconocida «${token}» (resuelta a «${t2}»)`)
          parsear(ctx)
        } else {
          parsear(t2)
        }
        continue
      }
      if (token && token !== '*') comprobarCol(token, ctx)
      if (sep === ')') return
      if (sep === '') return
    }
  }
  function comprobarCol(col: string, tabla: string) {
    if (!col || col === '*' || !ESQUEMA[tabla]) return
    if (!ESQUEMA[tabla].has(col)) problemas.push(`columna «${col}» no existe en «${tabla}»`)
  }
  parsear(tablaBase)
  return problemas
}

/** Extrae {tabla, select} de un valor exportado, sea objeto config o factoría `cfgX()`. */
function comoConfig(valor: unknown): { tabla?: string; select?: string } | null {
  if (typeof valor === 'function') {
    if (valor.length !== 0) return null // factorías con argumentos: no se pueden invocar a ciegas
    try {
      return comoConfig((valor as () => unknown)())
    } catch {
      return null
    }
  }
  if (valor && typeof valor === 'object' && 'tabla' in valor) {
    return valor as { tabla?: string; select?: string }
  }
  return null
}

// Descubre TODAS las configs de ambos módulos (las que empiezan por `cfg`) y se queda con
// las que tienen `select`. Así una config nueva entra en la prueba sin tocar este archivo.
async function casos(): Promise<{ origen: string; tabla: string; select: string }[]> {
  const modulos = { configs: await import('./configs'), lectura: await import('./configs-lectura') }
  const salida: { origen: string; tabla: string; select: string }[] = []
  for (const [nombreMod, mod] of Object.entries(modulos)) {
    for (const [nombre, valor] of Object.entries(mod)) {
      if (!nombre.startsWith('cfg')) continue
      const cfg = comoConfig(valor)
      if (cfg?.tabla && cfg.select) salida.push({ origen: `${nombreMod}.${nombre}`, tabla: cfg.tabla, select: cfg.select })
    }
  }
  return salida
}

describe('integridad de los select del frontend contra el esquema (INT-11)', () => {
  it('el esquema y las relaciones se leyeron de database.types.ts', () => {
    // Guarda de cordura: si el parseo se rompe, el resto daría falsos OK.
    expect(Object.keys(ESQUEMA).length).toBeGreaterThan(20)
    expect(ESQUEMA['dispositivo']?.has('codigo_mac')).toBe(true)
    expect(ESQUEMA['dispositivo']?.has('nombre_dispositivo')).toBe(false)
    expect(FK_COL['id_zona_padre']).toBe('zona')
  })

  it('la pantalla de errores de reconocimiento ya no pide una columna inexistente', async () => {
    const lectura = await import('./configs-lectura')
    const problemas = validarSelect(lectura.cfgErrorReconocimiento().select!, 'error_reconocimiento')
    expect(problemas).toEqual([])
  })

  it('ninguna config referencia columnas o relaciones que no existen en la base', async () => {
    const todos = await casos()
    // Positiva antes que negativa: confirma que de verdad se recogieron selects.
    expect(todos.length).toBeGreaterThan(5)
    const fallos: string[] = []
    for (const c of todos) {
      for (const p of validarSelect(c.select, c.tabla)) fallos.push(`${c.origen}: ${p}`)
    }
    expect(fallos).toEqual([])
  })

  it('el validador detecta de verdad una columna inexistente (no es un falso OK)', () => {
    const roto = validarSelect('*, dispositivo:dispositivo(nombre_dispositivo)', 'error_reconocimiento')
    expect(roto.length).toBeGreaterThan(0)
    expect(roto[0]).toMatch(/nombre_dispositivo/)
  })
})
