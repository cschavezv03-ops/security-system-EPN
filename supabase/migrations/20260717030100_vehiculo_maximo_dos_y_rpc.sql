-- Maximo de vehiculos activos por persona + registro atomico vehiculo+propietario
-- (req 35 de docs/New_Req/especificacion_validaciones_sistema_general.md).
--
-- Estado de datos verificado contra el remoto antes de esta migracion:
--   - 0 personas con mas de 2 relaciones activas que cuentan.
--   - 0 vehiculos con mas de un PROPIETARIO activo.
--   - 0 relaciones activas (id_persona,id_vehiculo) duplicadas.
-- Por eso los indices unicos y el trigger se pueden aplicar sin saneamiento.
--
-- Que relaciones CUENTAN para el limite (definicion explicita que pide el req 35):
--   estado_relacion = 'ACTIVA'
--   and tipo_relacion in ('PROPIETARIO','CONDUCTOR_AUTORIZADO')
--   and (fecha_fin is null or fecha_fin >= now())
-- PASAJERO y TEMPORAL no consumen el cupo: son relaciones incidentales.

-- ===========================================================================
-- 1. Unicidad de relaciones activas
-- ===========================================================================
-- No se puede repetir la MISMA relacion activa persona-vehiculo.
create unique index if not exists uq_persona_vehiculo_activa
  on public.persona_vehiculo (id_persona, id_vehiculo)
  where estado_relacion = 'ACTIVA';

-- Un vehiculo no puede tener dos PROPIETARIOS activos (relacion principal unica).
create unique index if not exists uq_vehiculo_propietario_activo
  on public.persona_vehiculo (id_vehiculo)
  where estado_relacion = 'ACTIVA' and tipo_relacion = 'PROPIETARIO';

-- Acelera el conteo del trigger (relaciones activas por persona).
create index if not exists idx_persona_vehiculo_persona_activa
  on public.persona_vehiculo (id_persona)
  where estado_relacion = 'ACTIVA';

-- ===========================================================================
-- 2. Trigger: maximo de vehiculos activos por persona (con lock)
-- ===========================================================================
-- Contar en el frontend no basta: dos peticiones simultaneas leerian "1" cada
-- una y ambas insertarian, dejando 3. Se serializa con un advisory lock por
-- persona dentro de la transaccion: la segunda peticion espera a la primera,
-- vuelve a contar y ve el cupo lleno. El limite vive en parametro_sistema.
create or replace function public.enforce_max_vehiculos_activos()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_max integer;
  v_actuales integer;
begin
  -- Solo importa una relacion que CUENTA para el limite.
  if not (new.estado_relacion = 'ACTIVA'
          and new.tipo_relacion in ('PROPIETARIO', 'CONDUCTOR_AUTORIZADO')
          and (new.fecha_fin is null or new.fecha_fin >= now())) then
    return new;
  end if;

  -- Serializa las operaciones concurrentes sobre la misma persona.
  perform pg_advisory_xact_lock(hashtext(new.id_persona::text));

  select coalesce(valor_parametro::integer, 2) into v_max
    from public.parametro_sistema
   where codigo_parametro = 'MAX_VEHICULOS_POR_PERSONA';
  v_max := coalesce(v_max, 2);

  select count(*) into v_actuales
    from public.persona_vehiculo
   where id_persona = new.id_persona
     and estado_relacion = 'ACTIVA'
     and tipo_relacion in ('PROPIETARIO', 'CONDUCTOR_AUTORIZADO')
     and (fecha_fin is null or fecha_fin >= now())
     and id_persona_vehiculo <> coalesce(new.id_persona_vehiculo, '00000000-0000-0000-0000-000000000000'::uuid);

  if v_actuales >= v_max then
    raise exception 'La persona ya tiene % vehiculos activos (maximo %). Cierra una relacion antes de asociar otra.',
      v_actuales, v_max
      using errcode = 'check_violation',
            hint = 'El limite se configura en parametro_sistema.MAX_VEHICULOS_POR_PERSONA.';
  end if;

  return new;
end;
$$;

