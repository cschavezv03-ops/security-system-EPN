# 03 — Decisiones y Correcciones

> Registro de las contradicciones detectadas entre los documentos fuente y cómo se resolvieron.
> **Estas decisiones ya están tomadas. No re-litigarlas.** Si algo aquí parece incorrecto,
> se cambia por acuerdo del equipo y se actualiza este documento — no en una sesión de código.

---

## Decisiones de arquitectura

### D1 — Autenticación: `auth.users` nativo de Supabase
**Decidido.** Se elimina `password_hash` de `usuario_sistema`; Supabase Auth gestiona la
contraseña y el JWT. `usuario_sistema` pasa a ser tabla de perfil vinculada a `auth.users(id)`.
Detalle completo en `01_AUTENTICACION_Y_ROLES.md` §2.
*Reemplaza lo que decía el Modelo de Datos Consolidado §3.1 sobre `password_hash`.*

### D10 — Expiración de sesiones: nativa de Supabase, sin cambios al modelo
**Decidido.** Timeout por **inactividad** de 60 min + **time-box** absoluto de 12 h, iguales
para todos los roles, configurados en `supabase/config.toml` y aplicados por Supabase Auth.
`recordar_sesion` deshabilitado. La tabla `sesion` queda como tabla de **auditoría**, no como
fuente de verdad de la expiración. `TIEMPO_SESION_MIN` se conserva en `parametro_sistema` por
exigencia del modelo. **No se añade ninguna columna ni tabla.**
Detalle y justificación en `01_AUTENTICACION_Y_ROLES.md` §5.
*Cierra la decisión pendiente §15.5 de `ADM_Login_Roles_Permisos.md` y P2 de
`04_REGLAS_NEGOCIO.md`.*

### D11 — Nueva tabla `guardia_punto_control` (25.ª entidad) ⚠️ ÚNICA TABLA AÑADIDA AL MODELO
**Decidido.** Se añade una tabla de unión que asigna guardias a puntos de control. **Es la única
entidad que se agrega al Modelo de Datos Consolidado (24 → 25 tablas).**

**Módulo dueño: PCO** (el punto de control es suyo; la asignación es una propiedad de la
infraestructura, no del usuario).

| Atributo | Tipo | Oblig. | PK | FK → | Descripción |
|---|---|---|---|---|---|
| `id_asignacion` | uuid | Sí | Sí | — | `gen_random_uuid()` |
| `id_usuario` | uuid | Sí | No | `usuario_sistema.id_usuario` | Guardia asignado |
| `id_punto_control` | uuid | Sí | No | `punto_control.id_punto_control` | Punto asignado |
| `turno` | varchar(30) | No | No | — | Ej. MATUTINO, VESPERTINO, NOCTURNO |
| `fecha_inicio` | timestamptz | Sí | No | — | `DEFAULT now()` |
| `fecha_fin` | timestamptz | No | No | — | Null si la asignación sigue vigente |
| `estado_asignacion` | text | Sí | No | — | `CHECK (ACTIVA, FINALIZADA)` |
| `id_usuario_registro` | uuid | Sí | No | `usuario_sistema.id_usuario` | Quién hizo la asignación |
| `fecha_registro` | timestamptz | Sí | No | — | `DEFAULT now()` |

**Por qué se crea:** `ADM_Login_Roles_Permisos.md` §7.7 y §13 exigen que el guardia solo vea
eventos y alertas de *su punto asignado*, pero **ninguna de las 24 tablas modelaba esa relación**
— la restricción era literalmente imposible de implementar en RLS. `punto_control` (PCO) y
`usuario_sistema` (ADM) existían, pero sin puente entre ellos.

**Por qué no viola el principio de "no crear tablas nuevas":** ese principio existe para evitar
*duplicación* de entidades. Aquí no hay nada que reutilizar: es una relación N:M que faltaba.
Se descartaron las alternativas de añadir `id_punto_control` a `usuario_sistema` (no soporta
rotación de turnos, ensucia una tabla maestra de ADM con un dato operativo) y de renunciar a la
restricción (incumpliría un criterio de aceptación ya escrito).

**Soporta:** turnos rotativos, guardias que cubren varios puntos, e historial
("¿quién estaba en la garita norte el 3 de julio?").

