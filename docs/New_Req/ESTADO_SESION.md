# Estado del sistema al cierre de la ronda de validaciones (reqs 9-38)

Punto de partida para la siguiente sesión, centrada en **modificaciones del módulo ADM**.

## Dónde está todo

| Qué | Dónde |
|---|---|
| Aplicación desplegada | https://security-system-epn.vercel.app |
| Rama de esta ronda | `feat/validaciones-reqs-9-38` (17 commits) |
| Decisiones tomadas | `docs/03_DECISIONES_Y_CORRECCIONES.md` §D34-D40 |
| Dudas y pendientes | `docs/99_DUDAS_PARA_EL_EQUIPO.md` §V8-V13 |
| Pruebas manuales | `docs/New_Req/GUIA_PRUEBAS_MANUALES.md` |

## Cuentas de prueba

Las 8 cuentas usan la contraseña **`admin1234`** y tienen `requiere_cambio_password = false`
para que no interrumpa las pruebas. Para probar el cambio obligatorio (req 27), reactívalo en
una sola cuenta:

```sql
update usuario_sistema set requiere_cambio_password = true where nombre_usuario = 'admin';
```

`frank.jumbo` quedó con bloqueo **administrativo** (`estado_usuario = 'BLOQUEADO'`) de las
pruebas: no caduca solo, se levanta con "Desbloquear usuario" en ADM → Usuarios.

## ⚠️ `supabase db push` NO funciona en este proyecto

Los archivos de migración locales del 14-15 de julio tienen timestamps distintos a los del
historial remoto (drift preexistente). `db push` intentaría reaplicar ~13 migraciones ya
aplicadas y fallaría.

**Las migraciones de esta ronda se aplicaron una a una con el MCP (`apply_migration`)**, usando
el contenido exacto del archivo. Es el procedimiento a seguir mientras no se reconcilie el
historial. Reconciliarlo es una tarea pendiente que conviene hacer pronto.

## Estado del módulo ADM (lo que toca la próxima sesión)

Pantallas actuales (`web/src/resources/registry.tsx`, bloque `ADM`):

| Pantalla | Implementación | Notas |
|---|---|---|
| Usuarios | `pages/modules/UsuariosScreen.tsx` (dedicada) | Estados, bloqueo por intentos, restablecer contraseña, alta usuario+rol |
| Matriz rol × permiso | `pages/modules/RolPermisoScreen.tsx` | |
| Sesiones | `cfgSesion` en `configs-lectura.tsx` | Dispositivo, apertura/cierre, cerrar sesión concreta |
| Bitácora | `cfgBitacora` | Solo lectura |
| Personas / Biometría / Vehículos / Asociaciones | configs genéricas | Motor `ResourceScreen` |
| Parámetros, Roles, Permisos, Categorías, Empresas | configs genéricas | |

Piezas reutilizables añadidas en esta ronda, útiles para lo que venga:

- `components/BuscarPersonaPorCedula.tsx` — reemplaza combos con todas las personas.
- `components/EncabezadoUsuario.tsx` — nombre + rol, formato único.
- `lib/useBorrador.ts` — persistencia de formularios (borrador con debounce).
- `lib/errores.ts` — traducción de errores del proveedor al español.
- `lib/validacion.ts` — validadores espejo de las funciones SQL.
- `ResourceConfig.accionDetalle` — acciones propias en el panel de detalle.

## Pendientes reales (no bloquean, dependen de terceros o de plan de pago)

1. **SMTP**: el flujo de recuperación funciona con el correo integrado de Supabase, limitado a
   2 correos/hora y sin poder traducir la plantilla (el asunto sigue en inglés). Se resuelve
   configurando un SMTP propio.
2. **Fuerza bruta**: el bloqueo por 5 intentos funciona y es efectivo, pero el conteo depende de
   que el intento pase por la Edge Function `iniciar-sesion`. Cerrarlo del todo requiere el Auth
   Hook de GoTrue (plan de pago) — la función ya está escrita — o activar hCaptcha (gratis).
3. **SRI / ANT / Registro Civil**: sin integración; `empresa.estado_verificacion_ruc` queda en
   `NO_VERIFICADO`.
4. **18 cédulas ficticias** de la ronda anterior siguen pendientes de sustituir por las reales.
5. **Historial de migraciones**: reconciliar para recuperar `supabase db push`.

## Cómo verificar que nada se rompió

```bash
cd web && npm run typecheck && npm test && npm run build

# Contra la base real (no dejan rastro salvo filas de auditoría):
export SB_URL=... SB_ANON=... SB_PASSWORD=admin1234
python3 scripts/prueba_multisesion.py
python3 scripts/prueba_bloqueo_intentos.py
python3 scripts/prueba_cierre_sesion.py
psql "$DATABASE_URL" -f scripts/pruebas_validaciones_nuevas.sql   # BEGIN … ROLLBACK
```
