import { useEffect, useState } from 'react'
import { ClipboardCheck, UserPlus } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { validarCedula } from '../lib/validacion'
import { humanizar } from '../lib/catalogos'
import { hoyISO } from '../lib/format'
import { Button, Card, ErrorBanner, Field, Input, Select, Textarea, useToast } from './ui'
import { BuscarPersonaPorCedula, type PersonaCedula } from './BuscarPersonaPorCedula'

/**
 * Autoriza la visita de hoy de una persona externa, en un solo paso.
 *
 * GPE §13 preguntaba: "El caso de uso de ingresos (visitas sin memorando) en teoría lo hace un
 * guardia, sería necesario que ese caso de uso se presente en el rol de guardia? Y si es así
 * cómo el guardia podría registrar a esta persona externa para darle la autorización?"
 *
 * La respuesta corta es que el guardia ya podía hacer las dos cosas por separado —tiene
 * CAC_PERSONA_EXTERNA_INSERT y CAC_AUTORIZACION_INSERT, y las políticas RLS ya lo
 * contemplaban—, pero no tenía ninguna pantalla donde hacerlas. Lo que faltaba no era permiso,
 * era el flujo. Por eso esto no toca la matriz de permisos.
 *
 * El orden es el de la garita: llega alguien, se le pide la cédula, y solo si no está
 * registrada se piden sus datos. Quien tiene el flujo completo de GPE usa la pantalla de
 * "Ingresos", que además deja programar visitas para otro día; aquí siempre es hoy, porque un
 * guardia autoriza a quien tiene delante.
 */
