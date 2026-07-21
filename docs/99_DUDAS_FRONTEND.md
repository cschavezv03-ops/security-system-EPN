# 99 — Dudas del frontend para el equipo

> Registro de las brechas de negocio y hallazgos técnicos que surgieron construyendo el frontend
> (`web/`) contra el backend real. Mismo patrón que `docs/99_DUDAS_PARA_EL_EQUIPO.md`: se implementó
> la opción más conservadora, se documenta aquí, y no bloqueó el desarrollo. Ninguna de estas dudas
> impidió construir los 6 módulos — son puntos a revisar con el equipo, no bugs pendientes.

| # | Tema | Estado |
|---|---|---|
| F1 | "Dar de baja" temporal con duración (persona/vehículo) | Implementado sin duración |
| F2 | Ámbito de `EMPRESA_SERVICIO` | **Revertido** — ahora INTERNA (ver F7) |
| F3 | Límite de "2 vehículos por persona" | Parámetro `MAX_VEHICULOS_POR_PERSONA` creado, sin aplicar aún |
| F4 | `usuario_rol` bloqueada por RLS para 5 de 7 roles | Resuelto en frontend sin tocar RLS |
| F5 | DIRECTOR_ADMINISTRATIVO no puede navegar a módulos fuera de ADM | Documentado, no resuelto |
| F6 | `requiere_cambio_password` no se puede limpiar desde 6 de 7 roles | Resuelto: descarte local del aviso |
| F7 | `EMPRESA_SERVICIO`: se confirmó INTERNA (revierte F2) | Resuelto: migración aplicada |
| F8 | Exportación de bitácora: PDF/XLSX pedido, se implementó CSV | Resuelto con alcance reducido |
| F9 | Registro ágil de visitante sin memorando | Resuelto parcialmente: `correo` opcional |
| F10 | "No se registra el cambio al dar de baja" (GPI) | No reproducido — ver detalle |
| F11 | Límite de dispositivos por punto: "máx. 5" ambiguo | Interpretado como total combinado |

---

## F1 — "Dar de baja" temporal con duración (Patrón D) → **implementado sin duración**
**Duda original (07 §6.1):** el mockup de GPI ofrecía "Permanente / Temporal + duración", pero
`persona.estado` solo admite `ACTIVO, INACTIVO, DADO_DE_BAJA` sin columna de fecha de reactivación.
**Resolución aplicada:** el modal de baja (`ResourceScreen` → `BajaModal`) solo pide motivo (textarea
obligatoria) y cambia el campo de estado a `INACTIVO` (persona) o al valor de baja correspondiente
(vehículo → `DADO_DE_BAJA`, memorando/autorización → `REVOCADA`/`VENCIDO`, etc.). El motivo se guarda
en `persona.detalle_estado` cuando existe la columna. **No se ofrece "temporal" ni selector de
duración** en ninguna pantalla. Si el equipo decide implementarlo, necesita antes una columna de
fecha de reactivación (o un `parametro_sistema` de referencia) — es un cambio de esquema, no de UI.

**Actualización (20/07), primera vuelta — corregida después:** se interpretó "no se puede volver a
activarle" como que la baja debía ser permanente para todos, ni siquiera ADM podía reactivar
(trigger `impedir_reactivar_persona`). Era una lectura equivocada de lo pedido — ver la vuelta
siguiente.

**Actualización (20/07), segunda vuelta — la correcta:** con la captura real de la pantalla de GPI
(ficha de Carlos Chávez, solo "Editar", ningún "Reactivar") se confirmó que **sí** debía existir el
botón, simétrico con "Dar de baja": cada módulo reactiva lo suyo (GPI su personal interno, GPE el
externo, ADM cualquiera), apoyado en la RLS que ya lo permitía. Se eliminó el trigger que lo
bloqueaba (`20260720240000_gpi_permitir_reactivar_persona.sql`, ver `99_DUDAS_PARA_EL_EQUIPO.md`
V44) y se agregó `reactivar: { valorActivo: 'ACTIVO' }` a `cfgPersonaInterna` (`configs-gpi.tsx`) y
`cfgPersonaExterna` (`configs.tsx`) — mismo patrón que zona/regla_acceso. El combo de Estado de la
vista global de ADM (`cfgPersonaADM`, `configs-lectura.tsx`) volvió a su versión sin restricción.
Lo único que sigue bloqueado (sin cambios, backend): GPI/GPE no pueden reactivar a una persona con
rol de Responsable/Director/Administrador — eso sigue siendo exclusivo de ADM (V43).

