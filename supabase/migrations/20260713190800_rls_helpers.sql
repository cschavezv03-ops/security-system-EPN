-- Helpers RLS reutilizados por las politicas de los siguientes migrations.
-- Ver docs/99_DUDAS_PARA_EL_EQUIPO.md (E6) para el razonamiento: varias
-- celdas "L" de docs/02_MATRIZ_PERMISOS_RLS.md no tienen un codigo_permiso
-- dedicado; se resuelven con el OR de los *_MODULO_ACCEDER pertinentes.

-- Cualquier usuario con acceso a algun modulo (categoria_persona,
-- parametro_sistema: L universal para los 7 roles).
create or replace function auth.tiene_algun_modulo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.tiene_permiso('ADM_MODULO_ACCEDER')
      or auth.tiene_permiso('GPI_MODULO_ACCEDER')
      or auth.tiene_permiso('GPE_MODULO_ACCEDER')
      or auth.tiene_permiso('PCO_MODULO_ACCEDER')
      or auth.tiene_permiso('CAC_MODULO_ACCEDER');
$$;

grant execute on function auth.tiene_algun_modulo() to authenticated;

-- CAC (supervisor) o GUARDIA_SEGURIDAD operando: cubre las tablas donde
-- ambos roles necesitan lectura sin restriccion de fila (zona, punto_control,
-- persona_vehiculo, persona_interna_detalle, persona para validacion).
-- No usar para tablas con restriccion de fila especifica del guardia
-- (dispositivo, guardia_punto_control) ni donde el guardia debe quedar
-- excluido (registro_biometrico): ahi se usa el codigo puntual.
create or replace function auth.tiene_acceso_operativo_cac()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.tiene_permiso('CAC_EVENTO_SELECT')
      or auth.tiene_permiso('CAC_EVENTO_SELECT_PUNTO_ASIGNADO')
      or auth.tiene_permiso('CAC_VALIDACION_EJECUTAR');
$$;

grant execute on function auth.tiene_acceso_operativo_cac() to authenticated;

-- Puntos de control activos actualmente asignados al usuario autenticado
-- (guardia_punto_control.estado_asignacion = 'ACTIVA'). Usado por las
-- politicas de fila restringida (evento_acceso, alerta_seguridad,
-- dispositivo, guardia_punto_control).
create or replace function auth.puntos_control_asignados()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select gpc.id_punto_control
    from public.guardia_punto_control gpc
   where gpc.id_usuario = auth.uid()
     and gpc.estado_asignacion = 'ACTIVA';
$$;

grant execute on function auth.puntos_control_asignados() to authenticated;
