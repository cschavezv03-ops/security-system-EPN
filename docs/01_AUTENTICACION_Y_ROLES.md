# 01 — Autenticación y Roles

> **Autoridad:** este documento manda sobre cualquier otro en materia de autenticación,
> roles y credenciales. Reemplaza lo que `ADM_Login_Roles_Permisos.md` decía sobre
> `password_hash` y sobre los roles "propuestos".

---

## 1. Los tres mecanismos de identidad del sistema

El sistema tiene **tres** formas distintas de "identificarse", y confundirlas es el error
más común. No son intercambiables:

| # | Mecanismo | Quién lo usa | Qué protege | Implementación |
|---|---|---|---|---|
| 1 | **Login al sistema** (usuario + contraseña) | Personal con cuenta: admin, director, responsables de módulo, guardias | El acceso a la *aplicación* | Supabase Auth (`auth.users`) |
| 2 | **Biometría facial** (rostro) | Cualquier persona que cruza un punto de control | El acceso *físico* al campus | Tabla `registro_biometrico` + Edge Function (mock) |
| 3 | **Identidad de servicio** (service key) | Dispositivos: cámaras, torniquetes, lectores LPR | El registro *automático* de eventos | `service_role` key de Supabase |

Una `persona` puede tener biometría sin tener cuenta de login (un estudiante), o cuenta de
login sin ser relevante para el acceso físico. Son ejes independientes.

---

## 2. Login al sistema — decisión: `auth.users` nativo

**Decidido:** se usa el sistema de autenticación nativo de Supabase.

### Consecuencias sobre el modelo de datos

- Se **elimina** la columna `password_hash` de `usuario_sistema`. Supabase Auth guarda y
  verifica la contraseña; nunca la almacenamos nosotros.
- `usuario_sistema.id_usuario` pasa a ser `uuid` con `REFERENCES auth.users(id) ON DELETE RESTRICT`.
  Deja de generarse con `gen_random_uuid()`: **hereda el id de `auth.users`**.
- `usuario_sistema` se convierte en una **tabla de perfil**: conserva `nombre_usuario`,
  `estado_usuario`, `intentos_fallidos`, `requiere_cambio_password`, `fecha_ultimo_login`,
  `id_persona` (FK a `persona`), `fecha_creacion`, `fecha_modificacion`.
- `correo_electronico` se mantiene en `usuario_sistema` **espejado** desde `auth.users.email`
  (sincronizado por trigger), para no romper las consultas del resto de módulos.
- Un trigger `on auth.users AFTER INSERT` crea automáticamente la fila en `usuario_sistema`.
- La tabla `sesion` **se conserva** (el modelo la exige y da trazabilidad propia), pero es
  informativa/auditora: Supabase gestiona el JWT real. `token_hash` guarda un hash del token
  de Supabase, nunca el token en claro.

### Permisos efectivos y `allowed_modules`

El cálculo se mantiene exactamente como lo define `ADM_Login_Roles_Permisos.md` §9:

```
auth.users → usuario_sistema → usuario_rol (activos)
           → rol (activos) → rol_permiso (activos) → permiso (activos)
           → permisos efectivos → allowed_modules
```

Un módulo entra en `allowed_modules` solo si el usuario tiene su permiso `*_MODULO_ACCEDER`.

Implementación recomendada: una función SQL `auth.permisos_efectivos()` (SECURITY DEFINER)
que devuelva el conjunto de `codigo_permiso` del usuario actual (`auth.uid()`), y que las
políticas RLS invoquen. Los permisos **no** se copian a los claims del JWT: se leen en vivo,
para que una revocación de rol surta efecto inmediato sin esperar un nuevo login
(requisito explícito de `ADM_Login_Roles_Permisos.md` §10.3).

---

### Bootstrap: orden de creación (§D12, §D13, §D14)

Tres detalles críticos que hay que respetar o el sistema no arranca:

1. **`id_persona` viaja en `raw_user_meta_data`.** El trigger `on auth.users AFTER INSERT` no
   puede adivinar a qué persona pertenece la cuenta, y `usuario_sistema.id_persona` es
   `NOT NULL`. Al crear la cuenta se pasa `id_persona` (y `nombre_usuario`) en la metadata, y
   el trigger los lee de ahí. **Orden obligatorio: primero la `persona`, después la cuenta.**

2. **El primer administrador se crea en el seed.** El `ADMINISTRADOR_SISTEMA` no tiene INSERT
   sobre `persona` (§D5), así que nadie podría crearlo desde la aplicación. `seed.sql` inserta
   directamente su `persona` + `usuario_sistema` + `usuario_rol`, ejecutándose con
   `service_role` (que opera fuera de RLS por definición). Patrón de bootstrap estándar.

3. **`sesion.token_hash` es NULLABLE.** Supabase gestiona el JWT y este vive en el cliente:
   nuestro backend nunca lo tiene para hashearlo. La fila de `sesion` se inserta con una función
   RPC llamada tras el login exitoso (registra `fecha_inicio`, `ip_origen`, `estado_sesion`).
   Es el **único cambio a una columna** del Modelo de Datos Consolidado.

