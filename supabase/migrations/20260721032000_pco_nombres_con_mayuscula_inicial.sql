-- Nuevos requerimientos PCO: "validar que todos los nombres empiecen con mayúscula en TODO el
-- sistema." Se implementa aquí para las dos entidades que trae este documento (zona y punto de
-- control); extenderlo al resto de módulos (persona, empresa, categoría, parámetro...) es un
-- cambio más grande, con datos y pantallas propias — queda anotado como pendiente en
-- 99_DUDAS_PARA_EL_EQUIPO.md en vez de tocarlo a ciegas en esta ronda.
--
-- Verificado contra el remoto: todos los nombres de zona y de punto de control que ya existen
-- empiezan en mayúscula, así que el CHECK se puede exigir de una vez, sin "not valid".
create or replace function public.es_nombre_con_mayuscula(p_nombre text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_nombre is null or btrim(p_nombre) ~ '^[A-ZÁÉÍÓÚÜÑ]';
$$;

comment on function public.es_nombre_con_mayuscula(text) is
  'La primera letra visible del texto es una mayúscula (con tildes y Ñ).';

alter table public.zona drop constraint if exists zona_nombre_zona_con_mayuscula;
alter table public.zona add constraint zona_nombre_zona_con_mayuscula
  check (public.es_nombre_con_mayuscula(nombre_zona));

alter table public.punto_control drop constraint if exists punto_control_nombre_punto_con_mayuscula;
alter table public.punto_control add constraint punto_control_nombre_punto_con_mayuscula
  check (public.es_nombre_con_mayuscula(nombre_punto));

revoke execute on function public.es_nombre_con_mayuscula(text) from public, anon;
grant  execute on function public.es_nombre_con_mayuscula(text) to authenticated;
