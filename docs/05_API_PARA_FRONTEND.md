# 05 — API para el frontend (Figma)

> Referencia corta de lo que el frontend necesita para consumir este backend.
> No repite el esquema completo (ver `Modelo_Datos_Consolidado_EPN.pdf` y
> `docs/02_MATRIZ_PERMISOS_RLS.md`) — solo el flujo de autenticación, los
> endpoints REST auto-generados relevantes por módulo, las funciones RPC, las
> vistas y las Edge Functions.

---

## 1. Cliente

Un único cliente Supabase (`@supabase/supabase-js`) con la `anon key` pública
(nunca la `service_role`). El backend expone:

- **REST auto-generado (PostgREST):** `https://<project>.supabase.co/rest/v1/<tabla>`
  para las 25 tablas + las 2 vistas. RLS decide qué filas ve cada usuario;
  el frontend no necesita lógica de permisos propia más allá de mostrar/ocultar
  UI según `allowed_modules()`.
- **RPC:** `https://<project>.supabase.co/rest/v1/rpc/<funcion>`.
- **Edge Functions:** `https://<project>.supabase.co/functions/v1/<funcion>`.
- **Storage:** bucket privado `registro-biometrico` (solo GPI).

---

## 2. Autenticación y permisos

1. Login: `supabase.auth.signInWithPassword({ email, password })`. Nativo de
   Supabase Auth (§D1) — el frontend nunca maneja hashes de contraseña.
2. Justo después del login exitoso, llamar la RPC `registrar_sesion(p_ip_origen, p_recordar_sesion)`
   para dejar la fila de auditoría en `sesion` (§D14). No bloquea el login si falla.
3. Llamar la función `allowed_modules()` (RPC, `select public.allowed_modules()`)
   para saber qué módulos mostrar en la navegación: devuelve un `text[]` con
   los prefijos de módulo (`ADM`, `GPI`, `GPE`, `PCO`, `CAC`) para los que el
   usuario tiene el permiso `*_MODULO_ACCEDER`.
4. Los timeouts de sesión (inactividad 60 min, time-box 12 h, §D10) los
   gestiona Supabase Auth de forma nativa — el frontend no implementa nada,
   solo debe reaccionar al evento `SIGNED_OUT` del cliente.
5. Cambio de contraseña: flujo nativo de Supabase Auth
   (`supabase.auth.updateUser({ password })}`), disponible para cualquier
   usuario autenticado sobre su propia cuenta.
6. El frontend **nunca** decide permisos por nombre de rol: siempre por la
   presencia/ausencia de filas al consultar una tabla (RLS deniega en
   silencio) o por `allowed_modules()`. Si una tabla devuelve vacío o un
   INSERT/UPDATE falla con 403, es una denegación de permisos esperada, no
   un bug — mostrar el mensaje de error de PostgREST tal cual.

---

## 3. Endpoints REST por módulo (pantallas típicas)

### ADM
`persona`, `empresa`, `categoria_persona`, `usuario_sistema`, `sesion`,
`rol`, `permiso`, `usuario_rol`, `rol_permiso`, `parametro_sistema`,
`bitacora_sistema` (solo lectura), `vehiculo`, `persona_vehiculo`.

### GPI
`persona` (filtrar `tipo_persona=eq.INTERNA` en el cliente), `persona_interna_detalle`,
`registro_biometrico` (metadatos; el archivo va por Storage, ver §5),
`vehiculo`, `persona_vehiculo`.

### GPE
`persona` (`tipo_persona=eq.EXTERNA`), `memorando`, `persona_memorando`,
`autorizacion_visita_diaria`, `vehiculo`, `persona_vehiculo`.

### PCO
`zona`, `punto_control`, `dispositivo`, `guardia_punto_control`.

### CAC
`regla_acceso`, `evento_acceso` (solo lectura vía REST — la escritura real
pasa por la Edge Function `registrar-evento-acceso`, ver §4), `alerta_seguridad`
(lectura + `PATCH` para atender: `estado_alerta`, `accion_atencion`,
`observacion_atencion`).

**Pantalla del guardia:** `guardia_punto_control` (`CAC_ASIGNACION_SELECT_PROPIA`)
para saber su punto asignado; `evento_acceso`/`alerta_seguridad` ya vienen
filtrados por RLS a ese punto (`CAC_EVENTO_SELECT_PUNTO_ASIGNADO`).

---

## 4. Vistas de solo lectura

| Vista | Para qué sirve | Columnas clave |
|---|---|---|
| `vista_vigencia_acceso` | "¿Esta persona puede entrar hoy?" sin recorrer memorando/autorización a mano. | `id_persona`, `via_vigencia` (`INTERNA_ACTIVA`\|`MEMORANDO`\|`AUTORIZACION_DIARIA`), `vigente_hasta` |
| `vista_vehiculos_dentro` | Panel operativo de vehículos actualmente dentro del campus (§D25). | `id_vehiculo`, `placa`, `horas_dentro`, `limite_horas_aplicable`, `limite_abandono_horas` |

