# Estado del sistema al cierre de la ronda de ADM (Requerimientos_ADM)

Punto de partida para la siguiente sesión, centrada en **modificaciones de GPE y GPI**.

## Dónde está todo

| Qué | Dónde |
|---|---|
| Aplicación desplegada | https://security-system-epn.vercel.app |
| Rama | `main` — esta ronda se integró directamente, sin PR (ver "Cómo se trabajó") |
| Commits de la ronda | `2ee09bb` … `d2ac250` (6) |
| Decisiones tomadas | `docs/03_DECISIONES_Y_CORRECCIONES.md` §D41-D46 |
| Dudas y pendientes | `docs/99_DUDAS_PARA_EL_EQUIPO.md` §V14-V17 |
| Requerimientos atendidos | `docs/New_Req/Requerimientos_ADM.docx` |
| Requerimientos por atender | `docs/New_Req/Requerimientos_GPE.docx`, `Requerimientos_GPI.docx` |

## Qué cambió en esta ronda (resumen)

Diez peticiones sobre el módulo ADM, todas cerradas:

- **Usuarios y roles son un solo panel.** "Asignaciones de rol" dejó de existir como pantalla:
  rol, cédula, fecha de asignación y fecha de estado se ven y se gestionan en la ficha del
  usuario. Soporta varios roles activos por cuenta.
- **El alta de usuario busca por cédula**, no con un combo de todas las personas.
- **Permisos**: la columna principal es la descripción legible; el código técnico va debajo.
- **Categorías**: fuera `nombre_categoria` (eliminada de la base), entran ámbito y descripción.
- **Parámetros**: `unidad_medida` como columna propia; los nombres ya no llevan "(min)".
- **Personas**: dos tablas separadas, interna y externa.
- **Biometría**: referencia del rostro y lugar de almacenamiento. Nunca el archivo.
- **Vehículos**: las asociaciones se gestionan desde la ficha del vehículo (solo en ADM).
- **Bitácora → Auditoría**, sobre la vista nueva `v_auditoria`.
- **Tildes**: las 106 descripciones de permisos y las 7 de roles estaban sin acentuar.

## Cambios de entorno respecto a la sesión anterior

### ✅ Vercel ya está conectado al repositorio

Antes los despliegues eran manuales (`npx vercel --prod`), lo que obligaba a parar y pedirlos
a una persona. Ahora un push a `main` despliega solo.

**Consecuencia para el flujo de trabajo:** un push publica. Conviene volver a trabajar en rama
y abrir PR, y dejar `main` para lo aprobado.

### `supabase db push` sigue sin funcionar

El drift de timestamps del historial no se ha reconciliado. **Las migraciones se aplican una a
una con el MCP (`apply_migration`)**, y después se guarda el archivo en
`supabase/migrations/` con el mismo `version_name` que devuelve `list_migrations`. Es el
procedimiento vigente. Reconciliar el historial sigue pendiente.

### TestSprite configurado

| Proyecto | ID |
|---|---|
| `Sistema de Seguridad EPN - Web` (frontend, 10 planes) | `95936660-3989-4f92-a0ce-d536ee25b14a` |
| `Sistema de Seguridad EPN - API` (backend, 1 prueba) | `25bd3dbb-b7dc-4688-8141-6f289513ea66` |

Los planes viven en `tests/testsprite/planes/*.json` y la prueba de backend en
`tests/testsprite/`. El proyecto de frontend ya tiene credencial de acceso configurada.

> **Aviso de permisos:** el sistema de permisos bloquea enviar credenciales a servicios
> externos, así que `testsprite project credential` y `project update --password` los tiene
> que ejecutar una persona. Lo mismo pasaba con el despliegue antes de conectar Vercel.

## Cuentas de prueba

Las 8 cuentas usan la contraseña **`admin1234`** y tienen `requiere_cambio_password = false`.

> **Cambio respecto al documento anterior:** `frank.jumbo` **ya no está bloqueado**. Se
> desbloqueó durante la revisión manual de esta ronda (queda registrado en Auditoría:
> `BLOQUEADO → ACTIVO`, ejecutado por `admin`). Si necesitas una cuenta bloqueada para probar,
> créala tú desde la pantalla — es lo que hace ahora el plan de TestSprite de estados, en vez
> de confiar en cómo la dejó otro.

## Piezas reutilizables (las de esta ronda, arriba)

- `ResourceConfig.detalleExtra` — bloque propio en el **cuerpo** del panel de detalle, para
  gestionar registros relacionados sin salir de la ficha. Es lo que usa
  `components/AsociacionesVehiculo.tsx`. Distinto de `accionDetalle`, que es un botón del pie.
