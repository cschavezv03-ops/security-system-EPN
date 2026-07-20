# Estado del sistema — punto de partida para la siguiente sesión

La ronda de **PCO v2** está cerrada. Lo siguiente es la **comprobación total del sistema**.

---

## ✅ La ronda de ADM está fusionada y desplegada

PR **#7** fusionado. Verificado tras el despliegue: producción sirve el bundle nuevo
(`registry-B7VQTN_5.js`) con el panel de rol único, la edición de la cuenta y el alta de persona
desde ADM; el texto que mandaba a GPI ya no está.

| | |
|---|---|
| Producción | https://security-system-epn.vercel.app |
| TestSprite | **5 planes, 5 en verde** (66 pasos) |
| Pruebas locales | 185 en verde, typecheck y build |
| Aserciones SQL | `scripts/pruebas_adm_cuentas.sql`, pasa entero |

**El esquema y el frontend desplegado vuelven a ir a la par.** Comprobado en la base al cerrar:

| Comprobación | Resultado |
|---|---|
| Correos desincronizados entre persona, cuenta y credencial | 0 |
| Cuentas con más de un rol activo | 0 |
| Cuentas cuya categoría no puede operar el sistema | 0 |
| No estudiantes con código único o carrera | 0 |
| Personas externas con cuenta | 0 |

Al cierre se añadieron tres migraciones más (§D76, §V40): **una cuenta del sistema pertenece al
personal, nunca a un estudiante**, comprobado al crear la cuenta y al cambiar la categoría de
quien ya la tiene. Salió de encontrar a `frank.jumbo` como ESTUDIANTE con rol de guardia; era la
única de las nueve cuentas fuera de norma.

## ✅ Qué resolvió la ronda de ADM

Cuatro incidencias que salieron de la revisión manual del administrador, todas reproducidas antes
de tocar código (decisiones §D72-§D75):

- **El correo vivía en tres sitios sin nada que los uniera.** Se registró a una persona con un
  correo equivocado, se corrigió en GPI y **la cuenta siguió entrando con el viejo durante días**.
  Ahora `persona.correo`, `usuario_sistema.correo_electronico`, `auth.users.email` y la identidad
  de GoTrue son un solo dato que el sistema mantiene idéntico, se toque desde GPI o desde ADM.
  Va en triggers y no en una Edge Function para que la propagación ocurra **dentro de la misma
  transacción**.
- **El alta no rellenaba el correo.** Causa raíz: `BuscarPersonaPorCedula` no pedía `correo` en su
  consulta. Ahí se colaba la errata.
- **El solapamiento de roles era un fallo real, no teórico.** `guardia_demo` tenía Guardia +
  Responsable de Personal Interno y, como la vista de Garita reemplaza toda la aplicación, esa
  cuenta **no podía entrar a GPI de ninguna manera**. Ahora: un rol activo por cuenta, impuesto
  con un índice único, y cambio atómico con `asignar_rol_unico`.
- **El administrador podía quitarse su propio rol.** La guarda existente solo cubría al *último*
  administrador; que hoy no ocurriera era casualidad, no protección.

Además, **ADM ya no depende de GPI para dar de alta un usuario**: si la cédula no existe, el
mismo formulario registra a la persona interna (permiso nuevo `ADM_PERSONA_INSERT`, acotado por
RLS a `INTERNA`) y continúa con la cuenta y el rol. Y desde la ficha se editan correo y nombre de
usuario.

**El bloqueo de 15 minutos se comprobó de extremo a extremo y funciona** (§V37): cinco intentos
bloquean, se escribe `banned_until` en GoTrue y, vencido el plazo, la cuenta entra **al primer
intento**.

## ⚠️ Cosas que hacer ANTES de empezar

**1. Volver a proteger los previews.** Panel de Vercel → proyecto `security-system-epn` →
**Settings → Deployment Protection** → **Vercel Authentication** → **Enabled**. Sigue desactivado
para que TestSprite pueda entrar; mientras siga así, cualquier URL de preview es accesible para
quien la tenga.

