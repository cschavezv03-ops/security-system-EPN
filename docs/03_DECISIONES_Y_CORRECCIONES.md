# 03 — Decisiones y Correcciones

> **Cómo numerar.** Cada decisión lleva un número único y se cita en el resto del repositorio como
> `§Dnn` (las dudas abiertas, como `§Vnn` en `99_DUDAS_PARA_EL_EQUIPO.md`). El número no se
> reutiliza nunca, aunque la decisión quede superada: se escribe una nueva que diga que sustituye
> a la anterior.
>
> Antes de añadir una, comprueba cuál es el siguiente libre:
>
> ```bash
> python3 scripts/verificar_numeracion_docs.py
> ```
>
> Ese script también avisa de números duplicados y de citas a decisiones que no existen. Se añadió
> el 20/07 después de que la ronda de ADM reutilizara sin querer D53-D58, ya ocupados por PCO: la
> colisión sobrevivió dos rondas porque cada una usaba un formato de encabezado distinto
> (`## §Dnn` frente a `### Dnn`) y ninguna búsqueda las veía juntas. Las de ADM pasaron a
> §D72-§D77.
>
> Los números **no van en orden dentro del documento**, y es a propósito: está agrupado por
> secciones temáticas y por rondas. Lo que importa es que un número no signifique dos cosas.


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

### D27 — Validación de datos en dos capas, con la BD como autoridad
- **Problema:** ningún campo tenía validación de formato. `persona.cedula` era `varchar(10)` a
  secas, los teléfonos texto libre, la placa solo `upper()`. La API REST de Supabase está
  expuesta: cualquier cliente con un token válido podía insertar basura sin pasar por el
  formulario.
- **Resuelto:** cada regla vive **dos veces**, a propósito:
  1. `supabase/migrations/20260716010000_funciones_validacion.sql` — funciones `IMMUTABLE`
     aplicadas como `CHECK`. **Es la autoridad.**
  2. `web/src/lib/validacion.ts` — el mismo algoritmo en TypeScript, solo para que el usuario
     vea el error antes de enviar y en español.
  Si cambias una regla, cámbiala en las dos. La duplicación es deliberada: la alternativa
  (validar solo en el cliente) deja la BD abierta, y (validar solo en la BD) da errores de
  Postgres ilegibles al usuario final.
- **Patrón:** el trigger **normaliza** antes de que el `CHECK` **juzgue**. Un guardia que teclea
  `0987654321` o `pdf-1234` no debe recibir un error: debe quedar guardado `+593987654321` y
  `PDF1234`. El CHECK solo rechaza lo que no se puede interpretar.
- **Excepción documentada:** `regla_acceso` **no** exige `horario_fin > horario_inicio`. El turno
  `NOCTURNO` existe (§D11, `turno`) y una regla de 22:00 a 06:00 es legítima.
- **Excepción documentada:** `persona.fecha_nacimiento` no tiene edad mínima. El CEC dicta cursos
  a menores (`persona_interna_detalle.curso`). Se valida por trigger, no por CHECK, porque
  depende de `current_date` y un CHECK exige inmutabilidad.

### D28 — `vehiculo.placa` se guarda canónica sin guion (`ABC1234`)
- **Decisión:** la columna guarda la forma canónica **sin guion y en mayúsculas**; la UI la
  muestra con guion vía `formatear_placa()` / `formatearPlaca()`.
- **Por qué:** en una sesión posterior se añadirá **lectura de placas por cámara (OCR)**, igual
  que el reconocimiento facial. Normalizando ambos lados a la misma forma, el match es una
  igualdad exacta y no depende de si la cámara distinguió el guion.
- **Formato (ANT):** 3 letras + 3 o 4 dígitos. La **1.ª letra** es la provincia y se valida
  contra las 24 asignadas (D y F no se usan). La **2.ª letra** es el tipo de servicio y **no se
  valida**: es `E` en vehículos del gobierno central y `M` en los de un GAD, y la EPN es
  universidad pública — restringirla bloquearía los vehículos de la propia Politécnica.
- **Fuera de alcance:** placas diplomáticas (`CC`, `CD`, `OI`, `AT`, `IT`), que usan otro formato.

### D29 — `estado_usuario` corta el acceso de verdad, por dos vías
- **Problema:** `usuario_sistema.estado_usuario` era decorativo. Un usuario `BLOQUEADO`
  conservaba su JWT, sus permisos y su capacidad de iniciar sesión: nadie leía la columna.
  Verificado contra el remoto: dos cuentas `BLOQUEADO` tenían 12 y 13 permisos vivos.
- **Resuelto** (`20260716030000_bloqueo_efectivo.sql`), con dos mecanismos **independientes**:
  1. `auth.users.banned_until` = 100 años (lo mismo que hace la Admin API con
     `ban_duration: '876000h'`) + borrado de `auth.sessions` y `auth.refresh_tokens` → GoTrue
     rechaza el login y lo echa de las sesiones abiertas.
  2. Guard `estado_usuario = 'ACTIVO'` dentro de `tiene_permiso()` y `permisos_efectivos()` →
     aunque conserve un JWT sin expirar (viven hasta 1 h), se queda sin un solo permiso y RLS le
     niega todo. Efecto inmediato.
- **Por qué las dos:** `banned_until` no invalida un JWT ya emitido, y el guard por sí solo no
  impide iniciar sesión. Cada una tapa el hueco de la otra.
- **`ACTIVO` es el único estado que permite entrar.** `INACTIVO`, `BLOQUEADO` y `DADO_DE_BAJA`
  cortan el acceso; se distinguen por intención administrativa, no por efecto técnico.
- **Coherente con "sin DELETE físico":** `DADO_DE_BAJA` **no** elimina de `auth.users`, es un ban
  permanente. La cuenta sigue existiendo para que la bitácora y los eventos históricos conserven
  su FK — que es justo lo que la regla persigue.

### D30 — El estado de la propia cuenta no lo cambia uno mismo
- **Problema:** `admin` era el **único** usuario con `ADM_USUARIO_DESBLOQUEAR`, `ADM_USUARIO_UPDATE`
  y `ADM_USUARIO_INSERT` (verificado contra el remoto). Bloquearse a sí mismo dejaba el sistema sin
  nadie que pudiera desbloquearlo. Mientras `estado_usuario` era decorativo no se notaba; con §D29
  aplicado sería un cierre permanente — ni siquiera podría volver a iniciar sesión.
- **Resuelto** (`20260717020441_guarda_autobloqueo.sql`), con dos triggers `BEFORE`:
  1. Nadie cambia el `estado_usuario` de su propia cuenta (`auth.uid() = new.id_usuario`).
  2. No se puede sacar de `ACTIVO` al último `ADMINISTRADOR_SISTEMA` activo, ni revocarle el rol.
- **En la BD, no en la interfaz:** esconder el botón no impide el mismo `UPDATE` por la API REST.
  La pantalla de ADM también lo explica, pero eso es cortesía, no la guarda.
- **`BEFORE` a propósito:** tiene que abortar antes de que `trg_sincronizar_estado_auth` (`AFTER`,
  §D29) escriba `banned_until` y borre las sesiones.
- **La regla mira roles, no permisos:** `ADMINISTRADOR_SISTEMA` es quien tiene por definición la
  gestión de usuarios (doc 01 §3); comprobarlo por rol es estable aunque se reasignen permisos.
- `auth.uid()` es nulo en migraciones, seed y Edge Functions con `service_role`: ahí no aplica la
  regla (1), que es lo correcto — el bootstrap del sistema no es un autobloqueo.

### D31 — Alta de usuarios: Edge Function sobre una persona existente
- **Problema:** no había forma de crear una cuenta desde el sistema; había que sembrarla con
  `scripts/seed_remoto.mjs`. Caso real: un encargado de módulo deja la EPN y entra su reemplazo.
- **Resuelto:** Edge Function `crear-usuario-sistema` (Auth Admin API), mismo patrón que
  `resetear-password-usuario`. `auth.users` está fuera del alcance de RLS: no hay `INSERT` posible.
- **Sobre persona existente e INTERNA:** `persona` es la maestra única propiedad de ADM (CLAUDE.md)
  y su alta es de GPI. La función se apoya en ella, no la duplica. Rechaza personas externas, no
  activas, o que ya tengan cuenta (una persona, una cuenta: si no, la bitácora no podría atribuir
  una acción a un humano concreto).
- **Verifica `ADM_USUARIO_INSERT` con el JWT de quien llama**, no con `service_role`.
- **Rollback explícito:** si falla la asignación del rol, se borra el usuario de auth recién creado.
  Una cuenta sin rol no tiene ningún permiso y quedaría huérfana.
- **Sobre añadir un módulo nuevo:** no es una operación de la interfaz. Un módulo es un prefijo de
  permisos (`ADM`/`GPI`/`GPE`/`PCO`/`CAC`) presente en `es_codigo_permiso()`, en `allowed_modules()`
  y en las políticas RLS de cada tabla. Añadir uno es una migración, no un alta de datos.

### D32 — La ortografía de la interfaz se resuelve al mostrar, no en la BD
- **Problema:** el usuario leía `DADO_DE_BAJA`, `DANO_FISICO` y `AUTENTICACION` (sin tilde) en
  pantalla, porque `Badge` pintaba el valor crudo de la BD y `humanizar()` solo bajaba a minúsculas.
- **Resuelto:** mapa `ETIQUETA` en `web/src/lib/catalogos.ts` con los 80 valores de catálogo que
  devuelven los CHECK reales (consultados desde `pg_constraint`), y `Badge` pasa por `humanizar()`.
- **Los valores de la BD NO cambian.** La convención de CLAUDE.md (catálogos en MAYÚSCULAS y sin
  tildes) es el contrato del backend: `AUTENTICACION` se guarda así y se muestra "Autenticación".
- Un valor nuevo que no esté en el mapa cae a la conversión automática: se verá aceptable aunque
  sin tildes, nunca como el código crudo.

### D33 — `sesion.ip_origen` estaba de adorno → oculto en la interfaz
- **Hallazgo:** 1 de 171 filas de `sesion` tenía IP (y era de un seed); 0 de 565 en
  `bitacora_sistema`. El frontend llamaba a `registrar_sesion()` sin pasar nunca `p_ip_origen`.
- **Decisión del usuario:** ocultar el campo de la interfaz (sesiones y bitácora). La columna se
  conserva: `sesion` y `bitacora_sistema` son históricos y el modelo de datos tiene 25 entidades
  cerradas.
