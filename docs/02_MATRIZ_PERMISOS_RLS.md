# 02 — Matriz de Permisos y RLS

> **Autoridad:** este documento manda sobre `matrizGeneralDePermisos.md` y sobre la §6/§7 de
> `ADM_Login_Roles_Permisos.md`. Es la traducción de esas matrices al nivel que necesita
> PostgreSQL: **tabla × acción × rol**. Es la entrada directa para generar `rol_permiso`
> y las políticas RLS.

---

## Leyenda

| Símbolo | Significado en RLS |
|---|---|
| `L` | SELECT permitido |
| `C` | INSERT permitido |
| `A` | UPDATE permitido |
| `—` | Sin acceso (denegación por defecto) |
| `L*` | SELECT restringido a un subconjunto de filas (ver nota al pie de la tabla) |
| `A*` | UPDATE restringido a ciertas columnas o filas (ver nota) |

**DELETE no aparece en ninguna celda: está prohibido en todo el sistema.** Se revoca el
privilegio a nivel de tabla y las bajas se hacen cambiando el campo de estado.

**Roles:** `ADMIN` = ADMINISTRADOR_SISTEMA · `DIR` = DIRECTOR_ADMINISTRATIVO ·
`GPI` = RESPONSABLE_PERSONAL_INTERNO · `GPE` = RESPONSABLE_PERSONAL_EXTERNO ·
`PCO` = RESPONSABLE_PUNTOS_CONTROL · `CAC` = RESPONSABLE_CONTROL_ACCESOS ·
`GUA` = GUARDIA_SEGURIDAD · `DISP` = identidad de servicio de dispositivos (bypass de RLS
vía Edge Function con `service_role`; se lista aquí solo para documentar qué necesita tocar).

---

## Módulo ADM — entidades maestras y seguridad lógica

| Tabla | ADMIN | DIR | GPI | GPE | PCO | CAC | GUA | DISP |
|---|---|---|---|---|---|---|---|---|
| `persona` | L C⁵ A | L | L C A | L C A | — | L | L C¹ | L |
| `empresa` | L C A | L | L | L | — | — | — | — |
| `categoria_persona` | L C A | L | L | L | L | L | L | L |
| `usuario_sistema` | L C A | L | L² | L² | L² | L² | L² | — |
| `sesion` | L | L | L² | L² | L² | L² | L² | — |
| `rol` | L C A | L | — | — | — | — | — | — |
| `permiso` | L C A | L | — | — | — | — | — | — |
| `usuario_rol` | L C A | L | — | — | — | — | — | — |
| `rol_permiso` | L C A | L | — | — | — | — | — | — |
| `parametro_sistema` | L C A | L | L | L | L | L | L | L |
| `bitacora_sistema` | L | L | — | — | — | — | — | — |
| `vehiculo` | L C A | L | L C³ | L C³ | — | L | L | L |
| `persona_vehiculo` | L C A | L | L C A | L C A | — | L | L | L |

¹ El guardia puede **crear** una `persona` solo con `tipo_persona = 'EXTERNA'` — es el caso
del visitante que llega sin cita y no existe en el sistema. No puede crear personas internas
ni modificar personas existentes. *(Derivado: ver `03_DECISIONES_Y_CORRECCIONES.md` §D6.)*

² Solo su propia fila (`id_usuario = auth.uid()`). Es el "Cuenta propia únicamente" de
`ADM_Login_Roles_Permisos.md` §6.

³ GPI y GPE pueden dar de alta un vehículo nuevo, pero **no** modificarlo ni darlo de baja:
el ciclo de vida (UPDATE / cambio de estado) queda en ADM, como exige el modelo de datos §3.1.

⁵ `ADM_PERSONA_INSERT`, acotado por RLS a `tipo_persona = 'INTERNA'` (§D75). Existe para que
crear un responsable no exija dos sesiones —una de GPI para la persona y otra de ADM para la
cuenta y el rol—, que era el flujo anterior. El personal externo sigue siendo de GPE: no puede
tener cuenta, así que ADM no lo crea.

⚠️ **`bitacora_sistema` no tiene INSERT para ningún rol.** Se escribe exclusivamente desde
triggers y funciones `SECURITY DEFINER`. Ningún usuario la escribe a mano y nadie la actualiza.

---

## Módulo GPI — personal interno y biometría

| Tabla | ADMIN | DIR | GPI | GPE | PCO | CAC | GUA | DISP |
|---|---|---|---|---|---|---|---|---|
| `persona_interna_detalle` | L | L | L C A | — | — | L | L | L |
| `registro_biometrico` | L⁴ | — | L C A | — | — | L | — | L |

