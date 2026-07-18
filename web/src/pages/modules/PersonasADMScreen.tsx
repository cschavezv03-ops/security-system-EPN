import { useState } from 'react'
import { UserCheck, UserCog } from 'lucide-react'
import { ResourceScreen } from '../../components/ResourceScreen'
import { cfgPersonaADM } from '../../resources/configs-lectura'
import { cx } from '../../components/ui'

const AMBITOS = [
  { key: 'INTERNA' as const, titulo: 'Personal interno', icono: UserCog, ayuda: 'Docentes, estudiantes, administrativos y trabajadores de la Politécnica.' },
  { key: 'EXTERNA' as const, titulo: 'Personal externo', icono: UserCheck, ayuda: 'Visitantes, proveedores, contratistas y conductores.' },
]

/**
 * Personal interno y externo (feedback ADM).
 *
 * Antes era una sola tabla con una columna "Tipo" que mezclaba a los 20 registros: para
 * saber quién era externo había que leer fila por fila. Ahora son dos tablas separadas,
 * cada una con su propia búsqueda, sus propios filtros y su propio panel de detalle.
 *
 * Se montan dos `ResourceScreen` en lugar de escribir una pantalla nueva: el motor de
 * listado ya resuelve búsqueda, filtros, edición y baja, y `filtroFijo` es justo el
 * mecanismo previsto para acotar por ámbito. En pantallas estrechas se muestran como
 * pestañas — dos tablas largas una debajo de otra no se pueden comparar en un móvil.
 */
export function PersonasADMScreen() {
  const [activa, setActiva] = useState<'INTERNA' | 'EXTERNA'>('INTERNA')

  return (
    <div>
      {/* Pestañas: solo en pantallas estrechas. En escritorio se ven las dos tablas. */}
      <div className="mb-4 flex gap-2 lg:hidden" role="tablist" aria-label="Ámbito del personal">
        {AMBITOS.map((a) => (
          <button
            key={a.key}
            type="button"
            role="tab"
            aria-selected={activa === a.key}
            onClick={() => setActiva(a.key)}
            className={cx(
              'rounded-lg px-3 py-1.5 text-sm font-medium',
              activa === a.key ? 'bg-navy text-white' : 'bg-slate-100 text-ink-soft hover:bg-slate-200',
            )}
          >
            {a.titulo}
          </button>
        ))}
      </div>

      <div className="space-y-8">
        {AMBITOS.map((a) => {
          const Icono = a.icono
          return (
            <section
              key={a.key}
              aria-label={a.titulo}
              className={cx(activa === a.key ? 'block' : 'hidden', 'lg:block')}
            >
              <div className="mb-2">
                <h2 className="flex items-center gap-2 text-base font-semibold text-navy">
                  <Icono className="h-5 w-5" /> {a.titulo}
                </h2>
                <p className="mt-0.5 text-sm text-ink-soft">{a.ayuda}</p>
              </div>
              <ResourceScreen config={cfgPersonaADM(a.key)} />
            </section>
          )
        })}
      </div>
    </div>
  )
}