export function AutorizarVisita({ onListo }: { onListo?: () => void }) {
  const { tiene, session } = useAuth()
  const toast = useToast()

  const [persona, setPersona] = useState<PersonaCedula | null>(null)
  const [cedulaBuscada, setCedulaBuscada] = useState('')
  const [noEncontrada, setNoEncontrada] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [yaAutorizada, setYaAutorizada] = useState(false)
  // `BuscarPersonaPorCedula` guarda por dentro la persona que encontró, así que poner a null la
  // de aquí no le afecta: seguiría enseñando la tarjeta del visitante anterior mientras el
  // formulario ya ha desaparecido. Cambiar la clave lo remonta limpio para el siguiente.
  const [ronda, setRonda] = useState(0)

  const puedeAutorizar = tiene('CAC_AUTORIZACION_INSERT') || tiene('GPE_AUTORIZACION_INSERT')

  // Si la persona ya tiene la visita de hoy registrada, emitir otra fallaría contra el índice
  // único (id_persona, fecha_visita). Mejor decirlo antes de que escriba el motivo.
  useEffect(() => {
    if (!persona) {
      setYaAutorizada(false)
      return
    }
    ;(async () => {
      const { data } = await supabase
        .from('autorizacion_visita_diaria')
        .select('id_autorizacion, estado_autorizacion')
        .eq('id_persona', persona.id_persona)
        .eq('fecha_visita', hoyISO())
        .maybeSingle()
      setYaAutorizada(!!data && (data as any).estado_autorizacion === 'VIGENTE')
    })()
  }, [persona])

  if (!puedeAutorizar) return null

  const autorizar = async () => {
    if (!persona) return
    if (!motivo.trim()) {
      setError('Escribe el motivo de la visita.')
      return
    }
    setGuardando(true)
    setError(null)
    const { error: err } = await supabase.from('autorizacion_visita_diaria').insert({
      id_persona: persona.id_persona,
      fecha_visita: hoyISO(),
      motivo: motivo.trim(),
      estado_autorizacion: 'VIGENTE',
      id_usuario_registro: session!.user.id,
    } as never)
    setGuardando(false)
    if (err) {
      setError(mensajeError(err))
      return
    }
    toast('ok', `${persona.nombres} ${persona.apellidos} queda autorizada a ingresar hoy.`)
    setPersona(null)
    setMotivo('')
    setCedulaBuscada('')
    setNoEncontrada(false)
    setRonda((n) => n + 1)
    onListo?.()
  }

  return (
    <Card className="p-5">
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-navy">
        <ClipboardCheck className="h-5 w-5" /> Autorizar una visita de hoy
      </h3>
      <p className="mb-4 text-xs text-ink-soft">
        Para quien viene sin memorando. La autorización vale solo por hoy.
      </p>

      <BuscarPersonaPorCedula
        key={ronda}
        id="autorizar-visita-cedula"
        label="Cédula del visitante"
        soloTipo="EXTERNA"
        soloActivas
        onSelect={(p) => {
          setPersona(p)
          if (p) setNoEncontrada(false)
          setError(null)
        }}
        // Si no está registrada, se ofrece darla de alta aquí mismo: mandar al guardia a otra
        // pantalla con alguien esperando en la garita no es una opción.
        onNoEncontrada={(c) => {
          setCedulaBuscada(c)
          setNoEncontrada(true)
        }}
      />

      {noEncontrada && !persona && (
        <NuevoVisitanteRapido
          cedula={cedulaBuscada}
          onCreada={(p) => {
            setPersona(p)
            setNoEncontrada(false)
          }}
        />
      )}

      {persona && (
        <div className="mt-4 space-y-3">
          {yaAutorizada ? (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Esta persona ya tiene una autorización vigente para hoy. Puede ingresar sin
              registrar otra.
            </p>
          ) : (
            <>
              <Field label="Motivo de la visita" required htmlFor="autorizar-visita-motivo">
                <Textarea
                  id="autorizar-visita-motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Por ejemplo: entrega de documentos en Secretaría General."
                />
              </Field>
              <ErrorBanner message={error} />
              <Button onClick={autorizar} loading={guardando} disabled={!motivo.trim()}>
                <ClipboardCheck className="h-4 w-4" /> Autorizar el ingreso de hoy
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  )
}

/** Alta mínima de una persona externa: lo imprescindible para poder autorizarla. */
function NuevoVisitanteRapido({
  cedula, onCreada,
}: {
  cedula: string
  onCreada: (p: PersonaCedula) => void
}) {
  const { tiene } = useAuth()
  const [nombres, setNombres] = useState('')
  const [apellidos, setApellidos] = useState('')
  const [idCategoria, setIdCategoria] = useState('')
  const [categorias, setCategorias] = useState<{ value: string; label: string }[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('categoria_persona')
      .select('id_categoria, codigo_categoria')
      .eq('ambito', 'EXTERNA')
      .eq('estado', 'ACTIVO')
      .then(({ data }) => {
        const filas = (data ?? []) as any[]
        setCategorias(filas.map((c) => ({ value: c.id_categoria, label: humanizar(c.codigo_categoria) })))
        // Quien llega sin memorando es, por defecto, un visitante.
        const visitante = filas.find((c) => c.codigo_categoria === 'VISITANTE')
        if (visitante) setIdCategoria(visitante.id_categoria)
      })
  }, [])

  if (!tiene('CAC_PERSONA_EXTERNA_INSERT') && !tiene('GPE_PERSONA_INSERT')) {
    return (
      <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
        Esa cédula no está registrada y no puedes dar de alta personas nuevas. Pide a Personal
        Externo que la registre.
      </p>
    )
  }

  const crear = async () => {
    setError(null)
    const errCedula = validarCedula(cedula)
    if (errCedula) {
      setError(errCedula)
      return
    }
    if (!nombres.trim() || !apellidos.trim() || !idCategoria) {
      setError('Completa nombres, apellidos y categoría.')
      return
    }
    setGuardando(true)
    // Sin correo (req 38): un visitante no tiene por qué dar uno para entrar media hora.
    const { data, error: err } = await supabase
      .from('persona')
      .insert({
        cedula, nombres: nombres.trim(), apellidos: apellidos.trim(),
        tipo_persona: 'EXTERNA', estado: 'ACTIVO', id_categoria: idCategoria,
      } as never)
      .select('id_persona, cedula, nombres, apellidos, tipo_persona, estado')
      .maybeSingle()
    setGuardando(false)
    if (err) {
      setError(mensajeError(err))
      return
    }
    if (data) onCreada(data as unknown as PersonaCedula)
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-dashed border-slate-300 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-navy">
        <UserPlus className="h-4 w-4" /> Visitante nuevo · cédula {cedula}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombres" required htmlFor="visita-nombres">
          <Input id="visita-nombres" value={nombres} onChange={(e) => setNombres(e.target.value)} />
        </Field>
        <Field label="Apellidos" required htmlFor="visita-apellidos">
          <Input id="visita-apellidos" value={apellidos} onChange={(e) => setApellidos(e.target.value)} />
        </Field>
        <Field label="Categoría" required htmlFor="visita-categoria">
          <Select id="visita-categoria" value={idCategoria} onChange={(e) => setIdCategoria(e.target.value)} options={categorias} />
        </Field>
      </div>
      <ErrorBanner message={error} />
      <Button onClick={crear} loading={guardando}>Registrar y continuar</Button>
    </div>
  )
}