⁴ ADMIN ve solo los **metadatos** de la fila (persona, vigencia, fechas). El acceso al archivo
en Storage se controla aparte y ADMIN no lo tiene: es un dato biométrico sensible y el
administrador del sistema no tiene necesidad funcional de verlo.

⚠️ **GPE no tiene NINGÚN permiso sobre `registro_biometrico`.** Los externos **nunca** tienen
biometría: se validan con la cédula ante el guardia (§D20). Un trigger debe impedir insertar
biometría de una `persona` con `tipo_persona = 'EXTERNA'`.
*(Esto revierte la decisión D7, que era incorrecta.)*

---

## Módulo GPE — personal externo

| Tabla | ADMIN | DIR | GPI | GPE | PCO | CAC | GUA | DISP |
|---|---|---|---|---|---|---|---|---|
| `memorando` | L | L | — | L C A | — | L | L | L |
| `persona_memorando` | L | L | — | L C A | — | L | L | L |
| `autorizacion_visita_diaria` | L | L | — | L C A | — | L | L C A⁶ | L |

⁶ **El guardia crea y revoca autorizaciones de visita diaria.** El modelo de datos lo dice
explícitamente: "la autorización depende del criterio del guardia, no de la DRI", y
`id_usuario_registro` se documenta como "Usuario (guardia) que la registró". El guardia
**no** toca `memorando` (eso requiere aprobación institucional de la DRI y es exclusivo de GPE).
*(Conflicto resuelto: ver `03_DECISIONES_Y_CORRECCIONES.md` §D3.)*

---

## Módulo PCO — infraestructura física

| Tabla | ADMIN | DIR | GPI | GPE | PCO | CAC | GUA | DISP |
|---|---|---|---|---|---|---|---|---|
| `zona` | L | L | — | — | L C A | L | L | L |
| `punto_control` | L | L | — | — | L C A | L | L | L |
| `dispositivo` | L | L | — | — | L C A | L | L⁷ | L |
| `guardia_punto_control` | L | L | — | — | L C A | L C A | L⁷ | L |

⁷ Solo las filas cuyo `id_punto_control` esté entre los puntos que el guardia tiene asignados
(`guardia_punto_control` con `estado_asignacion = 'ACTIVA'`). En el caso de
`guardia_punto_control`, además solo sus propias asignaciones (`id_usuario = auth.uid()`).

**`guardia_punto_control` es la 25.ª tabla del sistema** — la única añadida al Modelo de Datos
Consolidado. Módulo dueño: **PCO**. Estructura completa y justificación en
`03_DECISIONES_Y_CORRECCIONES.md` §D11. `RESPONSABLE_CONTROL_ACCESOS` también puede asignar
guardias (es quien organiza la operación diaria), no solo PCO.

---

## Módulo CAC — control de accesos

| Tabla | ADMIN | DIR | GPI | GPE | PCO | CAC | GUA | DISP |
|---|---|---|---|---|---|---|---|---|
| `evento_acceso` | L | L | L | L | — | L | L⁸ C⁹ | L C |
| `alerta_seguridad` | L | L | — | — | — | L A¹⁰ | L⁸ | C |
| `regla_acceso` | L | L | — | — | — | L C A | L | L |

⁸ Solo eventos/alertas de **su punto de control asignado**, resuelto vía `guardia_punto_control`
(ver §D11). La política se escribe así:

```sql
create policy evento_guardia_select on public.evento_acceso
  for select using (
    auth.tiene_permiso('CAC_EVENTO_SELECT_PUNTO_ASIGNADO')
    and evento_acceso.id_punto_control in (
      select gpc.id_punto_control
        from public.guardia_punto_control gpc
       where gpc.id_usuario = auth.uid()
         and gpc.estado_asignacion = 'ACTIVA'
    )
  );
```

Un guardia **sin asignación activa no ve ningún evento** — denegación por defecto, correcto.

⁹ Registro **manual** de entrada/salida (`origen_registro = 'MANUAL'`). El registro
automático lo hace `DISP` vía Edge Function.

¹⁰ **Solo el Supervisor CAC atiende alertas** (`estado_alerta` → `ATENDIDA`,
`accion_atencion`, `observacion_atencion`, `id_usuario_atencion`). Nadie **crea** alertas a
mano: nacen automáticamente de un trigger sobre `evento_acceso` o de la Edge Function de
validación. *(Conflicto resuelto: ver `03_DECISIONES_Y_CORRECCIONES.md` §D4.)*

⚠️ `evento_acceso` **no tiene UPDATE para nadie.** Es histórico. Una vez insertado, es inmutable.