*Cierra P5 de `04_REGLAS_NEGOCIO.md`.*

### D12 — Bootstrap del trigger `auth.users` → `usuario_sistema`
**Problema:** `usuario_sistema.id_persona` es `NOT NULL`, pero un trigger sobre `auth.users`
no tiene forma de saber a qué `persona` corresponde la cuenta. El trigger fallaría siempre.

**Decidido:** al crear la cuenta en Supabase Auth se pasa `id_persona` dentro de
`raw_user_meta_data`, y el trigger lo lee de ahí:

```sql
create or replace function public.crear_usuario_sistema()
returns trigger language plpgsql security definer as $$
begin
  insert into public.usuario_sistema (id_usuario, id_persona, nombre_usuario,
                                      correo_electronico, estado_usuario)
  values (new.id,
          (new.raw_user_meta_data->>'id_persona')::uuid,
          new.raw_user_meta_data->>'nombre_usuario',
          new.email,
          'ACTIVO');
  return new;
end $$;
```

**Orden obligatorio: primero se crea la `persona`, después la cuenta de Auth.** Si
`raw_user_meta_data` no trae un `id_persona` válido, el trigger debe fallar con un error claro.
Sin cambios al modelo.

### D13 — Bootstrap del primer administrador (seed)
**Problema:** por D5, `ADMINISTRADOR_SISTEMA` no tiene `INSERT` sobre `persona`. Las personas
internas las crea GPI. Pero para que exista un usuario GPI, alguien tuvo que crearlo — y ese
alguien es el admin, que todavía no existe. Huevo y gallina.

**Decidido:** `supabase/seed.sql` inserta directamente la primera `persona` +
`usuario_sistema` + `usuario_rol` del `ADMINISTRADOR_SISTEMA`.

**Esto no es una excepción a las reglas de RLS:** el seed se ejecuta con `service_role`, que por
definición opera fuera de RLS. Es el patrón de bootstrap estándar. A partir de esa cuenta, todo
lo demás se crea por los canales normales.

### D14 — `sesion.token_hash` pasa a NULLABLE ⚠️ CAMBIO A UNA COLUMNA DEL MODELO
**Problema:** el modelo declara `token_hash` como `NOT NULL`, pero por D10 el JWT lo gestiona
Supabase y vive en el cliente — nuestro backend nunca lo tiene para hashearlo.

**Decidido:** `token_hash` pasa a **nullable**. La fila de `sesion` se inserta mediante una
función RPC llamada justo después del login exitoso, que registra `fecha_inicio`, `ip_origen`
y `estado_sesion = 'ACTIVA'`.

**Es el único cambio a una columna del Modelo de Datos Consolidado.** Coherente con D10:
`sesion` es tabla de **auditoría**, no la fuente de verdad de la sesión.

### D15 — `registro_biometrico`: se queda `vigente boolean` (contradicción del PDF)
El PDF original se contradice consigo mismo: la tabla de atributos (§3.2) define
`vigente boolean`, pero el catálogo consolidado (§6) lista `RegistroBiometrico.estado` con
valores `ACTIVO, INACTIVO`. **Son dos columnas distintas para lo mismo.**

**Decidido:** gana la tabla de atributos → se implementa **`vigente boolean DEFAULT true`** y
se **ignora** la línea `RegistroBiometrico.estado` del catálogo §6. No existe tal columna.

### D16 — Catálogo de `alerta_seguridad.tipo_alerta` (⚠️ a confirmar con CAC)
El §6 del PDF define catálogos para `nivel_riesgo` y `estado_alerta`, pero deja `tipo_alerta`
como `text` libre — exactamente lo que la consolidación buscaba eliminar en el resto del modelo.

**Decidido (provisional):**
```
CHECK (tipo_alerta IN (
  'BIOMETRIA_FALLIDA', 'PERSONA_NO_AUTORIZADA', 'MEMORANDO_VENCIDO',
  'FUERA_DE_HORARIO', 'PUNTO_SALIDA_INCORRECTO',
  'DISPOSITIVO_NO_RECONOCIDO', 'VEHICULO_NO_AUTORIZADO',
  'VEHICULO_PERMANENCIA_EXCEDIDA', 'VEHICULO_ABANDONADO'   -- §D25
))
```
⚠️ **Este catálogo debe validarlo el equipo CAC**, que es el dueño de la entidad. Si añaden o
quitan valores, es un `ALTER` trivial.

