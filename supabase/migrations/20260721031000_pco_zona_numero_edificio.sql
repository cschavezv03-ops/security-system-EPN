-- Nuevos requerimientos PCO: "A la hora de registrar puntos de control que no nos haga escoger
-- qué edificio es. Mejor al ingresar una zona nos debe permitir ingresar el número del edificio
-- únicamente cuando es una zona de tipo edificio."
--
-- Hoy, para registrar un punto de control en un edificio, PCO tiene que (a) elegir en un combo
-- CUÁL de las zonas tipo EDIFICIO es, por nombre, Y ADEMÁS (b) teclear el número de edificio en
-- un campo aparte para que se componga el nombre EPN del punto (E20/P4/E004...) — dos formas de
-- decir el mismo edificio, que pueden no coincidir entre sí. Se añade un número estructurado al
-- edificio para que baste con teclear ese número: el sistema resuelve solo la zona, sin volver a
-- preguntar cuál es.
alter table public.zona add column if not exists numero_edificio integer;

-- Backfill de los edificios ya registrados, tomando el número que ya llevan en el nombre
-- ("Edificio 20 - ..." -> 20). El campus EARME es la excepción real: no tiene un número asignado
-- en ningún documento de la universidad, así que queda sin backfill — ver 99_DUDAS_PARA_EL_EQUIPO.
update public.zona
   set numero_edificio = (regexp_match(nombre_zona, '([0-9]+)'))[1]::int
 where tipo_zona = 'EDIFICIO'
   and numero_edificio is null
   and nombre_zona ~ '[0-9]+';

-- Único por edificio (no aplica a CAMPUS/PARQUEADERO, que no llevan número).
create unique index if not exists zona_numero_edificio_unico
  on public.zona (numero_edificio)
  where tipo_zona = 'EDIFICIO' and numero_edificio is not null;

create or replace function public.validar_numero_edificio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No revalida ediciones que no tocan ni el tipo ni el número: los edificios anteriores a esta
  -- regla (ej. EARME, sin número) no se pueden bloquear por algo que no tocaron (mismo criterio
  -- que validar_jerarquia_zona, §V22).
  if tg_op = 'UPDATE'
     and new.tipo_zona is not distinct from old.tipo_zona
     and new.numero_edificio is not distinct from old.numero_edificio then
    return new;
  end if;

  if new.tipo_zona = 'EDIFICIO' and new.numero_edificio is null then
    raise exception 'Un edificio debe llevar su número (ej. 20 para "Edificio 20").'
      using errcode = 'check_violation';
  end if;

  if new.tipo_zona <> 'EDIFICIO' and new.numero_edificio is not null then
    raise exception 'Solo una zona de tipo Edificio lleva número de edificio.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.validar_numero_edificio() is
  'Un Edificio necesita numero_edificio; los demás tipos de zona no lo llevan. No revalida ediciones que no tocan tipo ni número.';

drop trigger if exists trg_validar_numero_edificio on public.zona;
create trigger trg_validar_numero_edificio
  before insert or update on public.zona
  for each row execute function public.validar_numero_edificio();

revoke execute on function public.validar_numero_edificio() from public, anon, authenticated;
