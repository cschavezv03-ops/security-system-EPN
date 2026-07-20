-- PCO v2 §"En los campos de fecha, no debe haber la posibilidad de poner fechas anteriores" y
-- §"Que se completen todos los campos necesarios para el registro de un guardia".

/* Una asignación nueva no puede empezar en el pasado. Solo se comprueba al insertar y al mover
   la fecha de inicio: al editar el turno o el punto de una asignación que empezó el 1 de julio
   no se le puede exigir que cambie de fecha, porque falsearía cuándo empezó de verdad.

   `hoy_ecuador()` y no `current_date` (§D52): el servidor va en UTC y Ecuador cinco horas por
   detrás, así que a partir de las 19:00 `current_date` ya es mañana y rechazaría como "pasada"
   una fecha que aquí todavía es hoy. */
create or replace function public.validar_fechas_asignacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.fecha_inicio is distinct from old.fecha_inicio then
    if new.fecha_inicio::date < public.hoy_ecuador() then
      raise exception 'La fecha de inicio no puede ser anterior a hoy (%).', to_char(public.hoy_ecuador(), 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end if;
  end if;

  if new.fecha_fin is not null and (tg_op = 'INSERT' or new.fecha_fin is distinct from old.fecha_fin) then
    if new.fecha_fin::date < public.hoy_ecuador() then
      raise exception 'La fecha de fin no puede ser anterior a hoy (%).', to_char(public.hoy_ecuador(), 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_fechas_asignacion on public.guardia_punto_control;
create trigger trg_validar_fechas_asignacion
  before insert or update on public.guardia_punto_control
  for each row execute function public.validar_fechas_asignacion();

-- ATENCIÓN: aquí se añadía además el CHECK `gpc_activa_completa`, que resultó ser un error y se
-- retira en la migración siguiente (20260720170540). Un CHECK se evalúa en cualquier update de
-- la fila, así que dejaba sin poder editar a una asignación ACTIVA incompleta ya existente.

revoke execute on function public.validar_fechas_asignacion() from public, anon, authenticated;