- **Fallo de diseño anotado, no corregido:** la firma `registrar_sesion(p_ip_origen text)` deja que
  **el cliente declare su propia IP**, lo que para un campo de auditoría de seguridad no vale nada.
  Si algún día se quiere poblar, debe leerse en el servidor con
  `current_setting('request.headers')::json ->> 'x-forwarded-for'`, no recibirse por parámetro.

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

---

## Ronda de validaciones generales (2026-07-17) — reqs 9-38

> Implementación de `docs/New_Req/especificacion_validaciones_sistema_general.md`. Migraciones
> `20260717030000..030300`, Edge Functions y frontend. Decisiones aprobadas por el usuario.

### D34 — "Recordar sesión" y sesiones FUNCIONALES (supera §D10)
- **Conflicto:** §D10 dejó `sesion` como auditoría y `recordar_sesion` deshabilitado; los reqs
  29/30 exigen sesiones y "recordar sesión" funcionales.
- **Decisión del usuario:** seguir la nueva especificación. Se **supera D10** (queda como
  antecedente histórico, no se re-litiga hacia atrás).
- **Implementado:** `recordar_sesion` controla el almacén del token del proveedor
  (localStorage vs sessionStorage; **nunca** la contraseña). `sesion` se amplió
  (`fecha_ultima_actividad`, `user_agent`, `dispositivo_nombre`, `motivo_cierre`,
  `revocada_por`, `fecha_revocacion`) con estados nuevos `REVOCADA` y
  `CERRADA_CAMBIO_PASSWORD`. Timeout de inactividad (`SESION_INACTIVIDAD_MIN`) + expiración
  absoluta en `expirar_sesiones_vencidas()` (pg_cron). Revocación efectiva en GoTrue vía
  `revocar_sesiones_usuario()` / `revocar_mis_sesiones()` (borran refresh tokens + auth.sessions).

### D35 — RUC de sociedades: estructura vs algoritmo legado (req 14)
- El módulo 11 **deja de ser rechazo** para sociedades: el CHECK usa `es_ruc_estructural()`
  (13 dígitos, provincia, 3.er dígito 0-5/6/9, establecimiento; natural exige cédula válida).
  El módulo 11 se conserva como **advertencia** (`ruc_pasa_algoritmo_legado()`), y la
  verificación oficial se rastrea en `empresa.estado_verificacion_ruc` (default `NO_VERIFICADO`;
  no hay integración SRI). Cédula endurecida: rechazo de patrones de relleno (`es_relleno_obvio`).

### D36 — Turno de guardia con hora del servidor (req 34)
- `esta_en_turno_guardia(uuid, timestamptz)` en `America/Guayaquil`, nunca la hora del cliente.
  Entiende códigos (`MATUTINO/VESPERTINO/NOCTURNO`, ventanas en `parametro_sistema`) **y** rangos
  literales `HH:MM–HH:MM` (dato heterogéneo del remoto, §V4). Cruce de medianoche + tolerancia.
  Barrera dura en la Edge Function `registrar-evento-acceso` (el guardia escribe con service_role,
  así que el trigger de `evento_acceso` no cubre ese camino) y trigger para escrituras REST.
  Otros roles **no** se ven afectados. Intentos denegados → `bitacora_sistema`.

### D37 — Máximo 2 vehículos y registro atómico (req 35)
- Trigger `enforce_max_vehiculos_activos` con `pg_advisory_xact_lock` por persona (a prueba de
  concurrencia). Cuentan las relaciones `ACTIVA` de tipo `PROPIETARIO`/`CONDUCTOR_AUTORIZADO`
  vigentes; el límite es `MAX_VEHICULOS_POR_PERSONA`. RPC `crear_vehiculo_con_propietario`
  (SECURITY INVOKER, respeta RLS) crea vehículo + relación en una transacción: si falla la
  asociación, no queda vehículo huérfano. Índices únicos: relación activa persona-vehículo y
  un único PROPIETARIO activo por vehículo. **Múltiples roles activos por usuario SÍ se permiten**
  (verificado: `guardia_demo` tiene 2); solo se prohíbe duplicar el mismo rol activo.

### D38 — Recuperación de contraseña: flujo nativo, sin tabla propia (req 31)
- Se usa `resetPasswordForEmail` de Supabase Auth (administra token, expiración, un solo uso y
  rate limiting; spec §5.4). **No hay SMTP** en el proyecto: el flujo está completo y la respuesta
  es neutral (no revela si la cuenta existe), pero el ENVÍO queda `NO_VERIFICADO` hasta configurar
  SMTP. Tras el cambio se revocan todas las sesiones y se redirige al login sin iniciar sesión.
- Sin correo autogenerado (req 38): el visitante externo se guarda con `persona.correo = NULL`.

### D40 — Bloqueo por intentos fallidos: proxy de login + `banned_until`
- **Hallazgo:** `usuario_sistema.intentos_fallidos` era una columna decorativa (nadie la escribía)
  y los parámetros `MAX_INTENTOS_LOGIN` (5) y `TIEMPO_BLOQUEO_CUENTA_MIN` (15) no los leía nadie.
  Se podían probar contraseñas de forma ilimitada: vulnerable a fuerza bruta.
- **Lugar ideal descartado:** el Auth Hook `password_verification_attempt` de GoTrue, que el
  proveedor invoca en cada verificación y no se puede esquivar. **Requiere plan de pago**
  (HTTP 402 al activarlo). La función queda escrita y con permisos; activarla el día que se
  contrate un plan superior no exige tocar código.
- **Decisión (plan gratuito):** la política vive en `registrar_intento_login()` y la aplica la
  Edge Function `iniciar-sesion`, que hace de proxy del login. **La pieza que lo hace real** es
  que al bloquear se escribe `auth.users.banned_until`: desde ese momento GoTrue rechaza el
  acceso aunque se llame a `/auth/v1/token` directamente. Como es una marca de tiempo, el
  desbloqueo a los 15 minutos es automático, sin tarea programada.
- **Dos bloqueos distintos a propósito:** `estado_usuario = 'BLOQUEADO'` es administrativo y
  permanente (ban de 100 años, §D29); `bloqueado_hasta` es temporal y caduca solo. Nunca se
  acorta un ban administrativo al aplicar el temporal.
- Desbloqueo manual: `desbloquear_intentos_login()` (exige `ADM_USUARIO_DESBLOQUEAR`), con su
  propio botón en ADM → Usuarios, y también al reactivar la cuenta.

### D39 — Ningún error crudo del proveedor llega al usuario (req 25)
- **Hallazgo:** `mensajeError()` devolvía `error.message` tal cual, así que el usuario veía
  textos en inglés del proveedor ("Invalid login credentials") e incluso detalle de SQL
  ("violates check constraint ..."), contra el req 25 y su regla de no exponer errores crudos.
- **Decisión:** toda traducción vive en `web/src/lib/errores.ts`. Se traduce por **código estable**
  del proveedor primero (`invalid_credentials`, `user_banned`, …), luego por texto, y las
  restricciones de base se traducen **por nombre de constraint** (`persona_cedula_valida` →
  "La cédula no es válida"). Las violaciones de RLS se muestran como "No tiene permiso…", sin
  revelar la tabla.
- **Los mensajes que lanzan nuestras propias funciones SQL ya están en español y se dejan pasar**;
  cualquier mensaje desconocido se sustituye por uno genérico y se registra en consola para
  depuración. Nunca se muestra texto en inglés, SQL, tokens ni trazas.

---

# Ronda de mejoras del módulo ADM (2026-07-18) — Requerimientos_ADM

Origen: `docs/New_Req/Requerimientos_ADM.docx`, revisión de admin@epn.edu.ec y
gary.defas@epn.edu.ec sobre el módulo ya desplegado.

### D41 — Usuarios y roles son un solo apartado

"Asignaciones de rol" desaparece como pantalla. La ficha del usuario muestra y gestiona sus
roles, con fecha de asignación y fecha de estado (la de revocación si está revocado, la de
asignación si sigue activo). Se conservan los permisos `ADM_USUARIO_ROL_*`: son los que
decide la propia pantalla para mostrar u ocultar las acciones de asignar y revocar.

Un usuario puede tener **varios roles activos** — el modelo ya lo permitía y hay una cuenta
así en la base (`guardia_demo`), así que la pantalla lista todos, no uno.

### D42 — La unidad de medida de un parámetro es una columna, no parte del nombre

`parametro_sistema.unidad_medida` con CHECK sobre 12 valores. Antes la unidad viajaba dentro
de `nombre_parametro` ("Tiempo de sesion (min)"): dato disfrazado de etiqueta, imposible de
filtrar o validar. `HORA_DEL_DIA` marca los parámetros cuyo valor es un instante ("06:00"),
que no son una magnitud.

### D43 — La categoría se explica con una descripción; el ámbito ya existía

`categoria_persona.descripcion`, NOT NULL. `nombre_categoria` **se eliminó** (migración
`20260718210421`): repetía el código en versión legible ("Docente" para DOCENTE), así que era
un dato mantenido a mano que podía desincronizarse del código al que describía. Donde hacía
de etiqueta corta, la interfaz deriva el texto con `humanizar(codigo_categoria)`.

### D44 — Auditoría se resuelve con una vista, no con columnas nuevas

`v_auditoria` sobre `bitacora_sistema`. Traduce el nombre de la tabla a lenguaje llano,
resuelve `id_entidad_afectada` contra la tabla que corresponda, distingue **quién ejecutó**
de **sobre quién recayó**, y trae entrada/salida de la sesión cuando el evento es de sesión.

Se descartó añadir `id_usuario_afectado` y `fecha_salida` a la bitácora: es una tabla
histórica de solo INSERT (CLAUDE.md), así que columnas nuevas dejarían vacíos los 600+
registros ya escritos. La vista funciona sobre todo el histórico desde el primer día.

La vista lleva `security_invoker = true`. Cruza `persona`, `usuario_sistema` y `sesion`: como
SECURITY DEFINER habría sido exactamente la fuga que ya ocurrió una vez (§V7).

**El cambio se expone dos veces**: `datos` (texto plano, para el CSV) y `cambios` (jsonb
`[{campo, antes, despues}]`, para la interfaz). Traducir los valores en SQL habría obligado a
duplicar en la base el catálogo de etiquetas de `web/src/lib/catalogos.ts`.

### D45 — Las asociaciones persona-vehículo se gestionan desde la ficha del vehículo

Solo en ADM. GPI y GPE conservan su pantalla de asociaciones: ahí el alta de vínculos es
parte del trabajo diario, no una excepción administrativa. `ResourceConfig` gana
`detalleExtra` para esto: el hueco del cuerpo del panel de detalle, frente a `accionDetalle`,
que es un botón del pie.

