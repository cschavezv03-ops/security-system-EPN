import { useEffect, useRef, useState } from 'react'
import { Fingerprint, ScanFace, Trash2 } from 'lucide-react'
import { supabase, mensajeError } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthProvider'
import { CameraPanel, type CameraHandle } from '../../components/Camera'
import { BuscarPersonaPorCedula } from '../../components/BuscarPersonaPorCedula'
import { Badge, Button, Card, CenterSpinner, EmptyState, ErrorBanner, Modal, useToast } from '../../components/ui'

const BUCKET = 'registro-biometrico'

interface RegistroBiometrico {
  id_registro: string
  vigente: boolean
  path_storage: string | null
}

interface PersonaInterna {
  id_persona: string
  nombres: string
  apellidos: string
  cedula: string
  registro_biometrico: RegistroBiometrico[]
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
  // Quitar un enrolamiento que salió mal usa el mismo permiso que modificarlo (GPI_BIOMETRIA_UPDATE):
  // desactiva la fila (vigente=false; el matching ya filtra vigente=true) y borra la foto de Storage.
  const puedeBorrar = tiene('GPI_BIOMETRIA_UPDATE')

  const [personas, setPersonas] = useState<PersonaInterna[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState('')
  const [revisionBuscador, setRevisionBuscador] = useState(0)
  const [enrolando, setEnrolando] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [aBorrar, setABorrar] = useState<PersonaInterna | null>(null)
  const [borrando, setBorrando] = useState(false)
  const camRef = useRef<CameraHandle>(null)

  const cargar = async () => {
    setCargando(true)
    const { data, error } = await supabase
      .from('persona')
      .select('id_persona, nombres, apellidos, cedula, registro_biometrico(id_registro, vigente, path_storage)')
      .eq('tipo_persona', 'INTERNA')
      .order('apellidos')
    if (error) setError(mensajeError(error))
    setPersonas((data as PersonaInterna[] | null) ?? [])
    setCargando(false)
  }

  /**
   * Borra el enrolamiento de una persona (rostro capturado mal, borroso, de otra persona…).
   * Primero DESACTIVA la fila —eso corta el acceso, porque el matching solo usa vigente=true—,
   * luego borra la foto de Storage. La fila no se elimina físicamente (principio del proyecto);
   * queda como histórico desactivado. Se puede volver a enrolar después.
   */
  const borrar = async (persona: PersonaInterna) => {
    setBorrando(true)
    setError(null)
    try {
      const vigentes = (persona.registro_biometrico ?? []).filter((b) => b.vigente)
      for (const b of vigentes) {
        const { error } = await supabase.from('registro_biometrico').update({ vigente: false }).eq('id_registro', b.id_registro)
        if (error) throw new Error(error.message)
      }
      // path_storage es '<bucket>/<carpeta>/<archivo>'; Storage.remove espera la ruta SIN el bucket.
      const rutas = vigentes
        .map((b) => b.path_storage)
        .filter((p): p is string => !!p)
        .map((p) => p.replace(`${BUCKET}/`, ''))
      if (rutas.length) {
        const { error } = await supabase.storage.from(BUCKET).remove(rutas)
        if (error) throw new Error('El rostro se retiró, pero la foto no se pudo borrar de Storage: ' + error.message)
      }
      toast('ok', `Enrolamiento de ${persona.apellidos} ${persona.nombres} borrado: rostro retirado y foto eliminada de Storage.`)
      setABorrar(null)
      await cargar()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setBorrando(false)
    }
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
      if (intento === 2) throw new Error('No se pudo guardar la foto. Inténtalo de nuevo.')
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
      setRevisionBuscador((v) => v + 1)
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
                    <th className="px-4 py-2.5 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {personas.map((p) => {
                    const enrolada = p.registro_biometrico?.some((b) => b.vigente)
                    return (
                    <tr key={p.id_persona} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5">{p.cedula}</td>
                      <td className="px-4 py-2.5 text-navy">{p.apellidos} {p.nombres}</td>
                      <td className="px-4 py-2.5">
                        {enrolada
                          ? <Badge value="ACTIVA" />
                          : <span className="text-xs text-slate-400">Sin enrolar</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {enrolada && puedeBorrar && (
                          <button
                            type="button"
                            onClick={() => setABorrar(p)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            aria-label={`Borrar el enrolamiento de ${p.apellidos} ${p.nombres}`}
                          >
                            <Trash2 className="h-4 w-4" /> Borrar
                          </button>
                        )}
                      </td>
                    </tr>
                    )
                  })}
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
            <BuscarPersonaPorCedula
              key={revisionBuscador}
              label="Cédula de la persona interna"
              soloTipo="INTERNA"
              soloActivas
              onSelect={(persona) => setSel(persona?.id_persona ?? '')}
            />
            <CameraPanel ref={camRef} />
            <Button onClick={enrolar} loading={enrolando} className="w-full">
              <Fingerprint className="h-4 w-4" /> Capturar y enrolar
            </Button>
            {previewUrl && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-center">
                <img src={previewUrl} alt="Última foto registrada" className="mx-auto h-24 rounded object-cover" />
                <p className="mt-1 text-[11px] text-emerald-700">Foto guardada correctamente.</p>
              </div>
            )}
          </div>
        )}
      </Card>

      <Modal
        open={!!aBorrar}
        onClose={() => (borrando ? undefined : setABorrar(null))}
        title="Borrar el rostro registrado"
        footer={
          <>
            <Button variant="ghost" onClick={() => setABorrar(null)} disabled={borrando}>Cancelar</Button>
            <Button variant="danger" onClick={() => aBorrar && borrar(aBorrar)} loading={borrando}>
              <Trash2 className="h-4 w-4" /> Borrar enrolamiento
            </Button>
          </>
        }
      >
        <p className="text-sm text-navy">
          Se quitará el rostro de <strong>{aBorrar?.apellidos} {aBorrar?.nombres}</strong> y se borrará su foto de Storage.
          La persona dejará de identificarse por rostro hasta que se la vuelva a enrolar.
        </p>
        <p className="mt-2 text-xs text-ink-soft">Úsalo cuando la captura salió mal (borrosa, mal encuadrada o de otra persona).</p>
      </Modal>
    </div>
  )
}
