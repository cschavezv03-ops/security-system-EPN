# 99 — Dudas para el equipo

> Registro de las 11 dudas/inferencias que surgieron durante la construcción autónoma del backend
> (E1-E11, **todas resueltas**), más las que abrió la ronda de validación de datos (V1-V5, abiertas).
> En la primera sesión se implementó la opción más conservadora y se anotaron aquí. En la segunda
> sesión (despliegue al proyecto remoto de Supabase) **E1-E11 quedaron resueltas y verificadas
> contra la base real**. Cada entrada indica la **resolución** y **cómo se ejecutó/verificó**.
>
> Para el detalle completo del despliegue ver `docs/06_DESPLIEGUE_Y_RESOLUCIONES.md`.

| # | Tema (ronda de validación, 2026-07-16) | Estado |
|---|---|---|
| V1 | 18 de 19 cédulas del remoto eran de prueba e inválidas | Reemplazadas por ficticias válidas |
| V2 | MAC corrupta `00:14:2B:44:14:1` (le falta un dígito) | CHECK NOT VALID; fila intacta |
| V3 | Formato real de `codigo_unico` y `numero_memorando` | Sin patrón: solo no-vacío |
| V4 | `empresa.tipo_servicio` y `guardia_punto_control.turno` sin catálogo | Se dejan como texto libre |
| V5 | Sin `supabase db reset`: Docker no disponible en el entorno | Validado contra el remoto con ROLLBACK |
| V6 | `sesion.ip_origen` / `bitacora_sistema.ip_origen` nunca se poblaron | Ocultos en la interfaz |
| V7 | Regresión propia: la vista perdió `security_invoker` al reemplazarla | Corregida el mismo día |

| # | Tema (construcción del backend, sesiones 1-2) | Estado |
|---|---|---|
| E1 | Validación local sin Docker | ✅ Resuelta: validado y desplegado contra el remoto |
| E2 | `dispositivo.codigo_mac` UNIQUE | ✅ Confirmada como decisión de diseño |
| E3 | `rol.nombre_rol` con CHECK | ✅ Confirmada como decisión de diseño |
| E4 | `ambito` de la categoría CONDUCTOR | ✅ Decidido: EXTERNA |
| E5 | Bootstrap de `auth.users` | ✅ Resuelta: cuentas creadas por Auth Admin API y login verificado |
| E6 | Lectura vía `*_MODULO_ACCEDER` | ✅ Confirmada; RLS verificada rol por rol |
| E7 | 2 permisos nuevos | ✅ Confirmados y en uso |
| E8 | Permisos revocados a CAC | ✅ Confirmado a favor de la matriz por tabla |
| E9 | Clasificación de `tipo_alerta` | ✅ Resuelta: clasificación determinista por código canónico |
| E10 | Bucket de Storage solo GPI | ✅ Resuelta: confirmado por el usuario, desplegado |
| E11 | Huecos de la Edge Function | ✅ Resueltos (3 sub-puntos) |

---

## E1 — Validación local sin Docker → **RESUELTA**
**Duda original:** no se pudo correr `supabase db reset` (sin Docker/psql en el entorno de la 1ª sesión).
**Resolución:** en la 2ª sesión se instaló `psql`, y como la integración WSL de Docker Desktop seguía
rota, se validó y desplegó **directamente contra el proyecto remoto** de Supabase (`supabase db push`
autenticado con credenciales cacheadas + el MCP de Supabase para pruebas transaccionales con
`ROLLBACK`). **Las 26 migraciones están aplicadas en el remoto**, el `smoke_test.sql` corrió en verde
contra la base real, y las Edge Functions se probaron en vivo. Ya no es una duda: el backend está
desplegado y verificado.

## E2 — `dispositivo.codigo_mac` UNIQUE → **DECISIÓN CONFIRMADA**
Se mantiene el `UNIQUE`. Es coherente con `01_AUTENTICACION_Y_ROLES.md` §4 (el `codigo_mac` previene
la suplantación de hardware; debe identificar un dispositivo de forma inequívoca). La Edge Function
`registrar-evento-acceso` lo usa junto con `direccion_ip` para autenticar al dispositivo, y se
verificó en vivo que un dispositivo desconocido recibe **HTTP 401**.