comment on function public.enforce_max_vehiculos_activos() is
  'Impide superar MAX_VEHICULOS_POR_PERSONA relaciones vehiculares activas (PROPIETARIO/CONDUCTOR_AUTORIZADO) por persona. Serializa con advisory lock (req 35).';

drop trigger if exists trg_max_vehiculos_activos on public.persona_vehiculo;
create trigger trg_max_vehiculos_activos
before insert or update on public.persona_vehiculo
for each row execute function public.enforce_max_vehiculos_activos();

-- ===========================================================================
-- 3. RPC atomica: crear vehiculo y asociarlo en una sola transaccion
-- ===========================================================================
-- SECURITY INVOKER a proposito: los INSERT pasan por RLS con los permisos de
-- quien llama (ADM/GPI/GPE segun su rol), sin bypass. Todo corre en la misma
-- transaccion de la RPC: si la asociacion falla (cupo lleno, placa duplicada,
-- relacion repetida), el vehiculo tampoco se persiste. No hay vehiculo huerfano.
create or replace function public.crear_vehiculo_con_propietario(
  p_placa text,
  p_tipo_vehiculo text,
  p_marca text,
  p_modelo text,
  p_color text,
  p_id_persona uuid,
  p_tipo_relacion text default 'PROPIETARIO',
  p_fecha_inicio timestamptz default now(),
  p_motivo_sin_placa text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id_vehiculo uuid;
  v_id_relacion uuid;
  v_uid uuid := auth.uid();
  v_persona record;
begin
  if v_uid is null then
    raise exception 'Se requiere un usuario autenticado.' using errcode = 'insufficient_privilege';
  end if;

  if p_id_persona is null then
    raise exception 'Debe indicar la persona propietaria (busquela por cedula).' using errcode = 'check_violation';
  end if;

  -- La persona debe existir y estar visible para quien llama (RLS) y activa.
  select id_persona, estado, nombres, apellidos into v_persona
    from public.persona
   where id_persona = p_id_persona;

  if v_persona.id_persona is null then
    raise exception 'No se encontro la persona o no tienes permiso para verla.' using errcode = 'no_data_found';
  end if;
  if v_persona.estado <> 'ACTIVO' then
    raise exception 'La persona esta % : no se le puede asociar un vehiculo.', v_persona.estado using errcode = 'check_violation';
  end if;

  -- Crea el vehiculo (RLS: *_VEHICULO_INSERT). El trigger normaliza la placa.
  insert into public.vehiculo (placa, tipo_vehiculo, marca, modelo, color, motivo_sin_placa, id_usuario_registro)
  values (p_placa, p_tipo_vehiculo, p_marca, p_modelo, p_color, p_motivo_sin_placa, v_uid)
  returning id_vehiculo into v_id_vehiculo;

  -- Asocia (RLS: *_PERSONA_VEHICULO_INSERT + trigger de maximo 2). Si falla, se
  -- revierte tambien el INSERT del vehiculo (misma transaccion).
  insert into public.persona_vehiculo (id_persona, id_vehiculo, tipo_relacion, fecha_inicio, estado_relacion, id_usuario_registro)
  values (p_id_persona, v_id_vehiculo, coalesce(p_tipo_relacion, 'PROPIETARIO'), coalesce(p_fecha_inicio, now()), 'ACTIVA', v_uid)
  returning id_persona_vehiculo into v_id_relacion;

  return jsonb_build_object(
    'id_vehiculo', v_id_vehiculo,
    'id_persona_vehiculo', v_id_relacion,
    'persona', v_persona.nombres || ' ' || v_persona.apellidos
  );
end;
$$;

comment on function public.crear_vehiculo_con_propietario is
  'Crea vehiculo y persona_vehiculo en una transaccion (req 35). SECURITY INVOKER: respeta RLS. Rollback total si falla la asociacion.';

revoke execute on function public.crear_vehiculo_con_propietario(text, text, text, text, text, uuid, text, timestamptz, text) from public, anon;
grant execute on function public.crear_vehiculo_con_propietario(text, text, text, text, text, uuid, text, timestamptz, text) to authenticated;

revoke execute on function public.enforce_max_vehiculos_activos() from public, anon, authenticated;
