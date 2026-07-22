import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Car, RotateCcw } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { CAT, humanizar } from '../lib/catalogos'
import { hoyISO } from '../lib/format'
import { normalizarPlaca, validarPlacaTipo } from '../lib/validacion'
import { useBorrador } from '../lib/useBorrador'
import { Breadcrumb } from '../components/layout/Shell'
import { BuscarPersonaPorCedula, type PersonaCedula } from '../components/BuscarPersonaPorCedula'
import { Button, Card, EmptyState, ErrorBanner, Field, Input, Select, useToast } from '../components/ui'

const TIPOS_SIN_PLACA = ['BICICLETA', 'OTRO']

interface FormVehiculo {
  tipo_vehiculo: string
  placa: string
  motivo_sin_placa: string
  marca: string
  modelo: string
  color: string
  tipo_relacion: string
  fecha_inicio: string
  fecha_fin: string
}

const FORM_INICIAL: FormVehiculo = {
  tipo_vehiculo: 'AUTOMOVIL',
  placa: '',
  motivo_sin_placa: '',
  marca: '',
  modelo: '',
  color: '',
  tipo_relacion: 'PROPIETARIO',
  fecha_inicio: hoyISO(),
  fecha_fin: '',
}

/**
 * Registro unificado de vehículo + propietario (req 35): una sola pantalla y una
 * sola transacción (RPC crear_vehiculo_con_propietario). Busca a la persona por
 * cédula (sin combo masivo), valida la placa según el tipo y respeta el máximo de
 * dos vehículos activos (lo impone el backend). Conserva un borrador del formulario.
 */
