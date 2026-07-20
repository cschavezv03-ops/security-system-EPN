-- PCO v2 §"Gestión de Ubicaciones (Estándar EPN)": para los puntos de control de una zona tipo
-- EDIFICIO, el nombre sigue la nomenclatura oficial de espacios de la politécnica:
--
--     E<edificio>/P<piso>/E<espacio de tres dígitos>[ – descripción]
--     Ejemplo: "E20/P4/E004 – Laboratorio Alan Turing"
--
-- El documento pide además que el usuario no teclee "/" ni "-": la pantalla ofrece tres campos
-- numéricos y una descripción, y compone el nombre. Esto es la garantía del lado de la base.

/* Código de ubicación que encabeza un nombre de punto de control, o null si no lo lleva.
   "E20/P4/E004 – Laboratorio Alan Turing" -> "E20/P4/E004" */
create or replace function public.codigo_ubicacion_epn(p_nombre text)
returns text
language sql
immutable
set search_path = public
as $$
  select (regexp_match(coalesce(p_nombre, ''), '^(E[1-9][0-9]{0,2}/P[0-9]{1,2}/E[0-9]{3})(\s|$)'))[1];
$$;

comment on function public.codigo_ubicacion_epn(text) is
  'Extrae el código E<edificio>/P<piso>/E<espacio> del principio de un nombre de punto de control.';

/* Compone el nombre canónico a partir de las tres cifras y la descripción. La usa la pantalla
   y también sirve para sembrar datos sin escribir los separadores a mano. */
create or replace function public.componer_nombre_punto_epn(
  p_edificio int, p_piso int, p_espacio int, p_descripcion text default null
)
returns text
language sql
immutable
set search_path = public
as $$
  select 'E' || p_edificio || '/P' || p_piso || '/E' || lpad(p_espacio::text, 3, '0')
      || coalesce(' – ' || nullif(btrim(p_descripcion), ''), '');
$$;

comment on function public.componer_nombre_punto_epn(int, int, int, text) is
  'Construye "E20/P4/E004 – Laboratorio Alan Turing" a partir de sus partes.';

/* Un punto de control dentro de un edificio tiene que llevar el código. En un campus o un
   parqueadero no: allí los puntos son garitas y accesos perimetrales, que no ocupan un aula. */
create or replace function public.validar_nombre_punto_edificio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo_zona text;
begin
  -- No revalidar ediciones que no tocan ni el nombre ni la zona: los dos puntos que ya existen
  -- en edificios ("Puerta - Laboratorio de Suelos", "Puerta - Laboratorio Alan Turing") son
  -- anteriores a esta regla y no se les puede adivinar el piso ni el aula (§V41).
  if tg_op = 'UPDATE'
     and new.nombre_punto is not distinct from old.nombre_punto
     and new.id_zona      is not distinct from old.id_zona then
    return new;
  end if;

  select z.tipo_zona into v_tipo_zona from public.zona z where z.id_zona = new.id_zona;

  if v_tipo_zona = 'EDIFICIO' and public.codigo_ubicacion_epn(new.nombre_punto) is null then
    raise exception 'Un punto de control en un edificio debe nombrarse con el estándar de la EPN: E<edificio>/P<piso>/E<espacio de 3 dígitos>, por ejemplo "E20/P4/E004 – Laboratorio Alan Turing".'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_nombre_punto_edificio on public.punto_control;
create trigger trg_validar_nombre_punto_edificio
  before insert or update on public.punto_control
  for each row execute function public.validar_nombre_punto_edificio();

-- "Así nos aseguramos de que no se repitan": dos puntos no pueden compartir el mismo espacio
-- físico. El índice va sobre el código, no sobre el nombre completo, para que "E20/P4/E004 – Lab"
-- y "E20/P4/E004 – Laboratorio Alan Turing" cuenten como el mismo sitio.
create unique index if not exists punto_control_codigo_epn_unico
  on public.punto_control (public.codigo_ubicacion_epn(nombre_punto))
  where public.codigo_ubicacion_epn(nombre_punto) is not null;

revoke execute on function public.validar_nombre_punto_edificio() from public, anon, authenticated;
revoke execute on function public.codigo_ubicacion_epn(text) from public, anon;
grant  execute on function public.codigo_ubicacion_epn(text) to authenticated;
revoke execute on function public.componer_nombre_punto_epn(int, int, int, text) from public, anon;
grant  execute on function public.componer_nombre_punto_epn(int, int, int, text) to authenticated;