**2. Activar la protección de contraseñas filtradas.** Panel de Supabase →
**Authentication → Policies → Passwords** → *Leaked password protection*. Comprueba las
contraseñas contra HaveIBeenPwned; ahora mismo está desactivada y el linter lo señala. Es un
interruptor del panel: no se puede hacer por migración.

*(Las contraseñas de las cuentas ya NO hay que verificarlas: se comprobaron una a una, §V38.
Las 8 sembradas usan `admin1234`; `lady.velasquez` usa la suya porque completó el cambio
obligatorio, que es lo correcto.)*

**3. `guardia.demo@epn.edu.ec` ya NO ve GPI** (§V39). Al imponer un rol por cuenta se quedó solo
con GUARDIA_SEGURIDAD; el otro rol estaba marcado `TEMPORAL_PRUEBA_BIOMETRIA`. Para probar GPI,
`lenin.amangandi@epn.edu.ec`. Su turno sigue siendo 12:00–23:59 y fuera de esa ventana no puede
operar (req 34); para moverlo:

```sql
update public.guardia_punto_control
   set hora_inicio = '06:00', hora_fin = '18:00'
 where id_usuario = (select id from auth.users where email = 'guardia.demo@epn.edu.ec')
   and estado_asignacion = 'ACTIVA';
```

**4. El token del lector de placas: decidido NO activarlo** en el prototipo 3.
`PLATE_RECOGNIZER_TOKEN` no está configurado y el sistema funciona con el lector local
(Tesseract). Medido (§D71): con la placa llenando el marco el local acierta casi siempre, así que
la ganancia del motor en la nube es pequeña para una demo, y a cambio manda las imágenes a un
tercero y exige internet en el momento de la captura.

---

## La próxima ronda es de PCO

El documento de requerimientos es `docs/New_Req/Requerimientos_PCO.docx`. Antes de leerlo conviene
mirar lo que **ya se sabe que está a medias** en ese módulo, porque son cosas que el equipo ya
identificó y que probablemente reaparezcan en el documento:

| # | Qué | Por qué importa |
|---|---|---|
| ~~§V27~~ | ~~El "código único" enfrenta a PCO con GPI~~ | **✅ RESUELTA antes de empezar** (§D77). No era una contradicción: la frase de PCO hablaba de cómo se identifica a la gente, no del modelo de datos. El código único se queda como dato académico; identificar es siempre por cédula. De paso se corrigieron los dos sitios que aún no lo cumplían. |
| §V24 | El "Parqueadero Subsuelo EARME" cuelga del campus, no de un edificio | **Empezar por aquí ahora.** Dato mal colocado en la jerarquía de zonas. |
| §V25 | Puntos de control que cuelgan directamente del campus | Mismo problema, otra entidad. |
| §V28 | La búsqueda "solo con 10 dígitos o por apellido" no se implementó | Requisito pedido y no hecho. |
| §V30 | El descanso entre jornadas no se comprueba con turnos nocturnos combinados | Ojo con §D59/§D69: el error de medianoche ya ha aparecido tres veces. |

### Qué cambió esta ronda que afecta a PCO

- **`heidy.tenelema@epn.edu.ec` es la cuenta de PCO** y ahora tiene **un solo rol**. Si alguna
  prueba le asignaba un rol extra, ya no es posible: asignar otro **revoca** el que tenga.
- **Cambiar el correo de una persona con cuenta ahora cambia su credencial.** Si PCO edita
  personas, tenerlo presente: ya no son datos independientes.
- **`vista_categoria_sin_regla`** (de la ronda de CAC) sigue siendo la forma rápida de ver qué
  categorías dejarían gente fuera del campus. Útil al tocar zonas y puntos.

## Dónde está todo

