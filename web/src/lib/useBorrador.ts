import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Persistencia de borrador de formulario (req 32).
 *
 * Guarda el estado del formulario en localStorage con debounce y también al
 * evento `visibilitychange` (cambiar de pestaña, Alt+Tab, minimizar). Al volver
 * a la ruta se puede restaurar; al guardar o cancelar se descarta.
 *
 * NO guarda datos sensibles: como red de seguridad se descartan claves cuyo
 * nombre sugiera contraseña, token o biometría, además de que quien llama debe
 * pasar solo campos no sensibles.
 *
 * La clave debe incluir id_usuario + módulo + entidad + registro para no mezclar
 * borradores de distintos usuarios o formularios (spec §32).
 */
const PREFIJO = 'epn.borrador:'
const SENSIBLE = /(password|contrasena|contraseña|token|secret|descriptor|biometr|jwt)/i

function limpiarSensibles<T extends object>(valor: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    if (SENSIBLE.test(k)) continue
    out[k] = v
  }
  return out as Partial<T>
}

interface BorradorGuardado<T> {
  v: Partial<T>
  t: number
}

export function useBorrador<T extends object>(
  clave: string | null,
  valor: T,
  opciones?: { debounceMs?: number; activo?: boolean },
): {
  hayBorrador: boolean
  conflicto: boolean
  restaurar: () => Partial<T> | null
  descartar: () => void
} {
  const debounceMs = opciones?.debounceMs ?? 800
  const activo = opciones?.activo ?? true
  const storageKey = clave ? PREFIJO + clave : null

  // Existencia de un borrador previo, evaluada una sola vez al montar.
  const [hayBorrador] = useState<boolean>(() => {
    if (!storageKey) return false
    try {
      return window.localStorage.getItem(storageKey) != null
    } catch {
      return false
    }
  })
  const [conflicto, setConflicto] = useState(false)

  const valorRef = useRef(valor)
  valorRef.current = valor
  const escrituraPropia = useRef(0)

  const guardar = useMemo(
    () => () => {
      if (!storageKey || !activo) return
      try {
        const payload: BorradorGuardado<T> = { v: limpiarSensibles(valorRef.current), t: Date.now() }
        escrituraPropia.current = payload.t
        window.localStorage.setItem(storageKey, JSON.stringify(payload))
      } catch {
        /* almacenamiento lleno o no disponible: se ignora */
      }
    },
    [storageKey, activo],
  )

  // Debounce por cambios del formulario.
  useEffect(() => {
    if (!storageKey || !activo) return
    const id = window.setTimeout(guardar, debounceMs)
    return () => window.clearTimeout(id)
  }, [valor, storageKey, activo, debounceMs, guardar])

  // Guardado inmediato al ocultar la pestaña (Alt+Tab, cambio de pestaña).
  useEffect(() => {
    if (!storageKey || !activo) return
    const alOcultar = () => {
      if (document.visibilityState === 'hidden') guardar()
    }
    document.addEventListener('visibilitychange', alOcultar)
    window.addEventListener('pagehide', guardar)
    return () => {
      document.removeEventListener('visibilitychange', alOcultar)
      window.removeEventListener('pagehide', guardar)
    }
  }, [storageKey, activo, guardar])

  // Conflicto: otra pestaña escribió el mismo borrador.
  useEffect(() => {
    if (!storageKey) return
    const alCambiar = (e: StorageEvent) => {
      if (e.key !== storageKey || e.newValue == null) return
      try {
        const otro = JSON.parse(e.newValue) as BorradorGuardado<T>
        if (otro.t !== escrituraPropia.current) setConflicto(true)
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('storage', alCambiar)
    return () => window.removeEventListener('storage', alCambiar)
  }, [storageKey])

  return {
    hayBorrador,
    conflicto,
    restaurar: () => {
      if (!storageKey) return null
      try {
        const raw = window.localStorage.getItem(storageKey)
        if (!raw) return null
        return (JSON.parse(raw) as BorradorGuardado<T>).v
      } catch {
        return null
      }
    },
    descartar: () => {
      if (!storageKey) return
      try {
        window.localStorage.removeItem(storageKey)
      } catch {
        /* ignore */
      }
    },
  }
}