### D17 — Valores iniciales de `parametro_sistema`
**Decidido.** Filas a sembrar en `seed.sql` (cierran P1 y P7):

| `codigo_parametro` | `valor_parametro` | `tipo_dato` | `modulo_aplicacion` | Cierra |
|---|---|---|---|---|
| `MAX_INTENTOS_LOGIN` | `5` | ENTERO | AUTENTICACION | P1 |
| `TIEMPO_BLOQUEO_CUENTA_MIN` | `15` | ENTERO | AUTENTICACION | P1 |
| `TIEMPO_SESION_MIN` | `60` | ENTERO | SESION | D10 |
| `UMBRAL_BIOMETRIA` | `0.85` | DECIMAL | SEGURIDAD | P7 |
| `PERMANENCIA_MAX_INTERNO_H` | `16` | ENTERO | SEGURIDAD | D25 |
| `PERMANENCIA_MAX_EXTERNO_H` | `12` | ENTERO | SEGURIDAD | D25 |
| `PERMANENCIA_MAX_VISITA_H` | `4` | ENTERO | SEGURIDAD | D25 |
| `PERMANENCIA_ABANDONO_H` | `72` | ENTERO | SEGURIDAD | D25 |

Ninguno se hardcodea en el código: siempre se leen de esta tabla.

### D18 — `evento_acceso.fecha_hora` recibe `DEFAULT now()`
El modelo lo marca obligatorio pero sin default, lo que obligaría a enviarlo en cada INSERT.
**Decidido:** `timestamptz NOT NULL DEFAULT now()`. Corrección trivial, sin discusión.

### D19 — Regla de prefijos de los códigos de permiso
**Decidido:** en `MODULO_ENTIDAD_ACCION`, el **MODULO es aquel desde el que el usuario actúa,
no el módulo dueño de la tabla.**

Por eso conviven `GPE_AUTORIZACION_INSERT` (el responsable de GPE, trabajando dentro de GPE) y
`CAC_AUTORIZACION_INSERT` (el guardia, operando desde la interfaz de CAC) sobre la **misma tabla**
`autorizacion_visita_diaria`. No es una duplicación: son dos caminos de acceso distintos a la
misma entidad, y conviene poder revocarlos por separado.

**Claude Code no debe "normalizar" ni renombrar estos permisos.**

### D20 — LAS DOS VÍAS DE VALIDACIÓN ⚠️ REGLA CENTRAL DEL SISTEMA
**Decidido y ratificado por el equipo.** El sistema valida el acceso por **dos vías distintas
según el tipo de persona**. Esto **anula** la regla transversal del Contexto General §6
(*"las credenciales se basan únicamente en biometría facial"*), que solo describía correctamente
al personal interno.

| | Personal **INTERNA** | Personal **EXTERNA** |
|---|---|---|
| **Identidad** | Biometría facial (`registro_biometrico`) | **Cédula**, tecleada por el guardia |
| **Autorización** | `persona.estado = 'ACTIVO'` | Memorando vigente **o** autorización de visita diaria |
| **Quién valida** | El dispositivo (LPR / cámara) | **El guardia** |
| **`evento_acceso.origen_registro`** | `AUTOMATICA` | `MANUAL` |
| **¿Tiene biometría?** | **Sí, siempre** | **No, nunca** |

**Los externos NUNCA tienen registro biométrico.** No se enrola el rostro de un proveedor que
viene tres días. Esto no es una limitación: es el diseño.

**Flujo del guardia con un externo:** teclea la **cédula** → el sistema busca en
`persona.cedula` → recupera el memorando vigente (vía `persona_memorando`) o la autorización
de visita diaria del día → decide.

**Consecuencias de esquema:**
- `registro_biometrico` debe restringirse por trigger a `persona.tipo_persona = 'INTERNA'`.
  Un intento de enrolar biometría de un externo debe fallar.
