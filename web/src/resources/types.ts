import type { ReactNode } from 'react'

export interface Opcion {
  value: string
  label: string
}

export type FieldType =
  | 'text' | 'number' | 'date' | 'time' | 'email' | 'select' | 'textarea' | 'checkbox' | 'timerange'
  /** Busca a una persona por su cédula y guarda su id. Ver `FieldConfig.buscarPorCedula`. */
  | 'cedula-busqueda'

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
  /** Valor inicial de un campo auxiliar (`persistir: false`) al EDITAR un registro existente.
   *
   *  Sin esto, los filtros de cascada arrancaban vacíos en la edición: como no son columnas de
   *  la tabla, no vienen en el registro y quedaban en "". El campo que dependía de ellos se
   *  quedaba entonces sin opciones y, al ser obligatorio, impedía guardar. Es lo que hacía que
   *  al abrir un punto de control no apareciera ninguna "Zona", y al abrir un dispositivo,
   *  ningún "Punto de control" (feedback PCO). */
  derivarDeRegistro?: (registro: Record<string, any>) => Promise<unknown> | unknown
  /** El campo solo se muestra si esta función devuelve true para los valores actuales
   *  (ej. "Zona padre" solo si el tipo de zona es Parqueadero o Edificio). */
  visibleSi?: (valores: Record<string, any>) => boolean
  /** Mantiene el campo visible, pero bloquea su edición mientras se cumpla la condición.
   *  A diferencia de `visibleSi`, sirve cuando el usuario necesita entender que el dato existe
   *  pero no aplica a la selección actual (ej. Carrera para un estudiante del CEC). */
  deshabilitadoSi?: (valores: Record<string, any>) => boolean
  /** Formatea el valor tecleado en un input de texto (ej. MAC con ":", IP con ".") */
  formatear?: (valorCrudo: string) => string
  /** Valida el valor al guardar. Devuelve `null` si es correcto o el mensaje de error si no.
   *  Espejo de los CHECK de la BD (ver web/src/lib/validacion.ts): la BD es la que manda, esto
   *  solo adelanta el error para que el usuario no lo descubra al enviar. Recibe también el
   *  resto de valores del formulario, para reglas que dependen de otro campo (ej. el valor de
   *  un parámetro según su tipo_dato). */
  validar?: (valor: string, valores: Record<string, any>) => string | null
  /** En un campo `type: 'date'`, impide elegir una fecha anterior a hoy.
   *
   *  PCO v2: «en los campos de fecha, no debe haber la posibilidad de poner fechas anteriores».
   *  El trigger de la base ya lo rechaza, pero rechazarlo al guardar no es lo mismo que no
   *  poder elegirlo: el calendario del navegador deshabilita los días anteriores.
   *
   *  Usa `hoyISO()` (hora de Ecuador), no la fecha del navegador. */
  minHoy?: boolean
  /** Configuración del campo `type: 'cedula-busqueda'`.
   *
   *  PCO v2: «el input Guardia será de tipo numérico, se debe validar el ingreso de 10 dígitos
   *  pertenecientes a la cédula de un guardia. El sistema debe mostrar un mensaje de usuario
   *  encontrado o si no, de usuario no registrado. Si sí se ha encontrado, se mostrará a un lado
   *  el nombre completo del guardia.»
   *
   *  El campo guarda el **id** que devuelve el RPC, no la cédula: la cédula es cómo se busca a la
   *  persona, no cómo se la referencia en la base. */
  buscarPorCedula?: {
    /** RPC que recibe `{ p_cedula }` y devuelve filas con `id_usuario` y `nombre_completo`. */
    rpc: string
    /** Qué decir cuando esa cédula no corresponde a nadie con ese perfil. */
    textoNoEncontrado?: string
  }
  /** Valor que el sistema arma a partir de otros campos del formulario, y que **sí se guarda**.
   *
   *  Distinto de `soloLectura` + `valorCalculado`, que enseña un valor pero no lo envía en el
   *  payload. Aquí la columna es real y se persiste; lo que no se deja es teclearla a mano.
   *
   *  Se usa en el nombre de un punto de control dentro de un edificio: PCO pide la nomenclatura
   *  `E20/P4/E004 – Laboratorio Alan Turing` y que el usuario **no escriba los separadores**
   *  («solo ingresará los datos, pero no estos caracteres: "/, -"»). Se piden tres números y una
   *  descripción, y el nombre se compone solo, con lo que no hay forma de teclearlo mal. */
  componerDesde?: { campos: string[]; componer: (valores: Record<string, any>) => string }
  /** Advertencia que NO impide guardar, mostrada bajo el campo mientras se rellena el formulario.
   *
   *  Para lo que es legal pero conviene mirar dos veces. Se usa en el turno del guardia: entre 8
   *  y 12 horas la jornada es válida, pero son horas extra y quien la registra debería saberlo.
   *  Distinto de `validar`, que bloquea, y de `hint`, que es un texto fijo. */
  aviso?: (valor: string, valores: Record<string, any>) => string | null
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
  /** Permite omitir datos que no aplican a la categoría concreta del registro. */
  visibleSi?: (row: Row) => boolean
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
  /** Vuelta atrás de la baja. Sin esto, inactivar era un viaje de ida: la pantalla ofrecía
   *  "Inactivar" y ninguna forma de deshacerlo salvo editar el registro y cambiar el estado a
   *  mano (feedback PCO: "cuando se inactiva una Zona no existe un botón para volver a
   *  activarla"). El botón solo aparece cuando la fila está efectivamente dada de baja. */
  reactivar?: {
    /** Valor de `baja.campoEstado` que representa "en servicio" (ej. ACTIVA). */
    valorActivo: string
    etiqueta?: string
  }
  /** Valores por defecto extra al insertar (además de los `default` por campo). */
  defaultsInsert?: Record<string, unknown>
  /** Columnas que se rellenan automáticamente con el id del usuario autenticado al INSERTAR. */
  autoUsuarioRegistro?: string[]
  /** El alta no usa el formulario genérico, sino que lleva a esta ruta. Para recursos cuyo
   *  registro no es un simple INSERT en una tabla, sino una operación atómica sobre varias
   *  (ej. un vehículo NO puede crearse sin su propietario: el alta va a `/vehiculos/nuevo`, que
   *  crea vehículo y relación en una sola transacción vía RPC). Sin esto, el botón "Registrar"
   *  abría un formulario que insertaba la fila suelta y dejaba, p. ej., vehículos sin dueño. */
  altaRuta?: string
  /** Si el usuario tiene alguno de estos permisos, se muestra un botón "Exportar CSV" que
   *  exporta las filas actualmente filtradas/buscadas (feedback ADM: ADM_BITACORA_EXPORTAR). */
  exportarConPermiso?: string[]
  /** Campos cuyo cambio se confirma con una ventana antes de guardar (GPE §5: "agregar las
   *  ventanas o advertencias a la hora de modificar o agregar algún atributo sensible").
   *  Son los datos que cambian quién puede entrar al campus o cómo se identifica a alguien:
   *  tocarlos por error tiene consecuencias fuera del sistema. */
  camposSensibles?: string[]
}
