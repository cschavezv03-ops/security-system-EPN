# 08 — Mapa interactivo del campus

> Estado: **sesión 1 completada (2026-07-25)** — vista de administración (POC).
> Próximas sesiones: Realtime y vista pública. Dudas/decisiones abiertas: §V49–§V51 del doc 99.

El mapa interactivo pinta la infraestructura de control de accesos (zonas, puntos de control y
dispositivos) sobre el plano del campus de la EPN. Sirve para dos públicos distintos, que se
construyen por separado:

1. **Vista de administración** (módulo CAC) — para el personal de seguridad: ver de un vistazo
   qué puntos están activos, en falla o en mantenimiento, con qué dispositivos (biométricos o de
   placas). **Construida en la sesión 1.**
2. **Vista pública** (rol `anon`, pantallas del campus) — para estudiantes/docentes/visitantes:
   orientarse por el campus, ver qué accesos están abiertos, y (a decidir) nombres de guardias de
   turno + buzón de denuncias. **Pendiente** (ver §V51).

---

## Tecnología del mapa: Leaflet + imagen del campus (CRS.Simple)

El mapa se dibuja con **Leaflet** (la librería estándar de mapas interactivos web) en modo
`CRS.Simple`: en vez de una proyección geográfica, usa las **coordenadas de una imagen**. La capa
base es el **plano oficial del campus de la EPN** (`web/public/mapa-epn-2.jpg`, 686×446), añadido
con `L.imageOverlay` sobre `bounds = [[0,0],[H,W]]`. Encima van los **marcadores del sistema** con
datos reales (zonas/puntos/dispositivos), como `divIcon` de color según estado. Da zoom y paneo
reales, tooltips y clic → panel de detalle.

Por qué Leaflet + imagen y no Google Maps / lat-lng:

- **Se ve exactamente igual al plano oficial de la EPN**: la capa base *es* esa imagen.
- **Sin dependencia de API externa** (ni clave, ni costo, ni cuota, ni enviar nada a un tercero) —
  Leaflet es libre y la imagen se sirve desde el propio proyecto.
- Migrable: si algún día se quiere navegación geográfica real (calles/satélite), Leaflet ya soporta
  tiles reales cambiando el CRS, sin rehacer el modelo de coordenadas.

## Coordenadas: fracciones relativas a la imagen

Se guardan **dos fracciones relativas a la imagen**, no coordenadas geográficas:

- `zona.pos_x` — horizontal, `0` (izquierda) .. `1` (derecha).
- `zona.pos_y` — vertical, `0` (arriba) .. `1` (abajo).

El componente las convierte a coordenada Leaflet con `aLatLng(fx,fy) = [H*(1-fy), W*fx]` (en
`CRS.Simple`, el origen `[0,0]` es la esquina **inferior** izquierda, así que la fila se invierte).
Cada zona real se ubicó sobre **el edificio con su mismo número** en el plano (p. ej. "Edificio 20"
→ el edificio rotulado `20` en la imagen).

---

## Modelo de datos

No hay tablas nuevas. Se añaden dos columnas a `zona` (maestra de PCO):

| Columna | Tipo | Regla |
|---|---|---|
| `zona.pos_x` | `numeric(6,5)` | `NULL` o `0..1` (CHECK `zona_pos_x_rango`) |
| `zona.pos_y` | `numeric(6,5)` | `NULL` o `0..1` (CHECK `zona_pos_y_rango`) |

**Trigger `validar_coordenadas_zona`** (migraciones `20260725181804_cac_mapa_coordenadas_zona.sql`
y `20260725181916_..._search_path.sql`, aplicadas al remoto vía MCP):
- van las dos juntas o ninguna (no se puede ubicar "a medias");
- rango 0..1 con mensaje legible para el formulario;
- no revalida ediciones que no tocan las coordenadas (mismo patrón que `validar_numero_edificio` /
  `validar_jerarquia_zona`), para no bloquear filas anteriores a la regla.

Los puntos de control heredan la posición de su zona (`punto_control.id_zona`); los dispositivos
cuelgan del punto (`dispositivo.id_punto_control`). El marcador de una zona **agrega** el estado de
todos sus puntos y dispositivos.

### Estado de salud de una zona (color del marcador)

| Salud | Color | Cuándo |
|---|---|---|
| `INACTIVO` | gris | `estado_zona` = INACTIVA o BLOQUEADA |
| `CRITICO` | rojo | algún punto en `FALLA` o algún dispositivo en `DANO_FISICO` |
| `ADVERTENCIA` | ámbar | algún punto en `MANTENIMIENTO` o dispositivo en `FALLA_DE_RED` |
| `OK` | verde | todo operativo |

