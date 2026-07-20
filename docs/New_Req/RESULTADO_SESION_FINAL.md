# Resultado de la sesión final — integración de todo el sistema

Ejecución de `docs/New_Req/PLAN_SESION_FINAL.md` el **20/07/2026** (rama `docs/plan-sesion-final`).
Se probó por primera vez el sistema entero de punta a punta con la batería de integración de
TestSprite, más los scripts SQL y de sesión que la interfaz no puede ver.

## 1. Resumen

| Criterio de aceptación (§2 del plan) | Estado |
|---|---|
| Los 13 planes de integración en verde | **10 verdes**, 2 bugs reales corregidos, 1 bloqueado por el entorno |
| Suite local en verde + typecheck + build | ✅ **215/215** (subió de 200), typecheck y build limpios |
| Scripts SQL de la sección 3 sin fallos | ✅ los 6 SQL + 3 de sesión, todos verdes |
| `get_advisors` sin avisos nuevos | ✅ solo los conocidos (SECURITY DEFINER, leaked-password) |
| Dudas abiertas decididas o con fecha | ⏳ pendientes de datos del equipo (sección 4) |
| Recorrido manual completo | ⏳ para la defensa; frank.jumbo tiene garita activa y asignación completa |
| Protección de previews de Vercel reactivada | ⏳ **acción del usuario** (sección 5) |

## 2. Batería de integración (TestSprite)

Ejecutada en tandas de dos o tres, siempre con cuentas distintas (la lección de §V20). Contra
producción (`https://security-system-epn.vercel.app`).

| Plan | Recorre | Resultado |
|---|---|---|
| INT-01 | persona interna GPI ↔ ADM por cédula | ✅ 25/25 |
| INT-02 | externo con memorando: la vigencia manda | 🔧 **bug real corregido** (ver 3.1) |
| INT-03 | visita de un día sin memorando | ✅ 18/18 |
| INT-04 | zona → punto → dispositivo → guardia | ✅ 28/28 |
| INT-05 | regla de CAC apoyada en puntos de PCO | ✅ 15/15 |
| INT-06 | la garita permite el ingreso | ⛔ **bloqueado**: sin cámara en el navegador de TestSprite (ver 3.2) |
| INT-07 | ingreso denegado dice por qué | ✅ 16/16 |
| INT-08 | vehículo con dueño y conductor | ✅ 10/10 |
| INT-09 | auditoría y sesiones legibles, sin secretos | ✅ 21/21 |
| INT-10 | cada rol ve solo su módulo | ✅ 30/30 |
| INT-11 | fallos de cámara y placas entendibles | 🔧 **bug real corregido** (ver 3.3) |
| INT-12 | sin personas duplicadas; biometría sin exponer rostro | ✅ 20/20 |
| INT-13 | panel de monitoreo reúne lo de ahora | ✅ 15/15 |

## 3. Los tres bugs de integración (corregidos en la rama, sin desplegar)

### 3.1 INT-02 — la ficha decía que un externo podía entrar cuando no podía
La base estaba bien: `vista_vigencia_acceso` no le daba vigencia a la persona con el memorando
vencido. Pero la ficha de "Personas por memorando" mostraba el campo crudo `estado_acceso`
("Activo"), que es solo el estado del vínculo, junto a un memorando **vencido**. Se leía como que
la persona podía entrar. La **lista** ya cruzaba ambos datos ("¿Puede entrar?") desde la ronda de
GPE; la **ficha** se había quedado atrás. Corregido en `web/src/resources/configs.tsx`: la ficha
ahora dice "No — el memorando ya no autoriza" y el campo del vínculo se renombró para no
confundirse con el acceso. Prueba nueva: `web/src/resources/configs-gpe.test.tsx`.

### 3.2 INT-06 — el guardia veía jerga en inglés
El navegador de TestSprite no tiene cámara, así que la prueba no pudo completar el reconocimiento
(limitación del entorno, **no un fallo del sistema**). Pero destapó que, al fallar la cámara, el
guardia veía _"The highest priority backend 'wasm' has not yet been initialized"_. Nuevo
`web/src/lib/errores-camara.ts`: traduce el fallo por su causa (permiso, sin cámara, ocupada, sin
https) y **siempre recuerda la vía alternativa** — identificar por cédula, o teclear la placa a
mano. El detalle técnico se conserva en el `title` y en la bitácora. Prueba:
`web/src/lib/errores-camara.test.ts`.