### D46 — Biometría: se dice dónde está el rostro, nunca se muestra

"Referencia del rostro" (id corto + nombre del archivo) y "Lugar de almacenamiento" (bucket
de Storage, y si hay descriptor también el vector en la base). Ambas se derivan de
`path_storage`; la consulta no pide el archivo ni firma ninguna URL. Doc 02 nota ⁴ intacta.

---

## Ronda GPE + GPI (`Requerimientos_GPE.docx`, `Requerimientos_GPI.docx`)

### D47 — El estado de un memorando lo calculan sus fechas, no una columna editable

GPE reportó el síntoma con precisión: *"El memorando realmente ya no está vigente pero el combo
box aparece como vigente. Si le pongo guardar cambios no se pone vigente porque la regla está
ligada exclusivamente a las fechas de vigencia, sin embargo, ese apartado sigue ahí."*

El acceso **sí** se denegaba correctamente: `vista_vigencia_acceso` filtra por
`current_date between fecha_inicio and fecha_fin` desde el principio. Lo que fallaba era lo que
se mostraba: `estado_memorando` se quedaba en VIGENTE para siempre porque nada lo actualizaba.
Los tres memorandos sembrados vencieron el 17/07 y seguían anunciándose como vigentes.

El reparto queda así, y es el mismo criterio para las autorizaciones de visita:

| | Dónde vive | Quién lo decide |
|---|---|---|
| VIGENTE / VENCIDO / PROGRAMADO / CADUCADA | Se calcula al mostrar | El calendario |
| ANULADO / REVOCADA | Columna almacenada | Una persona, con motivo obligatorio |

`estado_memorando_efectivo()` y `estado_autorizacion_efectivo()` en la base;
`web/src/lib/vigencia.ts` como espejo, para no consultar la base por cada fila de un listado.
Una tarea de `pg_cron` sincroniza el valor almacenado cada día a las 00:05 de Ecuador, para que
la columna no vuelva a divergir; entre ejecución y ejecución manda el cálculo.

De las dos opciones que ofrecía el documento ("borrarlo o ponerle como campos en gris") se
eligió la segunda, y se añadió aparte una acción **Anular memorando**: el combo cubría un caso
legítimo —retirar la autorización antes de que venza— que borrarlo sin más habría eliminado. La
alternativa que se usaba hasta ahora, acortar la `fecha_fin`, falsea las fechas del documento
en papel.

### D48 — El número de memorando se teclea; la base garantiza lo que garantizaba el generador

GPE §3: *"El atributo numero_memorando ahora deberá ser un varchar para poder agregarlo a mano,
es decir que no puede ser automático."* El generador producía `MEM-MRQUHXKD`, que no se parece
a ningún memorando real de la Politécnica.

Sin patrón institucional obligatorio (§V3: cada dependencia numera a su manera), pero sí una
forma mínima en `es_numero_memorando()`: 3 a 50 caracteres, con al menos un dígito, y único.
Los tres números autogenerados se renumeraron a `EPN-DA-2026-000N-M`.

### D49 — Los campos del alta dependen de la categoría, y la categoría va primero

GPI: *"los campos de la interfaz deben ser dinámicos ... dependiendo del tipo de persona que se
elija habrá campos en la interfaz que serán bloqueados"*. El código único es solo del
estudiante (con trigger en la base, no solo en el formulario) y la empresa solo del personal de
empresa de servicio. `contrato` pasa de texto libre a catálogo FIJO/TEMPORAL — el dato sembrado
demostraba por qué: un docente con contrato "Si".

La empresa se pide en el **alta de la persona**, no en "Datos internos" como sugería el
documento: la columna `persona.id_empresa` ya existía y duplicarla en
`persona_interna_detalle` habría creado dos sitios donde guardar el mismo dato.

### D50 — GPI y GPE también gestionan las asociaciones desde la ficha del vehículo

Revierte la excepción de §D45. Ambos equipos pidieron en esta ronda lo mismo que tiene ADM, así
que los tres módulos se comportan igual y la tarjeta "Asociaciones" desaparece de los tres.
`AsociacionesVehiculo` pasa a estar parametrizado por módulo: comprueba
`{MODULO}_PERSONA_VEHICULO_*` y solo ofrece personas de su ámbito (GPI internas, GPE externas).

### D51 — El guardia autoriza visitas desde la garita, sin permisos nuevos

GPE §13 preguntaba si el caso de uso de "Ingresos (visitas sin memorando)" debía presentarse en
el rol de guardia, y cómo registraría el guardia a la persona externa.

Resultó que **el guardia ya podía hacerlo**: tiene `CAC_AUTORIZACION_INSERT` y
`CAC_PERSONA_EXTERNA_INSERT`, y las políticas RLS `autorizacion_visita_insert_guardia` y
`persona_insert_guardia` ya lo contemplaban. Lo que faltaba era la pantalla. Por eso esta ronda
**no toca la matriz de permisos** (doc 02 intacto): se añadió el componente `AutorizarVisita`
a la vista de garita, con el orden de la garita —cédula primero, alta solo si no existe— y
siempre para el día de hoy, porque un guardia autoriza a quien tiene delante.

### D52 — La fecha de referencia del sistema es la de Ecuador, no la de UTC

**Bug encontrado durante esta ronda, ajeno a lo que pedían los documentos.** Apareció porque
una prueba de vigencia empezó a fallar sola a las 19:00; no era la prueba.

El servidor corre en UTC y todo el sistema usaba `current_date` (base) y `toISOString()`
(interfaz). Ecuador va cinco horas por detrás, así que **desde las 19:00 hora local ambos
devolvían ya el día siguiente**. Efectos:

- `vista_vigencia_acceso` dejaba de reconocer las autorizaciones de visita del día. Un
  visitante con permiso válido era **denegado en la garita** durante las últimas cinco horas de
  cada jornada.
- Un memorando cuyo último día era hoy dejaba de autorizar cinco horas antes, contradiciendo
  §D24 ("`fecha_fin` inclusiva").
- Al registrar una visita, la fecha propuesta por defecto era mañana.
- `es_fecha_nacimiento_valida` aceptaba como pasada una fecha que en Ecuador todavía es futura.

Lo llamativo es que la Edge Function `registrar-evento-acceso` **ya lo hacía bien**: evalúa los
horarios de CAC con `America/Guayaquil` explícito. La base se había quedado atrás, así que en
un mismo ingreso la comprobación de horario usaba la hora de Ecuador y la de vigencia la de
UTC. Nadie lo notó porque las pruebas manuales se hacen de día.

Ahora hay una sola fuente para esto: `public.hoy_ecuador()` en la base y `hoyISO()` en
`web/src/lib/format.ts`, ambas sobre `America/Guayaquil`. Se usa el nombre de la zona y no un
desplazamiento fijo de -5: Ecuador continental no aplica horario de verano hoy, pero eso es una
decisión política, no una constante.

De paso, `vista_vigencia_acceso` pasa a excluir los memorandos **anulados** (§D47): sin eso, un
memorando anulado seguiría autorizando el ingreso mientras sus fechas siguieran corriendo.

## §D53 — Una zona está en servicio o no lo está: se retira BLOQUEADA

**Conflicto:** el modelo de datos daba a `zona.estado_zona` tres valores —ACTIVA, INACTIVA y
BLOQUEADA— y PCO preguntó si tenían sentido los tres para una zona física de la EPN.

**Decisión:** quedan **ACTIVA e INACTIVA**. BLOQUEADA no aportaba nada: operativamente era
indistinguible de INACTIVA —en ambas no pasa nadie—, ninguna pantalla ni ninguna regla de CAC
las trataba distinto, y obligaba a elegir entre dos palabras para el mismo hecho. Un catálogo
con una opción que nadie sabe cuándo usar es una fuente de datos inconsistentes.

Si en el futuro hace falta distinguir "fuera de servicio por obra" de "cierre de emergencia",
eso pide un campo de motivo, no un estado más.

## §D54 — Un punto de control no falla: falla el dispositivo que hay en él

**Conflicto:** `punto_control.estado_punto` admitía FALLA, y PCO preguntó cómo puede fallar un
punto de control.

**Decisión:** tiene razón, y se retira. Un punto de control es un **lugar** (una puerta, una
garita); no es un aparato y no se avería. Lo que se avería es el `dispositivo` instalado en él,
y esa tabla sí conserva `FALLA_DE_RED` y `DANO_FISICO`. Un punto solo puede estar **ACTIVO** o
en **MANTENIMIENTO** (cerrado a propósito). Las filas que estaban en FALLA pasaron a
MANTENIMIENTO, que es lo que querían decir.

Corolario: `dispositivo` **conserva** su campo de estado pese a que PCO pedía revisarlo también.
Ahí sí describe algo real. Lo que se hizo fue sacarlo del formulario de alta: un dispositivo se
instala funcionando, y la avería se registra después.

## §D55 — La jerarquía de zonas es Campus → Edificio → Parqueadero

**Conflicto:** el combo "Zona padre" ofrecía todas las zonas registradas, así que un parqueadero
podía colgar de otro parqueadero, y `validar_jerarquia_zona()` solo exigía que el padre fuese un
CAMPUS, fuera cual fuera el hijo.

**Decisión:** cada tipo tiene un único padre válido — CAMPUS es la raíz, EDIFICIO cuelga de
CAMPUS y PARQUEADERO de EDIFICIO. Se aplica en el trigger (que es lo que manda) y se refleja en
el combo, que ahora solo ofrece el nivel inmediatamente superior.

El trigger **no revalida** una edición que no toca ni el tipo ni el padre. Sin esa excepción, las
zonas anteriores a la regla —hay una, §V24— quedarían congeladas: no se les podría corregir ni
el nombre.

## §D56 — El estado no se elige al registrar, se cambia después

**Conflicto:** PCO lo señaló en zona, punto de control y dispositivo: *"no tiene sentido marcarla
como activa o inactiva al registrarla"*. Es el mismo comentario que ya habían hecho ADM y GPE.

**Decisión:** el combo de Estado desaparece de todos los formularios de **alta** de PCO. Todo
nace en servicio (ACTIVA / ACTIVO / OPERATIVO). Sigue estando en la **edición**, que es donde
cambiar un estado es una decisión consciente sobre algo que ya existe.

Y como contrapartida obligatoria: se añadió el botón **Reactivar**
(`ResourceConfig.reactivar`). Inactivar era hasta ahora un viaje de ida — la ficha ofrecía
"Inactivar" y ninguna forma de deshacerlo salvo editar el registro a mano.

