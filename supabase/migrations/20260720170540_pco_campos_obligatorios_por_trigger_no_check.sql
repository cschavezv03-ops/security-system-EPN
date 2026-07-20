-- Corrige la migración anterior. `gpc_activa_completa` se escribió como CHECK y, aunque se creó
-- NOT VALID, un CHECK se evalúa en CUALQUIER update de la fila. Eso dejaba sin poder editar a la
-- asignación 46a99012 —ACTIVA y sin fecha de fin, sembrada en la ronda de CAC—: cambiarle el
-- punto o la hora la habría hecho violar la restricción, y no se puede completar el dato por
-- nuestra cuenta sin inventarnos hasta cuándo dura ese turno (§V42).
--
-- Se sustituye por un trigger con el mismo criterio de convivencia que el resto de reglas de la
-- ronda: se exige a lo que se crea y a lo que se edita en esos campos, no a lo que ya estaba.
alter table public.guardia_punto_control drop constraint if exists gpc_activa_completa;

create or replace function public.validar_asignacion_completa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_falta text[];
begin
  if new.estado_asignacion <> 'ACTIVA' then
    return new;
  end if;

  -- Al editar, solo se exige si se está tocando alguno de estos campos o activando la asignación.
  if tg_op = 'UPDATE'
     and new.fecha_fin         is not distinct from old.fecha_fin
     and new.hora_inicio       is not distinct from old.hora_inicio
     and new.hora_fin          is not distinct from old.hora_fin
     and new.estado_asignacion is not distinct from old.estado_asignacion then
    return new;
  end if;

  v_falta := array_remove(array[
    case when new.fecha_fin   is null then 'la fecha de fin'   end,
    case when new.hora_inicio is null then 'la hora de entrada' end,
    case when new.hora_fin    is null then 'la hora de salida'  end
  ], null);

  if array_length(v_falta, 1) > 0 then
    raise exception 'Para dejar la asignación activa falta %.', array_to_string(v_falta, ', ')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_asignacion_completa on public.guardia_punto_control;
create trigger trg_validar_asignacion_completa
  before insert or update on public.guardia_punto_control
  for each row execute function public.validar_asignacion_completa();

revoke execute on function public.validar_asignacion_completa() from public, anon, authenticated;
