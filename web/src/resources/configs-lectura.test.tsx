import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

/**
 * Pantalla de Auditoría (Requerimientos_ADM).
 *
 * La lista de verificación del equipo pide comprobar que "Auditoría presente datos
 * legibles del evento, usuario que ejecutó la acción, usuario accedido y salida cuando
 * corresponda". Eso se decide en las funciones `render` de la configuración, así que se
 * las invoca directamente con una fila como la que devuelve la vista `v_auditoria`.
 */

vi.mock('../lib/supabase', () => ({
  supabase: {},
  fromTable: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
  mensajeError: () => 'Error',
}))

const { cfgBitacora, cfgBiometriaADM } = await import('./configs-lectura')

/** Fila de ejemplo: un administrador cierra la sesión de otro usuario. */
const CIERRE_DE_SESION = {
  id_bitacora: 'b-1',
  fecha_hora: '2026-07-18T18:39:06Z',
  modulo: 'ADM',
  accion: 'CIERRE_ADMINISTRATIVO_SESION',
  resultado: 'EXITO',
  entidad_afectada: 'sesion',
  tipo_registro: 'Sesión',
  registro_afectado: 'Sesión de gary.defas',
  ejecutor_usuario: 'admin',
  ejecutor_nombre: 'Administrador del Sistema',
  usuario_accedido: 'gary.defas',
  usuario_accedido_correo: 'gary.defas@epn.edu.ec',
  hora_entrada: '2026-07-18T18:39:05Z',
  hora_salida: '2026-07-18T18:39:06Z',
  motivo_cierre: 'CIERRE_ADMINISTRATIVO',
  descripcion: null,
  ip_origen: '10.0.0.1',
  cambios: [],
}

/** Fila de ejemplo: se bloquea una cuenta. Aquí lo interesante es la columna "Datos". */
const BLOQUEO = {
  ...CIERRE_DE_SESION,
  id_bitacora: 'b-2',
  accion: 'UPDATE',
  entidad_afectada: 'usuario_sistema',
  tipo_registro: 'Usuario del sistema',
  registro_afectado: 'gary.defas',
  hora_entrada: null,
  hora_salida: null,
  motivo_cierre: null,
  cambios: [{ campo: 'estado_usuario', antes: 'ACTIVO', despues: 'BLOQUEADO' }],
}

const columna = (clave: string) => cfgBitacora.columnas.find((c) => c.key === clave)!
const detalle = (etiqueta: string) => cfgBitacora.detalle.find((d) => d.label === etiqueta)!
const pintar = (nodo: ReactNode) => render(<div>{nodo}</div>)

describe('Auditoría', () => {
  it('distingue el usuario que ejecutó del usuario accedido', () => {
    pintar(columna('ejecutor_usuario').render!(CIERRE_DE_SESION))
    expect(screen.getByText('admin')).toBeInTheDocument()

    pintar(columna('usuario_accedido').render!(CIERRE_DE_SESION))
    expect(screen.getByText('gary.defas')).toBeInTheDocument()
  })

  it('atribuye al sistema las acciones sin usuario, en vez de dejar el hueco vacío', () => {
    pintar(columna('ejecutor_usuario').render!({ ...BLOQUEO, ejecutor_usuario: null, ejecutor_nombre: null }))
    expect(screen.getByText('Sistema')).toBeInTheDocument()
  })

  it('muestra la hora de salida en los eventos de sesión y nada en el resto', () => {
    pintar(columna('hora_salida').render!(CIERRE_DE_SESION))
    expect(screen.getByText(/18\/07\/2026/)).toBeInTheDocument()

    const sinSalida = pintar(columna('hora_salida').render!(BLOQUEO))
    expect(sinSalida.container.textContent).toBe('—')
  })

  it('traduce los datos del cambio: etiqueta con tilde y valores en español', () => {
    pintar(detalle('Datos').render(BLOQUEO))
    // Ni "Estado_usuario" ni "BLOQUEADO": es lo que pedía el punto de "Textos".
    expect(screen.getByText('Estado del usuario:')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
    expect(screen.getByText('Bloqueado')).toBeInTheDocument()
  })

  it('sustituye la entidad técnica por una referencia legible', () => {
    pintar(columna('registro_afectado').render!(CIERRE_DE_SESION))
    expect(screen.getByText('Sesión de gary.defas')).toBeInTheDocument()
    expect(screen.getByText('Sesión')).toBeInTheDocument()
    // El nombre de la tabla no debe llegar a la pantalla.
    expect(screen.queryByText('sesion')).not.toBeInTheDocument()
  })

  it('exporta a CSV el mismo dato que se ve en pantalla', () => {
    expect(columna('datos').valorExport!(BLOQUEO)).toBe('Estado del usuario: Activo → Bloqueado')
    expect(columna('ejecutor_usuario').valorExport!({ ...BLOQUEO, ejecutor_usuario: null })).toBe('Sistema')
  })
})

describe('Biometría (metadatos)', () => {
  const REGISTRO = {
    id_registro: 'd71a4100-c711-47bf-855f-c84e52b5c685',
    path_storage: 'registro-biometrico/0e45bbdc/1784125316916.jpg',
    descriptor_facial: '[0.1,0.2]',
    vigente: true,
    tipo_dato: 'FACIAL',
    persona: { nombres: 'Gary', apellidos: 'Defas', cedula: '1750000109' },
  }

  it('da una referencia del rostro sin exponer la ruta completa', () => {
    const { container } = pintar(cfgBiometriaADM.columnas.find((c) => c.key === 'referencia')!.render!(REGISTRO))
    expect(container.textContent).toContain('Rostro d71a4100')
    expect(container.textContent).not.toContain('0e45bbdc')
  })

  it('dice dónde está guardado el rostro, en Storage y como vector', () => {
    const { container } = pintar(cfgBiometriaADM.columnas.find((c) => c.key === 'almacenamiento')!.render!(REGISTRO))
    expect(container.textContent).toContain('Supabase Storage · registro-biometrico')
    expect(container.textContent).toContain('vector facial en la base de datos')
  })

  it('no muestra el rostro: ninguna columna ni fila de detalle pinta una imagen', () => {
    // El pedido es explícito: "solo se tiene que especificar en dónde está almacenado
    // dicho rostro, no mostrar el rostro". `path_storage` es la RUTA, que sí se usa para
    // derivar la referencia y el lugar; lo que no puede aparecer es el archivo.
    const pintados = [
      ...cfgBiometriaADM.columnas.filter((c) => c.render).map((c) => c.render!(REGISTRO)),
      ...cfgBiometriaADM.detalle.map((d) => d.render(REGISTRO)),
    ]
    for (const nodo of pintados) {
      const { container } = pintar(nodo)
      expect(container.querySelector('img')).toBeNull()
      // Una URL firmada de Storage sería la otra forma de filtrarlo.
      expect(container.textContent ?? '').not.toMatch(/https?:\/\//)
    }
  })
})
