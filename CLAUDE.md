# Sistema de Seguridad EPN — Reglas del proyecto

Backend en Supabase (PostgreSQL) para el Sistema de Seguridad y Control de Accesos de la
Escuela Politécnica Nacional. Proyecto académico — Ingeniería de Software I, periodo 2026-A.

## Documentos fuente (leer antes de actuar)

| Archivo | Qué contiene | Autoridad |
|---|---|---|
| `docs/Modelo_Datos_Consolidado_EPN.pdf` | 24 entidades, atributos, tipos, PK/FK, CHECKs, relaciones. **+1 tabla añadida: ver doc 03 §D11 → 25 en total** | **Fuente de verdad del esquema** |
| `docs/01_AUTENTICACION_Y_ROLES.md` | Modelo de autenticación, 7 roles, identidad de dispositivos | **Fuente de verdad de auth** |
| `docs/02_MATRIZ_PERMISOS_RLS.md` | Matriz permiso × rol por tabla y acción | **Fuente de verdad de RLS** |
| `docs/03_DECISIONES_Y_CORRECCIONES.md` | Conflictos ya resueltos entre documentos previos | **No re-litigar estas decisiones** |
| `docs/04_REGLAS_NEGOCIO.md` | Flujo completo de acceso y reglas de negocio (todas resueltas) | **Fuente de verdad del comportamiento** |
| `docs/08_MAPA_INTERACTIVO.md` | Diseño del mapa interactivo del campus (CAC): georreferencia de zonas, modelo de seguridad y roadmap | **Fuente de verdad del mapa** |

Si un documento contradice a otro, gana el que aparece como autoridad en esta tabla.
Si encuentras una contradicción no cubierta aquí, **detente y pregunta** — no la resuelvas en silencio.

## Principios de arquitectura (no negociables)

- **Una sola base de datos.** Sistema monolítico modular. NO microservicios.
- **Sin entidades duplicadas.** `persona`, `vehiculo`, `empresa` y `categoria_persona` son
  maestras únicas propiedad de ADM. Ningún módulo crea copias; se referencian por FK.
- **Sin DELETE físico.** Ninguna baja (personas, vehículos, reglas, usuarios) elimina la fila:
  se cambia el estado (`ACTIVO` / `INACTIVO` / `DADO_DE_BAJA`, etc.).
- **`evento_acceso` y `bitacora_sistema` son históricos:** solo INSERT. Nunca UPDATE ni DELETE.
- **Dos vías de validación (§D20):** el personal **interno** se identifica con **biometría facial**
  (`origen_registro = AUTOMATICA`); el personal **externo** se identifica con su **cédula**, tecleada
  por el guardia (`origen_registro = MANUAL`). **Los externos NUNCA tienen registro biométrico.**
  Esto anula la regla del Contexto General §6 que decía "solo biometría facial".
- El **login al sistema** (`usuario_sistema`) y la **validación de acceso físico** son dos
  mecanismos distintos. No confundirlos.

## Convenciones

- `snake_case` en todas las tablas y columnas.
- Valores de catálogo (`CHECK`) en MAYÚSCULAS y **sin tildes** (`AUTENTICACION`, no `AUTENTICACIÓN`).
- `uuid` con `gen_random_uuid()` como PK en todas las entidades.
- Códigos de permiso: `MODULO_ENTIDAD_ACCION` (ej. `GPI_PERSONA_INSERT`).
- Timestamps: `timestamptz`, `DEFAULT now()`.

## Flujo de trabajo obligatorio

1. Todo cambio de esquema se escribe **primero** como archivo en `supabase/migrations/`.
   Nunca aplicar SQL suelto vía MCP sin dejar el archivo de migración correspondiente.
2. Validar localmente con `supabase db reset` antes de aplicar al proyecto remoto.
3. **Trabaja de forma autónoma.** No pidas confirmación entre pasos. Las únicas dos acciones que
   requieren aprobación humana son `supabase db push` y `git push` — el sistema de permisos
   (`.claude/settings.json`) las intercepta solo. Todo lo demás es local y reversible: avanza.
   Si encuentras una duda que ningún documento resuelve, **no te detengas**: implementa la opción
   más conservadora y anótala en `docs/99_DUDAS_PARA_EL_EQUIPO.md` para revisarla al final.
4. Un commit por entidad o grupo lógico de entidades. No un commit gigante.
5. RLS habilitado en **todas** las tablas. Ninguna tabla queda expuesta sin políticas.

## Estado del entorno

- Proyecto de Supabase: ya existe (usar el MCP configurado con `project_ref`).
- Repositorio de GitHub: ya existe.
- Frontend: **existe** en `web/` (React 18 + Vite + TypeScript + Tailwind + `@supabase/supabase-js`).
  Se despliega en Vercel. Validación local: `cd web && npm run verificar` (typecheck + tests + build).
- Reconocimiento facial: **real** (face-api.js + pgvector, búsqueda 1:N con umbral L2), ya no
  mockeado. Lectura de placas: Tesseract local + Plate Recognizer opcional.

## Mapa interactivo del campus (CAC)

Ver `docs/08_MAPA_INTERACTIVO.md` (autoridad). Estado: **sesión 1 hecha (2026-07-25)** — vista de
administración. Puntos clave para retomar:

- **Georreferencia por overlay, no lat/lng ni Google Maps.** `zona.pos_x` / `zona.pos_y` son
  fracciones `0..1` relativas a la imagen del plano; el marcador va en `left/top` porcentuales.
  Trigger `validar_coordenadas_zona` (van juntas o ninguna, rango 0..1).
- **Coordenadas opcionales por ahora** (§V49): una zona sin ubicar no se dibuja, cae en la bandeja
  "zonas sin ubicar". Hacerlas obligatorias exige antes un selector de posición en el alta de PCO.
- **Sin RLS nueva para la vista de admin:** `zona`/`punto_control`/`dispositivo` ya son legibles
  desde CAC vía `tiene_acceso_operativo_cac()`.
- **Plano oficial** ya integrado en `web/public/mapa-epn.png` (§V50). La ilustración ocupa el ~40%
  superior (el resto es leyenda); coordenadas demo en `pos_y≈0.14–0.31`, aún por afinar por edificio.
- **Componente**: `web/src/pages/modules/MapaCampus.tsx`, submódulo "Mapa del campus" en CAC.
- **Roadmap** (próximas sesiones): Realtime en vivo; selector de posición + coordenadas
  obligatorias; **vista pública** (`anon`, pantallas del campus) con **vista SQL `SECURITY INVOKER`
  de columnas seguras** — nunca exponer IP/MAC/tecnología/estados de falla a `anon` (§V51). La
  vista pública mostrará nombres de guardias de turno (solo el nombre) y un buzón de denuncias
  diseñado como **envío privado a administración, no muro público** (pendiente de ratificar, §V51).
