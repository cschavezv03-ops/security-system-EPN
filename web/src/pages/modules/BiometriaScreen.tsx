import { useEffect, useRef, useState } from 'react'
import { Fingerprint, ScanFace } from 'lucide-react'
import { supabase, mensajeError } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthProvider'
import { CameraPanel, type CameraHandle } from '../../components/Camera'
import { Badge, Button, Card, CenterSpinner, EmptyState, ErrorBanner, Field, Select, useToast } from '../../components/ui'

const BUCKET = 'registro-biometrico'

interface PersonaInterna {
  id_persona: string
  nombres: string
  apellidos: string
  cedula: string
  registro_biometrico: { id_registro: string; vigente: boolean }[]
}

/**
 * Enrolamiento biométrico de personal INTERNO (§D20). Solo GPI.
 * Descriptor 128-d en el navegador → Storage (foto) + RPC enrolar_biometria (descriptor).
 * Los externos NUNCA aparecen aquí.
 */
export function BiometriaScreen() {
  const { tiene } = useAuth()
  const toast = useToast()
  const puedeLeer = tiene('GPI_BIOMETRIA_SELECT')
  const puedeEnrolar = tiene('GPI_BIOMETRIA_INSERT')

  const [personas, setPersonas] = useState<PersonaInterna[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState('')
  const [enrolando, setEnrolando] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const camRef = useRef<CameraHandle>(null)

  const cargar = async () => {
    setCargando(true)
    const { data, error } = await supabase
      .from('persona')
      .select('id_persona, nombres, apellidos, cedula, registro_biometrico(id_registro, vigente)')
      .eq('tipo_persona', 'INTERNA')
      .order('apellidos')
    if (error) setError(mensajeError(error))
    setPersonas((data as PersonaInterna[] | null) ?? [])
    setCargando(false)
  }

  useEffect(() => {
    if (puedeLeer) cargar()
    else setCargando(false)
  }, [puedeLeer])

  /** Sube el JPEG y confirma que el objeto realmente aterrizó en Storage antes de continuar
   *  (bug real detectado: la subida a veces "resuelve OK" sin dejar el archivo, dejando un
   *  registro_biometrico huérfano sin foto). Reintenta una vez si la verificación falla. */
  const subirYVerificar = async (path: string, jpeg: Blob): Promise<void> => {
    const carpeta = sel
    const archivo = path.slice(carpeta.length + 1)
    for (let intento = 1; intento <= 2; intento++) {
      const up = await supabase.storage.from(BUCKET).upload(path, jpeg, { contentType: 'image/jpeg', upsert: true })
      if (up.error) throw new Error('Storage: ' + up.error.message)
      const { data: listado, error: listError } = await supabase.storage.from(BUCKET).list(carpeta, { search: archivo })
      if (!listError && listado?.some((f) => f.name === archivo)) return
      if (intento === 2) throw new Error('La foto no se confirmó en Storage tras 2 intentos. Vuelve a intentar el enrolamiento.')
    }
  }

  const enrolar = async () => {
    if (!sel) {
      setError('Selecciona una persona interna.')
      return
    }
    setError(null)
    setEnrolando(true)
    try {
      const descriptor = await camRef.current!.descriptor()
      const jpeg = await camRef.current!.jpeg()
      if (jpeg.size < 2000) throw new Error('La foto capturada parece inválida (muy pequeña). Verifica que el rostro esté bien iluminado e inténtalo de nuevo.')
      const path = `${sel}/${Date.now()}.jpg`
      await subirYVerificar(path, jpeg)
      const { error } = await supabase.rpc('enrolar_biometria', {
        p_id_persona: sel,
        p_descriptor: descriptor,
        p_path_storage: `${BUCKET}/${path}`,
      })
      if (error) throw new Error(error.message)
      setPreviewUrl(URL.createObjectURL(jpeg))
      toast('ok', 'Biometría enrolada correctamente: foto confirmada en Storage.')
      setSel('')
      await cargar()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setEnrolando(false)
    }
  }

  if (!puedeLeer) {
    return <EmptyState title="No tienes acceso a biometría" hint="Pide acceso al administrador del sistema." />
  }

  const enroladas = personas.filter((p) => p.registro_biometrico?.some((b) => b.vigente))
  const sinEnrolar = personas.filter((p) => !p.registro_biometrico?.some((b) => b.vigente))

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <ErrorBanner message={error} />
        <Card className="mt-2 overflow-hidden">
          {cargando ? (
            <CenterSpinner label="Cargando personal interno..." />
          ) : personas.length === 0 ? (
            <EmptyState title="No hay personal interno registrado" hint="Registra personas en la sección Personal interno." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase text-ink-soft">
                    <th className="px-4 py-2.5">Cédula</th>
                    <th className="px-4 py-2.5">Persona</th>
                    <th className="px-4 py-2.5">Biometría</th>
                  </tr>
                </thead>
                <tbody>
                  {personas.map((p) => (
                    <tr key={p.id_persona} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5">{p.cedula}</td>
                      <td className="px-4 py-2.5 text-navy">{p.apellidos} {p.nombres}</td>
                      <td className="px-4 py-2.5">
                        {p.registro_biometrico?.some((b) => b.vigente)
                          ? <Badge value="ACTIVA" />
                          : <span className="text-xs text-slate-400">Sin enrolar</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <p className="mt-2 text-xs text-slate-400">
          {enroladas.length} enrolada(s) · {sinEnrolar.length} sin enrolar
        </p>
      </div>

      <Card className="h-fit p-5">
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-navy">
          <ScanFace className="h-5 w-5 text-navy" /> Enrolar rostro
        </h3>
        <p className="mb-4 text-xs text-ink-soft">
          Solo personal interno. El descriptor se calcula en el navegador; la comparación ocurre en el backend (pgvector).
        </p>
        {!puedeEnrolar ? (
          <EmptyState title="No puedes registrar rostros" hint="Puedes consultar los registros, pero no añadir ninguno. Pide acceso al administrador del sistema." />
        ) : (
          <div className="space-y-3">
            <Field label="Persona interna" required>
              <Select
                value={sel}
                onChange={(e) => setSel(e.target.value)}
                placeholder="— Seleccionar —"
                options={personas.map((p) => ({ value: p.id_persona, label: `${p.apellidos} ${p.nombres} · ${p.cedula}` }))}
              />
            </Field>
            <CameraPanel ref={camRef} />
            <Button onClick={enrolar} loading={enrolando} className="w-full">
              <Fingerprint className="h-4 w-4" /> Capturar y enrolar
            </Button>
            {previewUrl && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-center">
                <img src={previewUrl} alt="Última foto enrolada" className="mx-auto h-24 rounded object-cover" />
                <p className="mt-1 text-[11px] text-emerald-700">Foto confirmada en Storage.</p>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