## §D57 — El turno del guardia deja de ser texto libre

**Conflicto:** `guardia_punto_control.turno` era un `varchar` que contenía tanto `"07:00–17:00"`
como `"MATUTINO"` (§V10). `esta_en_turno_guardia()` (req 34) lo interpretaba con una expresión
regular y un catálogo de parámetros, y lo que no encajaba no habilitaba a nadie.

**Decisión:** las horas pasan a ser columnas (`hora_inicio`, `hora_fin`) y son la fuente de
verdad; el texto `turno` se **deriva** de ellas por trigger, así que no pueden discrepar.
`esta_en_turno_guardia()` usa las columnas cuando existen y solo cae al texto para las filas que
aún no se han estructurado — no se ha duplicado la regla del req 34, se ha reforzado.

Sobre *"los guardias únicamente podrán entrar a su usuario durante su turno"*: la restricción
**ya existía** a nivel operativo (barrera dura en `evento_acceso` + `verificar_turno_guardia_actual()`
en `GuardiaView`). No se ha convertido en un bloqueo del **inicio de sesión**: dejar a un guardia
sin poder ni entrar al sistema por un turno mal tecleado es peor que el problema que resuelve.
Lo que se añadió es visibilidad: la pantalla de asignaciones dice quién está en turno ahora.

## §D58 — Dos "bugs de pantalla" de PCO que eran en realidad RLS

Merece quedar escrito porque el síntoma despista y volverá a pasar.

**"En Asignaciones de guardia no aparece el nombre del guardia."** La política
`usuario_sistema_select` solo permitía leer la propia fila o exigía `ADM_USUARIO_SELECT`, que el
Responsable de Puntos de Control no tiene. Cuando RLS filtra un **embed** de PostgREST, la
consulta **no da error**: devuelve `guardia: null`. La columna pintaba "—" y parecía un fallo del
`render`. Se añadieron dos políticas acotadas: quien gestiona o supervisa asignaciones puede leer
las cuentas que son guardias, y las personas detrás de ellas. Nada más.

**"Cambiar heidy.tenelema por Heidy Tenelema."** Parecía un dato mal escrito. No lo era: el
encabezado muestra el nombre de la `persona` vinculada y, si no puede leerla, cae al nombre de
cuenta (`AuthProvider.tsx:98`). **Ninguna** política dejaba a un usuario leer su propia ficha de
persona. Renombrar la cuenta habría tapado el síntoma en una fila dejando igual a GPI, GPE y PCO.
Se añadió `persona_select_propia`, y con ella todos los roles muestran ya su nombre real.

**Regla para la próxima vez:** ante un campo que aparece vacío o "—" en una pantalla, comprobar
la política antes que el componente. Un embed bloqueado por RLS se ve exactamente igual que un
dato que no existe.

## §D59 — Un turno de guardia tiene límites de jornada y de descanso

**Conflicto:** nada impedía registrar un turno de catorce horas seguidas, ni encadenar dos turnos
sin descanso entre ellos. Los datos sembrados lo demostraban: había un turno de 14 h y otro de
10 h, y un guardia con dos asignaciones activas a la vez (§V26). El sistema aceptaba cualquier
cosa que fuera un par de horas válidas.

**Decisión:** tres reglas, con los límites en `parametro_sistema` y no en el código, porque son
política laboral y pueden cambiar:

1. **Ningún turno pasa de 12 horas** (`JORNADA_MAXIMA_GUARDIA_HORAS`). Referencia: Código del
   Trabajo del Ecuador — 8 h ordinarias (art. 47) ampliables con extras hasta 12 (art. 55).
2. **Entre 8 y 12 horas se avisa sin bloquear.** Es legal, pero son horas extra y quien registra
   la asignación debería saber lo que está firmando. Para esto se añadió `FieldConfig.aviso`,
   que hasta ahora no existía: el motor solo tenía errores que bloquean y textos fijos.
3. **12 horas de descanso continuo entre jornadas** (`DESCANSO_MINIMO_GUARDIA_HORAS`). Se mide
   sobre la ventana que ocupan todos los turnos activos del guardia ese día, de punta a punta;
   lo que sobra hasta las 24 h es su descanso.

Consecuencia deliberada de la regla 3: un guardia **no puede tener dos asignaciones cuya suma se
extienda más de 12 horas al día**. Dos turnos pegados (07:00–17:00 y 17:00–19:00) siguen siendo
válidos —12 h justas de trabajo y 12 de descanso—, pero repartir la jornada de 06:00 a 21:00 ya
no. Es lo que se pretendía: en la vida real un guardia tiene un turno, no dos.

Lo que la regla 3 **no** cubre son los turnos que cruzan medianoche, donde "la ventana del día"
no está definida: ahí se aplican solo las reglas 1 y 2 y el solapamiento (§V30).

**Un fallo que merece quedar escrito.** La primera versión de `duracion_turno_min()` calculaba el
turno nocturno como `(hora_fin + interval '24 hour') - hora_inicio`, y devolvía **−16 horas** para
22:00–06:00. En aritmética de `time`, sumar 24 h no lleva al día siguiente: **envuelve**. El
efecto no era cosmético — una duración negativa nunca supera el máximo, así que *todos* los turnos
nocturnos se saltaban la validación de jornada, y uno de 22:00 a 21:00 (23 horas) se habría
aceptado. Ahora se calcula sobre minutos desde medianoche, igual que `tramos_turno()`. **No usar
aritmética de intervalos sobre `time`.**

## §D60 — Una asignación sobre un punto en mantenimiento se marca en pantalla

**Conflicto:** la asignación de "Guardia Demo" se veía impecable —vigente, dentro de horario— pero
el guardia no podía operar: `esta_en_turno_guardia()` (req 34) exige que el punto de control esté
ACTIVO, y el suyo estaba en MANTENIMIENTO. Nada en la pantalla lo decía.

**Decisión:** el comportamiento del sistema es el correcto y no se toca — un guardia no puede
trabajar en un punto que está en mantenimiento o averiado. Lo que faltaba era **decirlo**: la
lista y la ficha de asignaciones marcan ahora las que apuntan a un punto no operativo, para que
PCO sepa que a ese guardia hay que reasignarlo a otro punto.

Los estados de `punto_control` siguen siendo manuales: nada los cambia solo. Que un punto entre en
mantenimiento y deje a su guardia sin poder trabajar es una consecuencia visible, no automática.

## §D61 — Una lista vacía por un filtro no puede decir que no hay datos

**Conflicto:** el mensaje de lista vacía solo contemplaba la barra de búsqueda. Con un filtro de
columna aplicado que no casaba con nada, la pantalla mostraba *"No hay puntos de control
registrados"* — afirmando que no existían datos mientras los ocultaba ella misma. Había seis.

Lo detectó TestSprite: el agente aplicó el filtro de zona, leyó ese mensaje y concluyó que la
lista estaba vacía. Un usuario real habría concluido lo mismo, y pensaría que perdió los datos.

**Decisión:** el mensaje distingue los dos casos. Si algo está filtrando, dice **"Sin
resultados"**, cuántos registros hay en total y ofrece un botón para **quitar los filtros** —
salir del callejón desde donde se ve el problema, sin tener que buscar el desplegable que lo
causó. "No hay X registrados" queda reservado para cuando de verdad no hay ninguno.

Es un cambio del motor genérico, así que vale para todas las pantallas del sistema, no solo PCO.

---

# Ronda de CAC (Control de Accesos) — §D62 a §D69

## §D62 — La cadena de validación se separa en pasos con motivo propio

**Conflicto:** `evaluarReglaAcceso` resolvía categoría, garita y horario en una sola consulta a
PostgREST. Cuando no encontraba ninguna regla, no había forma de saber cuál de las tres
condiciones había fallado, y la función devolvía siempre `FUERA_DE_HORARIO`. RNF-CA-004 pide
justo lo contrario: *"el motivo correspondiente sin utilizar mensajes ambiguos o genéricos"*.

**Decisión:** tres pasos separados, en el orden que fija RF-CA-019, con cortocircuito:

1. ¿Existe alguna regla ACTIVA para la categoría? → `SIN_REGLA_ACCESO` (RF-CA-005)
2. ¿Alguna de ellas autoriza esta garita? → `GARITA_NO_AUTORIZADA` (RF-CA-007)
3. ¿Alguna está vigente a esta hora? → `FUERA_DE_HORARIO` (RF-CA-006)

**Lo que ese fallo escondía:** seis docentes y seis administrativos no tenían **ninguna regla de
acceso activa** y por tanto no podían entrar al campus. Con el mensaje antiguo, el síntoma era
"fuera de horario" a cualquier hora del día, y se leía como un problema de horarios. Las reglas
que faltaban se sembraron en `20260719223310`, y la vista `vista_categoria_sin_regla` deja el
hueco a la vista de CAC antes de que alguien se quede fuera de la garita.

## §D63 — `requiere_memorando` deja de ser decorativo

**Conflicto:** RF-CA-001 lo dice con todas las letras: *"si es que requiere memorando hay que
validar que realmente esté ligado a un memorando, no tiene que ser un campo de decoración"*.
La validación solo comprobaba el memorando en la rama de personas **externas**. Una regla que
declaraba exigir memorando dejaba pasar a cualquier persona interna sin mirar si lo tenía.

**Decisión:** la comprobación depende de la REGLA, no del ámbito de la persona. Y se distingue
"no tiene ninguno" de "lo tiene vencido" (RF-CA-009 frente a RF-CA-010), porque son dos
problemas con dos soluciones distintas: al primero hay que tramitarle un memorando, al segundo
renovárselo. Decirle "memorando vencido" a quien nunca tuvo uno manda al guardia y a la persona
a buscar un papel que no existe.

## §D64 — El estado de la persona se comprueba en los dos ámbitos

RF-CA-008 no distingue interno de externo: *"únicamente los usuarios con estado Activo podrán
continuar"*. La validación solo miraba `persona.estado` en la rama interna, así que **una
persona externa bloqueada entraba** si su memorando seguía vigente. Ahora es el primer paso de
la cadena, antes de mirar reglas.

## §D65 — Una regla de acceso puede aplicar en varias garitas

**Conflicto:** RF-CA-002 y RF-CA-007 hablan de "garitas" en plural, pero `regla_acceso` tenía
una sola FK a `punto_control`. Autorizar a los docentes por las tres garitas del campus obligaba
a crear tres reglas iguales y a mantenerlas sincronizadas a mano.

**Decisión:** tabla N:M `regla_acceso_punto_control` y se retira la columna. La semántica de
"sin filas" se conserva exactamente igual que la de la columna a NULL:

