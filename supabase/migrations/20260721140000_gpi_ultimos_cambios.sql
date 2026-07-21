-- Ultimos cambios del modulo GPI (Ultimos_Cambios_GPI.pdf, 2026-07-21).
--
-- La interfaz oculta o bloquea los campos que no aplican, pero estas reglas tambien viven en
-- la base para que una escritura directa por REST/RPC no pueda saltarselas. Los datos historicos
-- incompatibles no se borran: solo se impide introducirlos o modificarlos desde esta migracion.

-- ===========================================================================
-- 1. Datos internos segun la categoria de la persona
-- ===========================================================================

create or replace function public.validar_campos_detalle_persona_interna()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categoria text;
begin
  select c.codigo_categoria
    into v_categoria
    from public.persona p
    join public.categoria_persona c on c.id_categoria = p.id_categoria
   where p.id_persona = new.id_persona;

  if v_categoria is null then
    raise exception 'No se encontro la categoria de la persona interna.'
      using errcode = '23514';
  end if;

  -- El docente se describe con su categoria academica, no mediante un cargo.
  if v_categoria = 'DOCENTE'
     and new.cargo is not null
     and (tg_op = 'INSERT' or new.cargo is distinct from old.cargo) then
    raise exception 'El campo Cargo no aplica para docentes.'
      using errcode = '23514';
  end if;

  -- El nuevo formulario ya no usa nombramiento para ninguna categoria laboral interna.
  if v_categoria in ('DOCENTE', 'ADMINISTRATIVO', 'TRABAJADOR', 'EMPRESA_SERVICIO')
     and new.nombramiento is not null
     and (tg_op = 'INSERT' or new.nombramiento is distinct from old.nombramiento) then
    raise exception 'El campo Nombramiento no aplica para la categoria seleccionada.'
      using errcode = '23514';
  end if;

  -- Un estudiante del CEC registra curso; uno de la EPN registra carrera. El cambio de unidad
  -- tambien se valida para que no deje un dato de la unidad anterior escondido en la fila.
  if v_categoria = 'ESTUDIANTE'
     and new.unidad = 'CEC'
     and new.carrera is not null
     and (tg_op = 'INSERT'
          or new.carrera is distinct from old.carrera
          or new.unidad is distinct from old.unidad) then
    raise exception 'Un estudiante del CEC registra Curso, no Carrera.'
      using errcode = '23514';
  end if;

  if v_categoria = 'ESTUDIANTE'
     and new.unidad = 'EPN'
     and new.curso is not null
     and (tg_op = 'INSERT'
          or new.curso is distinct from old.curso
          or new.unidad is distinct from old.unidad) then
    raise exception 'Un estudiante de la EPN registra Carrera, no Curso.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.validar_campos_detalle_persona_interna() is
  'GPI: valida Cargo/Nombramiento por categoria y Carrera/Curso segun la unidad del estudiante.';

drop trigger if exists trg_validar_campos_detalle_persona_interna on public.persona_interna_detalle;
create trigger trg_validar_campos_detalle_persona_interna
  before insert or update on public.persona_interna_detalle
  for each row execute function public.validar_campos_detalle_persona_interna();

revoke execute on function public.validar_campos_detalle_persona_interna()
  from public, anon, authenticated;

-- ===========================================================================
-- 2. Toda nueva relacion persona-vehiculo tiene fecha de fin
-- ===========================================================================

create or replace function public.exigir_fecha_fin_persona_vehiculo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Se toleran filas historicas sin fecha mientras no se intente cambiar su vigencia. Esto evita
  -- inventar una fecha de fin y permite corregirlas expresamente desde la interfaz.
  if new.fecha_fin is null
     and (tg_op = 'INSERT' or new.fecha_fin is distinct from old.fecha_fin) then
    raise exception 'La fecha de fin de la relacion persona-vehiculo es obligatoria.'
      using errcode = '23502';
  end if;

  return new;
end;
$$;

comment on function public.exigir_fecha_fin_persona_vehiculo() is
  'GPI: exige fecha_fin en nuevas relaciones persona-vehiculo sin falsear filas historicas.';

drop trigger if exists trg_exigir_fecha_fin_persona_vehiculo on public.persona_vehiculo;
create trigger trg_exigir_fecha_fin_persona_vehiculo
  before insert or update of fecha_fin on public.persona_vehiculo
  for each row execute function public.exigir_fecha_fin_persona_vehiculo();

revoke execute on function public.exigir_fecha_fin_persona_vehiculo()
  from public, anon, authenticated;

-- La RPC atomica de alta de vehiculo tambien recibe la fecha final como argumento obligatorio.
drop function if exists public.crear_vehiculo_con_propietario(
  text, uuid, text, text, text, text, text, timestamptz, text
);

create or replace function public.crear_vehiculo_con_propietario(
  p_tipo_vehiculo text,
  p_id_persona uuid,
  p_fecha_fin timestamptz,
  p_placa text default null,
  p_marca text default null,
  p_modelo text default null,
  p_color text default null,
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
    raise exception 'Debe indicar la persona propietaria (busquela por cedula).'
      using errcode = 'check_violation';
  end if;

  if p_fecha_fin is null then
    raise exception 'La fecha de fin de la relacion es obligatoria.'
      using errcode = 'not_null_violation';
  end if;

  if p_fecha_fin <= coalesce(p_fecha_inicio, now()) then
    raise exception 'La fecha de fin debe ser posterior a la fecha de inicio.'
      using errcode = 'check_violation';
  end if;

  select id_persona, estado, nombres, apellidos
    into v_persona
    from public.persona
   where id_persona = p_id_persona;

  if v_persona.id_persona is null then
    raise exception 'No se encontro la persona o no tienes permiso para verla.'
      using errcode = 'no_data_found';
  end if;

  if v_persona.estado <> 'ACTIVO' then
    raise exception 'La persona esta % : no se le puede asociar un vehiculo.', v_persona.estado
      using errcode = 'check_violation';
  end if;

  insert into public.vehiculo
    (placa, tipo_vehiculo, marca, modelo, color, motivo_sin_placa, id_usuario_registro)
  values
    (p_placa, p_tipo_vehiculo, p_marca, p_modelo, p_color, p_motivo_sin_placa, v_uid)
  returning id_vehiculo into v_id_vehiculo;

  insert into public.persona_vehiculo
    (id_persona, id_vehiculo, tipo_relacion, fecha_inicio, fecha_fin,
     estado_relacion, id_usuario_registro)
  values
    (p_id_persona, v_id_vehiculo, coalesce(p_tipo_relacion, 'PROPIETARIO'),
     coalesce(p_fecha_inicio, now()), p_fecha_fin, 'ACTIVA', v_uid)
  returning id_persona_vehiculo into v_id_relacion;

  return jsonb_build_object(
    'id_vehiculo', v_id_vehiculo,
    'id_persona_vehiculo', v_id_relacion,
    'persona', v_persona.nombres || ' ' || v_persona.apellidos
  );
end;
$$;

comment on function public.crear_vehiculo_con_propietario(
  text, uuid, timestamptz, text, text, text, text, text, timestamptz, text
) is
  'Crea vehiculo y propietario atomicamente; GPI exige fecha de inicio y fecha de fin de la relacion.';

revoke execute on function public.crear_vehiculo_con_propietario(
  text, uuid, timestamptz, text, text, text, text, text, timestamptz, text
) from public, anon;

grant execute on function public.crear_vehiculo_con_propietario(
  text, uuid, timestamptz, text, text, text, text, text, timestamptz, text
) to authenticated;