| Qué | Dónde |
|---|---|
| Producción | https://security-system-epn.vercel.app (rama `main`) |
| Decisiones | `docs/03_DECISIONES_Y_CORRECCIONES.md` — §D53-§D61 son de PCO; §D62-§D71, de CAC; §D72-§D77, de ADM. Antes de añadir una: `python3 scripts/verificar_numeracion_docs.py` |
| Dudas y pendientes | `docs/99_DUDAS_PARA_EL_EQUIPO.md` — §V37-V39 son de la ronda de ADM; §V31-V36, de CAC |
| Calibrar los umbrales | `scripts/calibracion_biometria` y `scripts/calibracion_placas` |
| **Cómo probar las placas y el rostro** | `docs/New_Req/GUIA_PRUEBAS_PLACAS.md` |
| Despliegue | `docs/DESPLIEGUE.md` |
| Feedback de CAC | `docs/New_Req/Requerimientos_CAC.docx` |
| Feedback de PCO y ADM | `docs/New_Req/Requerimientos_PCO.docx`, `Requerimientos_ADM.docx` |

## Cómo trabajar (lo que funcionó)

```bash
git checkout main && git pull
git checkout -b feat/<modulo>-mejoras
```

1. **Las migraciones van por MCP**, una a una con `apply_migration`, y **después** se guarda el
   archivo en `supabase/migrations/` con el `version_name` que devuelve `list_migrations`.
   `supabase db push` sigue sin funcionar (§7 de pendientes).
2. **Las Edge Functions van por la CLI**, que **sí está autenticada**:
   `supabase functions deploy <nombre> --project-ref hwfayejcwpmercvmmyvw`. Es mucho más rápido
   que pasar el fichero entero por el MCP. Lo mismo para regenerar tipos:
   `supabase gen types typescript --project-id hwfayejcwpmercvmmyvw --schema public`.
3. **Un commit por grupo lógico.** No un commit gigante.
4. **Verificar antes de dar nada por hecho:** `cd web && npm run verificar` (typecheck + 185
   pruebas + build).
5. **Push a la rama** → Vercel genera un preview. La URL **no** se puede adivinar: se saca de la
   API de GitHub, que es donde Vercel publica el deployment.
   ```bash
   SHA=$(git rev-parse HEAD)
   curl -s "https://api.github.com/repos/cschavezv03-ops/security-system-EPN/deployments" | head -c 300
   curl -s ".../deployments/<id>/statuses" | grep environment_url
   ```
   El scope de Vercel es **`epnsw`**, no el usuario de GitHub.

## TestSprite: lo que hay que saber

**1. La credencial del proyecto pisa la del plan.** TestSprite inyecta `admin@epn.edu.ec` en el
formulario de login. Para que un plan entre a otro módulo, el primer paso debe decirlo explícito:

> "Abrir la aplicación. En la pantalla de inicio de sesión, BORRAR cualquier valor que venga
> precargado en el campo de correo y escribir exactamente `<correo>`; en el campo de contraseña
> escribir `admin1234`. Es imprescindible usar esa cuenta y no otra. Después pulsar 'Ingresar al
> sistema'."

**Qué cuenta usar** (todas con `admin1234`):

| Módulo | Cuenta | Rol |
|---|---|---|
| **CAC** | `carlos.chavez03@epn.edu.ec` | Responsable de Control de Accesos (Carlos Chávez) |
| **Garita** | `guardia.demo@epn.edu.ec` | Guardia (**ya no ve GPI**, §V39) |
| PCO | `heidy.tenelema@epn.edu.ec` | Responsable de Puntos de Control |
| ADM | `admin@epn.edu.ec` | Administrador del Sistema |
| GPI | `lenin.amangandi@epn.edu.ec` | Responsable de Personal Interno |
| GPE | `joel.velastegui@epn.edu.ec` | Responsable de Personal Externo |

**2. Afirma el ROL, no el correo.** TestSprite comprueba lo que ve en pantalla, y en el
encabezado no aparece el correo sino el nombre y el rol. Un plan que afirme "la sesión
corresponde a carlos.chavez03@epn.edu.ec" se declara **blocked** aunque el login haya ido bien.
Fue así como se destapó §V36: el encabezado decía "Sebastián Chávez" porque el nombre de esa
persona estaba mal (ya corregido a **Carlos Chávez**).