---

## Códigos de permiso (`permiso.codigo_permiso`)

Formato: `MODULO_ENTIDAD_ACCION`. Estos son los registros a sembrar en la tabla `permiso`,
y las políticas RLS deben consultarlos (no hardcodear nombres de rol en las políticas).

> ⚠️ **Regla de prefijos (§D19):** el `MODULO` del código es **aquel desde el que el usuario
> actúa, no el módulo dueño de la tabla.** Por eso conviven `GPE_AUTORIZACION_INSERT` (el
> responsable de GPE) y `CAC_AUTORIZACION_INSERT` (el guardia, operando desde CAC) sobre la
> **misma tabla** `autorizacion_visita_diaria`. No es duplicación: son dos caminos de acceso
> distintos a la misma entidad, revocables por separado.
> **No renombrar ni "normalizar" estos permisos.**

### Acceso a módulo (uno por módulo; controla `allowed_modules`)
```
ADM_MODULO_ACCEDER
GPI_MODULO_ACCEDER
GPE_MODULO_ACCEDER
PCO_MODULO_ACCEDER
CAC_MODULO_ACCEDER
```

### ADM
```
ADM_USUARIO_SELECT          ADM_USUARIO_INSERT          ADM_USUARIO_UPDATE
ADM_ROL_SELECT              ADM_ROL_INSERT              ADM_ROL_UPDATE
ADM_PERMISO_SELECT          ADM_PERMISO_INSERT          ADM_PERMISO_UPDATE
ADM_USUARIO_ROL_SELECT      ADM_USUARIO_ROL_INSERT      ADM_USUARIO_ROL_UPDATE
ADM_ROL_PERMISO_SELECT      ADM_ROL_PERMISO_INSERT      ADM_ROL_PERMISO_UPDATE
ADM_PARAMETRO_SELECT        ADM_PARAMETRO_INSERT        ADM_PARAMETRO_UPDATE
ADM_EMPRESA_SELECT          ADM_EMPRESA_INSERT          ADM_EMPRESA_UPDATE
ADM_CATEGORIA_SELECT        ADM_CATEGORIA_INSERT        ADM_CATEGORIA_UPDATE
ADM_PERSONA_SELECT          ADM_PERSONA_INSERT          ADM_PERSONA_UPDATE
ADM_VEHICULO_SELECT         ADM_VEHICULO_INSERT         ADM_VEHICULO_UPDATE
ADM_PERSONA_VEHICULO_SELECT ADM_PERSONA_VEHICULO_INSERT ADM_PERSONA_VEHICULO_UPDATE
ADM_BITACORA_SELECT         ADM_BITACORA_EXPORTAR
```

> `ADM_PERSONA_INSERT` es de la ronda del 20/07/2026 (§D75) y solo lo tiene el
> **Administrador del Sistema**, no el Director Administrativo, que es de consulta. Su política
> RLS lo acota a `tipo_persona = 'INTERNA'`: el personal externo es de GPE y no puede tener
> cuenta. Existe para que dar de alta a un responsable no exija dos sesiones (una de GPI para
> la persona y otra de ADM para la cuenta).

### GPI
```
GPI_PERSONA_SELECT          GPI_PERSONA_INSERT          GPI_PERSONA_UPDATE
GPI_PERSONA_DETALLE_SELECT  GPI_PERSONA_DETALLE_INSERT  GPI_PERSONA_DETALLE_UPDATE
GPI_BIOMETRIA_SELECT        GPI_BIOMETRIA_INSERT        GPI_BIOMETRIA_UPDATE
GPI_VEHICULO_SELECT         GPI_VEHICULO_INSERT
GPI_PERSONA_VEHICULO_SELECT GPI_PERSONA_VEHICULO_INSERT GPI_PERSONA_VEHICULO_UPDATE
```

### GPE
```
GPE_PERSONA_SELECT          GPE_PERSONA_INSERT          GPE_PERSONA_UPDATE
GPE_MEMORANDO_SELECT        GPE_MEMORANDO_INSERT        GPE_MEMORANDO_UPDATE
GPE_PERSONA_MEMORANDO_SELECT GPE_PERSONA_MEMORANDO_INSERT GPE_PERSONA_MEMORANDO_UPDATE
GPE_AUTORIZACION_SELECT     GPE_AUTORIZACION_INSERT     GPE_AUTORIZACION_UPDATE
GPE_VEHICULO_SELECT         GPE_VEHICULO_INSERT
GPE_PERSONA_VEHICULO_SELECT GPE_PERSONA_VEHICULO_INSERT GPE_PERSONA_VEHICULO_UPDATE
```