> **Sin ninguna garita asociada, la regla aplica en TODAS.**

Es la parte que hay que tener presente al leer la pantalla: cero filas no es "esta regla no vale
en ninguna parte", es lo contrario. Por eso el listado dice "Todas las garitas" y no un guion.

## §D66 — Persona desconocida es un evento, no un error de pantalla

**Conflicto:** RF-CA-021 exige registrar el intento cuando el rostro no coincide con nadie. Era
**imposible**: `evento_acceso.id_persona` era NOT NULL, y la Edge Function devolvía 404 sin
escribir nada. El caso que más interesa registrar era el único que no se registraba; en la
garita se veía como un texto rojo que desaparecía al recargar la página.

**Decisión:** `id_persona` pasa a nullable, con un CHECK que ata ese hueco a su único caso
legítimo (`resultado = DENEGADO` y motivo `PERSONA_DESCONOCIDA%`). En las pantallas, un evento
sin persona se lee **"Persona desconocida"**, nunca "—": pintarlo como un dato que falta lo
convierte en una fila que nadie mira.

## §D67 — Dos umbrales biométricos en vez de uno, calibrados con caras reales

**Conflicto:** el umbral era 0.38 de confianza (= 0.62 de distancia L2). Medido sobre el banco
real, las personas **distintas** se separan a partir de **0.691**:

| Par | Distancia L2 |
|---|---|
| Guerra ↔ Jumbo | 0.6910 |
| Guerra ↔ Jaramillo | 0.6949 |
| Jumbo ↔ Jaramillo | 0.7423 |

Es decir: **0.071 de margen** entre el umbral y el impostor más parecido del banco. Un cambio de
luz o de ángulo mueve un descriptor bastante más que eso. El sistema estaba a un mal reflejo de
autorizar a la persona equivocada, y un umbral "de manual" (el 0.6 clásico de dlib) no lo revela
hasta que se prueba con caras de verdad.

**Decisión:** dos umbrales, que es lo que hace un control de acceso real:

| Confianza | Qué ocurre |
|---|---|
| ≥ 0.45 (`UMBRAL_BIOMETRIA`) | Se autoriza sin intervención |
| 0.35 – 0.45 (`UMBRAL_BIOMETRIA_REVISION`) | El guardia confirma visualmente |
| < 0.35 | `PERSONA_DESCONOCIDA` (RF-CA-021) |

Margen contra el impostor más cercano: **0.141**, el doble que antes. Y el impostor más parecido
(0.309) ni siquiera llega a la banda de revisión.

**Por qué no se sube más:** por encima de 0.50 empiezan a caerse capturas legítimas con
mascarilla, gafas o contraluz. Un guardia al que el rostro le falla tres de cada diez veces deja
de usarlo y teclea la cédula, y un umbral que nadie usa no protege nada.

**Recalibrar cuando haya más rostros enrolados.** Tres personas son pocas para fijar el suelo de
"personas distintas"; el número puede bajar con un banco mayor.

## §D68 — El OCR de placas se corrige por posición antes de por parecido

**Conflicto:** un OCR sobre una placa metálica no falla al azar: confunde siempre los mismos
caracteres (O/0, I/1, S/5, B/8, Z/2, G/6). Una comparación exacta rechaza `PDF1Z34` cuando la
placa es `PDF1234`, y el guardia acaba tecleándolo todo a mano.

**Decisión:** dos correcciones, en este orden, y la segunda es deliberadamente cobarde.

1. **Posicional** (`corregir_placa_ocr`, espejo en `web/src/lib/placas.ts`). La placa ecuatoriana
   tiene forma fija: tres letras y luego tres o cuatro dígitos. Un dígito leído en las tres
   primeras posiciones es necesariamente un error, y una letra en la parte numérica también. Se
   corrige por posición, sin mirar la base de datos. **No puede convertir una placa en otra placa
   válida distinta**, porque solo toca caracteres que estaban en la clase equivocada.
2. **Tolerancia difusa** (`identificar_placa`, `levenshtein` ≤ `TOLERANCIA_PLACA_CARACTERES`).
   Aquí sí se puede confundir un vehículo con otro, así que **solo se aplica cuando UNA sola
   placa registrada queda a esa distancia**. Con dos candidatas la función devuelve
   `ambigua = true` y no elige ninguna. Escoger "la más parecida" entre dos sería autorizar un
   vehículo por parecido, que es exactamente lo que RF-CA-015 prohíbe.

Cualquier lectura que haya hecho falta corregir se le enseña al guardia antes de usarla: el
sistema propone, la persona confirma.

## §D69 — Un horario de regla puede cruzar la medianoche

`regla_acceso` nunca exigió `fin > inicio`, a propósito: el turno nocturno es legítimo. Pero la
validación comparaba `inicio <= hora <= fin` en la propia consulta, así que **una regla nocturna
no casaba nunca**: a las 23:00 fallaba `hora <= 06:00` y a las 02:00 fallaba `22:00 <= hora`.

Es el mismo error que ya apareció en los turnos del guardia (§D59). La comparación se parte en
dos tramos cuando `fin < inicio`. En el formulario, teclear un horario que cruza la medianoche
muestra un **aviso** (no bloquea): es válido, pero se teclea por error con demasiada facilidad.

## §D70 — El umbral biométrico, ya medido: la estimación era correcta pero el margen era otro

**Qué se hizo:** §D67 fijó `UMBRAL_BIOMETRIA = 0.45` con tres rostros enrolados, midiendo solo
lo que se podía medir con una foto por persona: a qué distancia están dos personas **distintas**.
Faltaba la otra mitad —a qué distancia está la **misma** persona en dos fotos— y sin ella el
umbral era una estimación prudente.

Con LFW (*Labeled Faces in the Wild*) y su protocolo de pares etiquetados, medido con el mismo
modelo y el mismo detector que usa la garita:

| | n | min | p5 | mediana | p95 | max |
|---|---|---|---|---|---|---|
| **Misma persona** | 446 | 0.250 | 0.325 | 0.448 | 0.588 | 0.948 |
| **Personas distintas** | 416 | 0.566 | 0.681 | 0.829 | 0.963 | 1.087 |

**El valor no cambia.** La estimación estaba bien puesta:

| Confianza | Distancia | FAR (entra quien no es) | FRR (se rechaza a quien sí es) |
|---|---|---|---|
| 0.50 | 0.50 | 0.00 % | 27.35 % |
| **0.45** | **0.55** | **0.00 %** | **10.99 %** ← el vigente |
| 0.40 | 0.60 | 0.72 % | 4.48 % |
| **0.35** | **0.65** | 2.88 % | 4.04 % ← suelo de la banda de revisión |
| 0.30 | 0.70 | 7.93 % | 2.91 % |

A 0.45 **no se cuela ni un impostor de los 416 medidos**, y el 11 % de intentos legítimos que se
rechazan no se pierden: caen en la banda de revisión, donde el guardia confirma.

**Lo que la medición sí corrige de §D67:** allí se escribió "margen de 0.141", comparando contra
el impostor más parecido del banco de la EPN (0.691). Con 416 pares de impostores, el más
parecido está a **0.566**, no a 0.691. El margen real es **0.016** — sigue bastando, porque el
FAR medido es 0 %, pero es un filo y no un colchón. Si se cambia el modelo o el detector, hay que
volver a medir antes de dar nada por bueno.

**Por qué no se baja a 0.42** (FAR 0.5 %, FRR 5.2 %): los dos errores no cuestan lo mismo.
Rechazar a alguien legítimo cuesta repetir la captura delante de un guardia que está ahí mismo;
aceptar a un impostor es que entre. Con la banda de revisión cubriendo el rechazo, no hay razón
para pagar FAR a cambio de comodidad.

**Un hallazgo que no se buscaba: el detector pierde uno de cada cuatro rostros.** De los 1200
pares, **338 se descartaron porque `TinyFaceDetector` no encontró cara en alguna de las dos
fotos** — un 28 %. LFW son fotos de prensa, de frente y bien iluminadas; si ahí falla una de cada
cuatro, en una garita a contraluz fallará más.

Eso no afecta al umbral (un rostro no detectado no llega a compararse), pero sí a la experiencia:
parte de las capturas dirán "no se detectó ningún rostro" y habrá que repetir. `SsdMobilenetv1`
detecta bastante mejor a cambio de ser más pesado y lento. **Está sin decidir a propósito**:
cambiar el detector invalida esta calibración, así que habría que medir de nuevo con él antes de
cambiarlo. Anotado en §V32.

**Sobre trasladar estos números a la EPN:** LFW no es una garita. El FRR medido es **optimista**
—una cámara a contraluz o con mascarilla lo empeora— mientras que el FAR es razonablemente
trasladable: si dos personas distintas se separan bien en condiciones buenas, en condiciones
malas se separan más, no menos. Por eso el umbral se eligió apuntando al FAR.

---

## §D71 — Los umbrales del lector de placas salen de una medición, y la confianza se calcula por consenso

**Conflicto:** §D68 dejó el lector funcionando pero con dos números puestos a ojo
(`UMBRAL_PLACA` 0.80, `UMBRAL_PLACA_REVISION` 0.55). Al medirlos aparecieron dos problemas, uno
de ellos grave.

**El grave: la confianza era siempre 0.** `tesseract.js` 5 devuelve `confidence` a cero en todos
los niveles —documento, bloque y palabra—, así que el umbral no filtraba absolutamente nada.
Ninguna lectura lo alcanzaba jamás. El parámetro existía, se guardaba en cada evento y no hacía
nada. No se detectó antes porque el flujo no se rompe: simplemente todas las lecturas empataban
a cero y la primera válida ganaba siempre.

**La confianza pasa a calcularse por acuerdo entre variantes.** Las cuatro formas de preparar la
imagen son cuatro lectores independientes sobre la misma foto; que coincidan dice mucho más de
la lectura que cualquier número que un motor se ponga a sí mismo. Es la misma idea que votar
entre varios modelos. Y esa señal **sí** discrimina:

| | n | p5 | mediana | p95 |
|---|---|---|---|---|
| Lecturas correctas | 132 | 0.63 | **1.00** | 1.00 |
| Lecturas equivocadas | 20 | 0.38 | **0.63** | 0.75 |

**Cómo se midió:** 200 imágenes generadas con la placa correcta conocida
(`scripts/calibracion_placas`), en cinco condiciones. El medidor importa
`web/src/lib/placas.ts` compilado, así que mide el código real y no una copia parecida.