## F2 — Ámbito de `EMPRESA_SERVICIO` → **resuelto por el backend real: EXTERNA**
**Duda original (07 §6.2):** el mockup de GPI gestionaba `EMPRESA_SERVICIO` como personal interno
(biometría), pero el modelo de datos también contemplaba que fuera externo.
**Resolución aplicada:** se consultó `categoria_persona` en el proyecto remoto — `EMPRESA_SERVICIO`
está sembrada con `ambito = 'EXTERNA'` (verificado 2026-07-14). El frontend sigue este dato real:
`EMPRESA_SERVICIO` aparece en `CATEGORIAS_EXTERNAS` (`src/lib/catalogos.ts`) y solo es seleccionable
en las pantallas de GPE (`Personal externo`), nunca en GPI. No requiere biometría, coherente con §D20.

## F3 — Límite de "2 vehículos por persona" → **no implementado en UI**
**Duda original (07 §6.3):** el mockup mostraba "0/2 vehículos" como regla dura, no documentada en
`04_REGLAS_NEGOCIO.md`.
**Resolución aplicada:** el formulario de asociación persona–vehículo (`cfgPersonaVehiculo`) **no**
valida ningún límite de cantidad — se registra el vínculo sin tope. Si el equipo confirma que es una
regla real, debe decidirse si se valida en el frontend, en un trigger, o en ambos (recomendado:
trigger, para que ninguna vía de escritura la esquive).

## F4 — `usuario_rol` bloqueada por RLS para 5 de 7 roles → **resuelto en frontend, sin tocar RLS**
**Hallazgo (no estaba en las brechas del doc 07):** la matriz de permisos (doc 02, tabla ADM) da
`SELECT` sobre `usuario_rol` solo a `ADMIN` y `DIR`. El resto de roles (GPI, GPE, PCO, CAC,
GUARDIA_SEGURIDAD) reciben una fila vacía al consultar su propia asignación de rol — verificado en
vivo contra `guardia.demo@epn.edu.ec` y `carlos.chavez03@epn.edu.ec` (RESPONSABLE_CONTROL_ACCESOS).
Esto rompía dos cosas: (1) mostrar el nombre del rol en la barra superior, y (2) detectar si el
usuario autenticado es el guardia para activar su vista operativa (07 §5) — con `roles` siempre
vacío, el guardia nunca habría visto su pantalla y en su lugar habría caído al home de 6 módulos.
**Resolución aplicada:** el frontend deriva una etiqueta de rol (`rolLabel`) y la detección de
guardia (`esGuardia`) **a partir de permisos efectivos y `allowed_modules()`**, nunca leyendo
`usuario_rol` (`src/auth/AuthProvider.tsx` → `derivarRolLabel`). La señal para "es guardia" es el
permiso `CAC_EVENTO_INSERT`, exclusivo del guardia según la matriz real (única fila con INSERT en
`evento_acceso` fuera del dispositivo/`service_role`) — verificado comparando los permisos efectivos
reales de `guardia.demo` vs `carlos.chavez03`. Si el equipo prefiere que el frontend lea el nombre de
rol real, hace falta ampliar la política RLS de `usuario_rol` para permitir `SELECT` de la propia fila
a todo usuario autenticado (cambio de esquema/RLS, no de frontend).

## F5 — DIRECTOR_ADMINISTRATIVO no puede navegar a módulos fuera de ADM → **documentado, no resuelto**
**Hallazgo:** `DIRECTOR_ADMINISTRATIVO` tiene permisos `*_SELECT` de solo lectura en todos los
módulos (doc 02), pero solo el permiso `ADM_MODULO_ACCEDER` — verificado en vivo con
`gary.defas@epn.edu.ec`: `allowed_modules()` devuelve únicamente `["ADM"]`. Como la navegación de
módulos depende exclusivamente de `allowed_modules()` (07 §2.3, 05 §2.3 — regla explícita del
proyecto), DIR solo puede navegar al módulo ADM en el frontend, aunque técnicamente tenga permiso de
lectura sobre `regla_acceso`, `zona`, `memorando`, personal interno, etc. Sus permisos de auditoría
"todos los `_SELECT`" quedan sin superficie de UI para consultarlos fuera de ADM.
**No se resolvió** porque cualquier opción cambia el comportamiento documentado de navegación:
(a) dar a DIR los `*_MODULO_ACCEDER` de los demás módulos (cambio de datos en `rol_permiso`, no de
esquema), o (b) construir una vista transversal de "Auditoría" dentro de ADM que junte lectura de
otros módulos sin necesitar `allowed_modules()` para cada uno (cambio de frontend, mayor alcance).
El equipo debe decidir cuál prefiere; mientras tanto DIR es plenamente funcional dentro de ADM.