**3. Una aserción negativa sola no prueba nada.** Toda negativa debe ir precedida de una
positiva sobre la misma pantalla ("existe la tarjeta X" *y luego* "no existe la Y").

**4. Lanzarlos en paralelo, pero esperándolos en el MISMO comando.** Un `nohup ... &` seguido de
un comando que termina mata los hijos: los procesos mueren y los logs quedan vacíos. La forma que
funciona es lanzar todos con `&` y terminar con `wait` dentro de la misma invocación, en segundo
plano.

**4-bis. Como mucho DOS o TRES a la vez con la misma cuenta.** Medido el 20/07: doce pruebas de
PCO lanzadas a la vez con `heidy.tenelema` dieron cinco fallos, y todas mostraban el mismo
síntoma —formularios y desplegables vacíos, como si el usuario no tuviera permisos—. No era un
fallo de la aplicación: **la misma prueba que falló en el lote pasó 15/15 al ejecutarla sola**.
Doce navegadores compartiendo una cuenta se pisan las sesiones entre sí.

Antes de tocar código por un fallo así, **relanza esa prueba aislada**. Y no consultes la API con
esa misma cuenta mientras el lote corre, por el mismo motivo.

**5. En paralelo, comprueba que los cinco terminaron.** Lanzarlos con `&` + `wait` funciona,
pero en esta ronda **uno de los cinco murió sin escribir nada en su log** y el comando entero
devolvió error. Los otros cuatro habían pasado. Si un registro queda vacío, relanza ese test
solo: `testsprite test run <testId> --wait`. No des por fallado lo que en realidad no llegó a
ejecutarse.

**6. No afirmes columnas de una tabla que puede estar vacía.** Un plan que dice "la tabla muestra
las columnas X e Y" falla si no hay ni una fila, porque sin filas no se renderizan. Si el plan no
crea sus propios datos, la aserción tiene que contemplar los dos casos.

**Resultados de la ronda de CAC: los 6 planes en verde** (`28_*` a `33_*`).

| Plan | Resultado |
|---|---|
| `28` Garitas múltiples por regla | **passed 29/29** |
| `29` Regla sin combo de estado + reactivar | **passed 11/11** |
| `30` Historial con motivo y tipo de acceso | **passed 22/22** |
| `31` Errores de reconocimiento | **passed 12/12** |
| `32` Garita peatonal / vehicular | **passed 15/15** |
| `33` Placa no registrada y corrección de erratas | **passed 11/11** |

TestSprite encontró **dos cosas que las pruebas locales no podían ver**: el nombre equivocado de
la persona de la cuenta de CAC (§V36, ya corregido) y que el campo de placa manual rechazaba
`PDFI234` con un error de formato antes de que el corrector actuara, cuando el sistema sabía de
sobra que eso era `PDF1234`. Merece la pena correr los planes contra el preview aunque la suite
local esté verde.

```bash
testsprite test create --plan-from tests/testsprite/planes/NN_nombre.json
testsprite test run <testId> --target-url <url-del-preview> --wait --timeout 1800
```

## Qué se hizo en la ronda de CAC

Todo el documento de requerimientos está aplicado (RF-CA-001 a 025 y RNF-CA-001 a 005). Lo que
conviene saber para no repetir el análisis:

- **La cadena de validación se partió en pasos** (§D62). Antes resolvía categoría, garita y
  horario en una sola consulta y no podía decir cuál había fallado: lo reportaba todo como
  "fuera de horario". **Eso escondía que seis docentes y seis administrativos no tenían ninguna
  regla de acceso y no podían entrar al campus.**
- **Tres validaciones que no se hacían**: el estado de la persona solo se comprobaba a los
  internos (§D64), `requiere_memorando` era decorativo para el personal interno (§D63), y un
  horario nocturno no casaba nunca (§D69, el mismo error de medianoche de §D59).
- **Persona desconocida era imposible de registrar** (§D66): `id_persona` era NOT NULL. El caso
  que más interesa registrar era el único que no se registraba.