---

## 3. Roles definitivos (tabla `rol`)

Estos son los **7 roles humanos** del sistema. Son los únicos valores válidos de
`rol.nombre_rol`. Los códigos ADM/GPI/GPE/PCO/CAC son **módulos**, no roles — nunca deben
aparecer como filas en `rol`.

| `nombre_rol` | Nombre legible | Módulo visible | Alcance |
|---|---|---|---|
| `ADMINISTRADOR_SISTEMA` | Administrador del Sistema | ADM | Seguridad lógica: usuarios, roles, permisos, parámetros, auditoría, catálogos maestros. |
| `DIRECTOR_ADMINISTRATIVO` | Director Administrativo | ADM (solo lectura) | Consultas, reportes y auditoría. **No modifica ningún dato.** |
| `RESPONSABLE_PERSONAL_INTERNO` | Responsable de Personal Interno | GPI | Personal interno, biometría, asociaciones vehiculares. |
| `RESPONSABLE_PERSONAL_EXTERNO` | Responsable de Personal Externo | GPE | Personal externo, memorandos, autorizaciones, biometría de externos. |
| `RESPONSABLE_PUNTOS_CONTROL` | Responsable de Puntos de Control | PCO | Zonas, puntos de control, dispositivos. |
| `RESPONSABLE_CONTROL_ACCESOS` | Responsable de Control de Accesos | CAC | Reglas de acceso, supervisión de eventos, atención de alertas. |
| `GUARDIA_SEGURIDAD` | Guardia de Seguridad | CAC (vista operativa) | Operación diaria: validaciones, entradas/salidas, visitas sin memorando. |

**Roles acumulables:** una persona puede tener varios roles; sus permisos efectivos son la
unión de las asignaciones activas.

**"Cuenta propia únicamente":** todo usuario autenticado, sin importar su rol, puede cambiar
su contraseña, cerrar sesión y consultar su propia sesión. Esto **no** le da acceso al módulo ADM.

---

## 4. Identidad de dispositivos — decisión: service key

**Decidido:** los dispositivos (cámaras, torniquetes, lectores LPR) **no** usan la sesión de
un guardia. Tienen identidad de servicio propia.

- Los dispositivos llaman a una **Edge Function**, nunca a la API REST directamente.
- La Edge Function se autentica contra la base de datos con la **`service_role` key**
  (que hace bypass de RLS por diseño) y valida internamente el `codigo_mac` / `direccion_ip`
  del dispositivo contra la tabla `dispositivo` antes de aceptar el evento.
  Esto es lo que previene la suplantación de hardware que el modelo ya contempla.
- Eventos generados así se insertan con `evento_acceso.origen_registro = 'AUTOMATICA'` y
  `id_usuario` nulo donde aplique.
- Eventos registrados manualmente por un guardia usan **su JWT** y se marcan con
  `origen_registro = 'MANUAL'`.

⚠️ La `service_role` key **nunca** debe llegar al frontend ni al repositorio. Vive solo como
secreto de la Edge Function (`supabase secrets set`).

---

## 5. Duración y expiración de sesiones — decidido

**Decidido.** La expiración de sesiones la gestiona **Supabase Auth de forma nativa**, no
nuestra lógica. No se implementa a mano ni requiere triggers.

### Configuración (en `supabase/config.toml`)

```toml
[auth.sessions]
inactivity_timeout = "60m"   # cierra la sesión tras 60 min SIN actividad
timebox            = "12h"   # tope absoluto desde el login, pase lo que pase
```

Adicionalmente, en la configuración de Auth del proyecto: **`recordar_sesion` deshabilitado**
(no tiene sentido "recordarme" en un terminal compartido de garita).

### Por qué estos valores

| Mecanismo | Valor en el prototipo | Valor para producción |
|---|---|---|
| Inactividad | **60 min** | 10–15 min (garitas), 30 min (oficina) |
| Time-box absoluto | **12 h** | 12 h (duración de un turno) |

El mecanismo que realmente protege una garita es el **timeout por inactividad** (el riesgo es
el terminal desatendido, no que el guardia lleve mucho rato logueado). El time-box absoluto es
solo un tope de seguridad de fondo — un time-box corto expulsaría al guardia a mitad de turno
con gente esperando, lo que empeora la seguridad en la práctica (contraseñas anotadas, cuentas
compartidas).

En el prototipo se usan **60 min de inactividad** en lugar de 10–15 para no interrumpir las
pruebas y demostraciones. El mecanismo queda implementado y demostrable; solo cambia el número.

**No se diferencia por rol.** Supabase configura estos timeouts a nivel de proyecto y
diferenciarlos exigiría lógica propia en la aplicación, sin beneficio real en este alcance.

### Consecuencias sobre el modelo de datos: ninguna

