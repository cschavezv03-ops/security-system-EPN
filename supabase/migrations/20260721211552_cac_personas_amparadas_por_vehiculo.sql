-- Quién puede subirse a este vehículo, según el memorando que lo ampara.
--
-- La garita mostraba las personas de `persona_vehiculo` —quién está asociado al coche— y las
-- añadía con un clic. Dos problemas:
--
--   1. Estar asociado a un vehículo no es lo mismo que estar amparado por el memorando. Lo que
--      autoriza el ingreso es el oficio, no la relación con el coche.
--   2. Añadir con un clic significa que el guardia no comprobó la identidad de nadie. §D20 dice
--      que el personal externo se identifica **con su cédula, tecleada por el guardia**; un
--      botón que añade a alguien porque su nombre aparece en pantalla se salta exactamente eso.
--
-- Esta función devuelve las cédulas contra las que el guardia tiene que contrastar el documento
-- que le entregan. La vigencia se decide aquí, con la fecha de Ecuador, y no en el navegador.

create or replace function public.personas_amparadas_por_vehiculo(p_id_vehiculo uuid)
returns table (
  id_persona uuid,
  cedula varchar,
  nombres varchar,
  apellidos varchar,
  numero_memorando varchar
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.id_persona, p.cedula, p.nombres, p.apellidos, m.numero_memorando
    from public.memorando_vehiculo mv
    join public.memorando m on m.id_memorando = mv.id_memorando
    join public.persona_memorando pm on pm.id_memorando = m.id_memorando
    join public.persona p on p.id_persona = pm.id_persona
   where mv.id_vehiculo = p_id_vehiculo
     and pm.estado_acceso = 'ACTIVO'
     and p.estado = 'ACTIVO'
     and m.estado_memorando <> 'ANULADO'
     and m.permite_vehiculo
     and public.hoy_ecuador() between m.fecha_inicio and m.fecha_fin;
$$;

comment on function public.personas_amparadas_por_vehiculo(uuid) is
  'Personas que un memorando vigente autoriza a entrar en ese vehículo, con su cédula para que el guardia la contraste (§D20).';

revoke all on function public.personas_amparadas_por_vehiculo(uuid) from public, anon;
grant execute on function public.personas_amparadas_por_vehiculo(uuid) to authenticated, service_role;