- `persona.cedula` es el identificador de búsqueda del guardia → **necesita un índice**.
- `origen_registro` deja de ser un campo decorativo: es el que dice **por qué vía** entró.
  Nadie había documentado cuándo usar `AUTOMATICA` vs `MANUAL`. Ahora sí.

*Anula §D7. Ratificado por el equipo — no es una inferencia.*

### D21 — Nueva columna `evento_acceso.es_conductor` ⚠️ CAMBIO A UNA COLUMNA DEL MODELO
**Decidido.** Se añade `es_conductor boolean NOT NULL DEFAULT false` a `evento_acceso`.

**Por qué:** se genera **un `evento_acceso` por cada ocupante** de un vehículo (§D22). Sin esta
columna, cuatro eventos con el mismo `id_vehiculo` no distinguen quién iba manejando — y eso se
puede inferir de `persona_vehiculo`, pero no dice quién condujo **ese día en concreto**.

Es el **segundo (y último) cambio a una columna** del Modelo de Datos Consolidado, junto con
`sesion.token_hash` NULLABLE (§D14).

### D22 — Reglas de acceso vehicular
**Decidido.**
- La **placa** autoriza al **vehículo** (`vehiculo.estado_vehiculo = 'ACTIVO'`), no a la persona.
  Una placa **no es una credencial** — un auto robado no debe abrir la puerta.
- **Cada ocupante se valida individualmente** por su propia vía (§D20) y su propia vigencia.
- Se genera **un `evento_acceso` por ocupante**, todos compartiendo `id_vehiculo`,
  `id_punto_control` y `fecha_hora`. El conductor lleva `es_conductor = true`.
- Un pasajero **no necesita estar en `persona_vehiculo`** para entrar: se valida como persona,
  igual que si llegara caminando. `persona_vehiculo` autoriza al vehículo, no a las personas.
- **Un ocupante DENEGADO ⇒ el vehículo completo es DENEGADO.** Un auto es atómico: no se puede
  dejar entrar a tres y quedarse con uno afuera. Todos los eventos se registran con su resultado
  real. El guardia resuelve manualmente.
- Un vehículo puede llevar ocupantes de ambas vías: conductor interno (`AUTOMATICA`) +
  tres proveedores externos (`MANUAL`). Cuatro eventos, dos orígenes. Es válido.

### D23 — Regla de salida por el mismo punto de control
**Decidido.** La regla *"debe salir por el mismo punto por el que ingresó"* aplica **solo a los
visitantes con `autorizacion_visita_diaria`** — no al personal externo con memorando, ni al interno.

⚠️ Esto **reduce el alcance** de lo que declaraban el Contexto General §6 y el Modelo §3.3
("el personal externo debe salir por el mismo punto"). Ratificado por el equipo.

**Al incumplirse:** `resultado = DENEGADO` + alerta `PUNTO_SALIDA_INCORRECTO`, **con dos válvulas
de escape obligatorias:**
1. Si el punto de ingreso tiene `estado_punto != 'ACTIVO'` (FALLA / MANTENIMIENTO) → **se autoriza
   la salida** por otro punto, con alerta. De lo contrario la persona quedaría encerrada.
2. El guardia siempre puede registrar una salida **manual** (`origen_registro = 'MANUAL'`) con
   justificación en `motivo_resultado`, generando alerta.

**Nunca se construye un sistema de egreso físico sin override manual** (evacuaciones, emergencias).

### D24 — Vigencia temporal del acceso
**Decidido.**
- `memorando.fecha_fin` es **inclusiva**: un memorando que termina "hoy" vale hasta el final de hoy.
- La vigencia **solo se valida en el `INGRESO`**. Una `SALIDA` **nunca** se deniega por memorando
  o autorización vencida — si no, la persona queda atrapada en el campus.
- **Reglas de acceso solapadas:** gana la **más específica** (la que tiene `id_punto_control`
  explícito sobre la que lo tiene nulo). Si empatan en especificidad, gana la **más restrictiva**
  (denegar). **No se añade columna de prioridad.**

### D25 — Permanencia máxima de vehículos dentro del campus
**Decidido.** Se controla cuánto tiempo puede permanecer un vehículo dentro de la EPN.

