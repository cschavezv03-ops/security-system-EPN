import { useEffect, useState } from 'react'
import { IdCard, Search, X } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { validarCedula } from '../lib/validacion'
import { humanizar } from '../lib/catalogos'
import { Badge, Button, Field, Input, cx } from './ui'

export interface PersonaCedula {
  id_persona: string
  cedula: string
  /** Se pide para poder proponerlo como correo de acceso al crear la cuenta: sin él, el
   *  alta obligaba a teclearlo a mano y ahí se colaban erratas que dejaban la cuenta con
   *  un correo distinto al de la persona. */
  correo: string | null
  nombres: string
  apellidos: string
  tipo_persona: string
  estado: string
  categoria?: { codigo_categoria: string } | null
}

/**
 * Búsqueda de persona por cédula, reutilizable (req 37). Reemplaza los combos que
 * cargaban TODAS las personas. Valida la cédula antes de consultar, hace una
 * coincidencia EXACTA (no lista parcial), respeta RLS/permisos y pide solo los
 * campos necesarios. Todos los estados están en español.
 */
export function BuscarPersonaPorCedula({
  onSelect,
  label = 'Cédula de la persona',
  soloActivas = false,
  validar = true,
  autoFocus = false,
  id = 'buscar-persona-cedula',
  soloTipo,
  onNoEncontrada,
  personaInicial = null,
  disabled = false,
  embebido = false,
}: {
  onSelect: (persona: PersonaCedula | null) => void
  /** Se avisa con la cédula ya validada cuando no existe esa persona, para que quien use el
   *  buscador pueda ofrecer darla de alta ahí mismo en vez de mandar al usuario a otra pantalla. */
  onNoEncontrada?: (cedula: string) => void
  label?: string
  /** Si true, una persona no ACTIVA no puede seleccionarse. */
  soloActivas?: boolean
  /** Valida el formato de cédula ecuatoriana antes de buscar. */
  validar?: boolean
  autoFocus?: boolean
  /** Identificador del campo, para asociarlo con su etiqueta. Solo hace falta cambiarlo
   *  si hay dos buscadores en la misma pantalla. */
  id?: string
  /** Restringe el resultado al ámbito del módulo: GPI trabaja con personal interno y GPE con
   *  externo. Sin esto, desde GPI se puede acabar vinculando por error a un visitante. */
  soloTipo?: 'INTERNA' | 'EXTERNA'
  /** Persona que ya tiene el registro al abrir un formulario de edición. */
  personaInicial?: PersonaCedula | null
  disabled?: boolean
  /** Omite el `<Field>` propio cuando el motor de formularios ya aporta etiqueta, ayuda y error. */
  embebido?: boolean
}) {
  const [cedula, setCedula] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [persona, setPersona] = useState<PersonaCedula | null>(null)
  const [noEncontrada, setNoEncontrada] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (personaInicial?.id_persona) setPersona(personaInicial)
  }, [personaInicial?.id_persona])

  const normal = cedula.replace(/\D/g, '')
  const errorFormato = validar ? validarCedula(normal) : null

  const buscar = async () => {
    setError(null)
    setNoEncontrada(false)
    if (!normal) return
    if (errorFormato) {
      setError(errorFormato)
      return
    }
    setBuscando(true)
    const { data, error: err } = await supabase
      .from('persona')
      .select('id_persona, cedula, nombres, apellidos, correo, tipo_persona, estado, categoria:categoria_persona(codigo_categoria)')
      .eq('cedula', normal)
      .maybeSingle()
    setBuscando(false)
    if (err) {
      setError(mensajeError(err))
      return
    }
    if (!data) {
      setNoEncontrada(true)
      onSelect(null)
      onNoEncontrada?.(normal)
      return
    }
    const p = data as unknown as PersonaCedula
    if (soloActivas && p.estado !== 'ACTIVO') {
      setError(`La persona está ${humanizar(p.estado)}: no se puede seleccionar.`)
      onSelect(null)
      return
    }
    if (soloTipo && p.tipo_persona !== soloTipo) {
      const esperado = soloTipo === 'INTERNA' ? 'personal interno' : 'personal externo'
      const encontrado = p.tipo_persona === 'INTERNA' ? 'personal interno' : 'personal externo'
      setError(`Esta sección trabaja con ${esperado}, y esa cédula corresponde a ${encontrado}.`)
      onSelect(null)
      return
    }
    setPersona(p)
    onSelect(p)
  }

  const limpiar = () => {
    setPersona(null)
    setCedula('')
    setNoEncontrada(false)
    setError(null)
    onSelect(null)
  }

  const contenido = persona ? (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 font-semibold text-navy">
              <IdCard className="h-4 w-4" /> {persona.nombres} {persona.apellidos}
            </p>
            <p className="mt-0.5 text-xs text-ink-soft">
              Cédula {persona.cedula} · Categoría: {humanizar(persona.categoria?.codigo_categoria ?? persona.tipo_persona)} ·{' '}
              <Badge value={persona.estado} />
            </p>
          </div>
          {!disabled && (
            <button type="button" onClick={limpiar} className="rounded p-1 text-slate-400 hover:bg-white hover:text-navy" aria-label="Cambiar persona">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
  ) : (
    <>
      <div className="flex gap-2">
        <Input
          id={id}
          inputMode="numeric"
          autoFocus={autoFocus}
          disabled={disabled}
          value={cedula}
          maxLength={10}
          onChange={(e) => {
            setCedula(e.target.value.replace(/\D/g, '').slice(0, 10))
            setNoEncontrada(false)
            setError(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), buscar())}
          placeholder="Número de cédula"
        />
        <Button type="button" onClick={buscar} loading={buscando} disabled={disabled || !normal || (validar && !!errorFormato)}>
          <Search className="h-4 w-4" /> Buscar
        </Button>
      </div>
      {buscando && <p className={cx('mt-2 text-xs text-ink-soft')}>Buscando…</p>}
      {noEncontrada && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          No se encontró una persona con esa cédula.
        </p>
      )}
    </>
  )

  if (embebido) {
    return (
      <div>
        {contenido}
        {!persona && (error ?? (cedula && errorFormato ? errorFormato : null)) && (
          <p className="mt-1 text-xs text-red">{error ?? errorFormato}</p>
        )}
      </div>
    )
  }

  return (
    <Field
      label={label}
      htmlFor={id}
      error={error ?? (cedula && errorFormato ? errorFormato : null)}
      hint="10 dígitos."
    >
      {contenido}
    </Field>
  )
}