| Condición | Leída bien | Leída mal | No se leyó |
|---|---|---|---|
| Limpia | 90.0 % | 0.0 % | 10.0 % |
| Leve (ángulo, algo de desenfoque) | **100.0 %** | 0.0 % | 0.0 % |
| **Foto en la pantalla de un móvil** | 65.0 % | 12.5 % | 22.5 % |
| Pantalla del móvil, lejos y torcida | 5.0 % | 30.0 % | 65.0 % |
| Placa real en malas condiciones | 70.0 % | 7.5 % | 22.5 % |

**El preprocesado de un solo paso era el cuello de botella.** La binarización de Otsu que había
es la mejor opción con una placa metálica bien iluminada y una de las peores con una foto de
pantalla, porque el moiré —la interferencia entre la rejilla de píxeles del móvil y la del
sensor— se convierte en cantos negros falsos por toda la imagen. Ahora se prueban cuatro
variantes y se vota:

| Condición | SUAVIZADA | REALZADA | BINARIZADA | GRIS |
|---|---|---|---|---|
| Foto en pantalla del móvil | **65.0 %** | 57.5 % | 40.0 % | 42.5 % |
| Placa real en malas condiciones | **60.0 %** | 17.5 % | 12.5 % | 10.0 % |

`SUAVIZADA` (desenfoque 3×3 antes de binarizar) gana en todo lo difícil, y multiplica por cinco
el acierto de la binarización sola con una placa real en malas condiciones.

**Los umbrales elegidos:**

| Umbral | De las aceptadas, equivocadas | Correctas que se descartarían |
|---|---|---|
| 0.60 | 9.9 % | 3.8 % |
| 0.65 | 5.6 % | 23.5 % |
| **0.75** | **1.2 %** | 35.6 % |
| 0.90 | 1.2 % | 37.9 % |

`UMBRAL_PLACA = 0.75` es donde el error se desploma sin que subir más aporte nada. Y ese 35.6 %
de lecturas correctas **no se tira**: cae en la banda de revisión (`UMBRAL_PLACA_REVISION = 0.50`),
donde el guardia confirma la placa que el sistema propone. Por debajo de 0.50 las variantes
discrepan entre sí, y proponer una de ellas sería echar una moneda al aire delante del guardia:
ahí se pide repetir la captura.

Es el mismo patrón que la biometría (§D67): **el sistema propone, la persona decide, y solo lo
que no llega ni a proponerse se descarta.**

**Lo que la medición dice sobre la demo:** una foto de la placa en la pantalla del móvil,
encuadrada en el marco y de cerca, cae entre "leve" (100 %) y "pantalla del móvil" (65 %). Si se
aleja o se tuerce, el acierto se hunde — y ahí importa que las lecturas malas de ese caso tienen
confianza baja (p95 = 0.75), así que la mayoría no se auto-aceptan: se le proponen al guardia o
se descartan.

# Ronda de cuentas y roles de ADM (2026-07-20)

Origen: revisión manual del administrador tras desplegar la ronda de ADM. Cuatro incidencias,
todas reproducidas antes de tocar código.

> **Renumeradas el 20/07.** Esta ronda se escribió como D53-D56 y D58, números que ya ocupaba la
> ronda de PCO. La colisión pasó desapercibida porque aquí se usó `### Dnn` y allí `## §Dnn`, así
> que ninguna búsqueda las veía juntas. Son ahora **§D72-§D76**. Se renumeró esta ronda y no la de
> PCO porque las de PCO están citadas dentro de migraciones ya aplicadas, que no se reescriben.

## §D72 — El correo de una persona con cuenta es UNO SOLO

`persona.correo`, `usuario_sistema.correo_electronico` y `auth.users.email` (más la identidad
del proveedor en `auth.identities`) eran tres datos independientes. Se registró a Lady Celina
Velásquez con `lady.celina@epn.edu.ec`, se corrigió en GPI y **la cuenta siguió entrando con el
correo viejo durante días**.

Ahora hay **un solo correo guardado en tres sitios que el sistema mantiene idénticos**, se
toque desde donde se toque: GPI o ADM. No hay "fuente de verdad" porque no hay copias.

Se implementa con triggers y **no** con una Edge Function a propósito: así la propagación
ocurre dentro de la misma transacción que el cambio. Si la validación falla, no se guarda nada
y quien edita ve el error. Con una función externa habría una ventana en la que la persona ya
estaría cambiada y la credencial no — exactamente el fallo que se está arreglando.

La identidad de GoTrue (`auth.identities.identity_data->>'email'`) se actualiza también.
Olvidarla deja la cuenta en un estado incoherente que se manifiesta más tarde y cuesta
diagnosticar.

## §D73 — Una cuenta, un rol activo

El modelo permitía varios roles y eso producía un fallo real: `guardia_demo` tenía
GUARDIA_SEGURIDAD + RESPONSABLE_PERSONAL_INTERNO y, como la vista de Garita **reemplaza toda
la aplicación**, esa cuenta no podía entrar a GPI de ninguna manera. El rol extra no daba
acceso a nada; solo dejaba la pregunta de "¿qué ventana se abre?".

El multi-rol existe en sistemas reales, pero siempre con un **selector visible** de "actúas
como X". Lo que no existe en ninguno serio es una precedencia implícita e invisible. Entre
implementar el selector (toca la navegación de los seis módulos) y simplificar, el equipo
eligió simplificar: **quien necesite dos funciones, dos cuentas**.

Se impone con un índice único parcial sobre `usuario_rol (id_usuario) where estado_asignacion
= 'ACTIVO'`, no solo en la pantalla. Cambiar de rol pasa a ser atómico
(`asignar_rol_unico`): revoca el anterior y asigna el nuevo en una operación, porque con el
índice dos escrituras sueltas dejarían la cuenta sin rol si fallara la segunda.

## §D74 — Nadie se quita a sí mismo el rol de administrador

`proteger_rol_administrador` solo cubría al **último** administrador. Con dos, cualquiera podía
revocarse el suyo, perder ADM y no poder devolvérselo: una puerta que solo se abre por fuera.
Que hoy no ocurra es casualidad —`admin` es el único administrador, así que la guarda del
último lo cubre por accidente—, no una protección.

Añadida la guarda de auto-revocación, simétrica a la que `proteger_administracion` ya tenía
para el estado de la cuenta. La interfaz además oculta el control, para no descubrir la regla
chocándose con un error.

## §D75 — ADM da de alta personal interno

Crear un responsable exigía dos sesiones y dos personas: entrar como GPI para registrar a la
persona, salir, entrar como ADM para crear la cuenta y el rol. Ahora el alta de ADM registra
la persona si la cédula no existe, con permiso propio `ADM_PERSONA_INSERT` y RLS acotada a
`tipo_persona = 'INTERNA'` (el personal externo es de GPE y no puede tener cuenta).

`persona` sigue siendo entidad maestra única: es el mismo INSERT que hace GPI, no una copia.
El permiso es nuevo en vez de reutilizar `GPI_PERSONA_INSERT` para que la matriz siga diciendo
la verdad sobre quién puede qué, y para poder retirarlo sin tocar GPI.


## §D76 — El sistema lo opera el personal, no los estudiantes

Una cuenta de `usuario_sistema` solo puede pertenecer a una persona **interna** de categoría
**DOCENTE, ADMINISTRATIVO o TRABAJADOR**. Quedan fuera:

- **ESTUDIANTE** — es sujeto del control de accesos, no operador de él.
- **EMPRESA_SERVICIO** — personal contratado: entra al campus, no administra el sistema.
- **Todas las categorías EXTERNAS** — ya lo impedía el flujo, pero nada lo garantizaba.

La regla no se inventó: se dedujo de los datos. De las 9 cuentas existentes, 8 ya la cumplían y
una sola no (`frank.jumbo`, ESTUDIANTE con rol de guardia). Lo que faltaba era escribirla.

Se comprueba en **los dos sentidos**, porque la incoherencia puede entrar por cualquiera:

| Trigger | Qué impide |
|---|---|
| `trg_validar_operador_de_cuenta` (usuario_sistema) | Crear una cuenta sobre una persona que no puede tenerla |
| `trg_validar_categoria_con_cuenta` (persona) | Cambiar a una categoría no operadora a quien ya tiene cuenta |

**Lección de implementación:** la primera versión del segundo trigger no bloqueaba nada, porque
consultaba la categoría releyéndola de la tabla y en un `BEFORE UPDATE` la fila todavía tiene el
valor anterior. Un trigger BEFORE que valida **debe evaluar `NEW`**. Lo detectó su propia prueba;
sin ella habría quedado una guarda decorativa, que es peor que no tener ninguna porque da
sensación de seguridad.


## §D77 — El código único es un dato, no un identificador (resuelve §V27)

PCO pidió *"se elimina cualquier concepto de Código de Estudiante… no debe existir un campo
llamado Código"* y GPI, en la ronda anterior, pidió justo lo contrario y ya estaba implementado
y probado. Parecía una contradicción que obligaba a elegir un módulo ganador.

**No lo era.** Aclarado con el equipo: la frase de PCO habla de **cómo se identifica a una
persona**, no del modelo de datos. Y visto así, los dos requisitos son compatibles:

- **Identificar** a alguien se hace **siempre por cédula.** Nunca por código único, ni por
  correo, ni por nombre de cuenta.
- **Guardar** el código único de un estudiante es un dato académico legítimo, sujeto a la regla
  de GPI: solo estudiantes, y bloqueado para el resto (trigger `validar_codigo_unico_estudiante`).

La regla práctica que queda: *el código único se ve en la ficha del estudiante, pero no se busca
por él ni se muestra como identificador en ninguna lista.*

Al aplicarla aparecieron dos sitios que la incumplían, y se corrigieron:

| Dónde | Qué pasaba |
|---|---|
| PCO · asignación de guardia | Mostraba la cédula, pero la búsqueda era por `correo_electronico` |
| GPI · personal interno | Se podía encontrar a una persona tecleando su código único |

El correo sigue siendo el identificador de la **cuenta** (`usuario_sistema`), que es otra cosa:
una cuenta no es una persona. Por eso la pantalla de Sesiones sí busca por correo.
# Ronda de PCO v2 (2026-07-20) — Requerimientos_PCO_v2

## §D78 — Un punto de control dentro de un edificio se nombra con el estándar de la EPN

**Conflicto:** el nombre de un punto de control era texto libre. En un edificio eso no vale: dos
personas escriben el mismo laboratorio de dos formas y nada impide registrarlo dos veces.