### PCO
```
PCO_ZONA_SELECT             PCO_ZONA_INSERT             PCO_ZONA_UPDATE
PCO_PUNTO_CONTROL_SELECT    PCO_PUNTO_CONTROL_INSERT    PCO_PUNTO_CONTROL_UPDATE
PCO_DISPOSITIVO_SELECT      PCO_DISPOSITIVO_INSERT      PCO_DISPOSITIVO_UPDATE
PCO_ASIGNACION_SELECT       PCO_ASIGNACION_INSERT       PCO_ASIGNACION_UPDATE
```

### CAC
```
CAC_EVENTO_SELECT           CAC_EVENTO_INSERT
CAC_EVENTO_SELECT_PUNTO_ASIGNADO
CAC_ALERTA_SELECT           CAC_ALERTA_ATENDER
CAC_REGLA_SELECT            CAC_REGLA_INSERT            CAC_REGLA_UPDATE
CAC_VALIDACION_EJECUTAR
CAC_PERSONA_EXTERNA_INSERT
CAC_AUTORIZACION_INSERT     CAC_AUTORIZACION_UPDATE
CAC_ASIGNACION_SELECT       CAC_ASIGNACION_INSERT       CAC_ASIGNACION_UPDATE
CAC_ASIGNACION_SELECT_PROPIA
```

### Asignación de permisos a roles (tabla `rol_permiso`)

| Rol | Permisos |
|---|---|
| `ADMINISTRADOR_SISTEMA` | `ADM_MODULO_ACCEDER` + todos los `ADM_*` |
| `DIRECTOR_ADMINISTRATIVO` | `ADM_MODULO_ACCEDER` + todos los `*_SELECT` de todos los módulos + `ADM_BITACORA_EXPORTAR`. **Ningún `_INSERT` ni `_UPDATE`.** |
| `RESPONSABLE_PERSONAL_INTERNO` | `GPI_MODULO_ACCEDER` + todos los `GPI_*` |
| `RESPONSABLE_PERSONAL_EXTERNO` | `GPE_MODULO_ACCEDER` + todos los `GPE_*` |
| `RESPONSABLE_PUNTOS_CONTROL` | `PCO_MODULO_ACCEDER` + todos los `PCO_*` |
| `RESPONSABLE_CONTROL_ACCESOS` | `CAC_MODULO_ACCEDER` + todos los `CAC_*` **excepto** `CAC_PERSONA_EXTERNA_INSERT` |
| `GUARDIA_SEGURIDAD` | `CAC_MODULO_ACCEDER`, `CAC_VALIDACION_EJECUTAR`, `CAC_EVENTO_INSERT`, `CAC_EVENTO_SELECT_PUNTO_ASIGNADO`, `CAC_ALERTA_SELECT`, `CAC_PERSONA_EXTERNA_INSERT`, `CAC_AUTORIZACION_INSERT`, `CAC_AUTORIZACION_UPDATE`, `CAC_ASIGNACION_SELECT_PROPIA`, `GPE_MEMORANDO_SELECT`, `GPE_PERSONA_MEMORANDO_SELECT`, `ADM_VEHICULO_SELECT`. **Sin `CAC_REGLA_*`** (no puede editar las reglas que lo autorizan) y **sin `CAC_ASIGNACION_INSERT/UPDATE`** (no puede auto-asignarse a un punto de control). |

---

## Notas de implementación para RLS

- Habilitar `ROW LEVEL SECURITY` en las 25 tablas (24 del modelo + `guardia_punto_control`), sin excepción.
- Las políticas deben preguntar por **permiso**, no por nombre de rol. Ej.:
  ```sql
  create policy persona_select on public.persona
    for select using ( auth.tiene_permiso('GPI_PERSONA_SELECT')
                    or auth.tiene_permiso('GPE_PERSONA_SELECT')
                    or auth.tiene_permiso('ADM_PERSONA_SELECT') );
  ```
  Así, cambiar la matriz `rol_permiso` cambia el comportamiento sin re-desplegar políticas.
- `auth.tiene_permiso(codigo text)` debe ser `STABLE` y `SECURITY DEFINER`, resolviendo
  `auth.uid()` → `usuario_sistema` → `usuario_rol` (activos) → `rol_permiso` (activos) → `permiso`.
- Revocar el privilegio `DELETE` en todas las tablas (`REVOKE DELETE ON ALL TABLES ...`),
  además de no crear políticas de DELETE. Cinturón y tirantes.
- Revocar `UPDATE` a nivel de tabla en `evento_acceso` y `bitacora_sistema`.