## E3 — `rol.nombre_rol` con CHECK → **DECISIÓN CONFIRMADA**
Se mantiene el `CHECK` cerrado a los 7 roles (`01_AUTENTICACION_Y_ROLES.md` §3: "los únicos valores
válidos"). Ampliar el catálogo de roles es un `ALTER` trivial si el equipo lo decide.

## E4 — `ambito` de la categoría CONDUCTOR → **DECIDIDO: EXTERNA**
`CONDUCTOR` se siembra con `ambito = EXTERNA` (conductor de una empresa de transporte/servicio
contratada). Un conductor interno de la EPN encaja en `TRABAJADOR`. Si el equipo lo necesita interno,
es un `UPDATE` de una fila. Decisión tomada; no bloquea nada.

## E5 — Bootstrap de `auth.users` → **RESUELTA (cambio de implementación)**
**Duda original:** el `INSERT` crudo en `auth.users` desde `seed.sql` no estaba verificado en hosted.
**Resolución:** para el remoto se dejó de usar el INSERT crudo. Las dos cuentas de arranque (admin +
guardia demo) se crean con la **Auth Admin API de GoTrue** (`scripts/seed_remoto.mjs`), que genera
usuarios plenamente válidos (identidad, providers, tokens). El trigger `on_auth_user_created` crea
automáticamente su fila en `usuario_sistema`. **Se verificó login real** de ambas cuentas contra el
GoTrue del proyecto, y que `allowed_modules()` devuelve `["ADM"]` y `["CAC"]` respectivamente.
El `seed.sql` con INSERT crudo se conserva **solo para desarrollo local** (donde sí funciona).

## E6 — Lectura vía `*_MODULO_ACCEDER` para celdas "L" sin código dedicado → **CONFIRMADA Y VERIFICADA**
Se mantiene el patrón (helpers `public.tiene_algun_modulo()`, `public.tiene_acceso_operativo_cac()`).
Se verificó rol por rol contra la base real: p. ej. el guardia lee `categoria_persona` (9 filas) pero
no `rol` (0 filas, denegado por RLS); el admin lee `rol` (7 filas). El comportamiento coincide con la
matriz de `02_MATRIZ_PERMISOS_RLS.md`.

## E7 — Dos permisos nuevos (`ADM_BIOMETRIA_SELECT`, `CAC_AUTORIZACION_SELECT`) → **CONFIRMADOS**
Ambos siguen el formato `MODULO_ENTIDAD_ACCION` y cubren celdas de la matriz que no tenían código
propio, sin sobre-conceder. Están sembrados (100 permisos totales) y en uso por las políticas RLS.

## E8 — Permisos revocados a `RESPONSABLE_CONTROL_ACCESOS` → **CONFIRMADO**
Se mantiene la resolución a favor de la matriz por tabla (más granular): el supervisor CAC **no**
recibe `CAC_EVENTO_INSERT` ni `CAC_AUTORIZACION_INSERT/UPDATE` (esas son celdas C/A del guardia,
footnotes 6 y 9). Si el equipo quiere que el supervisor también registre, es un `INSERT` de 3 filas
en `rol_permiso`.

## E9 — Clasificación `motivo_resultado → tipo_alerta` → **RESUELTA (determinista)**
**Duda original:** la clasificación por coincidencia difusa de texto (`ilike`) era frágil.
**Resolución:** ahora es **determinista**. Quien deniega el acceso escribe `motivo_resultado` con un
**código canónico** como prefijo (`BIOMETRIA_FALLIDA: ...`, `MEMORANDO_VENCIDO: ...`, etc.); el
trigger toma el prefijo antes del `:` y lo mapea exacto contra el catálogo `tipo_alerta`, con
`PERSONA_NO_AUTORIZADA` como respaldo para motivos sin código. La Edge Function emite esos códigos en
cada denegación. **Verificado**: un evento DENEGADO con motivo `MEMORANDO_VENCIDO: ...` genera 1
alerta clasificada exactamente como `MEMORANDO_VENCIDO`.

## E10 — Bucket de Storage de biometría → **RESUELTA: solo GPI**
Confirmado por el usuario en la 1ª sesión: el bucket `registro-biometrico` es **privado y solo GPI**
(GPE nunca, por §D20; ADM ve solo metadatos, nunca el archivo). Desplegado en el remoto: bucket
`public=false` con 3 políticas (`select`/`insert`/`update`) atadas a `GPI_BIOMETRIA_*`.

## E11 — Huecos de la Edge Function `registrar-evento-acceso` → **RESUELTOS**
1. **Zona horaria** de `regla_acceso.horario_*`: decidido `America/Guayaquil` (UTC-5), correcto para
   la EPN. Es una decisión explícita, documentada en el código.
2. **`DISPOSITIVO_NO_RECONOCIDO` sin evento que referenciar**: se mantiene el diseño correcto — un
   dispositivo no identificado se rechaza (HTTP 401) y se registra en `bitacora_sistema` (no en
   `alerta_seguridad`, que exige `id_evento NOT NULL`). Verificado en vivo (401).
3. **Atribución de `bitacora_sistema.id_usuario`** en escrituras vía `service_role`: los eventos de
   dispositivo llevan `id_usuario` NULL (correcto, §4 doc 01: "id_usuario nulo donde aplique"); los
   registros manuales del guardia se atribuyen con una fila explícita de bitácora. Los eventos
   creados por inserción directa (REST) sí resuelven `auth.uid()` correctamente. Aceptado como
   diseño final del patrón "Edge Function + service_role".

---

## Nota adicional de la 2ª sesión (hallazgos y hardening)
Al desplegar y probar contra el remoto se detectaron y **corrigieron** además:
- **Funciones en el esquema `auth`**: Supabase hosted no permite crear funciones en `auth`; los 5
  helpers de RLS se movieron a `public` (funcionaba en local, fallaba en remoto).
- **`vista_vehiculos_dentro`**: fragilidad ante timestamps iguales (INGRESO y SALIDA en el mismo
  instante dejaban el vehículo "dentro" para siempre); reescrita con lógica "el último movimiento
  manda". Detectado por el smoke test.
- **Advisors de seguridad de Supabase**: se fijó `search_path` en 6 funciones de trigger y se revocó
  `EXECUTE` a `anon`/`PUBLIC` en todas las funciones propias. Warnings residuales: los 7 helpers que
  `authenticated` **debe** poder llamar (RLS + RPC del frontend) y `rls_auto_enable` (función de la
  plataforma), ambos aceptados; y la protección de contraseñas filtradas (HIBP), que **requiere plan
  Pro** — habilitarla en el dashboard tras el upgrade.

---

# Ronda de validación de datos (2026-07-16)

> Dudas abiertas por la implementación de validación de campos, cierre de sesiones y bloqueo
> efectivo de usuarios. Mismo criterio de siempre: se implementó la opción más conservadora y se
> anotó aquí; ninguna bloqueó el desarrollo.

## V1 — 18 de las 19 cédulas del remoto eran de prueba → **reemplazadas por ficticias válidas**

**Hallazgo:** al aplicar el algoritmo del Registro Civil (provincia + tercer dígito + módulo 10),
solo **1 de las 19** personas del proyecto remoto tenía una cédula válida (`1756082184`). El resto
eran de relleno: `9999999999` (provincia 99, que no existe), `1234567890`, `152711695` (9 dígitos),
y `1798765432`, que *parece* válida pero tiene tercer dígito 9 — eso identifica a una persona
jurídica, no natural.

**Decisión del usuario:** reemplazar las 18 por cédulas ficticias **válidas** (Pichincha, tercer
dígito 5, dígito verificador correcto), en vez de dejar el CHECK como `NOT VALID`.

**Riesgo asumido:** varias de esas filas parecen personas reales del equipo (Frank Jumbo, Victor
Coyago, Camila Caicedo, Cecilia Jaramillo, Hernán Avellaneda, Alexander Guerra). Sus cédulas
**ahora son inventadas**: `1750000208`, `1750000216`, `1750000224`, `1750000232`, `1750000240`,
`1750000257`. Si alguna de esas personas es real y su cédula importaba, **ADM debe corregirla a
mano**. El mapeo completo está en `supabase/migrations/20260716010100_saneamiento_datos.sql`.

**Pendiente del equipo:** sustituir las 18 cédulas ficticias por las reales desde el módulo ADM.

## V2 — MAC corrupta en el remoto → **CHECK NOT VALID**

**Hallazgo:** `dispositivo.codigo_mac` contiene `00:14:2B:44:14:1`, con el último octeto de un solo
dígito. Es una MAC imposible.

**Decisión:** no se puede adivinar el dígito que falta sin inventar la identidad de un dispositivo
de control de acceso, así que el CHECK `dispositivo_mac_valida` se aplica **NOT VALID**: la fila
histórica sobrevive, pero todo INSERT/UPDATE nuevo sí se valida.

**Pendiente del equipo:** corregir esa MAC contra el dispositivo físico y luego ejecutar
`ALTER TABLE public.dispositivo VALIDATE CONSTRAINT dispositivo_mac_valida;`.

## V3 — Formato de `codigo_unico` y `numero_memorando` → **sin patrón**

**Duda:** ninguno de los documentos define el formato real de estos dos campos. El frontend genera
`numero_memorando` como `MEM-<base36>`, que parece un placeholder y no un número de memorando de la
EPN (que suelen verse como `EPN-VIPS-2026-0123-M`).

**Decisión conservadora:** solo se valida que no estén vacíos. Inventar un patrón y ponerlo como
CHECK bloquearía registros legítimos el día que se use el número real.

**Pendiente del equipo:** confirmar ambos formatos. Si existen, se añaden como CHECK con regex.

## V4 — `tipo_servicio` y `turno` sin catálogo → **texto libre**

**Duda:** ambos son texto libre sin CHECK, y el remoto ya tiene valores heterogéneos:
`tipo_servicio` = "Limpieza"/"Seguridad" (minúsculas, contra la convención de CLAUDE.md de catálogos
en MAYÚSCULAS), y `turno` = "MATUTINO" pero también `"07:00–17:00"`.

**Decisión:** se dejan libres. Para `turno`, el doc 03 (§línea 39) dice literalmente
*"Ej. MATUTINO, VESPERTINO, NOCTURNO"* — **"Ej." es una lista abierta, no un catálogo cerrado**, y
un CHECK contradiría el documento fuente.

**Pendiente del equipo:** decidir si alguno de los dos debe ser catálogo cerrado. Si `turno` lo
fuera, hay que migrar antes el valor `"07:00–17:00"`.

## V5 — Sin validación local: Docker no disponible → **validado contra el remoto con ROLLBACK**

**Hallazgo:** el flujo obligatorio de CLAUDE.md exige `supabase db reset` antes de tocar el remoto,
pero en este entorno (WSL2) **Docker no está instalado** y solo existen las herramientas cliente de
PostgreSQL 16 (`psql`, `pg_dump`) — no hay binario de servidor (`postgres`, `initdb`), así que no se
puede levantar una base local. Es la misma duda E1 de la primera sesión, que había quedado resuelta
con "validado contra el remoto" pero vuelve a aparecer en cada sesión.

**Cómo se validó en su lugar:** cada función y trigger se cargó en el proyecto remoto dentro de una
transacción `BEGIN … ROLLBACK`, se ejerció con casos de prueba (20 grupos de aserciones para las
validaciones; una simulación completa de bloqueo → corte de sesión → reactivación) y se revirtió.
Se verificó después que el remoto quedara intacto (0 funciones nuevas). **Ninguna migración se
aplicó**: `supabase db push` sigue pendiente de aprobación humana.

**Pendiente del equipo:** instalar Docker Desktop con integración WSL2, o aceptar formalmente el
patrón `BEGIN … ROLLBACK` contra el remoto como sustituto del reset local.


## V6 — El campo IP nunca se pobló → **oculto en la interfaz**

**Hallazgo:** 1 de 171 filas de `sesion` tenía `ip_origen` (y era `10.0.0.5`, de un seed); 0 de 565
en `bitacora_sistema`. El frontend llamaba a `registrar_sesion()` sin pasar nunca `p_ip_origen`, así
que la columna "IP" mostraba `—` siempre.

**Decisión del usuario:** ocultarlo de la ventana de sesiones y de la bitácora. La columna se
conserva porque ambas tablas son históricas (solo INSERT) y el modelo tiene 25 entidades cerradas.

**Fallo de diseño anotado:** la firma `registrar_sesion(p_ip_origen text)` deja que **el cliente
declare su propia IP**. Para un campo de auditoría de seguridad eso no vale nada: un cliente puede
mentir. Si el equipo decide poblarla, debe leerse en el servidor con
`current_setting('request.headers')::json ->> 'x-forwarded-for'` (comprobado: PostgREST expone las
cabeceras a la BD) y eliminar el parámetro. **Pendiente del equipo:** decidir si la auditoría de
accesos necesita IP; hoy no la tiene y la interfaz ya no finge que sí.

## V7 — Regresión propia: la vista perdió `security_invoker` → **corregida**

**Qué pasó:** al añadir el nombre del conductor a `vista_vehiculos_dentro` se usó
`CREATE OR REPLACE VIEW` sin la cláusula `WITH`. Eso **no conserva las reloptions**: la vista volvió
al valor por defecto (`security_invoker = false`), es decir, pasó a evaluarse con los permisos de su
propietario y **saltándose el RLS** de quien consulta — justo cuando acababa de ganar nombre y
cédula del conductor.

**Cómo se detectó:** el linter de Supabase (`get_advisors`), que marcó
`0010_security_definer_view` como ERROR al revisar el proyecto tras aplicar el cambio. No lo detectó
ninguna prueba propia.

**Corregido** en `20260717021430_fix_security_invoker_vista_vehiculos_dentro.sql`; el archivo de la
migración anterior ya lleva la cláusula para que un `db reset` desde cero no lo reproduzca.
Verificado: las dos vistas del proyecto tienen `security_invoker = true`.

**Lección para el equipo:** todo `CREATE OR REPLACE VIEW` en este proyecto debe repetir
`with (security_invoker = true)`. Conviene pasar los advisors después de cada cambio de esquema.

---

# Ronda de validaciones generales (2026-07-17) — reqs 9-38

## V8 — Recuperación de contraseña sin SMTP → **flujo listo, envío NO_VERIFICADO**
El flujo de "¿Olvidó su contraseña?" usa `resetPasswordForEmail` de Supabase Auth (nativo,
seguro, respuesta neutral). **No hay SMTP configurado**, así que no llega correo. Todo el resto
(token, expiración, un solo uso, revocación de sesiones, redirección al login) es real.
**Pendiente del equipo:** configurar SMTP en el dashboard de Supabase (Auth → Email) para que el
enlace se entregue. No requiere cambios de código.

## V9 — La cédula ecuatoriana se exige a TODA persona (incluidos externos)
El CHECK `persona_cedula_valida` = `es_cedula_ecuatoriana` (ya existía, ahora además rechaza
relleno). Un visitante extranjero con pasaporte **no** puede registrarse con ese documento.
Es coherente con §D20 (el externo se identifica con "su cédula"), pero si el negocio necesita
admitir pasaportes habría que añadir un tipo de documento. **Pendiente del equipo:** confirmar si
se aceptan documentos no ecuatorianos; hoy no.

## V10 — Turno de guardia con dato heterogéneo → **se interpreta, no se normaliza**
`guardia_punto_control.turno` tiene `MATUTINO`, `06:00–20:00` y `07:00–17:00` (§V4). La función
`esta_en_turno_guardia` entiende ambos formatos, así que no se fuerza una migración del dato. Un
turno que no se pueda interpretar **no habilita** el acceso (conservador). **Pendiente del equipo:**
decidir si `turno` pasa a catálogo cerrado (`MATUTINO/VESPERTINO/NOCTURNO`) y migrar los rangos.

## V11 — 18 cédulas ficticias siguen pendientes (arrastre de §V1)
El endurecimiento de la cédula no cambia esto: las 18 cédulas sintéticas de §V1 siguen siendo
válidas por estructura pero no corresponden a personas reales. **Pendiente del equipo:** sustituir
por las cédulas reales desde ADM. (Las nuevas reglas no las rechazan: no son relleno.)

## V12 — `empresa.estado_verificacion_ruc` siempre NO_VERIFICADO
No hay integración con el SRI. La columna existe y el flujo la contempla, pero ningún RUC se marca
`VALIDO`/`INVALIDO` hasta que haya un servicio oficial. **Pendiente del equipo:** convenio/API del
SRI; entonces se puebla en backend con timeout y manejo de indisponibilidad (interfaz ya prevista).
