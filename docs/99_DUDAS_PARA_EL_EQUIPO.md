# 99 — Dudas para el equipo

> Acumulado por Claude Code durante la construcción autónoma del backend.
> Ninguna de estas dudas bloqueó el avance: en cada caso se implementó la opción
> más conservadora y se documenta aquí para revisión posterior.

---

## Entorno de trabajo

### E1 — No se pudo ejecutar `supabase db reset` en este entorno (sin Docker)
El flujo de trabajo obligatorio (CLAUDE.md) pide validar cada migración localmente con
`supabase db reset` antes de tocar el proyecto remoto. Este entorno de ejecución (sandbox en
segundo plano) **no tiene acceso a Docker** (`Cannot connect to the Docker daemon`) ni a
`psql`/PostgreSQL instalable sin privilegios `sudo`. Tampoco se creó un *branch* de desarrollo de
Supabase para validar de forma remota-pero-aislada, porque la herramienta lo marca explícitamente
como una acción con **costo** (`confirm_cost_id` requerido) — y gastar dinero de la cuenta del
usuario no es una decisión que corresponda tomar en automático.

**Decisión conservadora aplicada:** todas las migraciones, seed, políticas RLS, triggers, vistas
y Edge Functions se escribieron con revisión manual exhaustiva (orden de dependencias entre
tablas, nombres de columnas cruzados entre archivos, tipos y CHECKs contra los documentos fuente),
pero **sin ejecución real contra una base de datos**. `supabase db push` seguirá pidiendo tu
aprobación como estaba previsto; se recomienda ejecutar `supabase db reset` en tu máquina (con
Docker disponible) **antes** de aprobar el push, como primera verificación real.

---

## Inferencias razonables (no contradicen ningún documento, pero van más allá de lo explícito)

### E2 — `dispositivo.codigo_mac` con restricción `UNIQUE`
Ningún documento lo pide explícitamente, pero `01_AUTENTICACION_Y_ROLES.md` §4 describe el
`codigo_mac` como lo que "previene la suplantación de hardware": si dos dispositivos pudieran
compartir el mismo `codigo_mac`, la Edge Function no podría usarlo para identificar un dispositivo
de forma inequívoca. Se agregó `UNIQUE` sobre `dispositivo.codigo_mac`.

### E3 — `rol.nombre_rol` restringido por `CHECK` a los 7 roles definitivos
`01_AUTENTICACION_Y_ROLES.md` §3 dice explícitamente "estos son los únicos valores válidos de
`rol.nombre_rol`". Se interpretó como un `CHECK` cerrado a esos 7 valores, en vez de dejar la
columna como texto libre con solo `UNIQUE`. Si el equipo decide permitir roles adicionales en el
futuro, esto requiere un `ALTER TABLE ... DROP CONSTRAINT` trivial.

### E4 — `categoria_persona.CONDUCTOR` sembrada con `ambito = EXTERNA`
El catálogo de `codigo_categoria` (§6 del PDF) incluye `CONDUCTOR` sin especificar su `ambito`.
Las demás categorías se reparten claramente entre internas (DOCENTE, ESTUDIANTE, ADMINISTRATIVO,
TRABAJADOR) y externas (EMPRESA_SERVICIO, VISITANTE, PROVEEDOR, CONTRATISTA). Se sembró
`CONDUCTOR` como `EXTERNA` (conductor de una empresa de transporte/servicio contratada), pero es
una inferencia: un conductor interno de la EPN encajaría igual de bien en `TRABAJADOR`. Si el
equipo lo confirma como interno, es un `UPDATE` de una fila.

### E5 — Bootstrap de `auth.users` en `seed.sql` sin verificación de ejecución
Por §D13, el primer administrador (y, para que `guardia_punto_control` no quede vacío en la demo,
también un guardia) se siembran insertando directamente en `auth.users` (con `encrypted_password`
vía `pgcrypto`) para poder loguearse con Supabase Auth real, no solo con filas de `usuario_sistema`
huérfanas. Este patrón es el estándar de la comunidad Supabase, pero **no se pudo ejecutar en este
entorno** (ver E1) para confirmar que las columnas obligatorias de `auth.users` coinciden
exactamente con las de esta versión del CLI (`supabase_cli 2.105.0` / Postgres 17). Verificar con
el primer `supabase db reset` real que ambas cuentas (`admin@epn.edu.ec`,
`guardia.demo@epn.edu.ec`, contraseña `CambiarInmediatamente#2026`) pueden loguearse.