### 3.3 INT-11 — una pantalla entera caída por una columna inexistente
La pantalla "Errores de reconocimiento" pedía el embed `dispositivo:dispositivo(nombre_dispositivo)`,
una columna que **no existe** (un dispositivo se identifica por `codigo_mac` y `tipo_tecnologia`).
PostgREST respondía **400** y la pantalla entera quedaba vacía con un banner genérico — el mismo
síntoma que un dato que falta o una fila bloqueada por RLS (§D58), de los más difíciles de
localizar mirando la interfaz. Corregido en `web/src/resources/configs-lectura.tsx`.

**Protección nueva contra toda esta clase de bug:** `web/src/resources/embeds-esquema.test.ts`
recorre **todos** los `select` de **todas** las configs y comprueba, columna por columna y
relación por relación, que existen en el esquema. La fuente de la verdad es `database.types.ts`
(se regenera desde la base), así que la prueba envejece con el esquema sin mantenimiento manual.

## 4. Decisiones de datos — CERRADAS

Todas las decisiones de datos de la fotografía se tomaron y aplicaron en esta sesión. Los ajustes
de datos van en `scripts/ajustes_datos_demo_prototipo3.sql` (idempotente, aplicado contra la base);
las decisiones y su porqué quedan en `docs/99_DUDAS_PARA_EL_EQUIPO.md`.

| Duda | Decisión | Efecto |
|---|---|---|
| §V11 · 18 cédulas ficticias | **Aceptadas como datos de demo**: son las cuentas del sistema y del equipo (las usan todos los planes de TestSprite) y las personas de calibración biométrica; sustituirlas rompería las pruebas. | sin cambio |
| §V12 · RUC sin verificar | **Aceptado** (no hay SRI); la pantalla ahora avisa "· sin verificar" en vez de callarlo. | frontend + prueba |
| §V24 · parqueadero cuelga del campus | **Se crea el Edificio EARME** (real en la EPN) y se reasigna el parqueadero; no se relaja el trigger. | contador → 0 |
| §V29 · guardia_demo no operaba | **Resuelto**: ya está en "Garita Principal (demo)" ACTIVA; el punto en mantenimiento no es el suyo y se deja así. | sin cambio |
| §V31 · 2 vehículos sin propietario | **Propietario de demo** coherente: PDF7777 → Hernán Avellaneda; PDF1234 → Cecilia Jaramillo (Joel sigue de conductor). | contador → 0 |
| §V41 · nombres de punto en edificio | **Alan Turing → `E20/P4/E004`** (decisión del equipo); "Laboratorio de Suelos" se deja descriptivo hasta conocer su aula (está en mantenimiento). | 1 pendiente a propósito |
| §V42 · asignación sin fecha de fin | **`fecha_fin = 2026-12-31`** (cubre la defensa). | contador → 0 |

Lo único que queda abierto es, por elección, el nombre del "Laboratorio de Suelos" (§V41): se
renombrará cuando alguien confirme su piso y aula. No bloquea nada — el punto está en
mantenimiento y ningún guardia lo usa.

## 5. Lo que necesita al usuario (acciones fuera del repositorio)

1. **Revisar y decidir el commit/push de la rama.** Hay 13 ficheros tocados (4 scripts SQL, 3
   componentes/config del front, 3 pruebas nuevas). Nada se ha comiteado ni desplegado.
2. **Redesplegar** para revalidar INT-02 e INT-11 en TestSprite contra el fix (hoy están
   verificados por la base y por las pruebas locales nuevas, pero no re-ejecutados en la interfaz).
3. **Reactivar la protección de previews en Vercel** (§4 del plan): Settings → Deployment
   Protection → Vercel Authentication → **Enabled**. Está abierta desde el 19/07 para que
   TestSprite entrara; ya no hace falta.

## 6. Nota sobre los scripts SQL

Cinco de los seis scripts de `scripts/*.sql` **habían quedado desfasados del esquema** y fallaban
antes de probar nada: `regla_acceso.id_punto_control` ya no existe (CAC lo movió a la tabla puente
`regla_acceso_punto_control`); cédulas, nombres, placas y números de memorando inventados ya no
pasan los CHECK nuevos; las asignaciones de guardia exigen `fecha_fin`/`hora_inicio`/`hora_fin` y
no admiten fecha de inicio pasada (PCO v2). Corregidos todos. Además se robustecieron dos
aserciones que envejecían a cada ronda: la RLS está en **27 tablas** (no 25, todas con políticas)
y el catálogo de permisos tiene **107** (no 100), con `ADM_PERSONA_INSERT` del admin acotado a
personas internas (§D75, cambio deliberado, no regresión).
