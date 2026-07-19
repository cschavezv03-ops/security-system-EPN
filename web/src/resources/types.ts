import type { ReactNode } from 'react'

export interface Opcion {
  value: string
  label: string
}

export type FieldType = 'text' | 'number' | 'date' | 'time' | 'email' | 'select' | 'textarea' | 'checkbox' | 'timerange'

export interface FieldConfig {
  name: string
  label: string
  type?: FieldType
  required?: boolean
  /** Opciones estáticas o cargadas de forma asíncrona (FKs, catálogos). */
  options?: Opcion[] | (() => Promise<Opcion[]>)
  /** Si es false, el campo NO se puede editar en el formulario de edición (Patrón C). */
  editable?: boolean
  /** El campo se muestra siempre deshabilitado y NO se envía en el payload. Para datos que el
   *  usuario debe ver pero que el sistema calcula, no elige (ej. el estado del memorando, que
   *  depende solo de sus fechas — GPE §6: "hay dos opciones: borrarlo o ponerle como campos en
   *  gris"). Distinto de `editable: false`, que sí persiste el valor en el alta. */
  soloLectura?: boolean
  /** Texto a mostrar en un campo `soloLectura`, derivado del resto del formulario. Sin esto un
   *  campo de estado enseñaría el valor guardado, que es justo lo que no cuadra con la realidad. */
  valorCalculado?: (valores: Record<string, any>) => string
  /** Solo se envía en INSERT, no en UPDATE. */
  insertOnly?: boolean
  /** No se muestra en el formulario de alta — solo aparece al editar. Útil para campos como
   *  "estado" que deben fijarse automáticamente al crear (ej. regla_acceso siempre ACTIVA). */
  hideOnInsert?: boolean
  /** Si es false, el campo es solo de UI (filtro en cascada) y NO se envía en el payload. */
  persistir?: boolean
  /** Opciones que dependen del valor actual de OTRO campo del mismo formulario (cascada,
   *  ej. "Punto de control" según la "Zona" elegida). Se re-evalúa cada vez que cambian los
   *  valores del formulario. Tiene prioridad sobre `options` si está presente. */
  opcionesDependientes?: (valores: Record<string, any>) => Promise<Opcion[]> | Opcion[]
  /** Autocompleta este campo cuando cambia el campo `campo`, solo si el usuario no lo ha
   *  tocado todavía (ej. sugerir el siguiente nombre de punto de control según la zona). */
  autoSugerenciaDesde?: { campo: string; calcular: (valorOrigen: any, valores: Record<string, any>) => Promise<string | null> }
  /** Igual que `opcionesDependientes` pero para un valor derivado (no opciones de select) que
   *  SIEMPRE se recalcula al cambiar `campo`, incluso si el usuario ya tiene algo escrito aquí.
   *  Pensado para campos ocultos (persistir: false) que solo condicionan `visibleSi` de otros
   *  campos (ej. la categoría de la persona elegida, para mostrar/ocultar campos por categoría). */
  derivarSiempreDesde?: { campo: string; calcular: (valorOrigen: any) => Promise<string | null> }
  /** Al cambiar este campo, limpia el valor de estos otros (ej. cambiar el filtro de zona
   *  invalida el punto de control ya elegido). */
  alCambiarLimpiar?: string[]
  /** El campo solo se muestra si esta función devuelve true para los valores actuales
   *  (ej. "Zona padre" solo si el tipo de zona es Parqueadero o Edificio). */
  visibleSi?: (valores: Record<string, any>) => boolean
  /** Formatea el valor tecleado en un input de texto (ej. MAC con ":", IP con ".") */
  formatear?: (valorCrudo: string) => string
  /** Valida el valor al guardar. Devuelve `null` si es correcto o el mensaje de error si no.
   *  Espejo de los CHECK de la BD (ver web/src/lib/validacion.ts): la BD es la que manda, esto
   *  solo adelanta el error para que el usuario no lo descubra al enviar. Recibe también el
   *  resto de valores del formulario, para reglas que dependen de otro campo (ej. el valor de
   *  un parámetro según su tipo_dato). */
  validar?: (valor: string, valores: Record<string, any>) => string | null
  /** Normaliza el valor justo antes de enviarlo (ej. teléfono a +593, placa a canónica). Se
   *  aplica después de `validar`. La BD vuelve a normalizar por su cuenta: esto es solo para
   *  que el usuario vea en pantalla lo mismo que se guardó. */
  normalizar?: (valor: string) => string
  /** Selección múltiple (lista de checkboxes) en vez de un <select> simple. Al guardar, se
   *  crea un registro por cada valor seleccionado (ej. vincular varias personas a un mismo
   *  memorando de una sola vez). Solo tiene efecto en el alta, no en edición. */
  multiSelect?: boolean
  hint?: string
  /** Explicación del formato esperado, en la ventanita de la "i" junto a la etiqueta. Para las
   *  reglas que no caben en un `hint` de una línea (ej. qué valida una cédula y por qué). */
  ayuda?: string
  placeholder?: string
  colSpan?: 1 | 2 | 3
  /** Valor por defecto al registrar. Puede ser una función para valores calculados (ej. un
   *  código autogenerado distinto cada vez que se abre el formulario). */
  default?: string | number | boolean | (() => string | number | boolean)
}