### E6 — Patrón `*_MODULO_ACCEDER` como permiso de lectura para tablas sin código dedicado
Varias filas de la matriz por tabla (`docs/02_MATRIZ_PERMISOS_RLS.md`) marcan `L` para roles que
no tienen ningún código de permiso dedicado a esa tabla — p. ej. `empresa` da `L` a GPI/GPE, pero
el listado de códigos no define `GPI_EMPRESA_SELECT` ni `GPE_EMPRESA_SELECT`; `categoria_persona`
y `parametro_sistema` dan `L` a los 7 roles sin ningún código por-módulo. **Regla aplicada en las
políticas RLS (bloque 4):** cuando la matriz marca `L` para un conjunto de roles sin código propio,
se usa el `OR` de los `*_MODULO_ACCEDER` de esos módulos como puerta de lectura (p. ej. `empresa`:
`ADM_MODULO_ACCEDER OR GPI_MODULO_ACCEDER OR GPE_MODULO_ACCEDER`), en vez de inventar códigos
nuevos. Se usó también para las tablas de otros módulos donde ADMIN+DIRECTOR necesitan lectura de
auditoría (`persona_interna_detalle`, `memorando`, `persona_memorando`, `autorizacion_visita_diaria`,
`zona`, `punto_control`, `evento_acceso`): ahí la puerta es `ADM_MODULO_ACCEDER` sola, porque tanto
ADMIN como DIRECTOR la tienen. Cuando el rol operativo CAC/GUARDIA también necesitaba entrar sin
código propio, se reutilizó `CAC_EVENTO_SELECT` (solo CAC), `CAC_EVENTO_SELECT_PUNTO_ASIGNADO`
(solo guardia) o `CAC_VALIDACION_EJECUTAR` (ambos) según cuál de los dos roles debía quedar
incluido — verificado caso por caso contra la lista explícita de permisos del guardia para no
filtrarle acceso a tablas donde la matriz lo excluye explícitamente (p. ej. `registro_biometrico`).

### E7 — Dos códigos de permiso nuevos: `ADM_BIOMETRIA_SELECT` y `CAC_AUTORIZACION_SELECT`
A diferencia de E6 (donde una combinación de códigos existentes resolvía el hueco), estos dos
casos no tenían ningún código reutilizable sin sobre-conceder acceso a un rol que la matriz excluye
explícitamente:
- `registro_biometrico`: ADMIN tiene `L⁴` (solo metadatos) pero DIRECTOR tiene `—`. Usar
  `ADM_MODULO_ACCEDER` habría colado a DIRECTOR (lo tiene igual que ADMIN). Se creó
  `ADM_BIOMETRIA_SELECT`, otorgado solo a ADMIN vía el wildcard `ADM_%` ya existente.
- `autorizacion_visita_diaria`: la matriz exige `L` para CAC y `L C A` (footnote 6) para el
  guardia, pero el listado de códigos original solo definía `CAC_AUTORIZACION_INSERT/UPDATE`, sin
  su `SELECT`. Se creó `CAC_AUTORIZACION_SELECT`, otorgado a CAC vía el wildcard `CAC_%` y añadido
  explícitamente a la lista del guardia.
Ambos siguen el formato `MODULO_ENTIDAD_ACCION` ya establecido y no renombran ni normalizan ningún
código existente (§D19 se respeta: esto es *añadir*, no *tocar* lo que ya existía).

### E8 — Tres permisos revocados a `RESPONSABLE_CONTROL_ACCESOS` por sobre-concesión del wildcard
El resumen "Asignación de permisos a roles" le da a `RESPONSABLE_CONTROL_ACCESOS` "todos los
`CAC_*` excepto `CAC_PERSONA_EXTERNA_INSERT`" — un criterio mecánico que, aplicado literalmente,
también le habría dado `CAC_EVENTO_INSERT` y `CAC_AUTORIZACION_INSERT/UPDATE`. Pero la matriz **por
tabla** (más granular, y la fuente de verdad declarada de RLS) marca a CAC con **solo `L`** en
`evento_acceso` y en `autorizacion_visita_diaria` — el `C`/`A` en esas dos filas está pegado
específicamente a la celda del guardia (footnotes 6 y 9: "el guardia registra el ingreso/salida
manual", "el guardia crea y revoca autorizaciones... la autorización depende del criterio del
guardia, no de la DRI"). Se resolvió a favor de la matriz granular (más específica) y se excluyeron
esos tres códigos de la asignación wildcard de `RESPONSABLE_CONTROL_ACCESOS`. Si el equipo
considera que el supervisor CAC sí debería poder registrar eventos/autorizaciones directamente
(no solo el guardia), es un `INSERT` de tres filas en `rol_permiso`.

### E9 — Heurística de clasificación `motivo_resultado` → `tipo_alerta`
El trigger `generar_alerta_desde_evento_denegado` (bloque 5) debe elegir uno de los 9 valores de
`alerta_seguridad.tipo_alerta` (§D16) a partir de un `evento_acceso` denegado. Ningún documento
define el algoritmo de clasificación — D16 explícitamente marca el catálogo como "provisional, a
confirmar con el equipo CAC". Se implementó una heurística conservadora por coincidencia de texto
en `motivo_resultado` (p. ej. contiene "biometr" → `BIOMETRIA_FALLIDA`), con `PERSONA_NO_AUTORIZADA`
como valor por defecto cuando no hay coincidencia. Esto asume que quien escribe `evento_acceso`
(la Edge Function del bloque 8, o el guardia) redacta `motivo_resultado` de forma reconocible.
Si el equipo prefiere una clasificación explícita (p. ej. un parámetro adicional en el INSERT en
vez de inferirla del texto), es un cambio acotado a esta función.