- **Reconocimiento de placas nuevo** (§D68): motor en la nube con respaldo local, y corrección de
  erratas de OCR **por posición** antes que por parecido. La tolerancia difusa solo se aplica si
  una única placa registrada queda a esa distancia; con dos candidatas no elige.
- **Umbrales medidos, no estimados** (§D67, §D70, §D71). El del rostro pasó de uno a dos, con
  banda de revisión, y se validó con 862 pares de LFW: a 0.45 no se cuela ninguno de los 416
  impostores. El de la placa destapó un fallo de bulto — la confianza que se guardaba era
  **siempre 0**, porque tesseract.js 5 la devuelve a cero en todos los niveles, así que el umbral
  no filtraba nada. Se sustituyó por el acuerdo entre variantes de preprocesado.

**Piezas nuevas reutilizables:**

| Pieza | Para qué |
|---|---|
| `LectorPlaca` + `lib/placas.ts` | Captura con encuadre guiado, cuatro variantes de preprocesado que se votan entre sí, y OCR local. |
| `FichaMemorando` | El memorando completo dentro de cualquier pantalla, con estado calculado. |
| `GaritasDeRegla` | Patrón de N:M gestionado desde la ficha, como `AsociacionesVehiculo`. |
| `MOTIVO_LEGIBLE` (catalogos) | Código canónico → frase en castellano. Lo usan la garita y el historial. |
| `identificar_placa()` / `corregir_placa_ocr()` | En SQL, con espejo en TypeScript. |
| `vista_categoria_sin_regla` | Categorías cuyas personas serán rechazadas en la garita. |
| `vista_vehiculo_sin_propietario` | Incidencias de RF-CA-018 sin bloquear ingresos. |

**Lo que NO se hizo a propósito:**

- **Los dos vehículos sin propietario no se rellenaron** (§V31): no hay forma de saber de quién
  son. Quedan expuestos en una vista para que los corrija quien sepa.
- **Que falte el propietario no bloquea el ingreso.** Lo que decide un acceso es que la persona
  esté asociada al vehículo; lo otro es integridad del maestro.

## ✅ Qué resolvió la ronda de PCO v2 (2026-07-20)

Sobre `Requerimientos_PCO_v2.docx`. Las líneas 21-38 de ese documento repiten literalmente el v1
y ya estaban aplicadas; lo nuevo son las líneas 2-19. Decisiones §D78-§D82, dudas §V41-§V42.

- **Nombre de un punto de control en un edificio** (§D78): tres campos numéricos y una
  descripción; el sistema compone `E20/P4/E004 – Laboratorio Alan Turing` y el usuario no teclea
  nunca `/` ni `–`. Índice único sobre el código: dos puntos no pueden ocupar el mismo espacio.
- **El guardia se busca por cédula** (§D79), con mensaje de encontrado o no registrado y el
  nombre al lado. RPC acotado: no expone la ficha ni permite sondear el directorio.
- **"Activa" y "en turno" son dos columnas** (§D80), más "Desde" y "Hasta". No se borró nada: se
  separó lo que estaba mezclado, porque una asignación vigente de 22:00–06:00 también lo está a
  mediodía.
- **Campus vuelve a los combos** (§D82), lo que además cierra §V25.
- **Fechas pasadas**: bloqueadas al registrar, en el trigger y en el propio calendario
  (`FieldConfig.minHoy`). Al editar se respeta lo que ya estaba guardado.

**Tres piezas nuevas del motor**, útiles para cualquier módulo: `componerDesde` (valor que arma
el sistema y **sí** se guarda, a diferencia de `soloLectura`), el tipo de campo
`cedula-busqueda`, y `minHoy`.

**Un bug que no venía en el documento** (§D81): las fechas de vigencia se mostraban **un día
antes** a cualquiera en Ecuador. `fecha_inicio`/`fecha_fin` son `timestamptz` pero significan un
día, se guardan a medianoche UTC y se formateaban en la zona del navegador. Es la **cuarta**
aparición del error de medianoche (§D52, §D59, §D69). Se añadió `fmtFechaDia()`.

