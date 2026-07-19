# Estado del sistema — punto de partida para la sesión de PCO

Sustituye al documento de la ronda de ADM. La ronda GPE + GPI está cerrada y verificada.

---

## ⚠️ Dos cosas que hacer ANTES de empezar

**1. Fusionar el PR de GPE + GPI.**
[PR #3](https://github.com/cschavezv03-ops/security-system-EPN/pull/3), rama
`feat/gpe-gpi-mejoras`. Está verde y listo; solo falta pulsar **Merge**. El merge automático
quedó bloqueado por el sistema de permisos, que protege lo que despliega a producción.

> **Importante:** las migraciones de esa ronda **ya están aplicadas** en la base. Hasta que se
> fusione, producción corre el frontend antiguo sobre el esquema nuevo. No rompe nada —los
> cambios fueron aditivos— pero conviene no dejarlo así.

**2. Volver a proteger los previews.**
Panel de Vercel → proyecto `security-system-epn` → **Settings → Deployment Protection** →
**Vercel Authentication** → **Enabled**. Se desactivó el 19/07 para que TestSprite pudiera
entrar al preview; mientras siga así, cualquier URL de preview es accesible para quien la tenga.

---

## Dónde está todo

| Qué | Dónde |
|---|---|
| Producción | https://security-system-epn.vercel.app (rama `main`) |
| Decisiones | `docs/03_DECISIONES_Y_CORRECCIONES.md` — §D47-D52 son de la última ronda |
| Dudas y pendientes | `docs/99_DUDAS_PARA_EL_EQUIPO.md` — §V18-V21 |
| Despliegue | `docs/DESPLIEGUE.md` |
| Revisión manual de GPE/GPI | `docs/New_Req/GUIA_REVISION_GPE_GPI.md` |

## Cómo trabajar esta sesión (lo que funcionó en la anterior)

```bash
git checkout main && git pull
git checkout -b feat/pco-mejoras
```

1. **Las migraciones van por MCP**, una a una con `apply_migration`, y **después** se guarda el
   archivo en `supabase/migrations/` con el `version_name` que devuelve `list_migrations`.
   `supabase db push` sigue sin funcionar (§5 de pendientes).
2. **Un commit por grupo lógico.** No un commit gigante.
3. **Verificar antes de dar nada por hecho:**
   ```bash
   cd web && npm run verificar     # typecheck + 101 pruebas + build
   ```
4. **Push a la rama** → Vercel genera un preview automáticamente. Ya funciona (se arregló en la
   ronda anterior); antes había que desplegar a mano.

## TestSprite: lee esto antes de crear una sola prueba

Aquí se perdió más tiempo en la ronda anterior. Tres cosas que ya están resueltas y no hay que
volver a descubrir:

**1. La credencial del proyecto pisa la del plan.** TestSprite inyecta
`admin@epn.edu.ec` en el formulario de login, ignorando el correo que pida el plan. Y esa cuenta
es `ADMINISTRADOR_SISTEMA`: **solo ve el módulo Administración**. Para que un plan entre a PCO,
el primer paso tiene que decirlo de forma explícita:

> "Abrir la aplicación. En la pantalla de inicio de sesión, BORRAR cualquier valor que venga
> precargado en el campo de correo y escribir exactamente `heidy.tenelema@epn.edu.ec`; en el
> campo de contraseña escribir `admin1234`. Es imprescindible usar esa cuenta y no otra: es la
> única con acceso al módulo Puntos de Control. Después pulsar 'Ingresar al sistema'."

Y justo después, una aserción de que la sesión es la correcta y el módulo se ve.

**Qué cuenta usar según el módulo** (todas con contraseña `admin1234`):

| Módulo | Cuenta | Rol |
|---|---|---|
| **PCO** | `heidy.tenelema@epn.edu.ec` | Responsable de Puntos de Control |
| ADM | `admin@epn.edu.ec` | Administrador del Sistema |
| GPI | `lenin.amangandi@epn.edu.ec` | Responsable de Personal Interno |
| GPE | `joel.velastegui@epn.edu.ec` | Responsable de Personal Externo |
| CAC | `carlos.chavez03@epn.edu.ec` | Responsable de Control de Accesos |
| Garita | `guardia.demo@epn.edu.ec` | Guardia (además ve GPI) |

**2. Una aserción negativa sola no prueba nada.** Tres pruebas dieron "passed" sin comprobar
nada: decían "no aparece la tarjeta X" y se cumplían solas porque el usuario no veía el módulo.
**Toda negativa debe ir precedida de una positiva sobre la misma pantalla** ("existe la tarjeta
Dispositivos" *y luego* "no existe la tarjeta Y").

**3. Las variables de entorno de Preview ya están configuradas.** `VITE_SUPABASE_URL` y
`VITE_SUPABASE_ANON_KEY` existían solo para `production`, y los previews arrancaban en blanco.
Ya están en ambos entornos; no hay que volver a tocarlo.

```bash
testsprite test create --plan-from tests/testsprite/planes/NN_nombre.json
testsprite test run <testId> --target-url <url-del-preview> --wait --timeout 1500
```

Se pueden lanzar **en paralelo** (`&` y `wait`): 10 pruebas tardan ~15 min en vez de dos horas.
Cada una tarda entre 5 y 15 minutos.

## Puntos a mirar en PCO

No hay `Requerimientos_PCO.docx` todavía; cuando llegue, manda ese documento. Mientras tanto,
lo que se sabe del módulo:

- **Tablas**: `zona` (5 filas), `punto_control` (6), `dispositivo` (3),
  `guardia_punto_control` (4). Módulo dueño: PCO (doc 02 §"Infraestructura física").
- **Ya se hizo en rondas anteriores**: cascada tipo de zona → zona → punto de control,
  autonumerado "Acceso A/B/C" para puntos de tipo campus, autoformato de MAC e IP, validación
  de compatibilidad tecnología↔zona por trigger, y turnos de guardia obligatorios con fecha fin.
- **Datos limpios**: el barrido de ortografía y espacios sobrantes sobre las cuatro tablas no
  encontró nada pendiente (se corrigieron en la ronda anterior).
- **Lo que conviene revisar**, por analogía con lo que apareció en GPE/GPI:
  - `zona.nombre_zona` y `punto_control.nombre_punto` ya se normalizan por trigger, pero
    `dispositivo` no tiene equivalente.
  - `guardia_punto_control.turno` es texto con formato `HH:MM–HH:MM` interpretado, no
    estructurado (§V10). Si PCO pide algo sobre turnos, esto es lo primero que hay que decidir.
  - Los estados de `punto_control` (ACTIVO/FALLA/MANTENIMIENTO) y `dispositivo`
    (OPERATIVO/FALLA_DE_RED/DANO_FISICO) **no tienen ningún proceso que los cambie solo**: son
    manuales. Si se pide "detección automática de fallas", eso no existe hoy.

## Reglas del proyecto que conviene tener presentes

- **La fecha de hoy se calcula con `public.hoy_ecuador()` (SQL) y `hoyISO()` (frontend)**, nunca
  con `current_date` ni `toISOString()`. El servidor va en UTC y Ecuador cinco horas por detrás:
  eso causó que un visitante con permiso válido fuera **denegado en la garita** cinco horas al
  día (§D52). Si tocas algo con fechas, usa esas dos funciones.
- Sin DELETE físico: las bajas cambian el estado.
- Catálogos en MAYÚSCULAS sin tildes en la base; la traducción a texto legible vive en
  `web/src/lib/catalogos.ts` (`ETIQUETA`, `ETIQUETA_CAMPO`). Al añadir un valor nuevo, añádelo
  también ahí o saldrá el código crudo en pantalla.
- Toda regla nueva va **primero en SQL** (migración) y después en el espejo de
  `web/src/lib/validacion.ts`, nunca al revés.

## Piezas reutilizables

- `FieldConfig.soloLectura` + `valorCalculado` — campo en gris con un valor que calcula el
  sistema, en vez de un desplegable que no se puede usar.
- `ResourceConfig.camposSensibles` — confirmación con el antes/después antes de guardar.
- `ResourceConfig.detalleExtra` — bloque dentro de la ficha, para gestionar registros
  relacionados sin salir (lo usa `AsociacionesVehiculo`).
- `ListaSeleccionMultiple` (en `ResourceScreen`) — lista de casillas con buscador.
- `BuscarPersonaPorCedula` — con `soloTipo` (ámbito) y `onNoEncontrada` (alta en el sitio).
- `public.estado_memorando_efectivo()` / `estado_autorizacion_efectivo()` y su espejo
  `web/src/lib/vigencia.ts` — el patrón: **lo que depende del calendario se calcula, lo que
  depende de una decisión humana se almacena**.
- `public.acentuar_texto(text)` — repone tildes en textos sembrados.

> Al añadir campos nuevos, asocia siempre la etiqueta con el control (`htmlFor` + `id`). El
> formulario genérico ya lo hace solo; si escribes una pantalla a mano, no lo olvides: sin eso
> un lector de pantalla no anuncia el campo, y las pruebas no pueden localizarlo.

## Qué cubren las 101 pruebas automáticas

| Archivo | Qué protege |
|---|---|
| `lib/validacion.test.ts` | Cédula, RUC, placa, nombres, fechas, correo, teléfono, número de memorando |
| `lib/vigencia.test.ts` | Estados calculados y que la fecha de referencia sea la de Ecuador |
| `lib/errores.test.ts` | Que ningún error del proveedor llegue en inglés |
| `lib/useBorrador.test.ts` | Persistencia de formularios, y que nunca se guarden contraseñas |
| `auth/password.test.ts` | Que la reautenticación no cierre la sesión real |
| `pages/LoginPage.test.tsx` | Que tras iniciar sesión se entre al panel |
| `pages/ModuleHome.test.tsx` | Qué tarjetas existen en cada módulo |
| `pages/modules/UsuariosScreen.test.tsx` | Panel único de usuarios, alta por cédula |
| `components/ResourceScreen.test.tsx` | Campos dinámicos, campo en gris, confirmación, borrador |
| `resources/configs-lectura.test.tsx` | Auditoría legible; biometría no pinta el rostro |

Pruebas contra la base real (no dejan rastro salvo auditoría):

```bash
psql "$DATABASE_URL" -f scripts/pruebas_gpe_gpi_nuevas.sql    # 18 casos, BEGIN … ROLLBACK
psql "$DATABASE_URL" -f scripts/pruebas_adm_nuevas.sql
python3 scripts/prueba_multisesion.py                          # requiere SB_URL, SB_ANON, SB_PASSWORD
```

## Pendientes que no bloquean

1. **§V18/§V19**: un docente sembrado (cédula 1750000232) tiene código único y carrera de
   estudiante. Sin resolver a la espera de que el equipo decida.
2. **§V21**: el Root Directory del proyecto de Vercel debería ser `web`. Mientras no lo sea,
   hace falta el `vercel.json` de la raíz; si se cambia, **hay que borrarlo**.
3. **SMTP propio**: la recuperación de contraseña usa el correo de Supabase, 2 correos/hora.
4. **Fuerza bruta**: el bloqueo por 5 intentos depende de que el intento pase por la Edge
   Function; cerrarlo del todo requiere el Auth Hook (plan de pago) o hCaptcha.
5. **SRI / ANT / Registro Civil**: sin integración; `estado_verificacion_ruc` queda
   `NO_VERIFICADO`.
6. **18 cédulas ficticias** pendientes de sustituir.
7. **Historial de migraciones**: sin reconciliar, por eso `supabase db push` no funciona.
8. **Auto-refresco del token de TestSprite**: es de plan Pro.