**No requiere ninguna tabla ni columna nueva.** La permanencia es computable con lo que ya
existe: el tiempo entre el `INGRESO` de un `id_vehiculo` en `evento_acceso` y su `SALIDA`
correspondiente. Se implementa como **vista** (`vista_vehiculos_dentro`).

**A quién se le imputa:** al **conductor** (`evento_acceso.es_conductor = true`, §D21), no a los
pasajeros. El límite aplicable depende de la vía y vigencia de **ese conductor**.

#### Límites (filas nuevas en `parametro_sistema`)

| `codigo_parametro` | Valor | `tipo_dato` | `modulo_aplicacion` | Aplica a |
|---|---|---|---|---|
| `PERMANENCIA_MAX_INTERNO_H` | `16` | ENTERO | SEGURIDAD | Conductor `INTERNA` activo |
| `PERMANENCIA_MAX_EXTERNO_H` | `12` | ENTERO | SEGURIDAD | Conductor `EXTERNA` con memorando |
| `PERMANENCIA_MAX_VISITA_H` | `4` | ENTERO | SEGURIDAD | Conductor con `autorizacion_visita_diaria` |
| `PERMANENCIA_ABANDONO_H` | `72` | ENTERO | SEGURIDAD | Cualquiera → vehículo abandonado |

**Intención de diseño:** lo que se detecta **no es "estuvo mucho rato", es "se quedó a dormir"**.
16 h cubren una jornada de 06:00 a 22:00 (incluye clases nocturnas); pasar la noche es la anomalía.

⚠️ **Estos valores son placeholders razonados, no datos medidos.** Nadie midió cuánto permanece
realmente un vehículo en la EPN. Al vivir en `parametro_sistema`, ajustarlos es un `UPDATE`, no
un despliegue. **Revisar con CAC y con administración del campus.**

#### Detección: job programado (⚠️ nueva pieza de infraestructura)

Todas las demás alertas del sistema nacen de **un evento que ocurre**. Esta nace de **un evento
que NO ocurre** (la salida que nunca llegó) — no hay nada sobre lo que disparar un trigger.

Se implementa con **`pg_cron`** (nativo en Supabase), corriendo **cada hora**:
consulta `vista_vehiculos_dentro` y genera una `alerta_seguridad` por cada vehículo excedido.

`alerta_seguridad.id_evento` es `NOT NULL` → la alerta apunta al **`evento_acceso` de INGRESO**
que nunca recibió su salida. Encaja sin modificar el esquema.

Debe ser **idempotente**: no generar una alerta nueva cada hora para el mismo vehículo. Verificar
que no exista ya una alerta `PENDIENTE` del mismo tipo para ese `id_evento`.

#### Consecuencia: alerta informativa, NO bloqueante

- Excedido el límite → `alerta_seguridad` con `tipo_alerta = 'VEHICULO_PERMANENCIA_EXCEDIDA'`,
  `nivel_riesgo = 'MEDIO'`.
- Superado `PERMANENCIA_ABANDONO_H` → `tipo_alerta = 'VEHICULO_ABANDONADO'`,
  `nivel_riesgo = 'ALTO'`.
- **No se deniega la salida ni se suspende el vehículo automáticamente.** El Supervisor CAC
  atiende la alerta y la marca `ATENDIDA` si es legítima (ej. un contratista con permiso de dejar
  la volqueta durante la obra).

**Por qué así:** reutiliza el flujo de alertas que ya existe (§D4) en lugar de inventar un
mecanismo de excepciones con columnas nuevas. El caso legítimo se resuelve con una persona
atendiendo una alerta, no con más esquema.

#### Efecto secundario útil
Estas alertas van a **destapar problemas de calidad de dato**: cada salida que el guardia olvidó
registrar, o que un dispositivo no capturó, aparecerá como un "vehículo que nunca salió". Eso es
información valiosa, no ruido.

### D26 — Biometría facial: reconocimiento real 1:N con pgvector (ya no mock)
**Decidido (2026-07-14).** Se implementa el reconocimiento facial **real**, reemplazando el mock.
Detalle en `01_AUTENTICACION_Y_ROLES.md` §6.