export interface ColumnConfig<Row = any> {
  key: string
  label: string
  render?: (row: Row) => ReactNode
  /** Marca la columna como badge de estado. */
  badge?: boolean
  /** Valor de texto plano para exportar a CSV (si no está, se usa row[key] o "" para columnas
   *  con `render` — export a texto y JSX son cosas distintas, no se puede derivar del render). */
  valorExport?: (row: Row) => string
}

export interface DetailRow<Row = any> {
  label: string
  render: (row: Row) => ReactNode
}

export interface BajaConfig {
  /** Columna de estado a cambiar. */
  campoEstado: string
  /** Valor que representa "dado de baja" / inactivo. */
  valorBaja: string
  /** Columna donde se guarda el motivo (opcional; si no existe, el motivo va a bitácora implícita). */
  campoMotivo?: string
  /** Opciones de "tipo de baja" si aplica. */
  tipos?: Opcion[]
  etiqueta?: string
}

export interface ResourceConfig<Row = any> {
  tabla: string
  titulo: string
  singular: string
  icono?: ReactNode
  descripcion?: string
  idField: string
  /** select de PostgREST (incluye joins para mostrar nombres). */
  select?: string
  orderBy?: { columna: string; ascendente?: boolean }
  /** Permisos efectivos que la matriz (doc 02) exige por acción. */
  permisos: { select: string[]; insert?: string[]; update?: string[] }
  columnas: ColumnConfig<Row>[]
  /** Campos de texto sobre los que busca la barra de búsqueda (ilike). */
  buscarEn?: string[]
  detalle: DetailRow<Row>[]
  /** Acción extra en el pie del panel de detalle (ej. cerrar una sesión concreta).
   *  Recibe la fila y utilidades para refrescar la lista o cerrar el panel. */
  accionDetalle?: (row: Row, ctx: { recargar: () => Promise<void>; cerrarPanel: () => void }) => ReactNode
  /** Bloque extra en el CUERPO del panel de detalle, debajo de los datos. Para lo que no
   *  cabe en un botón: gestionar registros relacionados sin salir de la ficha (ej. las
   *  personas asociadas a un vehículo). */
  detalleExtra?: (row: Row, ctx: { recargar: () => Promise<void>; cerrarPanel: () => void }) => ReactNode
  campoTituloDetalle: (row: Row) => string
  campoSubtituloDetalle?: (row: Row) => ReactNode
  campos: FieldConfig[]
  /** Filtro fijo aplicado a todas las consultas (ej. tipo_persona=INTERNA). */
  filtroFijo?: Record<string, string>
  /** Filtros adicionales de columna (dropdowns junto a la barra de búsqueda). Soporta rutas
   *  con punto para campos embebidos (ej. "categoria.codigo_categoria"). */
  filtros?: {
    campo: string
    label: string
    opciones: Opcion[] | (() => Promise<Opcion[]>)
  }[]
  campoEstado?: string
  baja?: BajaConfig
  /** Valores por defecto extra al insertar (además de los `default` por campo). */
  defaultsInsert?: Record<string, unknown>
  /** Columnas que se rellenan automáticamente con el id del usuario autenticado al INSERTAR. */
  autoUsuarioRegistro?: string[]
  /** Si el usuario tiene alguno de estos permisos, se muestra un botón "Exportar CSV" que
   *  exporta las filas actualmente filtradas/buscadas (feedback ADM: ADM_BITACORA_EXPORTAR). */
  exportarConPermiso?: string[]
  /** Campos cuyo cambio se confirma con una ventana antes de guardar (GPE §5: "agregar las
   *  ventanas o advertencias a la hora de modificar o agregar algún atributo sensible").
   *  Son los datos que cambian quién puede entrar al campus o cómo se identifica a alguien:
   *  tocarlos por error tiene consecuencias fuera del sistema. */
  camposSensibles?: string[]
}
