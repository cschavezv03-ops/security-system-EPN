-- Un vehiculo de personal interno no se asocia a personal externo, ni al reves.
--
-- GPI gestiona a docentes, estudiantes, administrativos y trabajadores; GPE gestiona a
-- visitantes, proveedores y contratistas, que entran amparados por un memorando. Hasta ahora
-- la unica barrera estaba en la pantalla (`BuscarPersonaPorCedula` con `soloTipo`), y ademas
-- solo en la ficha del vehiculo: el alta unificada de vehiculo + propietario no filtraba nada,
-- asi que desde GPE se podia registrar un coche a nombre de un docente y desde GPI a nombre de
-- un visitante. La RPC y la API REST tampoco lo impedian.
--
-- Aqui la regla baja a la base, que es donde no se puede rodear:
--   1. quien inserta solo puede vincular personas de SU ambito (GPI internas, GPE externas);
--   2. un mismo vehiculo no puede tener a la vez personas internas y externas vinculadas,
--      sea cual sea el modulo desde el que se registraron.
--
-- ADM es la maestra de `persona`, `vehiculo` y `persona_vehiculo` (CLAUDE.md): puede vincular a
-- cualquiera, pero la regla 2 le sigue aplicando, porque un vehiculo mixto no es un permiso mas
-- amplio sino un dato incoherente — el ingreso de un interno se decide por su categoria y el de
-- un externo por su memorando, y ningun guardia sabria cual de las dos vias aplica.

-- ---------------------------------------------------------------------------
-- Ambito del usuario que esta escribiendo
-- ---------------------------------------------------------------------------
-- Se deduce de los permisos efectivos, no de un parametro que mande el cliente: el frontend
-- puede mentir sobre desde que pantalla llama, los permisos no.
create or replace function public.ambito_persona_vehiculo()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- ADM primero: quien administra las maestras trabaja con las dos poblaciones.
    when public.tiene_permiso('ADM_PERSONA_VEHICULO_INSERT')
      or public.tiene_permiso('ADM_PERSONA_VEHICULO_UPDATE') then 'ADM'
    when public.tiene_permiso('GPI_PERSONA_VEHICULO_INSERT')
      or public.tiene_permiso('GPI_PERSONA_VEHICULO_UPDATE') then 'GPI'
    when public.tiene_permiso('GPE_PERSONA_VEHICULO_INSERT')
      or public.tiene_permiso('GPE_PERSONA_VEHICULO_UPDATE') then 'GPE'
    else null
  end;
$$;

comment on function public.ambito_persona_vehiculo() is
  'Modulo desde el que el usuario autenticado puede vincular personas a vehiculos (ADM, GPI o GPE), deducido de sus permisos.';

revoke all on function public.ambito_persona_vehiculo() from public;
grant execute on function public.ambito_persona_vehiculo() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- La persona vinculada tiene que ser del ambito de quien la vincula
-- ---------------------------------------------------------------------------
create or replace function public.validar_ambito_persona_vehiculo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona record;
  v_ambito text;
  v_otro text;
  v_placa text;
begin
  select p.id_persona, p.tipo_persona, p.nombres, p.apellidos
    into v_persona
    from public.persona p
   where p.id_persona = new.id_persona;

  if v_persona.id_persona is null then
    raise exception 'No se encontro la persona que se intenta asociar al vehiculo.'
      using errcode = 'no_data_found';
  end if;

  -- 1. Ambito de quien escribe. `service_role` y los procesos internos no tienen permisos de
  --    usuario: ahi el ambito es null y esta comprobacion no aplica (la 2 si).
  v_ambito := public.ambito_persona_vehiculo();

  if v_ambito = 'GPI' and v_persona.tipo_persona <> 'INTERNA' then
    raise exception 'Personal Interno solo puede asociar vehiculos a personal interno; % % es personal externo. Registra esta asociacion desde Personal Externo.',
      v_persona.nombres, v_persona.apellidos
      using errcode = 'check_violation';
  end if;

  if v_ambito = 'GPE' and v_persona.tipo_persona <> 'EXTERNA' then
    raise exception 'Personal Externo solo puede asociar vehiculos a personal externo; % % es personal interno. Registra esta asociacion desde Personal Interno.',
      v_persona.nombres, v_persona.apellidos
      using errcode = 'check_violation';
  end if;

  -- 2. Coherencia del vehiculo: todas sus personas vigentes son de la misma poblacion.
  --    Solo miran las relaciones ACTIVAS; una revocada es historia y no condiciona nada.
  if new.estado_relacion = 'ACTIVA' then
    select p.tipo_persona
      into v_otro
      from public.persona_vehiculo pv
      join public.persona p on p.id_persona = pv.id_persona
     where pv.id_vehiculo = new.id_vehiculo
       and pv.estado_relacion = 'ACTIVA'
       and pv.id_persona_vehiculo is distinct from new.id_persona_vehiculo
       and p.tipo_persona <> v_persona.tipo_persona
     limit 1;

    if v_otro is not null then
      select v.placa into v_placa from public.vehiculo v where v.id_vehiculo = new.id_vehiculo;
      raise exception 'El vehiculo % ya esta asociado a personal %; no puede compartirse con personal %.',
        coalesce(v_placa, 'sin placa'),
        lower(v_otro),
        lower(v_persona.tipo_persona)
        using errcode = 'check_violation',
              hint = 'Revoca primero las asociaciones vigentes del otro ambito, o registra el vehiculo por separado.';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.validar_ambito_persona_vehiculo() is
  'GPI vincula personal interno y GPE personal externo; ademas, un mismo vehiculo no mezcla ambas poblaciones.';

revoke all on function public.validar_ambito_persona_vehiculo() from public;

drop trigger if exists trg_validar_ambito_persona_vehiculo on public.persona_vehiculo;
create trigger trg_validar_ambito_persona_vehiculo
  before insert or update of id_persona, id_vehiculo, estado_relacion
  on public.persona_vehiculo
  for each row
  execute function public.validar_ambito_persona_vehiculo();
