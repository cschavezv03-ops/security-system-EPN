-- GPE §4 "Corregir errores gramaticales en todo el sistema".
--
-- Mismo hallazgo que en la ronda de ADM (donde faltaban las tildes de las 106 descripciones de
-- permisos): los textos sembrados a mano nunca se revisaron. El barrido sobre todas las
-- columnas de texto libre que llegan a pantalla encontró cuatro casos.

-- "Ingenieria Mecanica" → con tildes. `acentuar_texto` no cubre estos dos términos, así que
-- se corrigen explícitamente.
update public.zona
   set nombre_zona = 'Edificio 15 - Facultad de Ingeniería Mecánica'
 where btrim(nombre_zona) = 'Edificio 15 - Facultad de Ingenieria Mecanica';

-- Espacio final: invisible en la interfaz, pero rompe las búsquedas por igualdad exacta y
-- descuadra los nombres al concatenarlos.
update public.zona set nombre_zona = btrim(nombre_zona) where nombre_zona <> btrim(nombre_zona);
update public.punto_control set nombre_punto = btrim(nombre_punto) where nombre_punto <> btrim(nombre_punto);
update public.empresa set nombre = btrim(nombre) where nombre <> btrim(nombre);

update public.autorizacion_visita_diaria
   set motivo = 'Entregar documentos en Secretaría General.'
 where btrim(motivo) = 'Entregar documentos en secretaria general.';

-- Que no vuelvan a entrar con espacios sobrantes. `normalizar_espacios` ya existe y es lo que
-- usan otras tablas; zona y punto_control se habían quedado fuera.
create or replace function public.normalizar_zona()
returns trigger
language plpgsql
as $$
begin
  new.nombre_zona := public.normalizar_espacios(new.nombre_zona);
  return new;
end;
$$;

drop trigger if exists trg_normalizar_zona on public.zona;
create trigger trg_normalizar_zona
  before insert or update on public.zona
  for each row execute function public.normalizar_zona();

create or replace function public.normalizar_punto_control()
returns trigger
language plpgsql
as $$
begin
  new.nombre_punto := public.normalizar_espacios(new.nombre_punto);
  return new;
end;
$$;

drop trigger if exists trg_normalizar_punto_control on public.punto_control;
create trigger trg_normalizar_punto_control
  before insert or update on public.punto_control
  for each row execute function public.normalizar_punto_control();
