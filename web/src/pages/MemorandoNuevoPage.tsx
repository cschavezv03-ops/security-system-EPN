import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Car, FileText, Users } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { CAT, humanizar } from '../lib/catalogos'
import { hoyISO } from '../lib/format'
import { normalizarPlaca, validarNumeroMemorando, validarPlacaTipo } from '../lib/validacion'
import { useBorrador } from '../lib/useBorrador'
import { Breadcrumb } from '../components/layout/Shell'
import { BuscarPersonaPorCedula, type PersonaCedula } from '../components/BuscarPersonaPorCedula'
import { optEmpresas } from '../resources/opciones'
import type { Opcion } from '../resources/types'
import { Button, Card, EmptyState, ErrorBanner, Field, Input, Select, useToast } from '../components/ui'

/** Tipos que pueden circular sin placa. Un memorando vehicular no los contempla: si alguien
 *  entra en bicicleta, entra a pie a efectos de control. */
const TIPOS_CON_PLACA = CAT.vehiculo_tipo.filter((t) => t !== 'BICICLETA' && t !== 'OTRO')

interface FormMemorando {
  numero_memorando: string
  id_empresa: string
  dependencia_autorizada: string
  fecha_inicio: string
  fecha_fin: string
  permite_vehiculo: boolean
  permite_acompanantes: boolean
  tipo_vehiculo: string
  placa: string
  marca: string
  modelo: string
  color: string
}

const FORM_INICIAL: FormMemorando = {
  numero_memorando: '',
  id_empresa: '',
  dependencia_autorizada: '',
  fecha_inicio: hoyISO(),
  fecha_fin: '',
  permite_vehiculo: false,
  permite_acompanantes: false,
  tipo_vehiculo: 'AUTOMOVIL',
  placa: '',
  marca: '',
  modelo: '',
  color: '',
}

/**
 * Alta de memorando, con el vehículo que ampara si lo hay.
 *
 * Por qué una pantalla propia y no el formulario genérico: un memorando con vehículo no es un
 * INSERT en una tabla. Son tres filas —memorando, vehículo y su persona responsable— que tienen
 * que nacer juntas, porque `vehiculo` no admite quedarse sin propietario (RF-CA-018) y porque un
 * memorando a medias es peor que ninguno: el número queda ocupado y el reintento choca contra
 * "ese número ya existe". Todo eso lo resuelve `crear_memorando_con_vehiculo` en una
 * transacción; aquí solo se recogen los datos. Mismo patrón que el alta de vehículo con
 * propietario (`altaRuta`).
 *
 * Las dos preguntas —vehículo y acompañantes— van aquí y no en una pantalla aparte porque son
 * parte de lo que el oficio autoriza, y de ellas depende que la garita deje entrar el coche.
 */
