-- Correcciones de la revisión funcional de PCO (22/07/2026).
--
-- Un edificio ya no obliga a repetir "Edificio 26 - EARME" en Nombre y 26 en Número. Se guarda
-- la descripción por separado y la base compone el nombre oficial. Además, el CAMPUS es la raíz
-- de toda la infraestructura y no puede inactivarse.

alter table public.zona add column if not exists descripcion varchar(100);

-- La revisión confirma el número 26 para EARME, que había quedado abierto en §V43.1.
update public.zona
   set numero_edificio = 26
 where tipo_zona = 'EDIFICIO'
   and numero_edificio is null
   and nombre_zona ilike 'Edificio EARME%';

-- Se conserva exactamente la parte descriptiva ya visible, quitando el prefijo redundante.
update public.zona
   set descripcion = nullif(
     btrim(regexp_replace(nombre_zona, '^Edificio\s+[0-9]+\s*[-–—]?\s*', '', 'i')),
     ''
   )
 where tipo_zona = 'EDIFICIO'
   and descripcion is null;

-- Una fila antigua que solo decía "Edificio 20" sigue siendo editable: la descripción mínima
-- deja constancia de que todavía debe completarse, sin perder el nombre existente.
update public.zona
   set descripcion = nombre_zona
 where tipo_zona = 'EDIFICIO'
   and descripcion is null;

create or replace function public.componer_nombre_zona_edificio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo_zona = 'EDIFICIO' then
    if new.numero_edificio is null or new.numero_edificio <= 0 then
      raise exception 'Un edificio debe llevar un número mayor que cero.' using errcode = '23514';
    end if;
    new.descripcion := public.normalizar_espacios(new.descripcion);
    if new.descripcion is null or new.descripcion = '' then
      raise exception 'La descripción del edificio es obligatoria.' using errcode = '23514';
    end if;
    new.nombre_zona := format('Edificio %s – %s', new.numero_edificio, new.descripcion);
  else
    new.descripcion := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_componer_nombre_zona_edificio on public.zona;
create trigger trg_componer_nombre_zona_edificio
  before insert or update of tipo_zona, numero_edificio, descripcion, nombre_zona on public.zona
  for each row execute function public.componer_nombre_zona_edificio();

-- Normaliza las filas existentes con el mismo formato que usarán las nuevas.
update public.zona
   set nombre_zona = format('Edificio %s – %s', numero_edificio, descripcion)
 where tipo_zona = 'EDIFICIO'
   and numero_edificio is not null;

create or replace function public.proteger_campus_activo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.tipo_zona = 'CAMPUS'
     and new.estado_zona is distinct from old.estado_zona
     and new.estado_zona <> 'ACTIVA' then
    raise exception 'El campus es la zona raíz y no se puede inactivar: los edificios y puntos de control dependen de él.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_campus_activo on public.zona;
create trigger trg_proteger_campus_activo
  before update of estado_zona on public.zona
  for each row execute function public.proteger_campus_activo();

comment on column public.zona.descripcion is
  'Descripción del edificio sin repetir su tipo ni número; nombre_zona se compone automáticamente.';
comment on function public.componer_nombre_zona_edificio() is
  'PCO: compone Edificio <número> – <descripción> y evita duplicar datos en el formulario.';
comment on function public.proteger_campus_activo() is
  'PCO: la zona raíz CAMPUS permanece activa porque la infraestructura depende de ella.';

revoke execute on function public.componer_nombre_zona_edificio() from public, anon, authenticated;
revoke execute on function public.proteger_campus_activo() from public, anon, authenticated;