| | |
|---|---|
| Pruebas locales | **200 en verde** (antes 185), typecheck y build |
| TestSprite | **12 planes de PCO, los 12 en verde**, incluida la integración con CAC |
| Migraciones | 5, aplicadas por MCP y guardadas en `supabase/migrations/` |

## Comprobación total del sistema — pendiente para la próxima sesión

Se han cerrado cinco rondas (validaciones, ADM, GPE+GPI, PCO, CAC) y cada una verificó lo suyo.
Falta una pasada **de extremo a extremo sobre el sistema completo**, que es lo que toca ahora.

**Lo que ya existe y hay que encadenar** (nada de esto hay que escribir de cero):

| Herramienta | Qué cubre |
|---|---|
| `cd web && npm run verificar` | typecheck + suite de pruebas + build |
| `python3 scripts/verificar_numeracion_docs.py` | numeración de decisiones y dudas, referencias rotas |
| `psql "$DATABASE_URL" -f scripts/smoke_test.sql` | humo general de la base |
| `scripts/pruebas_rls_por_rol.sql` | que cada rol ve lo que debe y nada más |
| `scripts/pruebas_cobertura_docs.sql` | que el esquema real concuerda con los documentos |
| `scripts/pruebas_adm_cuentas.sql`, `pruebas_gpe_gpi_nuevas.sql`, `pruebas_validaciones_nuevas.sql` | reglas de cada ronda |
| `scripts/prueba_multisesion.py`, `prueba_bloqueo_intentos.py`, `prueba_cierre_sesion.py` | sesión y bloqueo (requieren `SB_URL`, `SB_ANON`, `SB_PASSWORD`) |
| TestSprite | los planes de `tests/testsprite/planes/`, uno por módulo |

**Lo que conviene mirar y todavía no cubre ningún script:**

1. **Las integraciones entre módulos**, que es donde han aparecido los peores fallos: un cambio
   en PCO dejó sin nombre al guardia en CAC (§D58), y una política de CAC más estrecha que la de
   su tabla padre dejó un embed vacío sin dar error. Conviene una prueba que recorra el flujo
   completo —persona → memorando/autorización → regla → punto → dispositivo → evento— con cada rol.
2. **Los `advisors` de Supabase** (`get_advisors`, seguridad y rendimiento) después de cinco
   rondas de migraciones.
3. **Las dudas abiertas**: §V24, §V25, §V28, §V30 y las que deje esta ronda. Ninguna bloquea, pero
   varias son decisiones del equipo que llevan tiempo aparcadas.
4. **Datos sembrados**: quedan 18 cédulas ficticias por sustituir y sigue sin haber integración
   con SRI / ANT / Registro Civil, así que `estado_verificacion_ruc` es siempre `NO_VERIFICADO`.

## Reglas del proyecto que conviene tener presentes

- **La fecha de hoy se calcula con `public.hoy_ecuador()` (SQL) y `hoyISO()` (frontend)**, nunca
  con `current_date` ni `toISOString()`. El servidor va en UTC y Ecuador cinco horas por detrás
  (§D52). Lo mismo con las **horas**: cualquier comparación de `time` se hace en
  `America/Guayaquil`.
- **Un intervalo horario puede cruzar la medianoche.** Nunca compares `inicio <= hora <= fin` sin
  contemplarlo, y nunca sumes 24 h a un `time`: envuelve (§D59, §D69).
- Sin DELETE físico: las bajas cambian el estado.
- **Antes de investigar un campo vacío o un "—", mira §D58**: un embed bloqueado por RLS se ve
  exactamente igual que un dato que no existe, y no da error. En esta ronda volvió a pasar: la
  política de las garitas de una regla nacía más estrecha que la de la propia regla.
- Catálogos en MAYÚSCULAS sin tildes en la base; la traducción vive en `web/src/lib/catalogos.ts`.
- Toda regla nueva va **primero en SQL** (migración) y después en el espejo de
  `web/src/lib/validacion.ts` o `placas.ts`, nunca al revés.

## Qué cubren las 185 pruebas automáticas