- `public.acentuar_texto(text)` — repone tildes en textos sembrados sin ellas. **Reutilizable
  tal cual para los datos de GPE/GPI.** Ojo: los plurales en `-ciones` no llevan tilde y por
  eso no están en su lista.
- `public.v_auditoria` — bitácora legible. `security_invoker = true`, obligatorio.
- `lib/catalogos.ts` → `etiquetaCampo()` y `ETIQUETA_CAMPO` — nombre de columna → etiqueta con
  tildes. Al añadir columnas nuevas visibles, añadirlas ahí.
- `components/BuscarPersonaPorCedula.tsx` — reemplaza combos con todas las personas. Acepta
  `id` para asociar la etiqueta al campo (si hay dos en la misma pantalla, dales `id` distinto).
- `lib/useBorrador.ts` — persistencia de formularios.
- `lib/errores.ts`, `lib/validacion.ts` — errores en español y validadores espejo del SQL.

---

# Para la próxima sesión: GPE y GPI

Además de lo que pidan los dos documentos de requerimientos, hay cuatro asuntos transversales
que el equipo quiere revisar en todo el sistema. Esto es lo que ya sé de cada uno.

## 1. Validaciones de datos

La base es la que manda: los validadores de `web/src/lib/validacion.ts` son un **espejo** de
las funciones SQL, y existen solo para adelantar el error antes de enviar. Si añades una regla,
va primero en SQL (migración) y después en el espejo, nunca al revés.

Ya cubierto: cédula, RUC, placa por tipo de vehículo, nombres, fechas, correo institucional,
teléfono, códigos de parámetro y de permiso, valor según `tipo_dato`.

Puntos a mirar en GPE/GPI:

- **`persona_interna_detalle`** (cargo, unidad, carrera, escalafón) no tiene validaciones
  propias más allá de los CHECK básicos.
- **Memorandos**: `numero_memorando` es texto libre sin patrón (§V3), y `fecha_fin` vs
  `fecha_inicio` conviene revisar que estén cubiertas por CHECK.
- **`tipo_servicio`** de empresa sigue siendo texto libre sin catálogo (§V3, §V4).
- Las **18 cédulas ficticias** siguen sin sustituir (§V11) — afectan sobre todo a GPI.

## 2. Fallas de ortografía

**Este fue el hallazgo más grande de la ronda de ADM y hay que asumir que se repite.** Las
descripciones sembradas de permisos y roles estaban sin tildes desde la carga inicial; pasaba
desapercibido mientras nadie las mostraba en pantalla.

Cómo buscarlas: no basta con revisar el código, hay que **revisar los datos**. Consulta
directa, por ejemplo:

```sql
select codigo_permiso, descripcion from permiso
where descripcion ~ '\m(vehiculo|parametro|categoria|biometrico|sesion|codigo|auditoria)\M';
```

Y para corregir, `public.acentuar_texto(...)` ya existe. Candidatos que aún no se han revisado:
`zona.nombre_zona`, `punto_control.nombre_punto`, `dispositivo`, `memorando.asunto`,
`empresa.tipo_servicio`, `persona_interna_detalle` y los `motivo_*` que escriben los guardias.

En el frontend, `lib/catalogos.ts` traduce los códigos de catálogo (`DADO_DE_BAJA` → "Dado de
baja"), así que ahí el problema está resuelto **siempre que el valor nuevo se añada al mapa**.

## 3. Descripciones innecesarias para el usuario final

Hay textos que explican el sistema a quien lo construyó, no a quien lo usa. Dos categorías
concretas, con ejemplos reales que siguen en el código:

**a) Códigos de permiso mostrados en pantalla.** Cuando alguien no tiene acceso, ve la clave
técnica:

| Archivo | Texto actual |
|---|---|
| `pages/modules/UsuariosScreen.tsx:191` | "Requiere ADM_USUARIO_SELECT." |
| `pages/modules/BiometriaScreen.tsx:100` | "Requiere el permiso GPI_BIOMETRIA_SELECT." |
| `pages/modules/BiometriaScreen.tsx:155` | "Requiere GPI_BIOMETRIA_INSERT." |
| `pages/modules/AlertasScreen.tsx:84` | "Requiere CAC_ALERTA_SELECT." |
| `pages/modules/RolPermisoScreen.tsx:78` | "Requiere ADM_ROL_PERMISO_SELECT." |

A un guardia, `GPI_BIOMETRIA_INSERT` no le dice nada y no puede hacer nada con ese dato. Lo
útil sería "Pide acceso al administrador del sistema". El código técnico, si se quiere
conservar para soporte, cabe en un `title` o en la consola.