## F6 — `requiere_cambio_password` no se puede limpiar desde 6 de 7 roles → **resuelto: descarte local**
**Hallazgo:** la matriz de permisos (doc 02, tabla ADM) da `UPDATE` sobre `usuario_sistema` solo a
`ADMIN` (`L C A`); el resto de roles (DIR, GPI, GPE, PCO, CAC, GUARDIA_SEGURIDAD) tienen `L²`
(SELECT restringido a la propia fila, sin UPDATE). La pantalla "Mi cuenta" intentaba bajar
`requiere_cambio_password` a `false` tras un cambio de contraseña exitoso mediante un `UPDATE` sobre
la propia fila — **verificado en vivo** con `lenin.amangandi@epn.edu.ec` (RESPONSABLE_PERSONAL_INTERNO):
el `PATCH` devuelve `200` con lista vacía (RLS descarta la fila en silencio, no es un error) y el
valor permanece en `true` indefinidamente.
**Resolución aplicada:** se eliminó ese `UPDATE` de `src/pages/CuentaPage.tsx` — la contraseña sí
cambia (vía `supabase.auth.updateUser`, que no depende de esta tabla), pero el aviso "debes cambiar
tu contraseña" (`BannerPassword` en `App.tsx`) se descarta **solo localmente** (botón ✕, por sesión de
navegador), consistente con la decisión de la sesión de tratarlo como aviso suave y no bloqueante. Si
el equipo quiere que el aviso desaparezca permanentemente tras el cambio, hace falta ampliar el
`UPDATE` de `usuario_sistema` a "cuenta propia" en RLS (cambio de esquema/política, no de frontend).

---

## F7 — `EMPRESA_SERVICIO`: se confirmó INTERNA, revierte F2 → **resuelto**
El feedback de GPI (docs/Req_Front) pidió explícitamente que el personal de empresas de seguridad/
limpieza se gestione como interno (biometría, GPI), contradiciendo la resolución conservadora F2
(que lo dejaba EXTERNA siguiendo el dato semilla). El usuario confirmó el cambio explícitamente.
**Aplicado:** migración `20260715011000` — `categoria_persona.ambito='INTERNA'` para
`EMPRESA_SERVICIO` + `regla_acceso` demo nueva para esa categoría en Garita Principal. No había
personas ya registradas con esa categoría (verificado), así que no hizo falta migrar filas de
`persona.tipo_persona`. GPI ya la ofrece automáticamente (su selector de categoría no está
hardcodeado, filtra por `ambito` en vivo).

## F8 — Exportación de bitácora: se pidió PDF/XLSX, se implementó CSV → **resuelto con alcance reducido**
El permiso `ADM_BITACORA_EXPORTAR` ya existía sin ninguna función de exportación construida.
Implementar PDF o XLSX real requiere una librería pesada (jsPDF/exceljs) que no estaba en el
proyecto; dado el volumen de cambios de esta sesión, se optó por **CSV** (abre nativamente en
Excel/Sheets, cero dependencias nuevas) como equivalente funcional. Se agregó como mecanismo
genérico y reutilizable en `ResourceScreen` (`exportarConPermiso`), no solo para bitácora. Si el
equipo necesita específicamente PDF/XLSX con formato, es una mejora de frontend pendiente.

## F9 — Registro ágil de visitante sin memorando → **resuelto parcialmente**
El feedback de GPE pedía un formulario reducido (solo cédula + algún contacto) para visitantes de
paso, en vez del formulario completo de "Personal externo". Se hizo **`persona.correo` nullable**
(migración `20260715019000`, antes `NOT NULL`) y se quitó el `required` de correo/teléfono en el
formulario existente — cédula/nombres/apellidos siguen siendo obligatorios (identidad mínima), pero
ya no hace falta inventar un correo para poder guardar. **No se construyó una pantalla separada**
de registro rápido embebida dentro del flujo de "Ingresos" (autorización de visita); sigue siendo
necesario registrar primero la persona en "Personal externo" y luego crear la autorización. Si el
equipo quiere el flujo embebido de un solo paso, es una ampliación de frontend pendiente.

## F10 — "No se registra el cambio cuando se da de baja a una persona" (GPI) → **no reproducido**
Se revisó `BajaModal` (usado también por GPI) y la política RLS de `persona` UPDATE para GPI
(`tiene_permiso('GPI_PERSONA_UPDATE')`, sin restricción de columna) — ambas correctas. Se confirmó
además, con datos reales ya en la base, una persona de prueba ("TuRostro Muestra2") con
`estado = INACTIVO`, es decir **una baja anterior sí quedó guardada**. No se encontró evidencia de
que el mecanismo falle. Posibles explicaciones no descartadas: confusión por falta de confirmación
visual inmediata, o un caso puntual no reproducido. Si vuelve a ocurrir, reportar con la persona
exacta y el momento para poder revisar `bitacora_sistema` de esa fila.

## F11 — Límite de dispositivos por punto de control: "máx. 5" ambiguo → **interpretado como total combinado**
El feedback PCO dice "Para cada punto de control tipo parqueadero, máximo 5 dispositivos,
biométricos y lectura de placa" — ambiguo entre "5 de cada tipo" (hasta 10 total) o "5 en total
entre ambos tipos". Se implementó como **5 en total** en el trigger `validar_asignacion_dispositivo`
(migración `20260715016000`), la lectura más restrictiva y literal de la frase. Si el equipo quiere
5+5 (10 total), es un cambio de una línea en la función del trigger.