| Archivo | Qué protege |
|---|---|
| `lib/validacion.test.ts` | Cédula, RUC, placa, nombres, fechas, correo, teléfono, memorando |
| `lib/placas.test.ts` | **Corrección de erratas de OCR y extracción de la placa del texto** |
| `lib/vigencia.test.ts` | Estados calculados y fecha de Ecuador |
| `lib/errores.test.ts` | Que ningún error del proveedor llegue en inglés |
| `lib/useBorrador.test.ts` | Persistencia de formularios; nunca contraseñas |
| `lib/turnos.test.ts` | Turnos (incluido el nocturno) y hora de Ecuador |
| `auth/password.test.ts` | Que la reautenticación no cierre la sesión real |
| `pages/LoginPage.test.tsx` | Que tras iniciar sesión se entre al panel |
| `pages/ModuleHome.test.tsx` | Qué tarjetas existen en cada módulo |
| `pages/GuardiaView.test.tsx` | **Navegación peatonal/vehicular, ocupantes, doble autenticación** |
| `pages/modules/UsuariosScreen.test.tsx` | Panel único de usuarios, alta por cédula |
| `components/ResourceScreen.test.tsx` | Campos dinámicos, campo en gris, confirmación, borrador |
| `resources/configs-lectura.test.tsx` | Auditoría legible; biometría no pinta el rostro |
| `resources/configs-pco.test.tsx` | PCO: cascadas al editar, reactivar, jerarquía de zonas |
| `resources/configs-cac.test.tsx` | **Garitas por regla, motivo legible, persona desconocida** |

Pruebas contra la base real (no dejan rastro salvo auditoría):

```bash
psql "$DATABASE_URL" -f scripts/pruebas_gpe_gpi_nuevas.sql
psql "$DATABASE_URL" -f scripts/pruebas_adm_nuevas.sql
python3 scripts/prueba_multisesion.py
```

De esta ronda: `UsuariosScreen.test.tsx` añade que el alta **proponga el correo de la persona
encontrada** (regresión directa del caso lady.celina/lady.velasquez) y que cambiar de rol **avise
de que sustituye al anterior** antes de pulsar, no después.

## Pendientes que no bloquean

1. **§V32**: los umbrales están medidos (862 pares de LFW y 200 imágenes de placas). Lo que queda
   abierto es el **detector facial**: `TinyFaceDetector` no encuentra rostro en el 28 % de las
   fotos de LFW, que son fáciles. `SsdMobilenetv1` detecta mejor, pero es 29× más pesado (5,5 MB
   frente a 188 KB) y cambiarlo **invalida la calibración**, porque cada detector recorta la cara
   distinto y el descriptor sale del recorte.
   **Decidido no tocarlo en el prototipo 3**: ese 28 % es sobre LFW, y en una garita la persona
   se pone medio metro delante de la cámara —cara grande y centrada, que es justo lo que le
   cuesta al detector pequeño—. Si las pruebas manuales muestran que falla de más, ahí habrá un
   dato real con el que decidir; volver a medir cuesta diez minutos.
2. **§V33**: el lector de placas en la nube depende de un tercero; el plan gratuito son 2500
   lecturas/mes.
3. **§V34**: revisada y aceptada por el equipo — las cinco reglas de acceso sembradas se quedan
   con sus horarios. Si la EPN publica un horario oficial, hay que contrastarlo.
4. **§V18/§V19**: un docente sembrado (cédula 1750000232) tiene código único y carrera de
   estudiante.
5. **§V21**: el Root Directory de Vercel debería ser `web`; mientras no lo sea hace falta el
   `vercel.json` de la raíz.
6. **SMTP propio**: la recuperación de contraseña usa el correo de Supabase, 2 correos/hora.
7. **Historial de migraciones**: sin reconciliar, por eso `supabase db push` no funciona.
8. **`gh` (GitHub CLI)** está en `~/.local/bin/gh` pero **no autenticado en WSL**. Los PR se abren
   desde el navegador. La API pública de GitHub sí funciona sin token para este repo.