**Decisión:** dentro de una zona tipo EDIFICIO el nombre sigue la nomenclatura oficial —
`E<edificio>/P<piso>/E<espacio de tres dígitos>`, con una descripción opcional detrás:
`E20/P4/E004 – Laboratorio Alan Turing`. Hay un índice único sobre el **código**, no sobre el
nombre completo, para que `E20/P4/E004 – Lab` y `E20/P4/E004 – Laboratorio Alan Turing` cuenten
como el mismo sitio.

En **campus y parqueaderos no aplica**: ahí los puntos son garitas y accesos perimetrales que no
ocupan un aula, y obligarles a un código de aula sería inventarse un dato.

El documento pedía además que el usuario no tecleara `/` ni `-`. En vez de una máscara sobre un
único campo, la pantalla pide **tres números y una descripción** y compone el nombre. Con una
máscara el usuario aún puede equivocarse de posición; así el formato no depende de él. Para eso
se añadió `FieldConfig.componerDesde`, que a diferencia de `soloLectura` **sí persiste** el valor.

## §D79 — Al guardia se le busca por su cédula, no en una lista

**Conflicto:** asignar un guardia era elegirlo en un desplegable que lo identificaba por su
**correo**. El correo identifica a la cuenta, no a la persona (§D77).

**Decisión:** el campo es la cédula. Al completar los diez dígitos el sistema responde si esa
persona está registrada como guardia y muestra su nombre; si no, lo dice. Va por el RPC
`buscar_guardia_por_cedula`, que devuelve **solo** id, nombre y si ya tiene una asignación activa.

Ese acotamiento es deliberado: PCO no puede leer el directorio de personas, y un RPC que
respondiera por cualquier cédula sería una forma de sondearlo. Solo contesta si esa cédula
corresponde a una cuenta de guardia activa, así que tampoco se puede asignar por error a un
Responsable de Módulo.

## §D80 — "Activa" y "en turno" son dos columnas, no una

**Conflicto:** PCO pidió quitar los textos "en turno ahora" y "fuera de turno" porque *"con la
columna estado ya se entiende"*. No se entiende: son cosas distintas. `estado_asignacion` dice si
la asignación está en vigor estos días; estar en turno dice si el guardia está cubriendo el punto
**en este momento**. Una asignación ACTIVA de 22:00–06:00 sigue estando activa a mediodía, con el
guardia en su casa.

**Decisión:** no se borró nada; se separó lo que estaba mezclado. La lista tiene ahora una
columna **"Asignación"** (Activa / Finalizada) y otra **"Ahora mismo"** (En turno / Fuera de
turno / Sin horario / No aplica), más **"Desde"** y **"Hasta"** con las fechas del turno, que era
la otra parte de la petición.

## §D81 — Una fecha que significa un día no se formatea en la zona del navegador

`fecha_inicio` y `fecha_fin` son `timestamptz`, pero significan *"el día 31 de julio"*, no *"las
00:00 del 31"*. Se guardan a medianoche UTC y se formateaban con la zona del navegador, así que
para cualquiera en Ecuador **retrocedían un día**: una asignación vigente hasta el 31/07 se leía
"30/07". Lo mismo afectaba a la vigencia mostrada en la ficha.

**Decisión:** `fmtFechaDia()` formatea estos campos en UTC, que es donde se guardó el día. Se
distingue a propósito de `fmtFecha()`, que sigue usando la zona local y es la correcta para un
instante real (`fecha_registro`, hora de un evento).

**Cuarta aparición del mismo error de medianoche** (§D52 en la vigencia, §D59 en la duración del
turno, §D69 en los horarios de regla). Merece tenerlo presente: cada vez que se compara o se
muestra una fecha hay que preguntarse si representa un instante o un día.

## §D82 — "Campus" vuelve a los tres combos de tipo de zona

**Conflicto:** la ronda anterior quitó CAMPUS del alta de puntos de control, porque el documento
decía que un punto de control no está "en toda la universidad". El v2 pide lo contrario: que el
campo Zona ofrezca los tres tipos en todos los paneles.

**Decisión:** gana el requisito nuevo, y además resuelve el problema práctico que había dejado el
anterior (§V25): seis de los puntos sembrados —las garitas de entrada, "Acceso A", "Acceso B",
"Garita Principal"— sí cuelgan del campus, y con CAMPUS fuera del alta quedaban a medio gestionar.
Un acceso perimetral pertenece al campus y a ningún edificio: es un caso legítimo, no una
excepción que hubiera que tolerar.


## §D83 — Las placas de motocicleta: el lector leía el 0 %, y a veces leía mal

**Conflicto:** las motos se podían **registrar** sin problema —`validarPlacaTipo('MOTOCICLETA')`
acepta los dos formatos vigentes— pero en la garita no se leía ninguna. El alta funcionaba y la
lectura no, que es la peor combinación posible: el dato está en la base y el guardia no puede
llegar a él.

**La causa, medida sobre 80 placas de moto sintéticas con la respuesta conocida:**

| Modo de segmentación de Tesseract | Acierto en motos |
|---|---|
| **PSM 7 — el que usaba el sistema** | **0 %** |
| PSM 6 (bloque uniforme) | 71 % |
| **PSM 11 (texto disperso)** | **83 %** |
| PSM 12 | 83 %, pero exige `osd.traineddata`, que no viene en el paquete y falla al cargar |

No era mala suerte ni un problema de calidad de imagen: `tessedit_pageseg_mode: '7'` significa
literalmente *"esta imagen es **una sola línea** de texto"*. Una placa de moto ecuatoriana lleva
el código en **dos renglones**. Se le estaba diciendo a Tesseract que no buscara la segunda
línea, y Tesseract hacía caso.

**Y algo peor que no leer: leer mal.** Con el formato de dos letras (`IA-123B`), el último
recurso del extractor pega todo el texto —`"ECUADORIA123BIMBABURA"`— y busca el patrón dentro.
Encontraba **`RIA123`**, comiéndose la R final de "ECUADOR" y el último carácter de la placa, y
devolvía con aplomo una placa que no existe. Una lectura equivocada es peor que ninguna: si esa
placa fantasma existiera en la base, el sistema autorizaría el vehículo de otra persona.

**Decisión: tres cambios, todos acotados al camino de moto.**

1. **Modo de segmentación por tipo.** PSM 11 para moto, PSM 7 para auto. El modo se fija en cada
   lectura y no al crear el worker, porque el mismo panel lee las dos cosas.
2. **Marco guía por tipo.** El de auto es 70 % × 26 % (relación 4.8:1 sobre un vídeo 4:3); una
   placa de moto es 1.33:1, así que encuadrada ahí ocupaba **el 28 % del ancho** y el resto era
   fondo — tres cuartas partes de la resolución tiradas. El de moto es 45 % × 60 %.
3. **Unión de renglones al extraer**, activada solo en modo moto. "ECUADOR" y el nombre de la
   provincia se descartan antes de unir: están impresos en la placa y, colados en la unión,
   formarían placas fantasma como la de arriba.

**Cómo se elige auto o moto: lo dice el guardia**, con un selector en el panel. Se descartaron
las dos alternativas automáticas:

- *Probar los dos modos y votar* duplicaría las pasadas de OCR y metería candidatos nuevos en el
  voto del camino de auto, que funciona. Arreglar una cosa tocando la que ya va bien.
- *Derivarlo del tipo del vehículo registrado* es circular: hace falta leer la placa para saber
  el tipo, y el tipo para leer la placa.

El guardia tiene el vehículo delante y lo distingue de un vistazo. Es el dato más barato y más
fiable que hay disponible.

**Verificado tras el cambio** (mismo banco, código real compilado):

| | Antes | Después |
|---|---|---|
| Motos | 0 % | **81 %** |
| Autos | 66 % | **73 %** — sin tocar; la diferencia es el tamaño de la muestra |

Los valores por defecto de las funciones (`tipo = 'AUTO'`, `multilinea = false`) reproducen
exactamente el comportamiento anterior, y hay pruebas que lo fijan: si alguien cambia la
geometría o el modo del auto, la suite lo dice.
---

## Ronda GPE — ingreso vehicular con memorando

### D83 — Una fecha sin hora es un día, y ninguna zona horaria puede moverla

Reportado desde Memorandos: se registra uno con vigencia del 21/07 al 22/07 y el listado lo
muestra como "20/07 → 21/07".

Lo primero fue descartar el backend, porque de eso dependía si había gente quedándose fuera del
campus. No la había: la base guardaba `2026-07-21` y `2026-07-22`, exactamente lo tecleado, y la
validación de acceso compara columnas `date` contra `hoy_ecuador()` dentro de SQL, sin pasar por
el navegador. **Mentía solo la presentación.**

La causa es la de siempre: `new Date('2026-07-21')` es medianoche UTC por norma de JavaScript, y
`toLocaleDateString` la reexpresa en la zona del navegador; en Ecuador eso son las 19:00 del día
anterior. Es §D52, §D59 y §D69 otra vez, ahora en la vista.

Se arregla **en `fmtFecha`**, por donde pasan todas las fechas, y no en cada llamada: una cadena
`AAAA-MM-DD` ya viene escrita, y convertirla de zona no tiene ningún significado correcto. Con
eso quedaron bien de golpe la ficha del memorando de la garita, las autorizaciones de visita y
"Personas por memorando", que arrastraban el mismo desfase sin que nadie lo hubiera reportado.

`fmtFechaDia` sigue existiendo para las columnas `timestamptz` que representan un día; una
prueba fija que ambas den el mismo resultado, para que no aparezcan dos criterios en pantalla.

### D84 — Para un externo en vehículo, el segundo factor es el memorando

RF-CA-016 exige dos validaciones en el ingreso vehicular. Para el personal interno son la placa
y el rostro. Un externo **no tiene registro biométrico** (§D20), así que ese segundo factor no
existía para él: hasta ahora un conductor externo entraba solo con la placa.

El equipo cerró la regla: **la placa y el memorando vigente**. Y su corolario, que es lo que
convierte esto en una regla de seguridad y no en un trámite: **sin memorando, un externo no
entra conduciendo**; puede entrar a pie con su autorización de visita, pero no al volante.

Dos comprobaciones distintas, y conviene no confundirlas:

| A quién | Qué se exige |
|---|---|
| Cualquier ocupante externo | Memorando vigente. Una autorización de visita diaria no basta. |
| Además, al conductor externo | Que su memorando ampare **esa placa concreta**, no cualquier vehículo suyo. |

Sin la segunda, un externo con memorando podría entrar conduciendo cualquier coche del que
figure como propietario, que es justo lo que el oficio no dice.