El ícono del marcador es el número de edificio (`numero_edificio`) si lo tiene; para
parqueaderos/campus, ícono según tecnología (huella = biometría, auto = placas).

---

## Seguridad (RLS)

**La vista de administración no necesitó cambios de RLS.** Las políticas `zona_select`,
`punto_control_select` y `dispositivo_select_amplio` ya permiten lectura al personal operativo de
CAC vía el helper `tiene_acceso_operativo_cac()` (que cubre `CAC_EVENTO_SELECT`,
`CAC_EVENTO_SELECT_PUNTO_ASIGNADO`, `CAC_VALIDACION_EJECUTAR`), además de ADM y PCO. El submódulo
del mapa se muestra con `permisoVer: ['CAC_EVENTO_SELECT','PCO_ZONA_SELECT']`.

**La vista pública SÍ exigirá diseño de seguridad nuevo (pendiente, §V51):**
- nunca leer `zona`/`punto_control`/`dispositivo` directamente desde `anon`;
- una **vista `SECURITY INVOKER`** con solo columnas seguras (nombre, tipo, número de edificio,
  "abierto/cerrado" genérico) y su política de lectura `anon`;
- **nunca** exponer IP, MAC, tecnología del dispositivo ni estados de falla/mantenimiento (revelan
  puntos ciegos de vigilancia).

---

## Frontend

- Componente: `web/src/pages/modules/MapaCampus.tsx` (registrado como submódulo "Mapa del campus"
  en CAC, `web/src/resources/registry.tsx`).
- Mapa: **Leaflet** (`leaflet` + `leaflet/dist/leaflet.css`) en `CRS.Simple` con la imagen
  `web/public/mapa-epn-2.jpg` como capa base (constante `MAPA_FONDO`, dimensiones `IMG_W`/`IMG_H`).
  El contenedor usa `aspect-ratio` de la imagen; se llama `invalidateSize()` tras montar por si la
  Card arranca con tamaño 0. Marcadores = `L.divIcon` con color por estado y número de edificio (o
  `P` para parqueaderos); clic → panel de detalle; tooltip con el nombre de la zona.
- Datos: una sola consulta con embeds `zona → punto_control → dispositivo`. `pos_x`/`pos_y` llegan
  como texto (numeric de Postgres) y se convierten a número en el cliente.
- Funciones ya incluidas: contadores (puntos activos / totales / dispositivos), filtros por
  tecnología y por estado de salud, leyenda, panel de detalle por zona, y bandeja de "zonas sin
  ubicar".
- Datos:
  - **Remoto (producción):** las coordenadas se pusieron sobre las **zonas reales que ya existían**
    (7 edificios + 2 parqueaderos), con un `UPDATE` por `id_zona` vía el MCP de Supabase — no se
    insertaron filas demo. Cada `pos_x/pos_y` se leyó del **edificio con el mismo número en el plano
    `mapa-epn-2.jpg`** (686×446). Este `UPDATE` es una acción puntual, no está en una migración; si
    se reconstruye el remoto desde cero habría que repetirlo.
  - **Local (`supabase/seed.sql`):** siembra un campus demo con edificios numerados, puntos y
    dispositivos con estados variados para mostrar todos los colores en un `db reset`.
  - Recordatorio de negocio: `LPR_PLACAS` solo puede vivir en zonas `PARQUEADERO` (trigger
    `validar_asignacion_dispositivo`); los edificios llevan biometría facial.

---

## Roadmap (próximas sesiones)

1. **Realtime**: suscribir el mapa a cambios de `zona`/`punto_control`/`dispositivo` y a nuevos
   `evento_acceso` con Supabase Realtime, para que los marcadores cambien de color en vivo.
2. **Selector de posición en el alta de zonas** (PCO) + hacer las coordenadas obligatorias para
   EDIFICIO/PARQUEADERO (§V49).
3. **Vista pública** (`anon`): vista SQL segura, componente reutilizado, modo kiosco a pantalla
   completa, buscador de edificios, rutas de entrada/salida. Nombres de guardias de turno y buzón
   de denuncias según §V51 (denuncias como envío privado a administración, no muro público).
4. Pase fino de coordenadas por edificio sobre el plano oficial ya integrado (§V50).
5. Mapa de calor de accesos por punto/hora usando el histórico de `evento_acceso`.
