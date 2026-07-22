# Trazabilidad — revisión de los DOCX del 22/07/2026

Fuentes recibidas fuera del repositorio:

- `/home/renato/Documento de errores.docx`
- `/home/renato/requermientos a correjir.docx`

| # | Observación | Implementación | Cobertura |
|---|---|---|---|
| 1 | Quitar categoría del alta de usuario ADM | La categoría de una persona nueva se deriva del rol; no se muestra combobox. | `UsuariosScreen.test.tsx` |
| 2 | No inactivar la zona padre Campus | Acción deshabilitada y trigger `proteger_campus_activo`. | `configs-pco.test.tsx` + migración `20260722121000` |
| 3 | No mostrar “Activo” si el guardia está fuera de turno | El encabezado usa el resultado del servidor: En turno/Fuera de turno. | `GuardiaView.test.tsx` |
| 4 | Distinguir bloqueo, baja y contraseña incorrecta | Códigos y mensajes propios en `iniciar-sesion`. | `supabase.test.ts` |
| 5 | Validar año del código único | Numérico; año 1970..año actual en frontend y trigger. | `validacion.test.ts` + migración `20260722120000` |
| 6 | Buscar sin exigir tildes | Normalización común en listados, Usuarios y selección múltiple. | `ResourceScreen.test.tsx`, `validacion.test.ts` |
| 7 | Administrativo solo puede elegir EPN | Catálogo dependiente de categoría y trigger de respaldo. | `ResourceScreen.test.tsx` + migración `20260722120000` |
| 8 | Punto de control: filtrar como el panel de Zonas | El filtro usa tipo de zona: Campus, Edificio o Parqueadero. | `configs-pco.test.tsx` |
| 9 | Componer “Edificio 26 – EARME” | Número + descripción separados; nombre oficial derivado por UI y trigger. | `configs-pco.test.tsx` + migración `20260722121000` |
| 10 | Filtrar asignaciones activas/finalizadas | Nuevo filtro sobre `estado_asignacion`. | `configs-pco.test.tsx` |

## Verificación local

- `npm run verificar`: typecheck, **276/276 pruebas** y build de producción en verde.
- `supabase db reset` se intentó, pero el entorno no tiene un daemon de Docker activo. Las
  migraciones quedan versionadas para que el reset se ejecute en una estación con Docker antes
  de `supabase db push`.
