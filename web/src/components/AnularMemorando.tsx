import { useState } from 'react'
import { FileX } from 'lucide-react'
import { fromTable, mensajeError } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { estadoMemorandoEfectivo } from '../lib/vigencia'
import { fmtFecha } from '../lib/format'
import { Button, ErrorBanner, Field, Modal, Textarea, useToast } from './ui'

/**
 * Retira la autorización de un memorando antes de que venza.
 *
 * GPE §6 pedía resolver el combo "Estado" del formulario de edición, que dejaba cambiar a mano
 * un valor que en realidad depende de las fechas. Ese combo pasó a ser un campo en gris; pero
 * quitarlo sin más habría eliminado el único caso legítimo que cubría: revocar un memorando
 * todavía vigente porque la empresa terminó el contrato o la dependencia retiró el permiso.
 *
 * Eso es una decisión, no un cálculo, así que vive aquí: con confirmación explícita y motivo
 * obligatorio, como el resto de bajas del sistema. La alternativa que se usaba antes —acortar
 * la fecha_fin— falsea las fechas del documento en papel.
 */
export function AnularMemorando({
  memorando, recargar, cerrarPanel,
}: {
  memorando: Record<string, any>
  recargar: () => Promise<void>
  cerrarPanel: () => void
}) {
  const { tiene } = useAuth()
  const toast = useToast()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const estado = estadoMemorandoEfectivo(memorando as any)

  // Un memorando ya vencido o ya anulado no tiene autorización que retirar.
  if (!tiene('GPE_MEMORANDO_UPDATE') || estado === 'ANULADO' || estado === 'VENCIDO') return null

  const confirmar = async () => {
    if (!motivo.trim()) {
      setError('Escribe el motivo de la anulación.')
      return
    }
    setGuardando(true)
    setError(null)
    const { error } = await fromTable('memorando')
      .update({
        estado_memorando: 'ANULADO',
        motivo_anulacion: motivo.trim(),
        fecha_anulacion: new Date().toISOString(),
      })
      .eq('id_memorando', memorando.id_memorando)
    setGuardando(false)
    if (error) {
      setError(mensajeError(error))
      return
    }
    setAbierto(false)
    cerrarPanel()
    await recargar()
    toast('ok', 'Memorando anulado.')
  }

  return (
    <>
      <Button variant="danger" className="flex-1" onClick={() => setAbierto(true)}>
        <FileX className="h-4 w-4" /> Anular memorando
      </Button>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title={`Anular el memorando ${memorando.numero_memorando}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmar} loading={guardando}>Confirmar anulación</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Este memorando autoriza el ingreso hasta el {fmtFecha(memorando.fecha_fin)}. Al
            anularlo, <b>las personas vinculadas dejan de poder entrar de inmediato</b>, salvo
            que tengan otra autorización vigente. El memorando no se elimina: queda registrado
            como anulado, con este motivo.
          </p>
          <Field label="Motivo de la anulación" required>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por ejemplo: la empresa terminó el contrato de mantenimiento el 20/07."
            />
          </Field>
          <ErrorBanner message={error} />
        </div>
      </Modal>
    </>
  )
}
