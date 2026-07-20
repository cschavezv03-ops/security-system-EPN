-- PCO v2 §"Identificación de Usuarios Guardia": al asignar un guardia se le busca por su cédula,
-- el campo es numérico de 10 dígitos y el sistema responde si esa persona está registrada,
-- mostrando su nombre completo al lado.
--
-- Va por RPC y no leyendo `persona` desde la pantalla porque PCO solo puede ver las personas que
-- están detrás de una cuenta de guardia (política `persona_select_guardia_asignado`). El RPC
-- responde exactamente lo que la pantalla necesita y nada más: ni correo, ni dirección, ni
-- teléfono. Y no permite sondear el directorio, porque solo devuelve algo si esa cédula es de un
-- guardia con cuenta activa.
create or replace function public.buscar_guardia_por_cedula(p_cedula text)
returns table (
  id_usuario      uuid,
  nombre_completo text,
  cedula          text,
  ya_asignado     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select us.id_usuario,
         btrim(p.nombres || ' ' || p.apellidos) as nombre_completo,
         p.cedula,
         exists (
           select 1 from public.guardia_punto_control g
            where g.id_usuario = us.id_usuario and g.estado_asignacion = 'ACTIVA'
         ) as ya_asignado
    from public.persona p
    join public.usuario_sistema us on us.id_persona = p.id_persona
   where p.cedula = btrim(p_cedula)
     and p.estado = 'ACTIVO'
     and us.estado_usuario = 'ACTIVO'
     and public.es_usuario_guardia(us.id_usuario)
     -- Solo quien gestiona asignaciones puede preguntar.
     and (public.tiene_permiso('PCO_ASIGNACION_INSERT') or public.tiene_permiso('PCO_ASIGNACION_UPDATE'));
$$;

comment on function public.buscar_guardia_por_cedula(text) is
  'Busca un guardia por cédula para la pantalla de asignaciones. Devuelve solo id, nombre y si ya tiene una asignación activa; no expone el resto de la ficha ni sirve para sondear el directorio.';

revoke execute on function public.buscar_guardia_por_cedula(text) from public, anon;
grant  execute on function public.buscar_guardia_por_cedula(text) to authenticated;