- La tabla `sesion` **se mantiene sin cambios**, como tabla de **auditoría**: registra
  `fecha_inicio`, `fecha_cierre`, `ip_origen`, `estado_sesion`. **Supabase es la fuente de
  verdad de la expiración real**, no esta tabla.
- `TIEMPO_SESION_MIN` **se mantiene como fila en `parametro_sistema`** (el modelo lo exige),
  documentando la intención — aunque quien lo aplica efectivamente sea Supabase Auth.
- **No** se añade `fecha_ultima_actividad`. **No** se toca ninguna tabla.

⚠️ Nota para evitar una confusión frecuente: el JWT de acceso de Supabase caduca por defecto en
1 hora, pero **eso no cierra la sesión** — el cliente lo renueva solo con el refresh token, de
forma invisible. La expiración real de la sesión es la que configuran `inactivity_timeout` y
`timebox` arriba.

---

## 6. Validación de acceso físico — las dos vías (§D20)

⚠️ **El sistema NO valida a todo el mundo con biometría.** Hay dos vías, según el tipo de persona:

| | **INTERNA** | **EXTERNA** |
|---|---|---|
| Identidad | Biometría facial | **Cédula**, tecleada por el guardia |
| Autorización | `persona.estado = 'ACTIVO'` | Memorando vigente / autorización diaria |
| Quién valida | El dispositivo | El guardia |
| `origen_registro` | `AUTOMATICA` | `MANUAL` |
| ¿Tiene biometría? | **Sí, siempre** | **No, nunca** |

**Los externos nunca tienen `registro_biometrico`.** Un trigger debe impedir enrolar biometría
de una persona con `tipo_persona = 'EXTERNA'`. `persona.cedula` necesita índice: es el campo por
el que el guardia busca.

### Biometría facial (solo interna) — implementación real 1:N con pgvector

> **Decisión del equipo (2026-07-14).** Se sustituye el mock 1:1 por un
> reconocimiento facial **real** de identificación **1:N**, sin hardware
> dedicado: la cámara de laptop/celular basta. Supabase sigue **sin** hacer el
> reconocimiento; lo hace el descriptor facial + pgvector.

**Cómo funciona:**

- El **descriptor facial (128 dimensiones)** se calcula **en el navegador** con
  `face-api.js` (no hay proveedor externo ni costo). La **comparación ocurre en
  el backend** con **pgvector**: la BD sigue siendo la única fuente de verdad y
  el match no se puede falsificar desde el cliente.
- El flujo de ingreso de personal interno es una **identificación 1:N**
  ("¿de quién es este rostro?"), no una verificación 1:1. La Edge Function
  `validar-biometria` recibe `{ descriptor: number[128], id_dispositivo? }` y
  devuelve `{ match, id_persona, confidence }` — **la misma forma de respuesta
  que tendría un proveedor real** (AWS Rekognition `SearchFacesByImage`, Azure
  Face `Identify`, etc.).
- La búsqueda 1:N es la función SQL `identificar_por_descriptor` (pgvector,
  **distancia euclidiana / L2**): devuelve la persona **INTERNA** enrolada más
  cercana y su `confidence = 1 − distancia_L2`. **No** filtra por `estado`:
  identificar es distinto de autorizar; el estado ACTIVO, la regla y el horario
  los decide después `registrar-evento-acceso`.
  > ⚠️ **Métrica: euclidiana, NO coseno.** Los descriptores de face-api.js están
  > diseñados para compararse por distancia euclidiana. Con coseno, dos personas
  > distintas dan ~0.88 de similitud (falsos positivos medidos con rostros
  > reales el 2026-07-14). Con L2 hay separación real: genuino ≈ 0.44 de
  > confidence, impostor ≈ 0.29–0.31.
- **Un solo umbral para todo el pipeline:** el match se decide con el parámetro
  `UMBRAL_BIOMETRIA` (**0.38** = 1 − distancia L2 máxima 0.62; estricto con
  margen, ajustable en `parametro_sistema` sin tocar código), el mismo que ya
  compara `registrar-evento-acceso`. Por eso el resto del flujo CAC
  (evento → identidad → regla → resultado → alerta) **no cambia**.
- El enrolamiento usa la RPC `enrolar_biometria` (SECURITY INVOKER: respeta la
  RLS de GPI y el trigger que prohíbe biometría de externos). `forzar_fallo`
  sigue disponible para probar el camino de denegación/alertas.
- Las imágenes viven en **Supabase Storage** (bucket privado `registro-biometrico`),
  nunca en una columna; `registro_biometrico.path_storage` guarda la referencia.
  El **descriptor** sí se guarda, en `registro_biometrico.descriptor_facial`
  (`vector(128)`), para poder comparar.
- Comentario `// TODO: reemplazar por proveedor real antes de producción` visible:
  al migrar a un proveedor real solo cambia el origen del descriptor y esta
  función; el resto del flujo depende únicamente de la forma de la respuesta.

**Banco de pruebas con cámara:** `scripts/banco_biometria/` (herramienta de
desarrollo) permite enrolar e ingresar usando la cámara, antes de que exista el
frontend real.