- **Sin hardware dedicado.** El descriptor facial de 128 dimensiones lo calcula el navegador con
  `face-api.js` (cámara de laptop/celular); la **comparación ocurre en el backend** con
  **pgvector** (`registro_biometrico.descriptor_facial vector(128)`). La BD sigue siendo la única
  fuente de verdad y el match no se falsifica desde el cliente.
- **Identificación 1:N**, no verificación 1:1: `validar-biometria` recibe `{ descriptor }` y
  devuelve `{ match, id_persona, confidence }`. La búsqueda es la función SQL
  `identificar_por_descriptor` (solo `service_role`); el enrolamiento es la RPC
  `enrolar_biometria` (SECURITY INVOKER, respeta la RLS de GPI y el trigger que prohíbe biometría
  de externos, §D20).
- **Métrica: distancia euclidiana (L2), NO coseno.** Medido con rostros reales: con coseno dos
  personas distintas daban ~0.88 de similitud (falsos positivos: aceptaba a no enrolados). Con L2
  hay separación real. `confidence = 1 − distancia_L2`. Punto de operación **estricto con margen**:
  `UMBRAL_BIOMETRIA = 0.38` (= distancia L2 máxima 0.62). Verificado 1:N: genuino ≈ 0.44
  (aceptado), impostores ≈ 0.29–0.31 (rechazados).
- El resto del pipeline CAC no cambia: `registrar-evento-acceso` sigue comparando ese mismo
  `confidence` contra `UMBRAL_BIOMETRIA`. Reemplazar face-api.js/pgvector por un proveedor real
  (AWS Rekognition / Azure Face) solo tocaría el origen del descriptor y esta función.
- Herramienta de prueba con cámara: `scripts/banco_biometria/`.

### D2 — Dispositivos: identidad de servicio
**Decidido.** Los dispositivos no usan la sesión de un guardia. Llaman a una Edge Function
autenticada con `service_role` key, que valida `codigo_mac`/`direccion_ip` contra la tabla
`dispositivo`. Detalle en `01_AUTENTICACION_Y_ROLES.md` §4.
*Resuelve la ambigüedad de `matrizGeneralDePermisos.md`, donde "PCO" y "CAC" aparecían
validando accesos en tiempo real — eso era el dispositivo, no una persona.*

---

## Conflictos resueltos entre documentos

Los tres documentos de permisos se contradecían. **Criterio general aplicado:** gana
`ADM_Login_Roles_Permisos.md` (más detallado y explícito) salvo cuando el **Modelo de Datos
Consolidado** dice lo contrario, en cuyo caso gana el modelo.

### D3 — El guardia SÍ registra autorizaciones de visita diaria
- `ADM_Login_Roles_Permisos.md` §7.7 daba al guardia solo `CAC_AUTORIZACION_CONSULTAR`.
- El **Modelo de Datos** §3.3 dice explícitamente: *"La autorización depende del criterio del
  guardia, no de la DRI"* y documenta `id_usuario_registro` como *"Usuario (guardia) que la registró"*.
- **Resuelto a favor del modelo:** el guardia obtiene `CAC_AUTORIZACION_INSERT` y
  `CAC_AUTORIZACION_UPDATE` (para revocar).
- El guardia **sigue sin poder tocar `memorando`** — eso requiere aprobación institucional
  de la DRI y es exclusivo de GPE.

### D4 — Las alertas se generan solas; solo CAC las atiende
- `matrizGeneralDePermisos.md` daba "Generar alertas de seguridad" a 5 roles (incluido el
  Director Administrativo, que es de solo lectura).
- **Resuelto:** *generar* una alerta no es una acción de usuario. Las alertas nacen de un
  trigger sobre `evento_acceso` o de la Edge Function de validación. Ningún rol humano tiene
  INSERT sobre `alerta_seguridad`.
- *Atender* una alerta (`estado_alerta` → `ATENDIDA`) sí es acción de usuario, y es exclusiva
  de `RESPONSABLE_CONTROL_ACCESOS` (`CAC_ALERTA_ATENDER`).