export function VehiculoPropietarioPage() {
  const { perfil, tiene } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  // Desde qué módulo se llegó (lo pone `altaRuta` de la pantalla de vehículos). Si falta —por
  // ejemplo si alguien teclea la URL— se deduce del permiso que sí tiene el usuario, y solo se
  // trabaja sin restricción cuando de verdad es ADM.
  const moduloParam = params.get('modulo')
  const modulo: 'ADM' | 'GPI' | 'GPE' =
    moduloParam === 'GPI' || moduloParam === 'GPE' || moduloParam === 'ADM' ? moduloParam
    : tiene('ADM_VEHICULO_INSERT') ? 'ADM'
    : tiene('GPI_VEHICULO_INSERT') ? 'GPI'
    : 'GPE'
  // GPI registra vehículos de docentes, estudiantes y empleados; GPE, de visitantes,
  // proveedores y contratistas. La base lo exige igualmente (trigger
  // validar_ambito_persona_vehiculo): esto es solo para no dejar que el usuario llegue hasta
  // el final del formulario para descubrirlo.
  const soloTipo = modulo === 'GPI' ? 'INTERNA' : modulo === 'GPE' ? 'EXTERNA' : undefined

  const puede =
    tiene(`${modulo}_VEHICULO_INSERT`) ||
    tiene('ADM_VEHICULO_INSERT') || tiene('GPI_VEHICULO_INSERT') || tiene('GPE_VEHICULO_INSERT')

  const [persona, setPersona] = useState<PersonaCedula | null>(null)
  const [form, setForm] = useState<FormVehiculo>(FORM_INICIAL)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const claveBorrador = perfil ? `${perfil.id_usuario}:ADM:vehiculo:nuevo` : null
  const { hayBorrador, conflicto, restaurar, descartar } = useBorrador(claveBorrador, form, { activo: puede })
  const [ofreceBorrador, setOfreceBorrador] = useState(hayBorrador)

  const set = <K extends keyof FormVehiculo>(k: K, v: FormVehiculo[K]) => setForm((f) => ({ ...f, [k]: v }))

  const sinPlaca = TIPOS_SIN_PLACA.includes(form.tipo_vehiculo)
  const placaNormalizada = normalizarPlaca(form.placa)
  const errorPlaca = form.placa ? validarPlacaTipo(form.tipo_vehiculo)(form.placa) : null

  if (!puede) {
    return (
      <div>
        <Breadcrumb items={[{ label: 'Panel Principal', to: '/' }, { label: 'Registrar vehículo' }]} />
        <EmptyState title="No tiene permiso para registrar vehículos" hint="Pide acceso al administrador del sistema." />
      </div>
    )
  }

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!persona) { setError('Busque y seleccione a la persona propietaria por su cédula.'); return }
    if (!sinPlaca && !placaNormalizada) { setError('Ingrese la placa del vehículo.'); return }
    if (!sinPlaca && errorPlaca) { setError(errorPlaca); return }
    if (sinPlaca && !placaNormalizada && !form.motivo_sin_placa.trim()) {
      setError('Indique el motivo por el que el vehículo no tiene placa.'); return
    }
    if (!form.fecha_inicio) { setError('Ingrese la fecha de inicio de la relación.'); return }
    if (!form.fecha_fin) { setError('Ingrese la fecha de fin de la relación.'); return }
    if (form.fecha_fin < form.fecha_inicio) {
      setError('La fecha de fin no puede ser anterior a la fecha de inicio.'); return
    }

    setGuardando(true)
    // Operación ATÓMICA en el backend: crea vehículo y relación, o ninguno (req 35).
    // Los campos opcionales se OMITEN (no se envía cadena vacía ni null explícito):
    // la RPC aplica su DEFAULT null. Coherente con el req 19.
    const { error: err } = await supabase.rpc('crear_vehiculo_con_propietario', {
      p_tipo_vehiculo: form.tipo_vehiculo,
      p_id_persona: persona.id_persona,
      p_placa: placaNormalizada || undefined,
      p_marca: form.marca.trim() || undefined,
      p_modelo: form.modelo.trim() || undefined,
      p_color: form.color.trim() || undefined,
      p_tipo_relacion: form.tipo_relacion,
      // Son días de vigencia, no instantes locales: se guardan a medianoche UTC (§D81).
      p_fecha_inicio: `${form.fecha_inicio}T00:00:00.000Z`,
      p_fecha_fin: `${form.fecha_fin}T00:00:00.000Z`,
      p_motivo_sin_placa: sinPlaca && !placaNormalizada ? form.motivo_sin_placa.trim() : undefined,
    })
    setGuardando(false)
    if (err) { setError(mensajeError(err)); return }

    descartar()
    toast('ok', `Vehículo registrado y asociado a ${persona.nombres} ${persona.apellidos}.`)
    navigate('/')
  }

  return (
    <div>
      <Breadcrumb items={[{ label: 'Panel Principal', to: '/' }, { label: 'Registrar vehículo' }]} />
      <h1 className="mb-1 flex items-center gap-2 text-xl font-bold text-navy"><Car className="h-6 w-6" /> Registrar vehículo y propietario</h1>
      {soloTipo && (
        <p className="mb-3 text-sm text-ink-soft">
          {soloTipo === 'INTERNA'
            ? 'Vehículos del personal interno: docentes, estudiantes, administrativos y trabajadores.'
            : 'Vehículos del personal externo: visitantes, proveedores y contratistas.'}
        </p>
      )}

      {ofreceBorrador && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span className="flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Hay un borrador sin guardar de este formulario.</span>
          <span className="flex gap-2">
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => { const b = restaurar(); if (b) setForm((f) => ({ ...f, ...b })); setOfreceBorrador(false) }}>Restaurar</Button>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => { descartar(); setOfreceBorrador(false) }}>Descartar</Button>
          </span>
        </div>
      )}
      {conflicto && (
        <div className="mb-4 rounded-md border border-red/30 bg-red-50 px-3 py-2 text-sm text-red">
          Este formulario se está editando en otra pestaña. Los últimos cambios podrían sobrescribirse.
        </div>
      )}

      <form onSubmit={guardar} className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h3 className="text-base font-semibold text-navy">1. Propietario</h3>
          <BuscarPersonaPorCedula
            onSelect={setPersona}
            soloActivas
            soloTipo={soloTipo}
            label={
              soloTipo === 'INTERNA' ? 'Cédula del propietario (personal interno)'
              : soloTipo === 'EXTERNA' ? 'Cédula del propietario (personal externo)'
              : 'Cédula del propietario'
            }
            autoFocus
          />
        </Card>

        <Card className="space-y-4 p-5">
          <h3 className="text-base font-semibold text-navy">2. Vehículo</h3>
          <Field label="Tipo de vehículo" htmlFor="vehiculo-tipo" required>
            <Select
              id="vehiculo-tipo"
              value={form.tipo_vehiculo}
              onChange={(e) => set('tipo_vehiculo', e.target.value)}
              options={CAT.vehiculo_tipo.map((t) => ({ value: t, label: humanizar(t) }))}
            />
          </Field>

          <Field
            label={sinPlaca ? 'Placa (opcional)' : 'Placa'}
            htmlFor="vehiculo-placa"
            required={!sinPlaca}
            error={errorPlaca}
            ayuda="Automóvil/camioneta: 3 letras + 3 o 4 dígitos (ABC-1234). Motocicleta: también AB-123C. Bicicleta u otros pueden no tener placa."
          >
            <Input
              id="vehiculo-placa"
              value={form.placa}
              onChange={(e) => set('placa', e.target.value.toUpperCase())}
              placeholder={sinPlaca ? 'Sin placa' : 'ABC-1234'}
            />
          </Field>

          {sinPlaca && !placaNormalizada && (
            <Field label="Motivo sin placa" htmlFor="vehiculo-motivo-sin-placa" required hint="Por qué este vehículo no tiene placa (p. ej. bicicleta).">
              <Input id="vehiculo-motivo-sin-placa" value={form.motivo_sin_placa} onChange={(e) => set('motivo_sin_placa', e.target.value)} />
            </Field>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Field label="Marca (opcional)" htmlFor="vehiculo-marca"><Input id="vehiculo-marca" value={form.marca} onChange={(e) => set('marca', e.target.value)} /></Field>
            <Field label="Modelo (opcional)" htmlFor="vehiculo-modelo"><Input id="vehiculo-modelo" value={form.modelo} onChange={(e) => set('modelo', e.target.value)} /></Field>
            <Field label="Color (opcional)" htmlFor="vehiculo-color"><Input id="vehiculo-color" value={form.color} onChange={(e) => set('color', e.target.value)} /></Field>
          </div>
        </Card>

        <Card className="space-y-4 p-5 lg:col-span-2">
          <h3 className="text-base font-semibold text-navy">3. Relación</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Tipo de relación" htmlFor="vehiculo-tipo-relacion" required>
              <Select
                id="vehiculo-tipo-relacion"
                value={form.tipo_relacion}
                onChange={(e) => set('tipo_relacion', e.target.value)}
                options={CAT.persona_vehiculo_tipo.map((t) => ({ value: t, label: humanizar(t) }))}
              />
            </Field>
            <Field label="Fecha de inicio" htmlFor="vehiculo-fecha-inicio" required>
              <Input id="vehiculo-fecha-inicio" type="date" value={form.fecha_inicio} onChange={(e) => set('fecha_inicio', e.target.value)} max={hoyISO()} />
            </Field>
            <Field label="Fecha de fin" htmlFor="vehiculo-fecha-fin" required hint="Debe ser posterior a la fecha de inicio.">
              <Input id="vehiculo-fecha-fin" type="date" value={form.fecha_fin} onChange={(e) => set('fecha_fin', e.target.value)} min={form.fecha_inicio || undefined} />
            </Field>
          </div>
          <ErrorBanner message={error} />
          <div className="flex gap-2">
            <Button type="submit" loading={guardando}>Registrar vehículo y asociar</Button>
            <Button type="button" variant="secondary" onClick={() => { descartar(); navigate('/') }}>Cancelar</Button>
          </div>
        </Card>
      </form>
    </div>
  )
}