**b) Jerga interna en las tarjetas de módulo** (`resources/registry.tsx`): "Enrolamiento facial
1:N", "Vínculos persona–vehículo", "Metadatos de registros biométricos", "Categoría × punto ×
horario", "Ciclo de vida de vehículos". Describen la implementación, no la tarea.

Regla práctica al revisar: si el texto nombra una tabla, un permiso, un algoritmo o un
documento interno (§D20 y similares), no es para el usuario final.

## 4. Vehículo y asociaciones

En ADM ya está hecho: las asociaciones persona-vehículo se gestionan desde la ficha del
vehículo (`detalleExtra` + `AsociacionesVehiculo`) y la tarjeta suelta desapareció.

**GPI y GPE conservan su tarjeta "Asociaciones" separada**, a propósito: se decidió que ahí el
alta de vínculos es parte del trabajo diario y no una excepción administrativa
(`registry.tsx:57` y `:73`). Si en esta ronda el equipo pide lo mismo que en ADM, la pieza ya
está construida y es un cambio pequeño:

```tsx
detalleExtra: (r, { recargar }) => <AsociacionesVehiculo idVehiculo={r.id_vehiculo} onCambio={recargar} />
```

Lo único a decidir es si `AsociacionesVehiculo` debe filtrar las personas por ámbito, como hace
hoy `cfgPersonaVehiculo` (GPI solo internas, GPE solo externas). Hoy no filtra: en ADM no debía.

---

## Cómo verificar que nada se rompió

```bash
cd web && npm run verificar        # typecheck + 69 pruebas + build
```

GitHub Actions lo ejecuta solo en cada push a `main` y en cada PR
(`.github/workflows/verificar.yml`).

Pruebas contra la base real (no dejan rastro salvo filas de auditoría):

```bash
export SB_URL=... SB_ANON=... SB_PASSWORD=admin1234
python3 scripts/prueba_multisesion.py
python3 scripts/prueba_bloqueo_intentos.py
python3 scripts/prueba_cierre_sesion.py
psql "$DATABASE_URL" -f scripts/pruebas_validaciones_nuevas.sql   # BEGIN … ROLLBACK
psql "$DATABASE_URL" -f scripts/pruebas_adm_nuevas.sql            # BEGIN … ROLLBACK
```

TestSprite:

```bash
testsprite test run <testId> --wait                                  # frontend, uno a uno
testsprite test run --all --project 25bd3dbb-b7dc-4688-8141-6f289513ea66   # backend
```

### Qué cubren las pruebas automáticas (69 casos)

| Archivo | Qué protege |
|---|---|
| `lib/validacion.test.ts` | Cédula, RUC, placa, nombres, fechas, correo, teléfono |
| `lib/errores.test.ts` | Que ningún error del proveedor llegue en inglés al usuario |
| `auth/password.test.ts` | Que la reautenticación no cierre la sesión real |
| `lib/useBorrador.test.ts` | Persistencia de formularios y que **nunca** se guarden contraseñas |
| `pages/LoginPage.test.tsx` | Que tras iniciar sesión se entre al panel principal |
| `pages/ModuleHome.test.tsx` | Navegación del módulo y qué tarjetas existen |
| `pages/modules/UsuariosScreen.test.tsx` | Panel único de usuarios, alta por cédula, borrador |
| `resources/configs-lectura.test.tsx` | Auditoría legible y que Biometría no pinte el rostro |

> Al añadir campos, asocia la etiqueta con el campo (`<Field htmlFor="x">` + `<Input id="x">`).
> Sin eso un lector de pantalla no anuncia la etiqueta, y las pruebas no pueden localizar el
> campo. Esta ronda apareció justo ese fallo en `BuscarPersonaPorCedula`.

## Pendientes reales (no bloquean, dependen de terceros o de plan de pago)

1. **SMTP propio**: la recuperación de contraseña usa el correo integrado de Supabase, limitado
   a 2 correos/hora y con el asunto en inglés.
2. **Fuerza bruta**: el bloqueo por 5 intentos funciona, pero el conteo depende de que el
   intento pase por la Edge Function `iniciar-sesion`. Cerrarlo del todo requiere el Auth Hook
   de GoTrue (plan de pago) o activar hCaptcha (gratis).
3. **SRI / ANT / Registro Civil**: sin integración; `empresa.estado_verificacion_ruc` queda en
   `NO_VERIFICADO`.
4. **18 cédulas ficticias** pendientes de sustituir por las reales.
5. **Historial de migraciones**: reconciliar para recuperar `supabase db push`.
6. **Auto-refresco del token de TestSprite** (`project auto-auth`): es de plan Pro. Con
   credencial estática, un token de Supabase caduca en una hora.