### D5 — El Administrador del Sistema NO registra personas
- `matrizGeneralDePermisos.md` le daba X en "Registrar persona interna" y "Registrar persona externa".
- `ADM_Login_Roles_Permisos.md` §7.1 dice explícitamente lo contrario: *"No puede: registrar
  personal interno directamente en GPI. Registrar visitas o proveedores en GPE."*
- **Resuelto a favor de ADM_Login.** El administrador conserva `ADM_PERSONA_SELECT` y
  `ADM_PERSONA_UPDATE` (gestión del ciclo de vida / bajas de la entidad maestra), pero
  **no** `INSERT`. Es coherente con el principio de "separación por módulo".

### D6 — El guardia puede crear una `persona` EXTERNA (derivado)
- Ningún documento lo dice, pero es una consecuencia lógica de D3: un visitante que llega
  sin cita **no existe en la base de datos**, así que para crearle una
  `autorizacion_visita_diaria` primero hay que crear su `persona`.
- **Resuelto:** el guardia obtiene `CAC_PERSONA_EXTERNA_INSERT`, restringido por RLS a
  `tipo_persona = 'EXTERNA'`. No puede crear personas internas ni modificar personas existentes.
- ⚠️ *Esta es una inferencia, no una decisión documentada por el equipo. Confirmarla.*

### D7 — ❌ REVERTIDA: GPE **NO** registra biometría
> **Esta decisión fue anulada por §D20.** Se conserva el registro para explicar por qué.

*Razonamiento original (incorrecto):* "la única credencial del sistema es el rostro, así que un
externo con memorando no podría entrar sin rostro registrado" → se añadían
`GPE_BIOMETRIA_INSERT/UPDATE/SELECT`.

*Por qué era incorrecto:* el externo **sí puede entrar sin biometría** — lo hace por la vía
manual, identificándose con su cédula ante el guardia (§D20). El sistema tiene **dos vías de
validación**, no una.

**Estado final: `RESPONSABLE_PERSONAL_EXTERNO` NO tiene ningún permiso sobre
`registro_biometrico`.** Los permisos `GPE_BIOMETRIA_*` **no existen**.

### D8 — GPI/GPE crean vehículos directamente (no hay tabla de "solicitud")
- `ADM_Login_Roles_Permisos.md` §7.3/§7.4 mencionaba permisos como
  `GPI_VEHICULO_SOLICITAR_REGISTRO`, que implican un flujo de solicitud/aprobación.
- **Pero el Modelo de Datos no tiene ninguna entidad `SolicitudVehiculo`** entre sus 24 tablas.
- **Resuelto:** se descarta el flujo de solicitud (crearía una tabla nueva, y el principio
  rector es "priorizar reutilización de entidades antes que crear nuevas tablas").
  GPI y GPE hacen `INSERT` directo en `vehiculo` y en `persona_vehiculo`.
  ADM conserva el `UPDATE` / cambio de estado / baja de `vehiculo`, como exige el modelo §3.1
  (*"GPI y GPE solo consultan y generan asociaciones vía PersonaVehiculo"* → se amplía
  mínimamente a INSERT, porque de lo contrario nadie podría dar de alta un vehículo salvo ADM,
  y ADM no gestiona personal).

### D9 — ADM/GPI/GPE/PCO/CAC son módulos, no roles
- `matrizGeneralDePermisos.md` los usaba como si fueran roles de login, mezclados con
  "Director Administrativo" y "Guardia de Seguridad".
- **Resuelto:** los 7 roles reales están en `01_AUTENTICACION_Y_ROLES.md` §3. Los códigos de
  módulo nunca aparecen como filas en la tabla `rol`.

---

## Correcciones ya incorporadas al Modelo de Datos Consolidado

Estas ya vienen resueltas en el PDF y se listan aquí solo para que no se "re-descubran":
consolidación de `persona_vehiculo` en una sola tabla; `persona_interna_detalle` como
extensión 1:1 en vez de una tabla `Persona_Interna` separada; catálogo único
`categoria_persona`; entidad `empresa` nueva; `id_vehiculo` añadido a `evento_acceso`;
FKs de auditoría apuntando a `usuario_sistema` y no a `persona`; PK `id_alerta` añadida;
jerarquía recursiva `id_zona_padre` en `zona`; tabla `autorizacion_visita_diaria` nueva.