**Esto es más estricto que RF-CA-017**, que dice que los pasajeros cumplen las reglas del
ingreso peatonal. Aquella decisión se tomó para no dejar fuera a quien llega en el coche de un
compañero, y se pensó para personal interno. La regla nueva la estrecha solo para externos. Ver
§V45: si el equipo prefiere que un acompañante externo con visita diaria pueda entrar en el
coche, es cambiar una condición.

### D85 — El vehículo se cuelga del memorando, no de la persona

`memorando_vehiculo` referencia la maestra `vehiculo` (CLAUDE.md: sin entidades duplicadas; aquí
no se repiten ni la placa ni las características).

Se colgó del memorando y no de la persona porque **así el permiso caduca solo**: cuando el
memorando vence o se anula, el vehículo deja de estar amparado sin que nadie tenga que acordarse
de revocar nada. Es el mismo criterio de §D47 —lo que depende del calendario se calcula— llevado
al permiso vehicular. El script de aserciones lo comprueba en los dos sentidos.

Es tabla y no una columna en `memorando` porque una empresa puede acudir con más de un vehículo
amparado por el mismo oficio.

### D86 — El alta del memorando con vehículo es una transacción, y por eso tiene pantalla propia

El equipo pidió que las preguntas "¿entra con vehículo?" y "¿con acompañantes?" formen parte de
la **creación** del memorando. Pero un memorando con vehículo son tres filas que tienen que
nacer juntas: el memorando, el vehículo y la persona que lo conduce — porque `vehiculo` no
admite quedarse sin propietario (RF-CA-018, trigger diferido).

Hacerlo en dos llamadas desde el navegador deja un hueco desagradable: si la segunda falla
(placa repetida, la persona ya tiene dos vehículos, RLS), queda un memorando creado a medias y
quien reintenta choca contra "ese número ya existe" sin entender por qué. Con
`crear_memorando_con_vehiculo` en una sola transacción, o queda todo o no queda nada y el número
sigue libre.

Eso obliga a salir del formulario genérico, que solo sabe insertar en una tabla. Se reutiliza
`ResourceConfig.altaRuta`, el mismo mecanismo que ya usaba el alta de vehículo con propietario.

### D87 — Un evento de acceso tiene que poder explicarse solo

Al revisar el panel de monitoreo se vio que una fila decía quién, dónde y con qué resultado, pero
no respondía lo que se pregunta quien audita: **por dónde salió** quien entró por otra garita,
**qué aparato** hizo la lectura y **quién respondía** de ese punto a esa hora.

Dos de esas tres cosas ni siquiera se guardaban:

- **El dispositivo.** La Edge Function comprueba la MAC y la IP del lector antes de aceptar un
  registro automático, pero después no anotaba cuál era. Si una cámara empezara a autorizar lo
  que no debe, el histórico no permitía señalarla.
- **El guardia.** En un registro manual quedaba una fila en la bitácora con los ids de evento
  concatenados por comas. Servía para rastrear a mano, no para responder desde la pantalla.

Ahora `evento_acceso` guarda `id_dispositivo` y `id_usuario_registro`, y `detalle_evento_acceso()`
devuelve el evento entero —persona, garita y zona, aparato, quién lo registró, quién estaba de
turno, el ingreso emparejado con las horas dentro, la regla aplicada y el documento que lo
amparó— en una sola consulta.

Se resuelve en SQL y no en el navegador por dos razones: serían seis consultas encadenadas, y
"quién estaba de turno" no se puede contestar sin repetir la lógica de los turnos que cruzan la
medianoche, que ya se equivocó tres veces en este proyecto (§D59, §D69, §D83).

La ficha se muestra en el panel de monitoreo y en el historial de accesos de CAC, que son las dos
pantallas desde las que se audita.

### D88 — Cada módulo asocia vehículos a su propia población

GPI gestiona a docentes, estudiantes, administrativos y trabajadores; GPE gestiona a visitantes,
proveedores y contratistas. Al vincular una persona a un vehículo, sin embargo, esa frontera solo
existía en una pantalla: el buscador por cédula de la ficha del vehículo filtraba por
`tipo_persona`, pero el alta unificada de vehículo + propietario (`/vehiculos/nuevo`) no filtraba
nada, y la API REST y la RPC tampoco. Desde GPE se podía registrar el coche de un docente.

Se decide bajar la regla a la base, con dos comprobaciones que se complementan:

1. **Por quién escribe.** `validar_ambito_persona_vehiculo` deduce el ámbito de los permisos
   efectivos del usuario (no de un parámetro que mande el cliente): GPI solo puede vincular
   personas internas y GPE solo externas. ADM, que es la maestra de las tres tablas, puede
   vincular a cualquiera.
2. **Por coherencia del vehículo.** Ningún vehículo puede tener a la vez personas internas y
   externas con relación ACTIVA, lo escriba quien lo escriba. Un vehículo mixto no es un permiso
   más amplio, es un dato que nadie sabe interpretar: el ingreso de un interno se decide por su
   categoría y el de un externo por su memorando, y el guardia no tendría forma de saber cuál de
   las dos vías aplica.

El frontend sigue filtrando (el módulo viaja en `altaRuta` como `?modulo=GPI`), pero ya solo para
avisar antes y no dejar que el usuario llegue al final del formulario para descubrirlo.

### D89 — La vigencia de una asociación persona-vehículo la manda el memorando

Un externo entra al campus porque un memorando lo ampara, y entra **con** un vehículo porque ese
mismo memorando ampara la placa (§D85). Las fechas de la relación persona-vehículo, en cambio, se
tecleaban a mano: se podía dejar a un proveedor asociado al camión hasta 2027 cuando su memorando
terminaba pasado mañana. Dos fuentes de verdad para el mismo permiso.

A partir de esta ronda el memorando manda:

- al elegir a la persona, la pantalla busca el memorando que la ampara **con ese vehículo**
  (`memorandos_de_persona_y_vehiculo`), rellena las dos fechas y las deja en solo lectura, con el
  número del memorando y su vigencia a la vista;
- el trigger `alinear_persona_vehiculo_con_memorando` rellena las fechas que lleguen vacías y
  rechaza cualquier vigencia que se salga del memorando, venga de donde venga la escritura;
- el alta del vehículo desde el propio memorando (`registrar_vehiculo_de_memorando`) hereda las
  fechas en vez de usar `now()` y dejar la relación abierta, que era el caso más frecuente y el
  que nacía peor.

Cuando el vehículo de un externo **no** está amparado por ningún memorando (una visita de un solo
día, por ejemplo) no hay nada que heredar y las fechas se siguen tecleando.

De paso se corrige una regla que iba más lejos que la tabla: la RPC de alta exigía que la fecha de
fin fuese *estrictamente* posterior a la de inicio, y con las fechas heredadas eso dejaba fuera un
caso normal en GPE, el memorando que autoriza una entrega para un único día. El CHECK de
`persona_vehiculo` siempre admitió la igualdad; ahora la RPC también.

---

## Ronda de revisión final (2026-07-22) — documentos de errores y correcciones

### D90 — La búsqueda visible ignora tildes, sin alterar los datos

Los listados genéricos y el panel de Usuarios comparan una forma normalizada del texto: minúsculas
y sin diacríticos. Buscar `Calderon` encuentra `Calderón`; el valor almacenado y mostrado conserva
su ortografía. La misma normalización se reutiliza en listas de selección múltiples.

### D91 — Cada estado de cuenta tiene su propio error de inicio de sesión

Supabase Auth representa como un mismo ban técnico el bloqueo administrativo y la baja de una
cuenta. La Edge Function resuelve primero `estado_usuario` y devuelve códigos distintos para
**bloqueada por ADM**, **dada de baja** e **inactiva**. El bloqueo temporal por intentos y las
credenciales incorrectas mantienen sus códigos separados. La interfaz traduce cada uno en la
acción que corresponde; ya no acusa a la contraseña cuando el problema es el estado de la cuenta.
`iniciar-sesion` se declara además con `verify_jwt = false` en `config.toml`, porque quien llega al
login todavía no posee un JWT de usuario. Si falla la consulta del perfil, se informa que no pudo
verificarse el estado en vez de degradar el fallo a «contraseña incorrecta».

### D92 — En el alta rápida de una cuenta, la categoría se deriva del rol

`persona.id_categoria` sigue siendo obligatoria: eliminarla del modelo rompería las reglas de
acceso físico y §D76. Lo que se elimina es el combobox duplicado del alta de Usuarios. Para una
persona que aún no existe, **GUARDIA_SEGURIDAD → TRABAJADOR** y los demás roles operativos →
**ADMINISTRATIVO**. Una persona ya registrada conserva su categoría real, incluida DOCENTE.

### D93 — El código único y la unidad administrativa se validan también en la base

El código único es numérico y sus cuatro primeros dígitos son un año de matrícula entre 1970 y el
año actual. No se fija la longitud del resto porque el requerimiento no define una. La categoría
ADMINISTRATIVO solo admite unidad EPN; CEC desaparece de sus opciones. Ambos criterios viven en
triggers para que una escritura REST no pueda saltarse el formulario. El selector de Unidad no
muestra una explicación adicional: para un administrativo, la única alternativa visible es EPN.

### D94 — El nombre de un edificio es un dato derivado

`zona.descripcion` guarda solo el texto descriptivo y `numero_edificio` conserva el número. El
trigger compone `nombre_zona` como **Edificio &lt;número&gt; – &lt;descripción&gt;**. Así `26` y `EARME`
producen `Edificio 26 – EARME` sin pedir el mismo dato dos veces. La revisión confirma además el
número 26 para EARME, que estaba pendiente en §V43.1.

El CAMPUS no puede pasar a INACTIVA: es la raíz de la jerarquía y edificios, parqueaderos y puntos
dependen de él. La acción queda deshabilitada en pantalla y un trigger impide el cambio directo.

### D95 — Los filtros de PCO expresan el criterio que muestran

**Puntos de control → Filtrar por zona** usa `tipo_zona`, con Campus/Edificio/Parqueadero, igual
que el panel de Zonas; antes listaba nombres concretos de zona bajo la misma etiqueta. En
Asignaciones de guardia se añade el filtro **Asignación** con Activa/Finalizada.

### D96 — El encabezado del guardia informa su turno, no el estado del punto

La insignia `Activo` junto al punto correspondía a `punto_control.estado_punto`, aunque visualmente
parecía describir al guardia. Se sustituye por **En turno/Fuera de turno**, calculado por
`verificar_turno_guardia_actual` con la hora del servidor. Si la comprobación aún no respondió no
se inventa ningún estado.
