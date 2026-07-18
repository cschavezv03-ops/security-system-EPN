import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { supabase, mensajeError, getIdSesionActual } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { Button, useToast } from './ui'

/**
 * Cierra UNA sesión concreta desde la pantalla de Sesiones (req 29).
 *
 * El corte es real: `cerrar_sesion_admin` borra esa fila de `auth.sessions`, así
 * que el usuario pierde el acceso de ese dispositivo sin afectar a los demás.
 */
export function BotonCerrarSesion({
  idSesion,
  estado,
  onCerrada,
}: {
  idSesion: string
  estado: string
  onCerrada: () => Promise<void> | void
}) {
  const { tiene } = useAuth()
  const toast = useToast()
  const [cerrando, setCerrando] = useState(false)

  // Solo tiene sentido sobre sesiones vivas y con permiso de gestión de usuarios.
  if (estado !== 'ACTIVA' || !tiene('ADM_USUARIO_UPDATE')) return null

  const cerrar = async () => {
    setCerrando(true)
    const { error } = await supabase.rpc('cerrar_sesion_admin', { p_id_sesion: idSesion })
    setCerrando(false)
    if (error) {
      toast('error', mensajeError(error))
      return
    }
    // Si el administrador cerró su propia sesión, se sale de inmediato: el token
    // ya no sirve para nada y seguir en pantalla solo daría errores.
    if (idSesion === getIdSesionActual()) {
      await supabase.auth.signOut()
      return
    }

    toast('ok', 'Sesión cerrada.')
    await onCerrada()
  }

  return (
    <Button variant="danger" className="flex-1" loading={cerrando} onClick={cerrar}>
      <LogOut className="h-4 w-4" /> Cerrar sesión
    </Button>
  )
}
