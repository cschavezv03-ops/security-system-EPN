# Estado del sistema — punto de partida para la siguiente sesión

La ronda de **CAC** está cerrada. Sustituye al documento de la ronda de PCO.

---

## ⚠️ Cuatro cosas que hacer ANTES de empezar

**1. Fusionar los PR pendientes.** Hay **dos** sin fusionar: `feat/pco-mejoras` y
`feat/cac-mejoras` (esta última sale de la anterior, así que fusionarlas en ese orden). Mientras
no se fusionen, `main` y producción no tienen los cambios, **pero la base de datos sí** — las
migraciones se aplican por MCP, no por el PR.

**2. Volver a proteger los previews.** Panel de Vercel → proyecto `security-system-epn` →
**Settings → Deployment Protection** → **Vercel Authentication** → **Enabled**. Sigue desactivado
para que TestSprite pueda entrar; mientras siga así, cualquier URL de preview es accesible para
quien la tenga.

**3. `guardia.demo@epn.edu.ec` ahora usa `admin1234`.** Se le repuso la contraseña en esta ronda
(estaba sin documentar y bloqueaba toda prueba de la Garita). Y se le **reasignó** a la "Garita
Principal (demo)", turno 06:00–18:00: su punto anterior estaba en MANTENIMIENTO y no podía
registrar ni un evento. Fuera de esa franja horaria no puede operar, y es correcto.

**4. El token del lector de placas.** `PLATE_RECOGNIZER_TOKEN` **no está configurado**. Sin él el
sistema funciona con el lector local (Tesseract), que acierta bastante menos con placas reales.
Se pone en Supabase → *Edge Functions → Secrets*; no hay que redesplegar nada.

---

## Dónde está todo

| Qué | Dónde |
|---|---|
| Producción | https://security-system-epn.vercel.app (rama `main`) |
| Decisiones | `docs/03_DECISIONES_Y_CORRECCIONES.md` — §D62-D69 son de la ronda de CAC |
| Dudas y pendientes | `docs/99_DUDAS_PARA_EL_EQUIPO.md` — §V31-V36 son de la ronda de CAC |
| **Cómo probar las placas y el rostro** | `docs/New_Req/GUIA_PRUEBAS_PLACAS.md` |
| Despliegue | `docs/DESPLIEGUE.md` |
| Feedback de CAC | `docs/New_Req/Requerimientos_CAC.docx` |

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
4. **Verificar antes de dar nada por hecho:** `cd web && npm run verificar` (typecheck + 178
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
| **Garita** | `guardia.demo@epn.edu.ec` | Guardia (además ve GPI) |
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

**5. No afirmes columnas de una tabla que puede estar vacía.** Un plan que dice "la tabla muestra
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
- **Umbrales biométricos recalibrados con caras reales** (§D67): de un umbral a dos, con banda de
  revisión. El anterior dejaba 0.07 de margen contra el impostor más parecido del banco.

**Piezas nuevas reutilizables:**

| Pieza | Para qué |
|---|---|
| `LectorPlaca` + `lib/placas.ts` | Captura con encuadre guiado, preprocesado (recorte, contraste, Otsu) y OCR local. |
| `FichaMemorando` | El memorando completo dentro de cualquier pantalla, con estado calculado. |
| `GaritasDeRegla` | Patrón de N:M gestionado desde la ficha, como `AsociacionesVehiculo`. |
| `MOTIVO_LEGIBLE` (catalogos) | Código canónico → frase en castellano. Lo usan la garita y el historial. |
| `identificar_placa()` / `corregir_placa_ocr()` | En SQL, con espejo en TypeScript. |
| `vista_categoria_sin_regla` | Categorías cuyas personas serán rechazadas en la garita. |
| `vista_vehiculo_sin_propietario` | Incidencias de RF-CA-018 sin bloquear ingresos. |

**Lo que NO se hizo a propósito:**

- **No se corrigió el nombre de la persona de la cuenta de CAC** (§V36). Son dos personas reales
  del equipo y solo ellas saben cuál es el dato bueno.
- **Los dos vehículos sin propietario no se rellenaron** (§V31): no hay forma de saber de quién
  son. Quedan expuestos en una vista para que los corrija quien sepa.
- **Que falte el propietario no bloquea el ingreso.** Lo que decide un acceso es que la persona
  esté asociada al vehículo; lo otro es integridad del maestro.

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

## Qué cubren las 178 pruebas automáticas

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

## Pendientes que no bloquean

1. **§V32**: los umbrales biométricos se calibraron con **tres rostros**. Volver a medir con 15-20.
2. **§V33**: el lector de placas en la nube depende de un tercero; el plan gratuito son 2500
   lecturas/mes.
3. **§V34**: las cinco reglas de acceso sembradas llevan horarios plausibles pero **no acordados**.
4. **§V18/§V19**: un docente sembrado (cédula 1750000232) tiene código único y carrera de
   estudiante.
5. **§V21**: el Root Directory de Vercel debería ser `web`; mientras no lo sea hace falta el
   `vercel.json` de la raíz.
6. **SMTP propio**: la recuperación de contraseña usa el correo de Supabase, 2 correos/hora.
7. **Historial de migraciones**: sin reconciliar, por eso `supabase db push` no funciona.
8. **`gh` (GitHub CLI)** está en `~/.local/bin/gh` pero **no autenticado en WSL**. Los PR se abren
   desde el navegador. La API pública de GitHub sí funciona sin token para este repo.