export function MemorandoNuevoPage() {
  const { perfil, tiene } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const puede = tiene('GPE_MEMORANDO_INSERT')

  const [form, setForm] = useState<FormMemorando>(FORM_INICIAL)
  const [responsable, setResponsable] = useState<PersonaCedula | null>(null)
  const [empresas, setEmpresas] = useState<Opcion[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const claveBorrador = perfil ? `${perfil.id_usuario}:GPE:memorando:nuevo` : null
  const { hayBorrador, restaurar, descartar } = useBorrador(claveBorrador, form, { activo: puede })
  const [ofreceBorrador, setOfreceBorrador] = useState(hayBorrador)

  const set = <K extends keyof FormMemorando>(k: K, v: FormMemorando[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    optEmpresas().then(setEmpresas)
  }, [])

  const errorNumero = form.numero_memorando ? validarNumeroMemorando(form.numero_memorando) : null
  const errorPlaca = form.placa ? validarPlacaTipo(form.tipo_vehiculo)(form.placa) : null
  const fechasInvertidas = Boolean(form.fecha_fin && form.fecha_fin < form.fecha_inicio)

  if (!puede) {
    return (
      <div>
        <Breadcrumb items={[{ label: 'Panel Principal', to: '/' }, { label: 'Memorandos' }]} />
        <EmptyState
          title="No puedes registrar memorandos"
          hint="Pide acceso al administrador del sistema."
        />
      </div>
    )
  }

  const guardar = async () => {
    setError(null)

    if (!form.numero_memorando.trim()) { setError('Escribe el número del memorando.'); return }
    if (errorNumero) { setError(errorNumero); return }
    if (!form.id_empresa) { setError('Elige la empresa a la que pertenece el memorando.'); return }
    if (!form.fecha_inicio || !form.fecha_fin) { setError('Indica el inicio y el fin de la vigencia.'); return }
    if (fechasInvertidas) { setError('El fin de vigencia no puede ser anterior al inicio.'); return }

    if (form.permite_vehiculo) {
      if (!responsable) { setError('Busca por cédula a la persona que conducirá el vehículo.'); return }
      if (!form.placa.trim()) { setError('Escribe la placa del vehículo.'); return }
      if (errorPlaca) { setError(errorPlaca); return }
    }

    setGuardando(true)
    const { data, error: err } = await supabase.rpc('crear_memorando_con_vehiculo', {
      p_numero_memorando: form.numero_memorando.trim(),
      p_id_empresa: form.id_empresa,
      p_fecha_inicio: form.fecha_inicio,
      p_fecha_fin: form.fecha_fin,
      p_dependencia_autorizada: form.dependencia_autorizada.trim() || undefined,
      p_permite_vehiculo: form.permite_vehiculo,
      p_permite_acompanantes: form.permite_acompanantes,
      ...(form.permite_vehiculo
        ? {
            p_id_persona_responsable: responsable!.id_persona,
            p_tipo_vehiculo: form.tipo_vehiculo,
            p_placa: normalizarPlaca(form.placa),
            p_marca: form.marca.trim() || undefined,
            p_modelo: form.modelo.trim() || undefined,
            p_color: form.color.trim() || undefined,
          }
        : {}),
    } as never)
    setGuardando(false)

    if (err) { setError(mensajeError(err)); return }

    descartar()
    const conVehiculo = Boolean((data as { vehiculo?: unknown } | null)?.vehiculo)
    toast(
      'ok',
      conVehiculo
        ? `Memorando ${form.numero_memorando.trim()} registrado con su vehículo.`
        : `Memorando ${form.numero_memorando.trim()} registrado.`,
    )
    navigate('/m/GPE/memorandos')
  }

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Panel Principal', to: '/' },
          { label: 'Personal Externo', to: '/m/GPE' },
          { label: 'Memorandos', to: '/m/GPE/memorandos' },
          { label: 'Registrar memorando' },
        ]}
      />

      {ofreceBorrador && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-navy">
          <span>Tienes un memorando sin terminar de la última vez.</span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                const previo = restaurar()
                if (previo) setForm((f) => ({ ...f, ...previo }))
                setOfreceBorrador(false)
              }}
            >
              Recuperarlo
            </Button>
            <Button variant="ghost" onClick={() => { descartar(); setOfreceBorrador(false) }}>
              Empezar de cero
            </Button>
          </div>
        </div>
      )}

      <Card className="p-6">
        <h1 className="mb-1 flex items-center gap-2 text-lg font-bold text-navy">
          <FileText className="h-5 w-5" /> Registrar memorando
        </h1>
        <p className="mb-5 text-sm text-ink-soft">
          El memorando es el documento por el que el personal externo puede entrar al campus.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <Field
              label="Número de memorando"
              htmlFor="memo-numero"
              required
              hint="Cópialo del oficio. No se puede cambiar después."
              error={errorNumero}
            >
              <Input
                id="memo-numero"
                value={form.numero_memorando}
                onChange={(e) => set('numero_memorando', e.target.value)}
                placeholder="EPN-DA-2026-0001-M"
              />
            </Field>
          </div>

          <Field label="Empresa" htmlFor="memo-empresa" required>
            <Select
              id="memo-empresa"
              value={form.id_empresa}
              onChange={(e) => set('id_empresa', e.target.value)}
              placeholder="— Seleccionar —"
              options={empresas}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Dependencia autorizada (opcional)" htmlFor="memo-dependencia">
              <Input
                id="memo-dependencia"
                value={form.dependencia_autorizada}
                onChange={(e) => set('dependencia_autorizada', e.target.value)}
              />
            </Field>
          </div>

          <Field label="Inicio de vigencia" htmlFor="memo-inicio" required>
            <Input
              id="memo-inicio"
              type="date"
              value={form.fecha_inicio}
              onChange={(e) => set('fecha_inicio', e.target.value)}
            />
          </Field>

          <Field
            label="Fin de vigencia"
            htmlFor="memo-fin"
            required
            hint="El último día cuenta: se puede ingresar hasta esa fecha inclusive."
            error={fechasInvertidas ? 'El fin de vigencia no puede ser anterior al inicio.' : null}
          >
            <Input
              id="memo-fin"
              type="date"
              value={form.fecha_fin}
              onChange={(e) => set('fecha_fin', e.target.value)}
            />
          </Field>
        </div>

        {/* ---- Qué autoriza el memorando ---- */}
        <div className="mt-6 border-t border-slate-100 pt-5">
          <h2 className="mb-1 text-sm font-semibold text-navy">¿Cómo va a ingresar?</h2>
          <p className="mb-3 text-xs text-ink-soft">
            El personal externo solo puede entrar en vehículo si su memorando lo autoriza. Sin
            esto, el ingreso es a pie.
          </p>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-navy">
              <input
                id="memo-permite-vehiculo"
                type="checkbox"
                className="h-4 w-4"
                checked={form.permite_vehiculo}
                onChange={(e) => set('permite_vehiculo', e.target.checked)}
              />
              <Car className="h-4 w-4 text-ink-soft" /> Ingresa con vehículo
            </label>
            <label className="flex items-center gap-2 text-sm text-navy">
              <input
                id="memo-permite-acompanantes"
                type="checkbox"
                className="h-4 w-4"
                checked={form.permite_acompanantes}
                onChange={(e) => set('permite_acompanantes', e.target.checked)}
              />
              <Users className="h-4 w-4 text-ink-soft" /> Ingresa con acompañantes
            </label>
          </div>

          {form.permite_acompanantes && (
            <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-ink-soft">
              Cada acompañante se valida por separado en la garita y necesita estar amparado por
              este memorando. Vincúlalos desde "Personas por memorando".
            </p>
          )}
        </div>

        {/* ---- El vehículo, solo si lo hay ---- */}
        {form.permite_vehiculo && (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-navy">
              <Car className="h-4 w-4" /> Vehículo autorizado
            </h2>
            <p className="mb-4 text-xs text-ink-soft">
              La garita comprobará que la placa que lee coincide con esta y que el memorando
              sigue vigente. Quien conduce queda vinculado al memorando automáticamente.
            </p>

            <div className="mb-4">
              <BuscarPersonaPorCedula
                id="memo-responsable"
                label="Cédula de quien conduce"
                soloTipo="EXTERNA"
                soloActivas
                onSelect={setResponsable}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Tipo de vehículo" htmlFor="memo-tipo-vehiculo" required>
                <Select
                  id="memo-tipo-vehiculo"
                  value={form.tipo_vehiculo}
                  onChange={(e) => set('tipo_vehiculo', e.target.value)}
                  options={TIPOS_CON_PLACA.map((v) => ({ value: v, label: humanizar(v) }))}
                />
              </Field>

              <Field
                label="Placa"
                htmlFor="memo-placa"
                required
                hint="3 letras y 3 o 4 dígitos."
                error={errorPlaca}
              >
                <Input
                  id="memo-placa"
                  value={form.placa}
                  onChange={(e) => set('placa', e.target.value.toUpperCase())}
                  placeholder="PDF-1234"
                />
              </Field>

              <Field label="Marca" htmlFor="memo-marca">
                <Input id="memo-marca" value={form.marca} onChange={(e) => set('marca', e.target.value)} />
              </Field>

              <Field label="Modelo" htmlFor="memo-modelo">
                <Input id="memo-modelo" value={form.modelo} onChange={(e) => set('modelo', e.target.value)} />
              </Field>

              <Field label="Color" htmlFor="memo-color">
                <Input id="memo-color" value={form.color} onChange={(e) => set('color', e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        <div className="mt-6"><ErrorBanner message={error} /></div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => navigate('/m/GPE/memorandos')}>
            Volver al panel
          </Button>
          <Button onClick={guardar} loading={guardando}>Registrar memorando</Button>
        </div>
      </Card>
    </div>
  )
}