---

## 5. Edge Functions

### `POST /functions/v1/validar-biometria`
Reconocimiento facial **1:N** (identificación) de personal INTERNO (§6 doc 01).
El `descriptor` (128 floats) lo calcula el cliente con `face-api.js`; la
comparación ocurre en el backend (pgvector). Devuelve a quién pertenece el
rostro. `id_persona` solo viene poblado si `match` es `true`.

```json
// request  (descriptor = arreglo de exactamente 128 números)
{ "descriptor": [/* 128 floats */], "id_dispositivo": "uuid", "forzar_fallo": false }
// response
{ "match": true, "id_persona": "uuid", "confidence": 0.93 }
```

El `confidence` es `1 − distancia_euclidiana(L2)` contra el enrolado más cercano
(la métrica correcta para descriptores de face-api.js; coseno daba falsos
positivos). El match se decide contra `UMBRAL_BIOMETRIA` (**0.38** = distancia L2
máxima 0.62). Ese mismo `confidence` es el que se pasa como
`ocupantes[].confidence` a `registrar-evento-acceso`.

**Enrolamiento** (rol GPI, requiere sesión): RPC
`enrolar_biometria(p_id_persona uuid, p_descriptor float8[128], p_path_storage text)`.
Herramienta de prueba con cámara: `scripts/banco_biometria/`.

### `POST /functions/v1/registrar-evento-acceso`
Flujo completo de ingreso/salida (docs/04_REGLAS_NEGOCIO.md). Dos caminos:

- **`origen_registro: "AUTOMATICA"`** (dispositivo): sin JWT de usuario;
  requiere `codigo_mac` + `direccion_ip` del dispositivo que llama.
- **`origen_registro: "MANUAL"`** (guardia): requiere
  `Authorization: Bearer <jwt del guardia>`.

```json
// request (vehicular, mixto interno+externo — D22)
{
  "origen_registro": "MANUAL",
  "tipo_movimiento": "INGRESO",
  "id_punto_control": "uuid",
  "id_vehiculo": "uuid",
  "ocupantes": [
    { "id_persona": "uuid", "es_conductor": true, "confidence": 0.95 },
    { "cedula": "1700000099", "es_conductor": false }
  ]
}
// response
{
  "id_punto_control": "uuid",
  "tipo_movimiento": "INGRESO",
  "origen_registro": "MANUAL",
  "id_vehiculo": "uuid",
  "vehiculo_autorizado": false,
  "ocupantes": [
    { "id_evento": "uuid", "id_persona": "uuid", "autorizado": true, "motivo": null, "es_conductor": true },
    { "id_evento": "uuid", "cedula": "1700000099", "autorizado": false, "motivo": "...", "es_conductor": false }
  ]
}
```

Salida con override del guardia (§D23, válvula 2): agregar
`"salida_manual_forzada": true, "motivo_salida_manual": "..."`.

Ver `scripts/edge_functions.http` para ejemplos ejecutables completos
(peatonal interno/externo, vehicular, salida forzada).

---

## 6. Storage — fotos biométricas

Bucket privado `registro-biometrico`, **solo GPI** (nunca GPE ni ADM: los
externos no tienen biometría, §D20; ADM solo ve metadatos de la fila, nunca
el archivo). El frontend de GPI sube el archivo con
`supabase.storage.from('registro-biometrico').upload(path, file)` y guarda
`path` en `registro_biometrico.path_storage` vía `INSERT`/`UPDATE` normal
sobre la tabla.

---

## 7. Tipos TypeScript

`types/database.types.ts` **ya está generado** desde el esquema real del proyecto
remoto (25 tablas + 2 vistas). Para regenerarlo tras un cambio de esquema:
`npm run gen:types:linked` (contra el remoto) o `npm run gen:types` (contra un
stack local con `supabase start`).

## 8. Proyecto y cuentas de prueba

- **Project ref:** `hwfayejcwpmercvmmyvw` · **URL base:** `https://hwfayejcwpmercvmmyvw.supabase.co`
- La `anon` key (pública) se obtiene del dashboard o con `supabase projects api-keys`.
- Cuentas de arranque para probar (⚠️ rotar contraseña en el primer login):
  - `admin@epn.edu.ec` / `CambiarInmediatamente#2026` → ADMINISTRADOR_SISTEMA (módulo ADM)
  - `guardia.demo@epn.edu.ec` / `CambiarInmediatamente#2026` → GUARDIA_SEGURIDAD (módulo CAC)
- Datos demo para el flujo de acceso: `scripts/seed_demo.sql` (docente con biometría, visitante con
  autorización, dispositivo y reglas en la garita demo).
